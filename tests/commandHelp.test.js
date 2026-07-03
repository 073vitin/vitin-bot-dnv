const test = require("node:test")
const assert = require("node:assert/strict")

const { COMMAND_HELP, getPublicCommandNames } = require("../commandHelp")

test("command help documents whois as nickname-based lookup", () => {
  const whois = COMMAND_HELP.whois
  assert.ok(whois)
  assert.equal(whois.usage, "!whois <apelido>")
  assert.match(String(whois.description || ""), /apelido/i)
  assert.match(String(whois.description || ""), /grupos em comum/i)
  assert.match(String(whois.details || ""), /apelido/i)
})

test("public command names exclude hidden and override-only commands", () => {
  const names = getPublicCommandNames()
  assert.ok(names.includes("cmdlist"))
  assert.ok(names.includes("time"))
  assert.ok(names.includes("trade"))
  assert.ok(!names.includes("comandosfull"))
  assert.ok(!names.includes("jid"))
  assert.ok(!names.includes("jidsgrupo"))
})
