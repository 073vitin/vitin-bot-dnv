const test = require("node:test")
const assert = require("node:assert/strict")

const adivinhacao = require("../games/adivinhacao")
const dueloDados = require("../games/dueloDados")
const roletaRussa = require("../games/roletaRussa")
const caraOuCoroa = require("../games/caraOuCoroa")
const punishmentService = require("../services/punishmentService")
const storage = require("../storage")

function createSockCapture() {
  const sent = []
  return {
    sock: {
      async sendMessage(to, payload) {
        sent.push({ to, payload })
      },
    },
    sent,
  }
}

function setCoinRound(groupId, senderId, resultado, betMultiplier = 1) {
  const coinGames = storage.getCoinGames()
  if (!coinGames[groupId]) coinGames[groupId] = {}
  coinGames[groupId][senderId] = {
    player: senderId,
    resultado,
    betMultiplier,
    createdAt: Date.now(),
  }
  storage.setCoinGames(coinGames)
}

function getPunishmentStack(groupId, userId) {
  const entry = storage.getActivePunishments()[groupId]?.[userId]
  if (!entry) return []
  return Array.isArray(entry) ? entry : [entry]
}

test("startCoinRound accepts explicit !moeda bet multiplier", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_bet_${Date.now()}@g.us`
  const sender = "bettor@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Credit sender with coins for buy-in (7x bet = 70 coins)
  economyService.creditCoins(sender, 100, { type: "test-credit" })

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 7",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender]?.betMultiplier, 7)
  assert.ok(sent.some((m) => /Aposta: \*7x\*/.test(String(m.payload?.text || ""))))
})

test("startCoinRound rejects bet when player has insufficient coins", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_insufficient_${Date.now()}@g.us`
  const sender = "broke@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Don't credit coins - player starts with 0

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 5",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /precisa de pelo menos/.test(String(m.payload?.text || ""))))
})

test("startCoinRound rejects minimum bet below 2", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_minimum_${Date.now()}@g.us`
  const sender = "lowballer@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 1",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  assert.ok(sent.length >= 1)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /Use: !moeda \[2-10\]/.test(String(m.payload?.text || ""))))
})

test("startCoinRound enforces rate limit of 5 plays per 30 minutes", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_rate_limit_${Date.now()}@g.us`
  const sender = "spammer@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Credit sender with enough coins for 6 plays at 2x bet
  economyService.creditCoins(sender, 1000, { type: "test-credit" })

  // Manually set rate limit to 4 plays (to test the 5th play is rejected)
  const limits = storage.getCoinRateLimits(groupId) || {}
  limits[sender] = [Date.now(), Date.now() - 1000, Date.now() - 2000, Date.now() - 3000, Date.now() - 4000]
  storage.setCoinRateLimits(groupId, limits)

  // 6th play should be rejected
  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 2",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /atingiu o limite/.test(String(m.payload?.text || ""))))
})

test("coin guess loss does not apply punishment on low bet", async () => {
  const groupId = `__coin_threshold_${Date.now()}@g.us`
  const sender = "loser@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let punishmentCalls = 0

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  setCoinRound(groupId, sender, "cara", 3)

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "coroa",
    isGroup: true,
    isOverrideSender: false,
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {
      punishmentCalls += 1
    },
    clearPendingPunishment: () => {},
    rewardWinner: async () => {},
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(punishmentCalls, 0)
  assert.ok(sent.some((m) => /Se fudeu/i.test(String(m.payload?.text || ""))))
})

test("coin guess loss does not apply punishment on high bet", async () => {
  const groupId = `__coin_threshold_hit_${Date.now()}@g.us`
  const sender = "loser@s.whatsapp.net"
  const { sock } = createSockCapture()
  let punishmentCalls = 0

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  setCoinRound(groupId, sender, "cara", 4)

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "coroa",
    isGroup: true,
    isOverrideSender: false,
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {
      punishmentCalls += 1
    },
    clearPendingPunishment: () => {},
    rewardWinner: async () => {},
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(punishmentCalls, 0)
})

test("pending punishment choice is rejected when eligibility metadata is invalid", async () => {
  const groupId = `__pending_threshold_guard_${Date.now()}@g.us`
  const sender = "winner@s.whatsapp.net"
  const target = "target@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  const pending = storage.getCoinPunishmentPending()
  if (!pending[groupId]) pending[groupId] = {}
  pending[groupId][sender] = {
    mode: "target",
    target,
    createdAt: Date.now(),
    origin: "game",
    punishmentEligible: false,
    minPunishmentBet: 4,
    roundBet: 2,
  }
  storage.setCoinPunishmentPending(pending)

  const handled = await punishmentService.handlePendingPunishmentChoice({
    sock,
    from: groupId,
    sender,
    text: "1",
    mentioned: [],
    isGroup: true,
    senderIsAdmin: false,
    isCommand: false,
  })

  assert.equal(handled, true)
  assert.equal(Boolean(storage.getCoinPunishmentPending()[groupId]?.[sender]), false)
  assert.ok(sent.some((m) => /expirou por elegibilidade de aposta/i.test(String(m.payload?.text || ""))))
})

test("applyPunishment applies all punishment types with numeric IDs", async () => {
  const groupId = `__all_punishments_${Date.now()}@g.us`
  const target = "target@s.whatsapp.net"
  const { sock } = createSockCapture()

  const expectedById = {
    1: "max5chars",
    2: "rate20s",
    3: "lettersBlock",
    4: "emojiOnly",
    5: "mute5m",
    6: "noVowels",
    7: "urgentPrefix",
    8: "wordListRequired",
    9: "allCaps",
    10: "deleteAndRepost",
    11: "sexualReaction",
    12: "randomDeleteChance",
    13: "max3wordsStrict",
  }

  for (const [punishmentId, expectedType] of Object.entries(expectedById)) {
    await punishmentService.applyPunishment(sock, groupId, target, Number(punishmentId), {
      origin: "admin",
      severityMultiplier: 1,
    })
    const stack = getPunishmentStack(groupId, target)
    assert.equal(stack[stack.length - 1]?.type, expectedType)
  }

  punishmentService.clearPunishment(groupId, target)
})

test("punishment enforcement resolves sender JID variants consistently", async () => {
  const groupId = `__punishment_jid_norm_${Date.now()}@g.us`
  const targetWithDevice = "5511999999999:5@s.whatsapp.net"
  const targetCanonical = "5511999999999@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  await punishmentService.applyPunishment(sock, groupId, targetWithDevice, "1", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const enforced = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-1", remoteJid: groupId, fromMe: false, participant: targetCanonical } },
    groupId,
    targetCanonical,
    "mensagem muito longa",
    true,
    false,
    true
  )

  assert.equal(enforced, true)
  assert.ok(sent.some((entry) => Boolean(entry.payload?.delete)))
  punishmentService.clearPunishment(groupId, targetCanonical)
})

test("punishment enforcement matches @lid and @s variants for same user", async () => {
  const groupId = `__punishment_lid_s_norm_${Date.now()}@g.us`
  const targetLid = "5511888777666@lid"
  const targetS = "5511888777666@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  await punishmentService.applyPunishment(sock, groupId, targetLid, "5", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const enforcedFromS = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-lid-1", remoteJid: groupId, fromMe: false, participant: targetS } },
    groupId,
    targetS,
    "mensagem",
    true,
    false,
    true
  )

  await punishmentService.applyPunishment(sock, groupId, targetS, "5", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const enforcedFromLid = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-lid-2", remoteJid: groupId, fromMe: false, participant: targetLid } },
    groupId,
    targetLid,
    "mensagem",
    true,
    false,
    true
  )

  assert.equal(enforcedFromS, true)
  assert.equal(enforcedFromLid, true)
  const deletions = sent.filter((entry) => Boolean(entry.payload?.delete))
  assert.ok(deletions.length >= 2)
  punishmentService.clearPunishment(groupId, targetS)
})

test("punishment enforcement remains blocking when delete fails", async () => {
  const groupId = `__punishment_delete_fail_${Date.now()}@g.us`
  const target = "deletefail@s.whatsapp.net"
  const sent = []
  const sock = {
    async sendMessage(to, payload) {
      sent.push({ to, payload })
      if (payload?.delete) {
        throw new Error("simulated delete failure")
      }
    },
  }

  await punishmentService.applyPunishment(sock, groupId, target, "1", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const enforced = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-delete-fail", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "mensagem longa demais",
    true,
    false,
    false
  )

  assert.equal(enforced, true)
  assert.ok(sent.some((entry) => Boolean(entry.payload?.delete)))
  punishmentService.clearPunishment(groupId, target)
})

test("lettersBlock deletes only blocked letters and supports leet detection", async () => {
  const groupId = `__punishment_letters_unlock_${Date.now()}@g.us`
  const target = "letters@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const active = storage.getActivePunishments()
  if (!active[groupId]) active[groupId] = {}
  active[groupId][target] = {
    type: "lettersBlock",
    letters: ["a", "u"],
  }
  storage.setActivePunishments(active)

  const allowedMessage = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-allowed", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "bcd fgh",
    true,
    false,
    true
  )

  const blockedLetter = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-blocked", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "a b",
    true,
    false,
    true
  )

  const blockedLeet = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-leet", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "4 b |_|",
    true,
    false,
    true
  )

  const unlocked = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-unlock", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "4 |_|",
    true,
    false,
    true
  )

  assert.equal(allowedMessage, false)
  assert.equal(blockedLetter, true)
  assert.equal(blockedLeet, true)
  assert.equal(unlocked, false)
  assert.equal(sent.some((entry) => entry.payload?.delete?.id === "msg-allowed"), false)
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-blocked"))
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-leet"))
  assert.ok(sent.some((entry) => /foi liberado da punição das letras/i.test(String(entry.payload?.text || ""))))
  assert.equal(Boolean(storage.getActivePunishments()[groupId]?.[target]), false)
})

test("noVowels enforces classic and leet vowels", async () => {
  const groupId = `__punishment_no_vowels_${Date.now()}@g.us`
  const target = "novowels@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const active = storage.getActivePunishments()
  if (!active[groupId]) active[groupId] = {}
  active[groupId][target] = {
    type: "noVowels",
  }
  storage.setActivePunishments(active)

  const consonantsOnly = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-novowels-ok", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "brt krl",
    true,
    false,
    true
  )

  const classicVowel = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-novowels-vowel", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "casa",
    true,
    false,
    true
  )

  const leetA = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-novowels-leet-a", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "c4s4",
    true,
    false,
    true
  )

  const leetU = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-novowels-leet-u", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "|_|",
    true,
    false,
    true
  )

  assert.equal(consonantsOnly, false)
  assert.equal(classicVowel, true)
  assert.equal(leetA, true)
  assert.equal(leetU, true)
  assert.equal(sent.some((entry) => entry.payload?.delete?.id === "msg-novowels-ok"), false)
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-novowels-vowel"))
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-novowels-leet-a"))
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-novowels-leet-u"))
  punishmentService.clearPunishment(groupId, target)
})

test("punishment severity scales with linear timing and special-case rules", async () => {
  const groupId = `__punishment_linear_scale_${Date.now()}@g.us`
  const target = "target@s.whatsapp.net"
  const { sock } = createSockCapture()

  const toleranceMs = 2_000
  const assertDuration = async (punishmentId, severityMultiplier, expectedMs) => {
    const before = Date.now()
    await punishmentService.applyPunishment(sock, groupId, target, String(punishmentId), {
      origin: "admin",
      severityMultiplier,
    })
    const stack = getPunishmentStack(groupId, target)
    const endsAt = Number(stack[stack.length - 1]?.endsAt || 0)
    const duration = endsAt - before
    assert.ok(
      duration >= (expectedMs - toleranceMs) && duration <= (expectedMs + toleranceMs),
      `unexpected duration for punishment ${punishmentId}`
    )
    punishmentService.clearPunishment(groupId, target)
  }

  await assertDuration("6", 3, 15 * 60_000)
  await assertDuration("7", 3, 15 * 60_000)
  await assertDuration("9", 3, 30 * 60_000)
  await assertDuration("10", 3, 15 * 60_000)
  await assertDuration("11", 3, 15 * 60_000)
  await assertDuration("13", 3, 15 * 60_000)

  await punishmentService.applyPunishment(sock, groupId, target, "8", {
    origin: "admin",
    severityMultiplier: 3,
  })
  let stack = getPunishmentStack(groupId, target)
  let last = stack[stack.length - 1]
  let duration = Number(last?.endsAt || 0) - Date.now()
  assert.ok(duration > (9 * 60_000) && duration <= (10 * 60_000 + toleranceMs))
  assert.equal(last?.minRequiredWords, 3)
  punishmentService.clearPunishment(groupId, target)

  await punishmentService.applyPunishment(sock, groupId, target, "12", {
    origin: "admin",
    severityMultiplier: 3,
  })
  stack = getPunishmentStack(groupId, target)
  last = stack[stack.length - 1]
  assert.equal(Math.round(Number(last?.deleteChance || 0) * 100), 28)
  punishmentService.clearPunishment(groupId, target)
})

test("punishments stack and enforce simultaneously", async () => {
  const groupId = `__punishment_stack_${Date.now()}@g.us`
  const target = "stacked@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  await punishmentService.applyPunishment(sock, groupId, target, "11", {
    origin: "admin",
    severityMultiplier: 1,
  })
  await punishmentService.applyPunishment(sock, groupId, target, "1", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const stack = getPunishmentStack(groupId, target)
  assert.equal(stack.length, 2)

  const enforced = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-stack-1", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "mensagem muito longa",
    true,
    false,
    true
  )

  assert.equal(enforced, true)
  assert.ok(sent.some((entry) => entry.payload?.delete?.id === "msg-stack-1"))
  assert.ok(sent.some((entry) => entry.payload?.react?.key?.id === "msg-stack-1"))
  punishmentService.clearPunishment(groupId, target)
})

test("expired punishment message identifies the exact punishment", async () => {
  const groupId = `__punishment_expiry_msg_${Date.now()}@g.us`
  const target = "expired@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const active = storage.getActivePunishments()
  if (!active[groupId]) active[groupId] = {}
  active[groupId][target] = [
    {
      type: "allCaps",
      punishmentId: "9",
      endsAt: Date.now() - 2_000,
    },
    {
      type: "sexualReaction",
      punishmentId: "11",
      endsAt: Date.now() + 60_000,
    },
  ]
  storage.setActivePunishments(active)

  const enforced = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-expiry-1", remoteJid: groupId, fromMe: false, participant: target } },
    groupId,
    target,
    "texto qualquer",
    true,
    false,
    true
  )

  assert.equal(enforced, false)
  assert.ok(sent.some((entry) => /punição expirada: \*somente caixa alta\*/i.test(String(entry.payload?.text || ""))))
  const stack = getPunishmentStack(groupId, target)
  assert.equal(stack.length, 1)
  assert.equal(stack[0]?.type, "sexualReaction")
  punishmentService.clearPunishment(groupId, target)
})

test("adivinhacao resolves with closest players and punishments", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net", "c@s.whatsapp.net"]
  const state = adivinhacao.start("g@g.us", players)
  state.secretNumber = 50

  assert.equal(adivinhacao.recordGuess(state, players[0], "49").valid, true)
  assert.equal(adivinhacao.recordGuess(state, players[1], "49").valid, true)
  assert.equal(adivinhacao.recordGuess(state, players[2], "70").valid, true)

  const results = adivinhacao.getResults(state)
  assert.ok(Array.isArray(results.closestPlayers))
  assert.equal(results.closestPlayers.length, 2)
  assert.ok(results.punishments.some((p) => p.playerId === players[2]))
})

test("dueloDados returns tie punishment when both rolls are equal", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = dueloDados.start("g@g.us", players)
  state.rolls[players[0]] = 10
  state.rolls[players[1]] = 10

  const results = dueloDados.getResults(state)
  assert.equal(results.type, "tie")
  assert.deepEqual(results.punish.sort(), players.slice().sort())
})

test("roletaRussa guarantees a hit at sixth shot if not hit earlier", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = roletaRussa.start("g@g.us", players, { betValue: 5 })
  state.cylinders = 5

  let hit = false
  let outcome = null
  for (let i = 0; i < 6; i++) {
    outcome = roletaRussa.takeShotAt(state)
    if (outcome.hit) {
      hit = true
      break
    }
  }

  assert.equal(hit, true)
  assert.ok(outcome.loser)
})

test("roletaRussa solo auto-win triggers after surpassing bet", () => {
  const player = "solo@s.whatsapp.net"
  const state = roletaRussa.start("g@g.us", [player], { betValue: 0 })
  state.cylinders = 5

  const outcome = roletaRussa.takeShotAt(state)
  assert.equal(outcome.autoWin, true)
  assert.equal(outcome.hit, false)
  assert.deepEqual(outcome.winners, [player])
})

test("roletaRussa solo wins even on hit after clearing bet", () => {
  const player = "solo@s.whatsapp.net"
  const state = roletaRussa.start("g@g.us", [player], { betValue: 0 })
  state.cylinders = 0

  const outcome = roletaRussa.takeShotAt(state)
  assert.equal(outcome.hit, true)
  assert.equal(Boolean(outcome.autoWin), true)
  assert.deepEqual(outcome.winners, [player])
})

test("roletaRussa multiplayer hit after surpassing bet becomes all-win", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = roletaRussa.start("g@g.us", players, { betValue: 1 })
  state.cylinders = 5

  let outcome = null
  for (let i = 0; i < 6; i++) {
    outcome = roletaRussa.takeShotAt(state)
    if (outcome.hit) break
  }

  assert.equal(outcome.hit, true)
  assert.equal(outcome.allWin, true)
  assert.deepEqual((outcome.winners || []).sort(), players.slice().sort())
})

test("roletaRussa chamber selection hits on expected shot index", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]

  for (let chamber = 0; chamber <= 5; chamber++) {
    const state = roletaRussa.start("g@g.us", players, { betValue: 5 })
    state.cylinders = chamber

    let outcome = null
    for (let i = 0; i < 6; i++) {
      outcome = roletaRussa.takeShotAt(state)
      if (outcome.hit) break
    }

    assert.equal(Boolean(outcome?.hit), true)
    assert.equal(state.shotsFired, chamber + 1)
    assert.equal(Boolean(outcome?.guaranteed), chamber === 5)
  }
})

test("coin guess accepts formatted cara/coroa messages", async () => {
  const groupId = `__coin_guess_format_${Date.now()}@g.us`
  const sender = "formatted@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let rewardCalls = 0
  let lossCalls = 0

  setCoinRound(groupId, sender, "coroa")

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "  !CÓROA!!!  ",
    isGroup: true,
    isOverrideSender: false,
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {},
    clearPendingPunishment: () => {},
    rewardWinner: async () => {
      rewardCalls += 1
    },
    chargeLoser: async () => {
      lossCalls += 1
    },
  })

  assert.equal(handled, true)
  assert.equal(rewardCalls, 1)
  assert.equal(lossCalls, 0)
  assert.ok(sent.some((m) => String(m.payload?.text || "").includes("A moeda caiu em *coroa*")))
})

test("dobro ou nada charges buy-in 50 and doubles payout by streak", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__dobro_curve_${Date.now()}@g.us`
  const sender = `winner_${Date.now()}@s.whatsapp.net`
  const { sock } = createSockCapture()

  economyService.creditCoins(sender, 1000, { type: "test-credit" })
  const beforeCoins = Number(economyService.getProfile(sender)?.coins || 0)

  const started = await caraOuCoroa.startDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
    economyService,
    incrementUserStat: () => {},
  })
  assert.equal(started, true)

  const afterBuyInCoins = Number(economyService.getProfile(sender)?.coins || 0)
  assert.equal(afterBuyInCoins, beforeCoins - 50)

  const firstWin = await caraOuCoroa.handleDobroGuess({
    sock,
    from: groupId,
    sender,
    text: "cara",
    storage,
    economyService,
    incrementUserStat: () => {},
    isOverrideSender: true,
  })
  assert.equal(firstWin, true)
  const afterFirstWinState = caraOuCoroa.getDobroState(groupId, sender)
  assert.equal(afterFirstWinState?.streak, 1)
  assert.equal(afterFirstWinState?.status, "waiting_for_choice")

  const continued = await caraOuCoroa.continueDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
  })
  assert.equal(continued, true)

  const secondWin = await caraOuCoroa.handleDobroGuess({
    sock,
    from: groupId,
    sender,
    text: "cara",
    storage,
    economyService,
    incrementUserStat: () => {},
    isOverrideSender: true,
  })
  assert.equal(secondWin, true)
  const afterSecondWinState = caraOuCoroa.getDobroState(groupId, sender)
  assert.equal(afterSecondWinState?.streak, 2)
  assert.equal(afterSecondWinState?.status, "waiting_for_choice")

  const exited = await caraOuCoroa.exitDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
    economyService,
    incrementUserStat: () => {},
  })
  assert.equal(exited, true)

  const finalCoins = Number(economyService.getProfile(sender)?.coins || 0)
  assert.equal(finalCoins, beforeCoins + 50)
  assert.equal(caraOuCoroa.getDobroState(groupId, sender), null)
})

test("dobro ou nada accepts formatted guess text", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__dobro_guess_format_${Date.now()}@g.us`
  const sender = `formatted_dobro_${Date.now()}@s.whatsapp.net`
  const { sock } = createSockCapture()

  economyService.creditCoins(sender, 1000, { type: "test-credit" })

  const started = await caraOuCoroa.startDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
    economyService,
    incrementUserStat: () => {},
  })
  assert.equal(started, true)

  const handledGuess = await caraOuCoroa.handleDobroGuess({
    sock,
    from: groupId,
    sender,
    text: "*!CÁRA?!*",
    storage,
    economyService,
    incrementUserStat: () => {},
    isOverrideSender: true,
  })

  assert.equal(handledGuess, true)
  const state = caraOuCoroa.getDobroState(groupId, sender)
  assert.equal(state?.streak, 1)
  assert.equal(state?.status, "waiting_for_choice")
})

test("override coin guess uses player guess as resolved result", async () => {
  const groupId = `__override_guess_${Date.now()}@g.us`
  const sender = "override@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let rewardCalls = 0

  setCoinRound(groupId, sender, "coroa")

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "cara",
    isGroup: true,
    isOverrideSender: true,
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {},
    clearPendingPunishment: () => {},
    rewardWinner: async () => {
      rewardCalls += 1
    },
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(rewardCalls, 1)
  assert.ok(sent.some((m) => String(m.payload?.text || "").includes("A moeda caiu em *cara*")))
})

test("disabled override uses actual toss result", async () => {
  const groupId = `__override_disabled_${Date.now()}@g.us`
  const sender = "override@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let rewardCalls = 0
  let lossCalls = 0

  setCoinRound(groupId, sender, "coroa")

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "cara",
    isGroup: true,
    isOverrideSender: false,
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {},
    clearPendingPunishment: () => {},
    rewardWinner: async () => {
      rewardCalls += 1
    },
    chargeLoser: async () => {
      lossCalls += 1
    },
  })

  assert.equal(handled, true)
  assert.equal(rewardCalls, 0)
  assert.equal(lossCalls, 1)
  assert.ok(sent.some((m) => String(m.payload?.text || "").includes("A moeda caiu em *coroa*")))
})
