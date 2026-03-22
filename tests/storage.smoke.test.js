const test = require("node:test")
const assert = require("node:assert/strict")

const storage = require("../storage")

test("storage game state set/get/clear cycle", () => {
  const groupId = "__test_group@g.us"
  const key = "__test_game"

  storage.setGameState(groupId, key, { foo: 1 })
  assert.deepEqual(storage.getGameState(groupId, key), { foo: 1 })

  storage.clearGameState(groupId, key)
  assert.equal(storage.getGameState(groupId, key), null)
})
