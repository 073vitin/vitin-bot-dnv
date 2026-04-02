const test = require("node:test")
const assert = require("node:assert/strict")

const { COMMAND_HELP } = require("../commandHelp")

test("command help documents whois as nickname-based lookup", () => {
  const whois = COMMAND_HELP.whois
  assert.ok(whois)
  assert.equal(whois.usage, "!whois <apelido>")
  assert.match(String(whois.description || ""), /apelido/i)
  assert.match(String(whois.description || ""), /grupos em comum/i)
  assert.match(String(whois.details || ""), /apelido/i)
})
