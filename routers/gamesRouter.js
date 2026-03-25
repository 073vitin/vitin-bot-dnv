const telemetry = require("../telemetryService")

const RR_TURN_TIMEOUT_MS = 60_000
const RR_TURN_TIMEOUT_SECONDS = Math.floor(RR_TURN_TIMEOUT_MS / 1000)
const LOBBY_BET_GRACE_MS = 15_000
const GAME_XP_REWARDS = {
  lobbyStart: 6,
  batataWin: 24,
  batataLoss: 10,
  guessExact: 35,
  guessClosest: 20,
  guessLoss: 8,
  dadosWin: 28,
  dadosLoss: 10,
  rrSurviveShot: 6,
  rrWin: 30,
  rrLoss: 12,
}
const rrTurnTimeouts = new Map()

function rrTurnTimerKey(groupId, lobbyId) {
  return `${groupId}::${lobbyId}`
}

function clearRrTurnTimeout(groupId, lobbyId) {
  const key = rrTurnTimerKey(groupId, lobbyId)
  const timerId = rrTurnTimeouts.get(key)
  if (timerId) {
    clearTimeout(timerId)
    rrTurnTimeouts.delete(key)
  }
}

async function handleGameCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    cmdName,
    cmdArg1,
    cmdArg2,
    mentioned,
    prefix,
    isGroup,
    text,
    msg,
    storage,
    gameManager,
    economyService,
    caraOuCoroa,
    adivinhacao,
    batataquente,
    dueloDados,
    roletaRussa,
    startPeriodicGame,
    GAME_REWARDS,
    BASE_GAME_REWARD,
    normalizeUnifiedGameType,
    normalizeLobbyId,
    activeGameKey,
    resolveActiveLobbyForPlayer,
    getLobbyCreateBlockMessage,
    getGameBuyIn,
    collectLobbyBuyIn,
    distributeLobbyBuyInPool,
    parsePositiveInt,
    isResenhaModeEnabled,
    rewardPlayer,
    rewardPlayers,
    incrementUserStat,
    applyRandomGamePunishment,
    createPendingTargetForWinner,
    jidNormalizedUser,
    createLobbyWarningCallback,
    createLobbyTimeoutCallback,
    buildGameStatsText,
  } = ctx

  const isJoinCommand = cmdName === prefix + "entrar" || cmdName === prefix + "join"
  const isStartCommand = (
    cmdName === prefix + "começar" ||
    cmdName === prefix + "comecar" ||
    cmdName === prefix + "start"
  )
  const normalizedStartTarget = normalizeUnifiedGameType(cmdArg1)
  const isQuickGameStartTarget = ["embaralhado", "memória", "reação", "comando"].includes(normalizedStartTarget)

  async function getCommandParticipants() {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    return (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)
  }

  function buildBetMultiplierMap(playerIds, multiplier) {
    const safeMultiplier = parsePositiveInt(multiplier, 1)
    return (playerIds || []).reduce((acc, playerId) => {
      acc[playerId] = safeMultiplier
      return acc
    }, {})
  }

  function getLobbyGraceStateKey(lobbyId) {
    return `lobbyGrace:${lobbyId}`
  }

  function sanitizeLobbyBet(value, fallback = 1) {
    const parsed = parsePositiveInt(value, fallback)
    return Math.max(1, Math.min(10, parsed))
  }

  function resolvePunishmentSeverityFromLoserBet(state, playerId, fallbackSeverity = 1) {
    const nativeSeverity = sanitizeLobbyBet(fallbackSeverity, 1)
    const betByPlayer = state?.playerBetByPlayer
    if (!betByPlayer || typeof betByPlayer !== "object") return nativeSeverity
    if (!Object.prototype.hasOwnProperty.call(betByPlayer, playerId)) return nativeSeverity
    return sanitizeLobbyBet(betByPlayer[playerId], nativeSeverity)
  }

  function parseDifficulty(value, fallback = 3) {
    const parsed = parsePositiveInt(value, fallback)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) return null
    return parsed
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function getTeamMembersFromStorage(teamId) {
    const team = typeof storage.getTeam === "function" ? storage.getTeam(teamId) : null
    if (!team || !Array.isArray(team.members)) return []
    return [...new Set(team.members.filter(Boolean))]
  }

  function getUserLevel(userId) {
    const profile = typeof economyService.getProfile === "function" ? economyService.getProfile(userId) : null
    const level = Number(profile?.progression?.level) || 1
    return Math.max(1, Math.floor(level))
  }

  function getActiveTeamParticipants(teamMembers = [], presentParticipants = []) {
    const presentSet = new Set((presentParticipants || []).filter(Boolean))
    return (teamMembers || []).filter((memberId) => presentSet.has(memberId))
  }

  function getContributionWeightMap(participants = []) {
    const map = {}
    for (const userId of participants) {
      map[userId] = 1 + (getUserLevel(userId) / 10)
    }
    return map
  }

  function getTeamPower(participants = [], difficulty = 3) {
    if (!Array.isArray(participants) || participants.length === 0) return 0
    const levelAvg = participants.reduce((sum, userId) => sum + getUserLevel(userId), 0) / participants.length
    const teamEfficiencyUnits = Math.sqrt(participants.length)
    const levelFactor = 1 + (levelAvg / 30)
    const difficultyTax = clamp(1 - (difficulty * 0.03), 0.55, 0.97)
    return teamEfficiencyUnits * levelFactor * difficultyTax
  }

  function distributeSharedRewards(participants = [], totalCoins = 0, xpEach = 0, options = {}) {
    const safeParticipants = [...new Set((participants || []).filter(Boolean))]
    if (safeParticipants.length === 0) {
      return { distributedCoins: 0, perUser: {}, teamPoolBonus: 0 }
    }

    const participantBaseSharePct = clamp(Number(options.participantBaseSharePct) || 0.45, 0.25, 0.7)
    const teamPoolSharePct = clamp(Number(options.teamPoolSharePct) || 0.1, 0, 0.35)
    const total = Math.max(0, Math.floor(Number(totalCoins) || 0))
    const teamPoolBonus = Math.floor(total * teamPoolSharePct)
    const distributable = Math.max(0, total - teamPoolBonus)

    const basePool = Math.floor(distributable * participantBaseSharePct)
    const weightedPool = Math.max(0, distributable - basePool)
    const basePerUser = Math.floor(basePool / safeParticipants.length)

    const weights = getContributionWeightMap(safeParticipants)
    const totalWeight = safeParticipants.reduce((sum, userId) => sum + (weights[userId] || 1), 0)

    const perUser = {}
    let distributed = 0
    for (const userId of safeParticipants) {
      const weight = weights[userId] || 1
      const weightedShare = totalWeight > 0
        ? Math.floor((weightedPool * weight) / totalWeight)
        : 0
      const amount = Math.max(0, basePerUser + weightedShare)
      if (amount > 0 && typeof economyService.creditCoins === "function") {
        economyService.creditCoins(userId, amount, {
          type: "game-win",
          details: options.details || "Vitória em modo cooperativo",
          meta: {
            mode: options.mode || "coop",
            groupId: from,
          },
        })
      }
      if (xpEach > 0) {
        grantGameXp(userId, xpEach, options.xpSource || "team-mode", {
          mode: options.mode || "coop",
          ...options.xpMeta,
        })
      }
      perUser[userId] = amount
      distributed += amount
    }

    return {
      distributedCoins: distributed,
      perUser,
      teamPoolBonus,
    }
  }

  function formatParticipantList(participants = []) {
    return (participants || []).map((userId) => `@${String(userId).split("@")[0]}`).join(" ")
  }

  function grantGameXp(userId, xpAmount, source = "game", meta = {}) {
    const safeXp = Math.max(0, Math.floor(Number(xpAmount) || 0))
    if (!safeXp) return
    if (typeof economyService?.addXp !== "function") return
    economyService.addXp(userId, safeXp, {
      source,
      ...meta,
    })
  }

  function getGraceStates() {
    const states = storage.getGameStates(from)
    return Object.keys(states || {})
      .filter((key) => key.startsWith("lobbyGrace:"))
      .map((key) => ({ key, state: states[key], lobbyId: key.substring("lobbyGrace:".length) }))
      .filter((entry) => entry.state && entry.lobbyId)
  }

  function collectLobbyBuyInWithBets(playerIds, buyInAmount, gameType, playerBetByPlayer = {}) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return { ok: true, pool: 0, buyInByPlayer: {}, playerBetByPlayer: {} }
    }
    if (buyInAmount <= 0) {
      const normalizedBets = playerIds.reduce((acc, playerId) => {
        acc[playerId] = sanitizeLobbyBet(playerBetByPlayer[playerId], 1)
        return acc
      }, {})
      return { ok: true, pool: 0, buyInByPlayer: {}, playerBetByPlayer: normalizedBets }
    }

    const uniquePlayers = [...new Set(playerIds.filter(Boolean))]
    const normalizedBets = uniquePlayers.reduce((acc, playerId) => {
      acc[playerId] = sanitizeLobbyBet(playerBetByPlayer[playerId], 1)
      return acc
    }, {})

    const buyInByPlayer = uniquePlayers.reduce((acc, playerId) => {
      acc[playerId] = buyInAmount * normalizedBets[playerId]
      return acc
    }, {})

    const insufficient = uniquePlayers.filter((playerId) => economyService.getCoins(playerId) < buyInByPlayer[playerId])
    if (insufficient.length > 0) {
      return { ok: false, insufficient, buyInByPlayer, playerBetByPlayer: normalizedBets }
    }

    let pool = 0
    for (const playerId of uniquePlayers) {
      const debitAmount = buyInByPlayer[playerId]
      const debited = economyService.debitCoins(playerId, debitAmount, {
        type: "game-buyin",
        details: `Entrada para ${gameType}`,
        meta: {
          game: gameType,
          buyInBase: buyInAmount,
          playerBet: normalizedBets[playerId],
          buyInAmount: debitAmount,
        },
      })
      if (debited) {
        pool += debitAmount
        incrementUserStat(playerId, "moneyGameLost", debitAmount)
      }
    }

    return { ok: true, pool, buyInByPlayer, playerBetByPlayer: normalizedBets }
  }

  function getLobbyPayoutOptions(state = {}) {
    return {
      payoutMode: "lobby-bet-formula",
      playerBetByPlayer: state.playerBetByPlayer || {},
      buyInByPlayer: state.buyInByPlayer || {},
    }
  }

  function scheduleRrTurnTimeout(lobbyId, stateKey) {
    clearRrTurnTimeout(from, lobbyId)
    const key = rrTurnTimerKey(from, lobbyId)
    const timerId = setTimeout(async () => {
      rrTurnTimeouts.delete(key)

      const latestState = storage.getGameState(from, stateKey)
      if (!latestState) return

      const timedOutPlayer = roletaRussa.getCurrentPlayer(latestState)
      if (!timedOutPlayer) {
        storage.clearGameState(from, stateKey)
        return
      }

      const winners = (latestState.players || []).filter((playerId) => playerId !== timedOutPlayer)
      const betMultiplier = parsePositiveInt(latestState.betMultiplier, 1)

      incrementUserStat(timedOutPlayer, "gameRrShotLoss", 1)

      if (winners.length > 0) {
        winners.forEach((playerId) => {
          incrementUserStat(playerId, "gameRrWin", 1)
          incrementUserStat(playerId, "gameRrBetWin", 1)
        })
        await distributeLobbyBuyInPool(winners, latestState.buyInPool, "Roleta Russa", getLobbyPayoutOptions(latestState))
      }

      await sock.sendMessage(from, {
        text:
          `⏱️ Lobby *${lobbyId}*: @${timedOutPlayer.split("@")[0]} não usou *!atirar* em ${RR_TURN_TIMEOUT_SECONDS}s.\n` +
          (winners.length > 0
            ? `🏆 Vitória automática para ${winners.map((p) => `@${p.split("@")[0]}`).join(" ")} (multiplicador ${betMultiplier}x).`
            : "Partida encerrada por timeout."),
        mentions: [timedOutPlayer, ...winners],
      })

      telemetry.incrementCounter("game.rr.completed", 1, {
        result: "turn-timeout",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: latestState.players,
        loser: timedOutPlayer,
        guaranteed: false,
        betMultiplier,
        timeoutMs: RR_TURN_TIMEOUT_MS,
        timeoutType: "turn",
      })

      storage.clearGameState(from, stateKey)
    }, RR_TURN_TIMEOUT_MS)

    rrTurnTimeouts.set(key, timerId)
  }

  // ======= fé que n quebra !BRINCADEIRAS =======
  if (cmd === prefix + "brincadeiras") {
    await sock.sendMessage(from, {
      text: `
╭━━━〔 🎮 SUBMENU: BRINCADEIRAS 〕━━━╮
│ - roleta
│ - bombardeio @user
│ - gay @user
│ - gado @user
│ - ship @a @b
│ - treta
╰━━━━━━━━━━━━━━━━━━━━╯
      `,
    })
    return true
  }
  // ==========================================================

  if ((cmd === prefix + "moeda dobro" || cmd === prefix + "moeda dobroounada" || cmd === prefix + "moeda dobrounada") && isGroup) {
    const toggle = caraOuCoroa.toggleDobroOuNada(from, sender)
    if (toggle.enabled) {
      await sock.sendMessage(from, {
        text: `🎲 Dobro ou Nada ATIVADO para !moeda!\n\n${caraOuCoroa.formatDobroStatus(from, toggle.state)}`,
      })
    } else {
      await sock.sendMessage(from, {
        text: "🎲 Dobro ou Nada DESATIVADO para !moeda.",
      })
    }
    return true
  }

  if (cmdName === prefix + "jogos" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: `${buildGameStatsText(profile)}\n\nUse *!jogos* para ver a lista de jogos.`,
    })
    return true
  }

module.exports = { handleGamesCommand };
  if (cmdName === prefix + "jogos" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: `${buildGameStatsText(profile)}\n\nUse *!jogos* para ver a lista de jogos.`,
    })
    return true
  }

  if (cmd === prefix + "jogos") {
    await sock.sendMessage(from, {
      text:
`╭━━━〔 🎮 SUBMENU: JOGOS 〕━━━╮
│ Jogos de lobby:
│ - adivinhacao
│ - batata
│ - dados
│ - rr
│ - moeda
│ - moeda dobro / moeda dobroounada
│ - streak / streakranking
│ - coop <dificuldade 1-10>
│ - teamduelo @usuario <dificuldade 1-10>
│
│ Jogos rápidos:
│ - embaralhado
│ - memória
│ - reação
│ - comando
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 📌 COMANDOS 〕━━━╮
│ ${prefix}jogos stats
│ ${prefix}entrar <LobbyID> / ${prefix}join <LobbyID>
│ ${prefix}lobbies
│ ${prefix}começar <jogo> (ou ${prefix}comecar / ${prefix}start)
│ ${prefix}começar <LobbyID> (ou ${prefix}comecar / ${prefix}start)
│ ${prefix}começar <embaralhado|memória|reação|comando>
│ ${prefix}comecar <embaralhado|memoria|reacao|comando>
│ ${prefix}coop <1-10>
│ ${prefix}teamduelo @usuario <1-10>
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmdName === prefix + "coop" && isGroup) {
    const difficulty = parseDifficulty(cmdArg1 || "3", 3)
    if (!difficulty) {
      await sock.sendMessage(from, { text: `Use: ${prefix}coop <dificuldade 1-10>` })
      return true
    }

    const teamId = typeof storage.getUserTeamId === "function" ? storage.getUserTeamId(sender) : null
    if (!teamId) {
      await sock.sendMessage(from, { text: "Você precisa estar em um time para usar o modo coop." })
      return true
    }

    const team = typeof storage.getTeam === "function" ? storage.getTeam(teamId) : null
    const teamMembers = getTeamMembersFromStorage(teamId)
    if (!team || teamMembers.length < 2) {
      await sock.sendMessage(from, { text: "Seu time precisa ter pelo menos 2 membros para jogar coop." })
      return true
    }

    const participantsInGroup = await getCommandParticipants()
    const activeMembers = getActiveTeamParticipants(teamMembers, participantsInGroup)
    const qualificationThreshold = Math.max(2, Math.ceil(teamMembers.length * 0.4))
    if (activeMembers.length < qualificationThreshold) {
      await sock.sendMessage(from, {
        text:
          `Participação insuficiente do time *${team.name || teamId}*.
Membros do time no grupo: *${activeMembers.length}* | mínimo exigido: *${qualificationThreshold}* (40% do time, mínimo 2).`,
      })
      return true
    }

    const entryCostPerPlayer = 12 * difficulty
    const qualifiedMembers = activeMembers.filter((userId) => {
      if (typeof economyService.getCoins !== "function") return true
      return economyService.getCoins(userId) >= entryCostPerPlayer
    })
    if (qualifiedMembers.length < qualificationThreshold) {
      await sock.sendMessage(from, {
        text:
          `Saldo insuficiente para iniciar coop.
Cada participante precisa de *${entryCostPerPlayer}* coins.
Elegíveis: *${qualifiedMembers.length}* | mínimo: *${qualificationThreshold}*`,
      })
      return true
    }

    let entryPool = 0
    for (const userId of qualifiedMembers) {
      const debited = typeof economyService.debitCoins === "function"
        ? economyService.debitCoins(userId, entryCostPerPlayer, {
            type: "game-buyin",
            details: `Entrada modo coop (dificuldade ${difficulty})`,
            meta: { game: "coop", difficulty, teamId },
          })
        : true
      if (debited) {
        entryPool += entryCostPerPlayer
        incrementUserStat(userId, "moneyGameLost", entryCostPerPlayer)
      }
    }

    const teamPower = getTeamPower(qualifiedMembers, difficulty)
    const successChance = clamp(0.28 + (teamPower * 0.07) - (difficulty * 0.03), 0.12, 0.9)
    const success = Math.random() < successChance

    if (success) {
      const mintedBonus = Math.floor((difficulty * 45) * Math.sqrt(qualifiedMembers.length))
      const totalReward = entryPool + mintedBonus
      const xpEach = 12 + (difficulty * 4)
      const rewards = distributeSharedRewards(qualifiedMembers, totalReward, xpEach, {
        mode: "coop",
        details: `Vitória no modo coop (${difficulty})`,
        xpSource: "coop-win",
        xpMeta: { difficulty },
      })

      if (rewards.teamPoolBonus > 0 && typeof storage.addTeamPoolCoins === "function") {
        storage.addTeamPoolCoins(teamId, rewards.teamPoolBonus)
      }

      qualifiedMembers.forEach((userId) => incrementUserStat(userId, "gameComandoWin", 1))

      telemetry.incrementCounter("game.coop.completed", 1, { result: "win", difficulty })
      telemetry.appendEvent("game.coop.completed", {
        groupId: from,
        teamId,
        teamName: team.name || teamId,
        participants: qualifiedMembers,
        difficulty,
        successChance,
        result: "win",
        entryPool,
        totalReward,
        distributedCoins: rewards.distributedCoins,
        teamPoolBonus: rewards.teamPoolBonus,
      })

      await sock.sendMessage(from, {
        text:
          `🤝 MISSÃO COOP COMPLETA (${difficulty}/10)
Time: *${team.name || teamId}*
Participantes: ${formatParticipantList(qualifiedMembers)}
Chance de sucesso: *${Math.round(successChance * 100)}%*
✅ Recompensa distribuída: *${rewards.distributedCoins}* coins
🏦 Bônus no cofre do time: *${rewards.teamPoolBonus}* coins`,
        mentions: qualifiedMembers,
      })
      return true
    }

    const consolationXp = Math.max(4, Math.floor(difficulty * 2))
    qualifiedMembers.forEach((userId) => {
      incrementUserStat(userId, "gameComandoLoss", 1)
      grantGameXp(userId, consolationXp, "coop-loss", { difficulty })
    })

    telemetry.incrementCounter("game.coop.completed", 1, { result: "loss", difficulty })
    telemetry.appendEvent("game.coop.completed", {
      groupId: from,
      teamId,
      teamName: team.name || teamId,
      participants: qualifiedMembers,
      difficulty,
      successChance,
      result: "loss",
      entryPool,
    })

    await sock.sendMessage(from, {
      text:
        `🤝 MISSÃO COOP FALHOU (${difficulty}/10)
Time: *${team.name || teamId}*
Participantes: ${formatParticipantList(qualifiedMembers)}
Chance estimada: *${Math.round(successChance * 100)}%*
💥 Entrada consumida: *${entryPool}* coins
📘 Consolação: +${consolationXp} XP por participante`,
      mentions: qualifiedMembers,
    })
    return true
  }

  if (cmdName === prefix + "teamduelo" && isGroup) {
    const opponentAnchor = mentioned[0]
    const difficulty = parseDifficulty(cmdArg2 || cmdArg1 || "3", 3)
    if (!opponentAnchor || !difficulty) {
      await sock.sendMessage(from, { text: `Use: ${prefix}teamduelo @usuario <dificuldade 1-10>` })
      return true
    }

    const teamAId = typeof storage.getUserTeamId === "function" ? storage.getUserTeamId(sender) : null
    const teamBId = typeof storage.getUserTeamId === "function" ? storage.getUserTeamId(opponentAnchor) : null
    if (!teamAId || !teamBId || teamAId === teamBId) {
      await sock.sendMessage(from, {
        text: "Você e o alvo devem estar em times diferentes para iniciar teamduelo.",
      })
      return true
    }

    const teamA = typeof storage.getTeam === "function" ? storage.getTeam(teamAId) : null
    const teamB = typeof storage.getTeam === "function" ? storage.getTeam(teamBId) : null
    if (!teamA || !teamB) {
      await sock.sendMessage(from, { text: "Não foi possível carregar os dois times para o duelo." })
      return true
    }

    const groupParticipants = await getCommandParticipants()
    const teamAMembers = getTeamMembersFromStorage(teamAId)
    const teamBMembers = getTeamMembersFromStorage(teamBId)
    const activeA = getActiveTeamParticipants(teamAMembers, groupParticipants)
    const activeB = getActiveTeamParticipants(teamBMembers, groupParticipants)
    const thresholdA = Math.max(2, Math.ceil(teamAMembers.length * 0.4))
    const thresholdB = Math.max(2, Math.ceil(teamBMembers.length * 0.4))

    if (activeA.length < thresholdA || activeB.length < thresholdB) {
      await sock.sendMessage(from, {
        text:
          `Participação insuficiente para teamduelo.
${teamA.name || teamAId}: ${activeA.length}/${thresholdA}
${teamB.name || teamBId}: ${activeB.length}/${thresholdB}`,
      })
      return true
    }

    const entryCost = 10 * difficulty
    const eligibleA = activeA.filter((userId) => {
      if (typeof economyService.getCoins !== "function") return true
      return economyService.getCoins(userId) >= entryCost
    })
    const eligibleB = activeB.filter((userId) => {
      if (typeof economyService.getCoins !== "function") return true
      return economyService.getCoins(userId) >= entryCost
    })

    if (eligibleA.length < thresholdA || eligibleB.length < thresholdB) {
      await sock.sendMessage(from, {
        text:
          `Saldo insuficiente para entrada do duelo (*${entryCost}* por membro).
${teamA.name || teamAId}: elegíveis ${eligibleA.length}/${thresholdA}
${teamB.name || teamBId}: elegíveis ${eligibleB.length}/${thresholdB}`,
      })
      return true
    }

    let poolA = 0
    let poolB = 0
    for (const userId of eligibleA) {
      const ok = typeof economyService.debitCoins === "function"
        ? economyService.debitCoins(userId, entryCost, {
            type: "game-buyin",
            details: `Entrada teamduelo (${difficulty})`,
            meta: { game: "teamduelo", side: "A", teamId: teamAId, difficulty },
          })
        : true
      if (ok) {
        poolA += entryCost
        incrementUserStat(userId, "moneyGameLost", entryCost)
      }
    }
    for (const userId of eligibleB) {
      const ok = typeof economyService.debitCoins === "function"
        ? economyService.debitCoins(userId, entryCost, {
            type: "game-buyin",
            details: `Entrada teamduelo (${difficulty})`,
            meta: { game: "teamduelo", side: "B", teamId: teamBId, difficulty },
          })
        : true
      if (ok) {
        poolB += entryCost
        incrementUserStat(userId, "moneyGameLost", entryCost)
      }
    }

    const powerA = getTeamPower(eligibleA, difficulty) + (Math.random() * 0.6)
    const powerB = getTeamPower(eligibleB, difficulty) + (Math.random() * 0.6)
    const winnerSide = powerA >= powerB ? "A" : "B"

    const winnerTeamId = winnerSide === "A" ? teamAId : teamBId
    const winnerTeam = winnerSide === "A" ? teamA : teamB
    const winnerMembers = winnerSide === "A" ? eligibleA : eligibleB
    const loserMembers = winnerSide === "A" ? eligibleB : eligibleA
    const totalPool = poolA + poolB
    const mintedBonus = Math.floor((difficulty * 35) * Math.sqrt(Math.max(2, winnerMembers.length)))
    const totalReward = totalPool + mintedBonus
    const winnerXp = 10 + (difficulty * 3)
    const loserXp = Math.max(4, difficulty)

    const rewards = distributeSharedRewards(winnerMembers, totalReward, winnerXp, {
      mode: "teamduelo",
      details: `Vitória em teamduelo (${difficulty})`,
      xpSource: "teamduelo-win",
      xpMeta: { difficulty },
      teamPoolSharePct: 0.12,
    })

    loserMembers.forEach((userId) => grantGameXp(userId, loserXp, "teamduelo-loss", { difficulty }))

    if (rewards.teamPoolBonus > 0 && typeof storage.addTeamPoolCoins === "function") {
      storage.addTeamPoolCoins(winnerTeamId, rewards.teamPoolBonus)
    }

    winnerMembers.forEach((userId) => incrementUserStat(userId, "gameDadosWin", 1))
    loserMembers.forEach((userId) => incrementUserStat(userId, "gameDadosLoss", 1))

    telemetry.incrementCounter("game.teamduelo.completed", 1, {
      difficulty,
      winnerSide,
    })
    telemetry.appendEvent("game.teamduelo.completed", {
      groupId: from,
      difficulty,
      teamAId,
      teamBId,
      teamAName: teamA.name || teamAId,
      teamBName: teamB.name || teamBId,
      powerA,
      powerB,
      winnerSide,
      winnerTeamId,
      entryPool: totalPool,
      mintedBonus,
      distributedCoins: rewards.distributedCoins,
      teamPoolBonus: rewards.teamPoolBonus,
      participantsA: eligibleA,
      participantsB: eligibleB,
    })

    await sock.sendMessage(from, {
      text:
        `⚔️ TEAMDUELO (${difficulty}/10)
${teamA.name || teamAId} vs ${teamB.name || teamBId}
Poder: *${powerA.toFixed(2)}* vs *${powerB.toFixed(2)}*
🏆 Vencedor: *${winnerTeam.name || winnerTeamId}*
💰 Recompensa distribuída: *${rewards.distributedCoins}* coins
🏦 Bônus no cofre vencedor: *${rewards.teamPoolBonus}* coins
📘 XP: vencedores +${winnerXp}, derrotados +${loserXp}`,
      mentions: [...winnerMembers, ...loserMembers],
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "adivinhacao") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("adivinhacao", "Adivinhação")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "adivinhacao", 1, 4, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "adivinhacao" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "adivinhacao", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🎰 Jogo de Adivinhação criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n\n` +
        `Entrada por jogador: *${getGameBuyIn("adivinhacao")}* Epsteincoins (cobrada ao iniciar).\n` +
        `1-4 jogadores, número secreto entre 1 e 100.\n` +
        `Depois de iniciar, responda com *!resposta <número>*.`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "batata") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("batata", "Batata Quente")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "batata", 2, null, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "batata" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "batata", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🥔 Batata Quente criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n` +
        `Entrada por jogador: *${getGameBuyIn("batata")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Mínimo de 2 jogadores, sem limite máximo.`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "dados") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("dados", "Duelo de Dados")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "dados", 2, 2, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "dados" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "dados", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🎲 Duelo de Dados criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n` +
        `Entrada por jogador: *${getGameBuyIn("dados")}* Epsteincoins (cobrada ao iniciar).`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "rr") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("rr", "Roleta Russa")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "rr", 1, 4, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "rr" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "rr", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🔫 Roleta Russa criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*) [aposta]\n` +
        `Entrada por jogador: *${getGameBuyIn("rr")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Exemplo: *!começar ${lobbyId} 3*`,
    })
    return true
  }

  if (isJoinCommand && isGroup) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !entrar <LobbyID> ou !join <LobbyID>" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado ou expirado.` })
      return true
    }

    if (gameManager.addPlayerToOptIn(from, lobbyId, sender)) {
      incrementUserStat(sender, "lobbiesJoined", 1)
      telemetry.incrementCounter("game.lobby.joined", 1, { gameType: session.gameType })
      telemetry.appendEvent("game.lobby.joined", { groupId: from, lobbyId, gameType: session.gameType, userId: sender })
      const maxPlayersLabel = Number.isFinite(session.maxPlayers) ? String(session.maxPlayers) : "∞"
      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} entrou no lobby *${lobbyId}*!\nJogadores: ${session.players.length}/${maxPlayersLabel}`,
        mentions: [sender],
      })
    } else {
      await sock.sendMessage(from, {
        text: "Lobby cheio ou você já entrou nele.",
      })
    }
    return true
  }

  if (cmd === prefix + "lobbies" && isGroup) {
    const groupSessions = gameManager.optInSessions[from] || {}
    const ids = Object.keys(groupSessions)
    if (ids.length === 0) {
      await sock.sendMessage(from, { text: "Nenhum lobby aberto no momento." })
      return true
    }

    const lines = ids.map((id) => {
      const s = groupSessions[id]
      const maxPlayersLabel = Number.isFinite(s.maxPlayers) ? String(s.maxPlayers) : "∞"
      return `- ${id} | ${s.gameType} | ${s.players.length}/${maxPlayersLabel}`
    })

    await sock.sendMessage(from, {
      text:
        "Lobbies abertos:\n" +
        lines.join("\n") +
        "\n\nEntre com: !entrar <LobbyID>",
    })
    return true
  }

  if (cmdName === prefix + "aposta" && isGroup) {
    const explicitLobbyId = normalizeLobbyId(cmdArg1)
    let targetLobbyId = ""
    let betToken = ""

    if (explicitLobbyId) {
      targetLobbyId = explicitLobbyId
      betToken = cmdArg2
    } else {
      betToken = cmdArg1
      const playerGraceStates = getGraceStates().filter((entry) =>
        Array.isArray(entry.state?.players) && entry.state.players.includes(sender)
      )

      if (playerGraceStates.length === 0) return false
      if (playerGraceStates.length > 1) {
        await sock.sendMessage(from, {
          text: "Você está em múltiplos lobbies em período de aposta. Use: !aposta <LobbyID> <1-10>",
        })
        return true
      }
      targetLobbyId = playerGraceStates[0].lobbyId
    }

    const graceKey = getLobbyGraceStateKey(targetLobbyId)
    const graceState = storage.getGameState(from, graceKey)
    if (!graceState) return false

    if (!Array.isArray(graceState.players) || !graceState.players.includes(sender)) {
      await sock.sendMessage(from, {
        text: `Você não está no lobby *${targetLobbyId}* em preparação.`,
      })
      return true
    }

    const betRaw = Number.parseInt(String(betToken || ""), 10)
    if (!Number.isFinite(betRaw) || betRaw < 1 || betRaw > 10) {
      await sock.sendMessage(from, {
        text: "Use: !aposta <LobbyID> <1-10>",
      })
      return true
    }

    if (!graceState.playerBetByPlayer) graceState.playerBetByPlayer = {}
    graceState.playerBetByPlayer[sender] = betRaw
    storage.setGameState(from, graceKey, graceState)

    const baseBuyIn = Math.max(0, Number(graceState.buyInAmount) || 0)
    const multipliedBuyIn = baseBuyIn * betRaw
    await sock.sendMessage(from, {
      text:
        `🎯 Lobby *${targetLobbyId}*: bet de @${sender.split("@")[0]} ajustada para *${betRaw}x*.\n` +
        `Buy-in deste jogador: *${multipliedBuyIn}* Epsteincoins (base ${baseBuyIn}).`,
      mentions: [sender],
    })
    return true
  }

  if (isStartCommand && isGroup && !isQuickGameStartTarget) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !começar <LobbyID> (ou !comecar / !start)" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado.` })
      return true
    }

    const stateKey = activeGameKey(session.gameType, lobbyId)
    if (storage.getGameState(from, stateKey)) {
      await sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      return true
    }

    const graceStateKey = getLobbyGraceStateKey(lobbyId)
    const existingGraceState = storage.getGameState(from, graceStateKey)
    if (!existingGraceState?.forceStart) {
      if (existingGraceState) {
        await sock.sendMessage(from, {
          text: `Lobby *${lobbyId}* já está no período de aposta. Use: !aposta ${lobbyId} <1-10>`,
        })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const graceState = {
        lobbyId,
        gameType: session.gameType,
        players: [...session.players],
        buyInAmount,
        playerBetByPlayer: (session.players || []).reduce((acc, playerId) => {
          acc[playerId] = 1
          return acc
        }, {}),
        rrBetValueToken: cmdArg2,
        startedBy: sender,
        forceStart: false,
        createdAt: Date.now(),
      }
      storage.setGameState(from, graceStateKey, graceState)

      await sock.sendMessage(from, {
        text:
          `⏳ Lobby *${lobbyId}* entra em período de aposta por 15s.\n` +
          `Cada jogador pode definir bet de *1x a 10x* para multiplicar o buy-in.\n` +
          `Use: *!aposta ${lobbyId} <1-10>*).\n` +
          `Se não escolher, fica em *1x*.`,
        mentions: session.players || [],
      })

      setTimeout(async () => {
        const latestGraceState = storage.getGameState(from, graceStateKey)
        if (!latestGraceState) return
        latestGraceState.forceStart = true
        storage.setGameState(from, graceStateKey, latestGraceState)

        await handleGameCommands({
          sock,
          from,
          sender: latestGraceState.startedBy || sender,
          cmd: `${prefix}começar ${lobbyId}`,
          cmdName,
          cmdArg1: lobbyId,
          cmdArg2: latestGraceState.rrBetValueToken || "",
          mentioned,
          prefix,
          isGroup,
          text,
          msg,
          storage,
          gameManager,
          economyService,
          caraOuCoroa,
          adivinhacao,
          batataquente,
          dueloDados,
          roletaRussa,
          startPeriodicGame,
          GAME_REWARDS,
          BASE_GAME_REWARD,
          normalizeUnifiedGameType,
          normalizeLobbyId,
          activeGameKey,
          resolveActiveLobbyForPlayer,
          getLobbyCreateBlockMessage,
          getGameBuyIn,
          collectLobbyBuyIn,
          distributeLobbyBuyInPool,
          parsePositiveInt,
          isResenhaModeEnabled,
          rewardPlayer,
          rewardPlayers,
          incrementUserStat,
          applyRandomGamePunishment,
          createPendingTargetForWinner,
          jidNormalizedUser,
          createLobbyWarningCallback,
          createLobbyTimeoutCallback,
          buildGameStatsText,
        })
      }, LOBBY_BET_GRACE_MS)

      return true
    }

    const graceBetByPlayer = existingGraceState?.playerBetByPlayer || {}
    storage.clearGameState(from, graceStateKey)

    incrementUserStat(sender, "lobbiesStarted", 1)
    grantGameXp(sender, GAME_XP_REWARDS.lobbyStart, "lobby-start", {
      gameType: session.gameType,
      lobbyId,
    })
    telemetry.incrementCounter("game.lobby.started", 1, { gameType: session.gameType })
    telemetry.appendEvent("game.lobby.started", {
      groupId: from,
      lobbyId,
      gameType: session.gameType,
      starterId: sender,
      players: session.players,
    })

    if (session.gameType === "adivinhacao") {
      if (session.players.length < 1) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = adivinhacao.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const mentions = [...session.players]
      await sock.sendMessage(from, {
        text:
          `🎰 Adivinhação iniciada no lobby *${lobbyId}*!\n` +
          `${mentions.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Resposta: *!resposta <número>* (auto)\n` +
          `Ou: *!resposta ${lobbyId} <número>*\n` +
          `Faixa: 1-100`,
        mentions,
      })
      return true
    }

    if (session.gameType === "batata") {
      if (session.players.length < 2) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = batataquente.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🥔 Batata Quente iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `${batataquente.formatStatus(state)}\n` +
          `Comando de passe: *!passa @usuario* (auto)\n` +
          `Ou: *!passa ${lobbyId} @usuario*`,
        mentions: session.players,
      })

      const countdownSeconds = [15, 10, 5, 4, 3, 2, 1]
      for (const secs of countdownSeconds) {
        const delayMs = Math.max(0, state.durationMs - secs * 1000)
        setTimeout(async () => {
          const currentState = storage.getGameState(from, stateKey)
          if (!currentState) return
          const holder = currentState.currentHolder
          await sock.sendMessage(from, {
            text: `⏱️ *${secs}s* restantes no lobby *${lobbyId}*\nBatata com @${holder.split("@")[0]}`,
            mentions: [holder],
          })
        }, delayMs)
      }

      setTimeout(async () => {
        const finalState = storage.getGameState(from, stateKey)
        if (finalState) {
          const loser = batataquente.getLoser(finalState)
          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: resenhaOn
              ? `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} foi punido!`
              : `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} perdeu a rodada!`,
            mentions: [loser],
          })

          const winners = (finalState.players || []).filter((playerId) => playerId !== loser)
          winners.forEach((playerId) => incrementUserStat(playerId, "gameBatataWin", 1))
          incrementUserStat(loser, "gameBatataLoss", 1)
          winners.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.batataWin, "batata-win", { lobbyId }))
          grantGameXp(loser, GAME_XP_REWARDS.batataLoss, "batata-loss", { lobbyId })
          telemetry.incrementCounter("game.batata.completed", 1, {
            result: "timeout",
          })
          telemetry.appendEvent("game.batata.completed", {
            groupId: from,
            lobbyId,
            players: finalState.players,
            loser,
            winners,
          })
          await distributeLobbyBuyInPool(winners, finalState.buyInPool, "Batata Quente", getLobbyPayoutOptions(finalState))

          await applyRandomGamePunishment(loser, {
            severityMultiplier: resolvePunishmentSeverityFromLoserBet(finalState, loser, 1),
          })
          storage.clearGameState(from, stateKey)
        }
      }, 15000)

      return true
    }

    if (session.gameType === "dados") {
      if (session.players.length !== 2) {
        await sock.sendMessage(from, { text: "Precisamos de exatamente 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = dueloDados.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🎲 Duelo de Dados iniciado no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" vs ")}\n\n` +
          `Cada jogador usa: *!rolar* (auto)\n` +
          `Ou: *!rolar ${lobbyId}*`,
        mentions: session.players,
      })
      return true
    }

    if (session.gameType === "rr") {
      if (session.players.length === 0) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const betRaw = Number.parseInt(String(cmdArg2 ?? "0"), 10)
      const betValue = Number.isFinite(betRaw) ? Math.max(0, Math.min(5, betRaw)) : 0
      const state = roletaRussa.start(from, session.players, { betValue })
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const currentPlayer = roletaRussa.getCurrentPlayer(state)
      const startMentions = Array.from(new Set([
        ...session.players,
        ...(currentPlayer ? [currentPlayer] : []),
      ]))

      await sock.sendMessage(from, {
        text:
          `🔫 Roleta Russa iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Aposta: *${state.betValue || 0}*\n` +
          `Multiplicador (aposta + 1): *${state.betMultiplier || 1}x*\n` +
          `${roletaRussa.formatStatus(state)}\n` +
          `⏱️ Cada turno expira em *${RR_TURN_TIMEOUT_SECONDS}s*.\n` +
          `Atire com: *!atirar* (auto)\n` +
          `Ou: *!atirar ${lobbyId}*`,
        mentions: startMentions,
      })
      scheduleRrTurnTimeout(lobbyId, stateKey)
      return true
    }

    await sock.sendMessage(from, { text: "Esse lobby deve ser iniciado com !começar <jogo> (ou !comecar / !start)." })
    return true
  }

  if (cmdName === prefix + "resposta" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("adivinhacao", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Adivinhação ativa. Use !resposta <número> quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Adivinhação. Use: !resposta <LobbyID> <número>" })
      return true
    }

    const guessToken = resolved.foundExplicit ? cmdArg2 : cmdArg1
    const { lobbyId, stateKey, state } = resolved
    const result = adivinhacao.recordGuess(state, sender, guessToken)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)

    if (Object.keys(state.guesses).length === state.players.length) {
      const results = adivinhacao.getResults(state)
      const guessBuckets = {}
      Object.keys(state.guesses || {}).forEach((playerId) => {
        const guessValue = state.guesses[playerId]
        if (!guessBuckets[guessValue]) guessBuckets[guessValue] = []
        guessBuckets[guessValue].push(playerId)
      })
      Object.values(guessBuckets).forEach((bucket) => {
        if (bucket.length > 1) {
          bucket.forEach((playerId) => incrementUserStat(playerId, "gameGuessTie", 1))
        }
      })

      if (Array.isArray(results.punishments) && results.punishments.length > 0) {
        results.punishments.forEach((entry) => incrementUserStat(entry.playerId, "gameGuessLoss", 1))
        results.punishments.forEach((entry) => grantGameXp(entry.playerId, GAME_XP_REWARDS.guessLoss, "guess-loss", { lobbyId }))
      }

      const resenhaOn = isResenhaModeEnabled()
      const displayResults = resenhaOn
        ? results
        : {
            ...results,
            punishments: [],
            chooser: null,
            winner: null,
          }
      await sock.sendMessage(from, {
        text: `Lobby *${lobbyId}*\n\n${adivinhacao.formatResults(state, displayResults, resenhaOn)}`,
        mentions: state.players || [],
      })

      if (results.chooser) {
        incrementUserStat(results.chooser, "gameGuessExact", 1)
        grantGameXp(results.chooser, GAME_XP_REWARDS.guessExact, "guess-exact", { lobbyId })
        await distributeLobbyBuyInPool([results.chooser], state.buyInPool, "Adivinhação", getLobbyPayoutOptions(state))
      } else if (Array.isArray(results.closestPlayers) && results.closestPlayers.length > 0 && state.players.length > 1) {
        results.closestPlayers.forEach((playerId) => incrementUserStat(playerId, "gameGuessClosest", 1))
        results.closestPlayers.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.guessClosest, "guess-closest", { lobbyId }))
        await distributeLobbyBuyInPool(results.closestPlayers, state.buyInPool, "Adivinhação", getLobbyPayoutOptions(state))
      } else if (state.players.length === 1) {
        incrementUserStat(state.players[0], "gameGuessLoss", 1)
        grantGameXp(state.players[0], GAME_XP_REWARDS.guessLoss, "guess-solo-miss", { lobbyId })
        await sock.sendMessage(from, {
          text: "Adivinhação solo: só recebe recompensa em acerto exato.",
        })
      }

      if (Array.isArray(results.punishments) && results.punishments.length > 0) {
        if (resenhaOn) {
          for (const entry of results.punishments) {
            await applyRandomGamePunishment(entry.playerId, {
              severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, entry.playerId, entry.severity || 1),
            })
          }
        }
      }

      if (results.chooser) {
        await createPendingTargetForWinner(
          results.chooser,
          `🎯 @${results.chooser.split("@")[0]}, você acertou exatamente!`,
          results.choiceSeverity || 2,
          state.players.filter((p) => p !== results.chooser)
        )
      }

      telemetry.incrementCounter("game.adivinhacao.completed", 1, {
        result: results.chooser ? "exact" : (Array.isArray(results.closestPlayers) && results.closestPlayers.length > 0 ? "closest" : "none"),
      })
      telemetry.appendEvent("game.adivinhacao.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        chooser: results.chooser || null,
        closestCount: Array.isArray(results.closestPlayers) ? results.closestPlayers.length : 0,
      })

      storage.clearGameState(from, stateKey)
    }
    return true
  }

  if (cmdName === prefix + "passa" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("batata", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Batata Quente ativa. Use !passa @usuario quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Batata Quente. Use: !passa <LobbyID> @usuario" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Marque alguém para passar a batata!" })
      return true
    }

    const result = batataquente.recordPass(state, sender, target)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `✅ Lobby *${lobbyId}*: @${sender.split("@")[0]} passou a batata para @${target.split("@")[0]}!`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "rolar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("dados", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhum Duelo de Dados ativo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de um Duelo de Dados. Use: !rolar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const result = dueloDados.recordRoll(state, sender)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `🎲 Lobby *${lobbyId}*: @${sender.split("@")[0]} rolou ${result.roll}!`,
      mentions: [sender],
    })

    if (Object.keys(state.rolls).length === 2) {
      const results = dueloDados.getResults(state)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: `Lobby *${lobbyId}*\n\n${dueloDados.formatResults(state, results, resenhaOn)}`,
        mentions: state.players || [],
      })

      if (results.winner) {
        incrementUserStat(results.winner, "gameDadosWin", 1)
        grantGameXp(results.winner, GAME_XP_REWARDS.dadosWin, "dados-win", { lobbyId })
        await distributeLobbyBuyInPool([results.winner], state.buyInPool, "Duelo de Dados", getLobbyPayoutOptions(state))
      }

      if (results.punish && results.punish.length > 0) {
        results.punish.forEach((playerId) => incrementUserStat(playerId, "gameDadosLoss", 1))
        results.punish.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.dadosLoss, "dados-loss", { lobbyId }))
        if (resenhaOn) {
          for (const playerId of results.punish) {
            await applyRandomGamePunishment(playerId, {
              severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, playerId, results.severity || 1),
            })
          }
        }
      } else if (results.loser) {
        incrementUserStat(results.loser, "gameDadosLoss", 1)
        grantGameXp(results.loser, GAME_XP_REWARDS.dadosLoss, "dados-loss", { lobbyId })
        if (resenhaOn) {
          await applyRandomGamePunishment(results.loser, {
            severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, results.loser, results.severity || 1),
          })
        }
      }

      telemetry.incrementCounter("game.dados.completed", 1, {
        result: results.winner ? "win" : "tie",
      })
      telemetry.appendEvent("game.dados.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        winner: results.winner || null,
        loser: results.loser || null,
      })

      storage.clearGameState(from, stateKey)
    }
    return true
  }

  if (cmdName === prefix + "atirar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("rr", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Roleta Russa ativa." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Roleta Russa. Use: !atirar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const currentPlayer = roletaRussa.getCurrentPlayer(state)
    if (sender !== currentPlayer) {
      await sock.sendMessage(from, {
        text: `Não é sua vez no lobby *${lobbyId}*! É de @${currentPlayer.split("@")[0]}`,
        mentions: [currentPlayer],
      })
      return true
    }

    clearRrTurnTimeout(from, lobbyId)
    const result = roletaRussa.takeShotAt(state)
    incrementUserStat(sender, "gameRrTrigger", 1)
    grantGameXp(sender, GAME_XP_REWARDS.rrSurviveShot, "rr-shot", {
      lobbyId,
      hit: Boolean(result.hit),
    })
    storage.setGameState(from, stateKey, state)
    const betMultiplier = parsePositiveInt(state.betMultiplier, 1)
    const betValueRaw = Number.parseInt(String(state.betValue), 10)
    const betValue = Number.isFinite(betValueRaw) ? Math.max(0, Math.min(5, betValueRaw)) : Math.max(0, betMultiplier - 1)
    const soloCoinMultiplier = Math.max(1, betValue)
    const rrCoinMultiplier = state.players.length === 1 ? soloCoinMultiplier : betMultiplier

    if (result.autoWin) {
      const winners = Array.isArray(result.winners) && result.winners.length > 0
        ? result.winners
        : [sender]
      winners.forEach((playerId) => {
        incrementUserStat(playerId, "gameRrWin", 1)
        incrementUserStat(playerId, "gameRrBetWin", 1)
        grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "auto-win" })
      })
      if (state.players.length === 1) {
        await rewardPlayer(sender, GAME_REWARDS.ROLETA_WIN, rrCoinMultiplier, "Roleta Russa (solo)")
      }
      await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
      await sock.sendMessage(from, {
        text:
          `*CLICK*\n` +
          `✅ @${sender.split("@")[0]} sobreviveu e ultrapassou a aposta (*${betValue}*) no lobby *${lobbyId}*!\n` +
          `🏆 Vitória automática no modo solo.`,
        mentions: winners,
      })
      telemetry.incrementCounter("game.rr.completed", 1, {
        result: "solo-surpass",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        loser: null,
        guaranteed: false,
        betMultiplier,
        betValue,
        surpassedBet: true,
        mode: "solo",
      })
      storage.clearGameState(from, stateKey)
      return true
    }

    if (result.hit) {
      if (result.allWin) {
        const shotPlayer = sender
        const winnersRaw = Array.isArray(result.winners) && result.winners.length > 0
          ? result.winners
          : (state.players || [])
        const winners = winnersRaw.filter((playerId) => playerId !== shotPlayer)
        winners.forEach((playerId) => {
          incrementUserStat(playerId, "gameRrWin", 1)
          incrementUserStat(playerId, "gameRrBetWin", 1)
          grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "all-win" })
        })
        if (winners.length > 0) {
          await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
        }
        await sock.sendMessage(from, {
          text:
            `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTOU!"}\n` +
            `Lobby *${lobbyId}*\n` +
            `✅ O jogador da vez ultrapassou a aposta (*${betValue}*), mas quem tomou tiro não recebe prêmio.\n` +
            (winners.length > 0
              ? `🏆 Premiação para: ${winners.map((p) => `@${p.split("@")[0]}`).join(" ")}`
              : "Sem jogadores elegíveis para premiação nesta rodada."),
          mentions: [shotPlayer, ...winners],
        })
        telemetry.incrementCounter("game.rr.completed", 1, {
          result: result.guaranteed ? "guaranteed-all-win" : "all-win-surpass",
        })
        telemetry.appendEvent("game.rr.completed", {
          groupId: from,
          lobbyId,
          players: state.players,
          loser: shotPlayer,
          guaranteed: Boolean(result.guaranteed),
          betMultiplier,
          betValue,
          surpassedBet: true,
          mode: "multiplayer",
        })
        storage.clearGameState(from, stateKey)
        return true
      }

      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: resenhaOn
          ? `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido e punido!`
          : `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido!`,
        mentions: [result.loser],
      })

      const rrLoss = BASE_GAME_REWARD * rrCoinMultiplier
      const rrTaken = economyService.debitCoinsFlexible(result.loser, rrLoss, {
        type: "game-loss",
        details: "Derrota em Roleta Russa",
        meta: { game: "rr", multiplier: rrCoinMultiplier },
      })
      if (rrTaken > 0) {
        incrementUserStat(result.loser, "moneyGameLost", rrTaken)
        await sock.sendMessage(from, {
          text: `💸 @${result.loser.split("@")[0]} perdeu *${rrTaken}* Epsteincoins na Roleta Russa.`,
          mentions: [result.loser],
        })
      }

      incrementUserStat(result.loser, "gameRrShotLoss", 1)
      grantGameXp(result.loser, GAME_XP_REWARDS.rrLoss, "rr-loss", { lobbyId, guaranteed: Boolean(result.guaranteed) })
      await applyRandomGamePunishment(result.loser, {
        severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, result.loser, betMultiplier),
      })
      const winners = (state.players || []).filter((playerId) => playerId !== result.loser)
      winners.forEach((playerId) => {
        incrementUserStat(playerId, "gameRrWin", 1)
        incrementUserStat(playerId, "gameRrBetWin", 1)
        grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "hit" })
      })
      await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
      telemetry.incrementCounter("game.rr.completed", 1, {
        result: result.guaranteed ? "guaranteed-hit" : "hit",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        loser: result.loser,
        guaranteed: Boolean(result.guaranteed),
        betMultiplier,
        betValue,
        surpassedBet: Boolean(result.surpassedBet),
      })
      storage.clearGameState(from, stateKey)
    } else {
      const currentPlayer = roletaRussa.getCurrentPlayer(state)
      const clickMentions = Array.from(new Set([
        sender,
        ...(currentPlayer ? [currentPlayer] : []),
      ]))
      await sock.sendMessage(from, {
        text: `*CLICK*\n✅ @${sender.split("@")[0]} sobreviveu no lobby *${lobbyId}*!\n\n${roletaRussa.formatStatus(state)}`,
        mentions: clickMentions,
      })
      scheduleRrTurnTimeout(lobbyId, stateKey)
    }
    return true
  }

  if ((cmd === prefix + "embaralhado" || (isStartCommand && normalizeUnifiedGameType(cmdArg1) === "embaralhado")) && isGroup) {
    const participants = await getCommandParticipants()
    if (participants.length < 3) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 3 participantes para iniciar o Embaralhado por comando." })
      return true
    }

    const startResult = await startPeriodicGame("embaralhado", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "memória") && isGroup) {
    const participants = await getCommandParticipants()
    if (participants.length < 3) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 3 participantes para iniciar a Memória por comando." })
      return true
    }

    const startResult = await startPeriodicGame("memória", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "reação") && isGroup) {
    const participants = await getCommandParticipants()

    if (participants.length < 3) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 3 participantes para iniciar a Reação por comando." })
      return true
    }

    const startResult = await startPeriodicGame("reação", {
      triggeredBy: sender,
      automatic: false,
      reactionParticipants: participants,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "comando") && isGroup) {
    const participants = await getCommandParticipants()
    if (participants.length < 3) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 3 participantes para iniciar o Comando por comando." })
      return true
    }

    const startResult = await startPeriodicGame("comando", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  return false
}

async function handleGameMessageFlow(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    msg,
    mentioned,
    isGroup,
    isCommand,
    storage,
    gameManager,
    reação,
    embaralhado,
    memória,
    comando,
    startPeriodicGame,
    GAME_REWARDS,
    isResenhaModeEnabled,
    rewardPlayer,
    incrementUserStat,
    createPendingTargetForWinner,
  } = ctx

  if (!isGroup || isCommand) return false

  gameManager.incrementMessageCounter(from, sender)

  const reactionActive = storage.getGameState(from, "reaçãoActive")
  if (reactionActive && reactionActive.started && !reactionActive.winner) {
    const reactionResult = reação.recordReaction(reactionActive, sender)
    if (reactionResult.valid) {
      reactionActive.winner = sender
      storage.setGameState(from, "reaçãoActive", reactionActive)
      const results = reação.getResults(reactionActive)
      const resenhaOn = isResenhaModeEnabled()

      await sock.sendMessage(from, {
        text: reação.formatResults(reactionActive, results, resenhaOn),
        mentions: Array.from(new Set((results.reactions || []).map((r) => r.playerId))),
      })

      await rewardPlayer(sender, GAME_REWARDS.REACAO, 1, "Reação")
      incrementUserStat(sender, "gameReacaoWin", 1)
      const reactionLosers = (reactionActive.players || []).filter((playerId) => playerId !== sender)
      reactionLosers.forEach((playerId) => incrementUserStat(playerId, "gameReacaoLoss", 1))

      storage.clearGameState(from, "reaçãoActive")
      return true
    }
  }

  const wsActive = storage.getGameState(from, "embaralhadoActive")
  if (wsActive && !wsActive.winner) {
    const result = embaralhado.checkAnswer(wsActive, sender, text)
    if (result.correct) {
      storage.setGameState(from, "embaralhadoActive", wsActive)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: embaralhado.formatResults(wsActive, resenhaOn),
      })

      await rewardPlayer(sender, GAME_REWARDS.EMBARALHADO, 1, "Embaralhado")
      incrementUserStat(sender, "gameEmbaralhadoWin", 1)
      const embaralhadoLosers = (wsActive.players || []).filter((playerId) => playerId !== sender)
      embaralhadoLosers.forEach((playerId) => incrementUserStat(playerId, "gameEmbaralhadoLoss", 1))

      storage.clearGameState(from, "embaralhadoActive")
      return true
    }
  }

  const memActive = storage.getGameState(from, "memóriaActive")
  if (memActive && !memActive.winner) {
    const memoryAnswerText = text.trim()
    const memoryAnswerOnlyPattern = /^[A-Za-z0-9]{12}$/
    if (memoryAnswerOnlyPattern.test(memoryAnswerText)) {
      const result = memória.recordAttempt(memActive, sender, memoryAnswerText)
      if (result.correct) {
        storage.setGameState(from, "memóriaActive", memActive)
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: memória.formatResults(memActive, resenhaOn),
          mentions: [result.winner],
        })

        await rewardPlayer(result.winner, GAME_REWARDS.MEMORIA, 1, "Memória")
        incrementUserStat(result.winner, "gameMemoriaWin", 1)
        const memoriaLosers = (memActive.players || []).filter((playerId) => playerId !== result.winner)
        memoriaLosers.forEach((playerId) => incrementUserStat(playerId, "gameMemoriaLoss", 1))

        storage.clearGameState(from, "memóriaActive")
        return true
      }
    }
  }

  const uaActive = storage.getGameState(from, "comandoActive")
  if (uaActive) {
    comando.recordParticipant(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  }

  if (uaActive && uaActive.instruction.cmd === "silence") {
    comando.recordSilenceBreaker(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  } else if (uaActive && uaActive.instruction.cmd !== "silence") {
    const isCompliant = comando.isValidCompliance(uaActive, {
      text,
      mentioned,
      rawMsg: msg,
    })
    if (isCompliant) {
      comando.recordCompliance(uaActive, sender)
      storage.setGameState(from, "comandoActive", uaActive)
    }
  }

  if (gameManager.shouldTriggerPeriodicGame(from)) {
    const gameType = gameManager.pickRandom(["embaralhado", "reação", "comando", "memória"])
    const startResult = await startPeriodicGame(gameType, {
      triggeredBy: sender,
      automatic: true,
    })

    if (startResult.ok) {
      gameManager.recordPeriodicTrigger(from)
    } else {
      gameManager.resetMessageCounter(from)
    }
  }

  return false
}

// Retrocompatibilidade: alguns ambientes ainda referenciam handleGamesCommand.
const handleGamesCommand = handleGameCommands

module.exports = {
  handleGameCommands,
  handleGamesCommand,
  handleGameMessageFlow,
}
