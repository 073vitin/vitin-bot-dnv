const test = require("node:test")
const assert = require("node:assert/strict")

const { COMMAND_HELP } = require("../commandHelp")
const {
  buildAliasCandidates,
  chooseBestMetric,
  getLikelyCommandSuggestions,
  scoreCandidate,
} = require("../services/commandSuggestionService")

test("command suggestions propose !escambo for typo escmabo", () => {
  const result = getLikelyCommandSuggestions({
    input: "!escmabo",
    commandHelp: COMMAND_HELP,
    prefix: "!",
    maxSuggestions: 3,
    minScore: 0.4,
  })

  const suggestions = result.suggestions.map((entry) => entry.text)
  assert.ok(suggestions.includes("!escambo"))
})

test("command suggestions include fixed-choice args for multiple-choice commands", () => {
  const result = getLikelyCommandSuggestions({
    input: "!trabalho bitcon",
    commandHelp: COMMAND_HELP,
    prefix: "!",
    maxSuggestions: 3,
    minScore: 0.4,
  })

  const suggestions = result.suggestions.map((entry) => entry.text)
  assert.ok(suggestions.includes("!trabalho bitcoin"))
})

test("command suggestions include newly documented override commands", () => {
  const result = getLikelyCommandSuggestions({
    input: "!enqute",
    commandHelp: COMMAND_HELP,
    prefix: "!",
    maxSuggestions: 3,
    minScore: 0.4,
  })

  const suggestions = result.suggestions.map((entry) => entry.text)
  assert.ok(suggestions.includes("!enquete"))
})

test("Damerau-Levenshtein performs at least as well as Jaro-Winkler on typo corpus", () => {
  const candidates = buildAliasCandidates(COMMAND_HELP, "!")
  const typoPairs = [
    ["!escmabo", "!escambo"],
    ["!trbalho", "!trabalho"],
    ["!xprnaking", "!xpranking"],
    ["!missao cliam q1", "!missao claim q1"],
    ["!carepakage", "!carepackage"],
    ["!comecar", "!comecar"],
    ["!mentons off", "!mentions off"],
  ]

  let dlHits = 0
  let jwHits = 0
  for (const [input, target] of typoPairs) {
    const bestDl = [...candidates]
      .map((candidate) => ({ candidate, score: scoreCandidate(input, candidate, "damerau-levenshtein") }))
      .sort((a, b) => b.score - a.score)[0]
    const bestJw = [...candidates]
      .map((candidate) => ({ candidate, score: scoreCandidate(input, candidate, "jaro-winkler") }))
      .sort((a, b) => b.score - a.score)[0]

    if (bestDl?.candidate === target) dlHits += 1
    if (bestJw?.candidate === target) jwHits += 1
  }

  assert.ok(dlHits >= jwHits)
})

test("metric chooser prefers Damerau-Levenshtein for transposition typo", () => {
  const candidates = buildAliasCandidates(COMMAND_HELP, "!")
  const chosen = chooseBestMetric("!escmabo", candidates)
  assert.equal(chosen, "damerau-levenshtein")
})
