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

test("storage group filters support sanitization and add/remove helpers", () => {
  const groupId = "__test_filters@g.us"

  storage.setGroupFilters(groupId, [
    " spam ",
    { text: "foo", addedAt: "10", addedBy: "user@s.whatsapp.net", addedByName: "User" },
    { text: "   " },
  ])

  const initial = storage.getGroupFilters(groupId)
  assert.equal(initial.length, 2)
  assert.equal(initial[0].text, "spam")
  assert.equal(initial[1].text, "foo")

  const added = storage.addGroupFilter(groupId, { text: "bar", addedBy: "admin@s.whatsapp.net" })
  assert.equal(added.ok, true)
  assert.equal(added.index, 3)

  const afterAdd = storage.getGroupFilters(groupId)
  assert.equal(afterAdd.length, 3)
  assert.equal(afterAdd[2].text, "bar")

  const removed = storage.removeGroupFilter(groupId, 2)
  assert.equal(removed.ok, true)
  assert.equal(removed.removed?.text, "foo")

  const afterRemove = storage.getGroupFilters(groupId)
  assert.equal(afterRemove.length, 2)
  assert.equal(afterRemove[0].text, "spam")
  assert.equal(afterRemove[1].text, "bar")

  storage.setGroupFilters(groupId, [])
})
