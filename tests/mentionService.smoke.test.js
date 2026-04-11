const test = require("node:test")
const assert = require("node:assert/strict")

const { resolveSingleTargetFromMentionOrReply } = require("../services/mentionService")

test("mentionService resolver prioritizes explicit mention over reply", () => {
  const result = resolveSingleTargetFromMentionOrReply({
    mentioned: ["5511999999999@s.whatsapp.net"],
    contextInfo: {
      participant: "5511888888888@s.whatsapp.net",
      quotedMessage: { conversation: "hi" },
    },
    requireSingleMention: true,
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, "mention")
  assert.equal(result.target, "5511999999999@s.whatsapp.net")
})

test("mentionService resolver falls back to replied sender", () => {
  const result = resolveSingleTargetFromMentionOrReply({
    mentioned: [],
    contextInfo: {
      participant: "5511777777777@s.whatsapp.net",
      quotedMessage: { conversation: "hi" },
    },
    requireSingleMention: true,
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, "reply")
  assert.equal(result.target, "5511777777777@s.whatsapp.net")
})

test("mentionService resolver rejects multiple mentions for single-target mode", () => {
  const result = resolveSingleTargetFromMentionOrReply({
    mentioned: [
      "5511999999999@s.whatsapp.net",
      "5511888888888@s.whatsapp.net",
    ],
    contextInfo: {},
    requireSingleMention: true,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, "multiple-mentions")
})

test("mentionService resolver reports quoted target missing", () => {
  const result = resolveSingleTargetFromMentionOrReply({
    mentioned: [],
    contextInfo: {
      quotedMessage: { conversation: "hi" },
    },
    requireSingleMention: true,
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, "quoted-target-missing")
})

test("mentionService resolver blocks self and bot targets when disabled", () => {
  const selfResult = resolveSingleTargetFromMentionOrReply({
    mentioned: ["5511999999999@s.whatsapp.net"],
    sender: "5511999999999@s.whatsapp.net",
    allowSelf: false,
    requireSingleMention: true,
  })

  const botResult = resolveSingleTargetFromMentionOrReply({
    mentioned: ["5511666666666@s.whatsapp.net"],
    botJid: "5511666666666@s.whatsapp.net",
    allowBot: false,
    requireSingleMention: true,
  })

  assert.equal(selfResult.ok, false)
  assert.equal(selfResult.reason, "self-target")
  assert.equal(botResult.ok, false)
  assert.equal(botResult.reason, "bot-target")
})
