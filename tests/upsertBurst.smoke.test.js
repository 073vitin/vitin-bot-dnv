const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")

const punishmentService = require("../services/punishmentService")
const storage = require("../storage")

function enqueueByChat(queueByChat, chatKey, task) {
  const key = String(chatKey || "").trim() || "global"
  const previous = queueByChat.get(key) || Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => task())
    .finally(() => {
      if (queueByChat.get(key) === next) {
        queueByChat.delete(key)
      }
    })
  queueByChat.set(key, next)
  return next
}

test("rapid consecutive upserts do not stall delete throughput", async () => {
  const runId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${process.pid}-${Date.now()}`
  const groupId = `__upsert_burst_${runId}@g.us`
  const sender = `burst_${runId}@s.whatsapp.net`
  const totalMessages = 35
  const deleteAttempts = []
  const deleteAttemptsByMessageId = new Map()

  const sock = {
    async sendMessage(_to, payload) {
      if (!payload?.delete) return

      const messageId = String(payload.delete?.id || "")
      if (messageId) {
        deleteAttempts.push(messageId)
      }
      const attemptCount = (deleteAttemptsByMessageId.get(messageId) || 0) + 1
      deleteAttemptsByMessageId.set(messageId, attemptCount)

      // Simulate a hung first delete call; punishment delete timeout/retry must recover.
      if (messageId === "msg-0" && attemptCount === 1) {
        return new Promise(() => {})
      }
    },
  }

  const activePunishments = storage.getActivePunishments()
  if (!activePunishments[groupId]) activePunishments[groupId] = {}
  activePunishments[groupId][sender] = [{
    type: "mute5m",
    punishmentId: "5",
    severityMultiplier: 1,
    appliedAt: Date.now(),
    targetUserId: sender,
    endsAt: Date.now() + (5 * 60 * 1000),
  }]
  storage.setActivePunishments(activePunishments)

  try {
    const queueByChat = new Map()
    const startedAt = Date.now()

    const tasks = Array.from({ length: totalMessages }, (_entry, index) => {
      const messageId = `msg-${index}`
      const msg = {
        key: {
          id: messageId,
          remoteJid: groupId,
          fromMe: false,
          participant: sender,
        },
      }

      return enqueueByChat(queueByChat, groupId, async () =>
        punishmentService.handlePunishmentEnforcement(
          sock,
          msg,
          groupId,
          sender,
          `spam-${index}`,
          true,
          false,
          true
        )
      )
    })

    const settled = await Promise.allSettled(tasks)
    const elapsedMs = Date.now() - startedAt

    const rejected = settled.filter((entry) => entry.status === "rejected")
    const resolvedTrue = settled.filter((entry) => entry.status === "fulfilled" && entry.value === true)

    assert.equal(rejected.length, 0)
    assert.equal(resolvedTrue.length, totalMessages)

    const uniqueDeletedMessageIds = new Set(deleteAttempts)
    assert.equal(uniqueDeletedMessageIds.size, totalMessages)
    assert.ok((deleteAttemptsByMessageId.get("msg-0") || 0) >= 2)

    // One stalled delete should not freeze the queue indefinitely.
    assert.ok(elapsedMs < 15000)
    assert.equal(queueByChat.size, 0)
  } finally {
    punishmentService.clearPunishment(groupId, sender)
  }
})
