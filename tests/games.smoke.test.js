const test = require("node:test")
const assert = require("node:assert/strict")

const adivinhacao = require("../games/adivinhacao")
const dueloDados = require("../games/dueloDados")
const roletaRussa = require("../games/roletaRussa")

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
  const state = roletaRussa.start("g@g.us", players, { betMultiplier: 2 })
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
