const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../economyService")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USERS = [
  "__test_a@s.whatsapp.net",
  "__test_b@s.whatsapp.net",
]

function cleanupTestUsers() {
  if (!fs.existsSync(ECONOMY_FILE)) return
  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users = parsed.users || {}
  for (const userId of TEST_USERS) {
    delete parsed.users[userId]
  }
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")
  economy.loadEconomy()
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
