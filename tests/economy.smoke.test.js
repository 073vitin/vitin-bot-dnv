const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../services/economyService")
const { DAILY_QUEST_POOL } = require("../services/questPools")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USERS = [
  "__test_a@s.whatsapp.net",
  "__test_b@s.whatsapp.net",
]

function cleanupTestUsers() {
  if (!fs.existsSync(ECONOMY_FILE)) return
  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users = parsed.users || {}
  for (const userId of Object.keys(parsed.users)) {
    const normalized = String(userId || "")
    if (TEST_USERS.includes(normalized) || normalized.startsWith("__test")) {
      delete parsed.users[userId]
    }
  }
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")
  economy.loadEconomy()
}

function stableHash(input = "") {
  let hash = 0
  const text = String(input || "")
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function pickDailyQuestSlots(userId = "", dayKey = "", rerollNonce = 0, dailyQuestCount = 3) {
  const safeUserId = String(userId || "").trim().toLowerCase()
  const safeDayKey = String(dayKey || "")
  const nonce = Math.max(0, Math.floor(Number(rerollNonce) || 0))
  const seed = `${safeUserId}:${safeDayKey}:${nonce}`
  const used = new Set()
  const picks = []

  for (let i = 0; i < dailyQuestCount; i++) {
    let pickIndex = stableHash(`${seed}:pick:${i}`) % DAILY_QUEST_POOL.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % DAILY_QUEST_POOL.length
    }
    used.add(pickIndex)

    const template = DAILY_QUEST_POOL[pickIndex]
    picks.push({
      slot: i,
      questId: `Q${i + 1}`,
      key: String(template?.key || ""),
    })
  }

  return picks
}

function alphabeticSuffix(index = 0) {
  let value = Math.max(0, Math.floor(Number(index) || 0))
  let result = ""
  do {
    result = String.fromCharCode(97 + (value % 26)) + result
    value = Math.floor(value / 26)
  } while (value > 0)
  return result
}

function findUserWithDailyClaimQuest(dayKey = "", maxAttempts = 5000) {
  const targetKey = "dailyClaimCount"
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = alphabeticSuffix(i)
    const candidate = `__testquest${suffix}@s.whatsapp.net`
    const picks = pickDailyQuestSlots(candidate, dayKey, 0, 3)
    const match = picks.find((entry) => entry.key === targetKey)
    if (match) {
      return {
        userId: candidate,
        questId: match.questId,
      }
    }
  }
  return null
}

test.before(cleanupTestUsers)
test.after(cleanupTestUsers)

test("economy credit/debit/transfer flow works", () => {
  const a = TEST_USERS[0]
  const b = TEST_USERS[1]

  economy.creditCoins(a, 300, { type: "test-credit" })
  assert.equal(economy.getCoins(a) >= 300, true)

  const ok = economy.debitCoins(a, 100, { type: "test-debit" })
  assert.equal(ok, true)

  const transfer = economy.transferCoins(a, b, 50)
  assert.equal(transfer.ok, true)
  assert.equal(economy.getCoins(b) >= 50, true)
})

test("daily claim only succeeds once per day", () => {
  const a = TEST_USERS[0]
  const first = economy.claimDaily(a, 100)
  assert.equal(first.ok, true)

  const second = economy.claimDaily(a, 100)
  assert.equal(second.ok, false)
  assert.equal(second.reason, "already-claimed")
})

test("kronos grants 2 temporary shields per day and unused shields expire", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  const originalNow = Date.now

  try {
    Date.now = () => new Date("2026-03-20T10:00:00.000Z").getTime()
    economy.addItem(a, "kronosQuebrada", 1)

    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.getShields(a), 1)

    Date.now = () => new Date("2026-03-21T10:00:00.000Z").getTime()
    assert.equal(economy.getShields(a), 2)
    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.consumeShield(a), false)
  } finally {
    Date.now = originalNow
  }
})

test("kronos increases steal success chance by 10 percent", () => {
  cleanupTestUsers()
  const thief = TEST_USERS[0]
  const victim = TEST_USERS[1]

  const baseChance = economy.getStealSuccessChance(victim, thief)

  economy.addItem(thief, "kronosQuebrada", 1)
  const buffedChance = economy.getStealSuccessChance(victim, thief)
  assert.equal(Number((buffedChance - baseChance).toFixed(2)), 0.1)
})

test("selling true kronos crown removes active kronos buff", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.addItem(a, "kronosVerdadeira", 1)
  assert.equal(economy.hasActiveKronos(a), true)

  const sold = economy.sellItem(a, "kronosVerdadeira", 1)
  assert.equal(sold.ok, true)
  assert.equal(economy.getItemQuantity(a, "kronosVerdadeira"), 0)
  assert.equal(economy.hasActiveKronos(a), false)
})

test("work cooldown can be reset to zero", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.setWorkCooldown(a, Date.now())
  assert.equal(economy.getWorkCooldown(a) > 0, true)

  economy.setWorkCooldown(a, 0)
  assert.equal(economy.getWorkCooldown(a), 0)
})

test("steal cooldown setter/getter works", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  const stamp = Date.now() - 12345

  economy.setStealCooldown(a, stamp)
  assert.equal(economy.getStealCooldown(a), Math.floor(stamp))
})

test("coin transfer rejects oversized amount", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  const b = TEST_USERS[1]
  economy.creditCoins(a, 1_000_000, { type: "test-credit" })

  const tooLarge = economy.transferCoins(a, b, 999_999_999)
  assert.equal(tooLarge.ok, false)
  assert.equal(tooLarge.reason, "amount-too-large")
})

test("lootbox open rejects oversized quantity", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  economy.addItem(a, "lootbox", 1000)

  const result = economy.openLootbox(a, 9999, [a])
  assert.equal(result.ok, false)
  assert.equal(result.reason, "quantity-too-large")
})

test("addXp grants milestone reward at level 5", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  const initialCoins = economy.getCoins(a)
  const xpToReachLevel5 = (
    economy.getXpRequiredForLevel(1)
    + economy.getXpRequiredForLevel(2)
    + economy.getXpRequiredForLevel(3)
    + economy.getXpRequiredForLevel(4)
  )
  const xpResult = economy.addXp(a, xpToReachLevel5, { source: "test-milestone" })
  const updatedCoins = economy.getCoins(a)

  assert.equal(xpResult.ok, true)
  assert.equal(xpResult.level, 5)
  assert.equal(xpResult.levelsGained, 4)
  assert.equal(Array.isArray(xpResult.levelRewards), true)
  assert.equal(xpResult.levelRewards.length, 1)
  assert.equal(xpResult.levelRewards[0].level, 5)
  assert.equal(updatedCoins > initialCoins, true)
})

test("xp curve keeps per-level growth between 10 and 30 percent", () => {
  const reqLevel1 = economy.getXpRequiredForLevel(1)
  const reqLevel2 = economy.getXpRequiredForLevel(2)

  const growth12 = (reqLevel2 - reqLevel1) / reqLevel1

  assert.ok(growth12 >= 0.10 && growth12 <= 0.30)

  for (let level = 2; level <= 25; level++) {
    const current = economy.getXpRequiredForLevel(level)
    const previous = economy.getXpRequiredForLevel(level - 1)
    const growth = (current - previous) / previous
    assert.ok(growth >= 0.10 && growth <= 0.30)
  }
})

test("getAllUserIds returns created profiles", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  const b = TEST_USERS[1]

  economy.creditCoins(a, 10, { type: "test-credit" })
  economy.creditCoins(b, 20, { type: "test-credit" })

  const userIds = economy.getAllUserIds()
  assert.equal(Array.isArray(userIds), true)
  assert.ok(userIds.includes(a))
  assert.ok(userIds.includes(b))
  assert.equal(new Set(userIds).size, userIds.length)
})

test("quest reset autogeneration updates daily and weekly keys on rollover", () => {
  cleanupTestUsers()
  const user = TEST_USERS[0]
  const originalNow = Date.now

  try {
    Date.now = () => new Date("2026-03-29T10:00:00.000Z").getTime()
    economy.creditCoins(user, 20, { type: "test-credit" })

    Date.now = () => new Date("2026-03-30T10:00:00.000Z").getTime()
    const result = economy.runQuestResetAutogeneration({ reason: "test-rollover" })

    assert.equal(result.ok, true)
    assert.equal(result.skipped, false)
    assert.equal(result.scanDaily, true)
    assert.equal(result.scanWeekly, true)
    assert.ok(result.dailyGeneratedUsers >= 1)
    assert.ok(result.weeklyGeneratedUsers >= 1)

    const daily = economy.getDailyQuestState(user)
    const weekly = economy.getWeeklyQuestState(user)
    assert.equal(daily.dayKey, economy.getDayKey())
    assert.equal(weekly.weekKey, economy.getWeekKey())
    assert.equal(Array.isArray(daily.quests), true)
    assert.equal(Array.isArray(weekly.quests), true)
  } finally {
    Date.now = originalNow
  }
})

test("quest reset autogeneration is idempotent inside same day and week", () => {
  cleanupTestUsers()
  const user = TEST_USERS[0]
  const originalNow = Date.now

  try {
    Date.now = () => new Date("2026-03-31T10:00:00.000Z").getTime()
    economy.creditCoins(user, 10, { type: "test-credit" })

    const first = economy.runQuestResetAutogeneration({ reason: "test-idempotent-1" })
    const second = economy.runQuestResetAutogeneration({ reason: "test-idempotent-2" })

    assert.equal(first.ok, true)
    assert.equal(first.skipped, false)
    assert.equal(second.ok, true)
    assert.equal(second.skipped, true)
    assert.equal(second.dailyGeneratedUsers, 0)
    assert.equal(second.weeklyGeneratedUsers, 0)
  } finally {
    Date.now = originalNow
  }
})

test("daily claim counts even before quest command after reset autogeneration", () => {
  cleanupTestUsers()
  const originalNow = Date.now

  try {
    Date.now = () => new Date("2026-04-01T09:00:00.000Z").getTime()
    const nextDayMs = new Date("2026-04-02T09:00:00.000Z").getTime()

    const nextDayKey = economy.getDayKey(nextDayMs)
    const candidate = findUserWithDailyClaimQuest(nextDayKey)
    assert.ok(candidate)

    economy.creditCoins(candidate.userId, 50, { type: "test-credit" })

    Date.now = () => nextDayMs
    const resetRun = economy.runQuestResetAutogeneration({ reason: "test-daily-before-view" })
    assert.equal(resetRun.ok, true)

    const daily = economy.claimDaily(candidate.userId, 100)
    assert.equal(daily.ok, true)

    const claimQuest = economy.claimDailyQuest(candidate.userId, candidate.questId)
    assert.equal(claimQuest.ok, true)
    assert.equal(String(claimQuest.questId || ""), candidate.questId)
  } finally {
    Date.now = originalNow
  }
})

test("deleteUserProfile removes all alias variants", () => {
  cleanupTestUsers()
  const base = "551198887777@s.whatsapp.net"

  economy.creditCoins(base, 100, { type: "test-credit" })

  const legacyLid = "551198887777@lid"
  const legacyUpper = "551198887777@S.WHATSAPP.NET"
  const legacyObject = {
    coins: 999,
    items: { lootbox: 3 },
    buffs: {},
    cooldowns: {},
    stats: {},
    preferences: {},
    progression: {},
    transactions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users[legacyLid] = { ...legacyObject }
  parsed.users[legacyUpper] = { ...legacyObject }
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")
  economy.loadEconomy()

  const deleted = economy.deleteUserProfile(base)
  assert.equal(deleted, true)

  const afterDelete = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  const remainingKeys = Object.keys(afterDelete.users || {})
  const victimKeys = remainingKeys.filter((key) => String(key).includes("551198887777"))

  assert.equal(victimKeys.length, 0)
})
