const {
  normalizeMentionArray,
  getMentionHandleFromJid,
  formatMentionTag,
  resolveSingleTargetFromMentionOrReply,
} = require("./mentionService")
const crypto = require("crypto")
const { downloadMediaMessage } = require("@whiskeysockets/baileys")
const storage = require("../storage")
const economyService = require("./economyService")
const telemetry = require("./telemetryService")

const LETTER_ALPHABET = "abcdefghijklmnopqrstuvwxyz"
const WORD_LIST_POOL = [
  "cachorro",
  "gato",
  "programador",
  "computador",
  "telefone",
  "internet",
  "mensagem",
  "diversao",
  "amigo",
  "familia",
  "trabalho",
  "escola",
  "carro",
  "moto",
  "bicicleta",
  "livro",
  "filme",
  "musica",
  "danca",
  "esporte",
]
const REPOST_REACTION_EMOJIS = ["🍆", "🔥", "🔞", "🤤", "😈"]
const PUNISHMENT_DELETE_TIMEOUT_MS = 3000
const PUNISHMENT_DELETE_RETRY_DELAYS_MS = [150, 350]
const LETTER_DUMP_STATE_KEY = "letterDumpDetector"
const LETTER_DUMP_WHITELIST = new Set(["a", "i", "k", "q"])
const LEET_MULTI_CHAR_REPLACERS = [
  [/\|_\|/g, "u"],
]
const LEET_CHAR_MAP = {
  "@": "a",
  "4": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "+": "t",
  "8": "b",
  "9": "g",
  "2": "z",
}

const PUNISHMENT_TYPE_TO_ID = {
  max5chars: "1",
  rate20s: "2",
  lettersBlock: "3",
  emojiOnly: "4",
  mute5m: "5",
  noVowels: "6",
  urgentPrefix: "7",
  wordListRequired: "8",
  allCaps: "9",
  deleteAndRepost: "10",
  sexualReaction: "11",
  randomDeleteChance: "12",
  max3wordsStrict: "13",
}

function waitMs(ms = 0) {
  const delay = Math.max(0, Number(ms) || 0)
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delay)
    if (typeof timer?.unref === "function") {
      timer.unref()
    }
  })
}

function createTimeoutError(label = "operation", timeoutMs = 0) {
  const err = new Error(`${label} timed out after ${timeoutMs}ms`)
  err.code = "ETIMEDOUT"
  return err
}

async function withTimeout(taskPromise, timeoutMs = 0, label = "operation") {
  const timeout = Number(timeoutMs)
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return taskPromise
  }

  let timeoutId = null
  try {
    return await Promise.race([
      Promise.resolve(taskPromise),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(label, timeout))
        }, timeout)
        if (typeof timeoutId?.unref === "function") {
          timeoutId.unref()
        }
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function deleteMessageWithRetry(sock, from, messageKey, options = {}) {
  if (!from || !messageKey || typeof sock?.sendMessage !== "function") {
    return false
  }

  const retryDelays = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length > 0
    ? options.retryDelaysMs
    : PUNISHMENT_DELETE_RETRY_DELAYS_MS
  const timeoutMs = Number(options.timeoutMs)
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : PUNISHMENT_DELETE_TIMEOUT_MS
  const maxAttempts = Math.max(1, retryDelays.length + 1)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await withTimeout(
        sock.sendMessage(from, { delete: messageKey }),
        effectiveTimeoutMs,
        "punishment.delete"
      )
      return true
    } catch (err) {
      if (attempt >= maxAttempts) {
        console.error("[punishment] deleteMessageWithRetry exhausted", {
          from,
          messageId: String(messageKey?.id || ""),
          error: String(err?.message || err),
        })
        return false
      }

      const delayMs = Math.max(0, Number(retryDelays[attempt - 1]) || 0)
      if (delayMs > 0) {
        await waitMs(delayMs)
      }
    }
  }

  return false
}

function getPunishmentChoiceFromText(text = "") {
  const cleaned = text.toLowerCase().trim()
  const match = cleaned.match(/(?:^|\s)(1[0-3]|[1-9])(?:\s|$)/)
  if (match?.[1]) return match[1]
  return null
}

function getRandomPunishmentChoice() {
  const choices = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]
  return choices[crypto.randomInt(0, choices.length)]
}

function normalizePunishmentId(value = "") {
  const parsed = Number.parseInt(String(value || "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 13) return ""
  return String(parsed)
}

function inferPunishmentIdFromType(type = "") {
  return PUNISHMENT_TYPE_TO_ID[String(type || "")] || ""
}

function createPunishmentStackId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return crypto.randomBytes(12).toString("hex")
}

function ensurePunishmentStateMeta(state = null) {
  if (!state || typeof state !== "object") return null
  if (!state.stackId) {
    state.stackId = createPunishmentStackId()
  }

  const normalizedId = normalizePunishmentId(state.punishmentId)
  if (normalizedId) {
    state.punishmentId = normalizedId
  } else {
    const inferredId = inferPunishmentIdFromType(state.type)
    if (inferredId) {
      state.punishmentId = inferredId
    }
  }

  return state
}

function normalizePunishmentStack(value = null) {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === "object"
      ? (Array.isArray(value.stack) ? value.stack : [value])
      : [])

  const normalized = []
  for (const entry of source) {
    const sanitized = ensurePunishmentStateMeta(entry)
    if (sanitized) normalized.push(sanitized)
  }
  return normalized
}

function setPunishmentStackForUser(groupPunishments = {}, userKey = "", stack = []) {
  const normalizedStack = normalizePunishmentStack(stack)
  if (!userKey) return false
  if (normalizedStack.length === 0) {
    delete groupPunishments[userKey]
    return false
  }
  groupPunishments[userKey] = normalizedStack
  return true
}

function removePunishmentFromStackById(groupPunishments = {}, userKey = "", stackId = "") {
  if (!userKey) return null
  const stack = normalizePunishmentStack(groupPunishments[userKey])
  const stackIdLabel = String(stackId || "")
  const index = stack.findIndex((entry) => String(entry?.stackId || "") === stackIdLabel)
  if (index < 0) {
    if (stack.length > 0 && !Array.isArray(groupPunishments[userKey])) {
      groupPunishments[userKey] = stack
    }
    return null
  }

  const [removed] = stack.splice(index, 1)
  if (removed?.timerId) {
    clearTimeout(removed.timerId)
  }
  setPunishmentStackForUser(groupPunishments, userKey, stack)
  return removed
}

function getLinear15xSeverityScale(severityMultiplier = 1) {
  const level = Math.max(1, Math.floor(Number(severityMultiplier) || 1))
  return 1 + (level - 1) * 0.5
}

function getPunishmentNameByType(type = "") {
  const punishmentId = inferPunishmentIdFromType(type)
  if (!punishmentId) return "desconhecida"
  return getPunishmentNameById(punishmentId)
}

function getPunishmentLabelFromState(punishmentState = null) {
  if (!punishmentState || typeof punishmentState !== "object") {
    return "desconhecida"
  }

  const normalizedId = normalizePunishmentId(punishmentState.punishmentId)
  const baseName = normalizedId
    ? getPunishmentNameById(normalizedId)
    : getPunishmentNameByType(punishmentState.type)

  if (punishmentState.type === "wordListRequired") {
    const words = Array.isArray(punishmentState.wordList)
      ? punishmentState.wordList.filter(Boolean)
      : []
    if (words.length > 0) {
      return `${baseName} (${words.join(", ")})`
    }
  }

  if (punishmentState.type === "randomDeleteChance") {
    const chance = Math.max(0, Math.min(1, Number(punishmentState.deleteChance) || 0))
    return `${baseName} (${Math.round(chance * 100)}%)`
  }

  return baseName
}

async function sendPunishmentExpiredMessage(sock, groupId, userId, punishmentState = null) {
  if (!sock || typeof sock.sendMessage !== "function") return
  const targetUserId = normalizeUserId(userId) || String(userId || "")
  if (!targetUserId) return
  const label = getPunishmentLabelFromState(punishmentState)
  await sock.sendMessage(groupId, {
    text: `${formatMentionTag(targetUserId)}, punição expirada: *${label}*.`,
    mentions: normalizeMentionArray([targetUserId]),
  })
}

async function expirePunishmentByStackId(sock, groupId, userId, stackId) {
  const activePunishments = storage.getActivePunishments()
  const groupPunishments = activePunishments[groupId]
  if (!groupPunishments || typeof groupPunishments !== "object") {
    return false
  }

  const matchedKey = findMatchingUserKey(groupPunishments, userId)
  if (!matchedKey) {
    return false
  }

  const removed = removePunishmentFromStackById(groupPunishments, matchedKey, stackId)
  if (!removed) {
    return false
  }

  if (Object.keys(groupPunishments).length === 0) {
    delete activePunishments[groupId]
  }
  storage.setActivePunishments(activePunishments)

  const targetForMessage = normalizeUserId(removed.targetUserId || userId) || String(userId || "")
  await sendPunishmentExpiredMessage(sock, groupId, targetForMessage, removed)
  return true
}

function schedulePunishmentExpiryTimer(sock, groupId, userId, punishmentState = null) {
  if (!punishmentState?.endsAt) {
    return false
  }

  if (punishmentState.timerId) {
    clearTimeout(punishmentState.timerId)
  }

  const remainingMs = Math.max(0, Number(punishmentState.endsAt) - Date.now())
  if (remainingMs <= 0) {
    return false
  }

  const stackId = String(punishmentState.stackId || "")
  punishmentState.timerId = setTimeout(() => {
    expirePunishmentByStackId(sock, groupId, userId, stackId).catch(() => {})
  }, remainingMs)
  if (typeof punishmentState.timerId?.unref === "function") {
    punishmentState.timerId.unref()
  }
  return true
}

function getPunishmentNameById(punishmentId) {
  const normalizedId = normalizePunishmentId(punishmentId)
  if (normalizedId === "1") return "máx. 5 caracteres"
  if (normalizedId === "2") return "1 mensagem/20s"
  if (normalizedId === "3") return "bloqueio por letras (indefinido)"
  if (normalizedId === "4") return "somente emojis e figurinhas"
  if (normalizedId === "5") return "mute total"
  if (normalizedId === "6") return "sem vogais"
  if (normalizedId === "7") return "prefixo obrigatório"
  if (normalizedId === "8") return "palavras da lista"
  if (normalizedId === "9") return "somente caixa alta"
  if (normalizedId === "10") return "repost pelo bot"
  if (normalizedId === "11") return "reação sugestiva"
  if (normalizedId === "12") return "chance de apagar"
  if (normalizedId === "13") return "máx. 3 palavras"
  return "desconhecida"
}

function getPunishmentMenuText() {
  return [
    "Escolha a punição digitando um número de *1* a *13*:",
    "1. Mensagens com no máximo 5 caracteres por 5 minutos.",
    "2. Máximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por letras aleatórias (indefinido: mensagens contendo letras bloqueadas são apagadas; para sair, envie UMA mensagem só com essas letras + espaços/quebras de linha, contendo todas).",
    "4. Só pode enviar emojis e figurinhas por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar será apagado).",
    "6. Sem vogais por 5 minutos (anti-bypass: 4->A, |_|->U; severidade escala tempo linearmente).",
    "7. Toda mensagem deve começar com \"🚨URGENTE:\" por 5 minutos, EXATAMENTE como está entre aspas. (severidade escala tempo linearmente).",
    "8. Mensagem deve conter palavras da lista por 5 minutos (severidade escala tempo em 1.5x e quantidade +1 por nível).",
    "9. Mensagens em caixa alta por 10 minutos (severidade escala tempo linearmente).",
    "10. Mensagens são apagadas e repostadas pelo bot por 5 minutos (severidade escala tempo linearmente).",
    "11. Mensagens recebem reação sugestiva por 5 minutos (severidade escala tempo linearmente).",
    "12. Chance de apagar mensagens por 1 hora (20% base, +4% por nível).",
    "13. Máximo de 3 palavras por 5 minutos (severidade escala tempo linearmente)."
  ].join("\n")
}

function getPunishmentDetailsText() {
  return [
    "📚 Lista detalhada de punições (1-13)",
    "",
    "1. Máx. 5 caracteres",
    "- Regra: mensagem com mais de 5 caracteres é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "2. 1 mensagem a cada 20s",
    "- Regra: se enviar antes do intervalo, apaga.",
    "- Duração: 10 minutos x severidade.",
    "",
    "3. Bloqueio de letras",
    "- Regra: mensagem contendo qualquer letra bloqueada é apagada (detecção anti-bypass, ex.: 4->A e |_|->U).",
    "- Saída: envie UMA mensagem contendo todas as letras bloqueadas (ao menos 1x cada), usando apenas essas letras + espaços/quebras de linha.",
    "- Escala: +1 letra proibida por severidade.",
    "- Término: indefinido, encerra ao cumprir condição de saída.",
    "",
    "4. Só emojis/figurinhas",
    "- Regra: texto fora de emoji/sticker é apagado.",
    "- Duração: 5 minutos x severidade.",
    "",
    "5. Mute total",
    "- Regra: toda mensagem é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "6. Sem vogais",
    "- Regra: mensagem com vogal é apagada (inclui anti-bypass como 4->A e |_|->U).",
    "- Duração: 5 minutos x severidade.",
    "",
    "7. Prefixo obrigatório",
    "- Regra: mensagem sem início em \"🚨URGENTE:\" é apagada. O início deve ser exatamente como descrito.",
    "- Duração: 5 minutos x severidade.",
    "",
    "8. Palavra(s) da lista",
    "- Regra: precisa conter palavra(s) sorteada(s) da lista.",
    "- Escala: tempo x1.5 e +1 palavra exigida por severidade.",
    "- Base de tempo: 5 minutos.",
    "",
    "9. Caixa alta",
    "- Regra: texto com letras minúsculas é apagado.",
    "- Duração: 10 minutos x severidade.",
    "",
    "10. Apaga e reposta",
    "- Regra: bot apaga e reposta texto/mídia (quando possível).",
    "- Duração: 5 minutos x severidade.",
    "",
    "11. Reação sugestiva",
    "- Regra: bot reage com emoji sugestivo nas mensagens.",
    "- Duração: 5 minutos x severidade.",
    "",
    "12. Chance de apagar",
    "- Regra: mensagem pode ser apagada aleatoriamente.",
    "- Duração: 1 hora.",
    "- Chance: 20% base +4% por severidade.",
    "",
    "13. Máx. 3 palavras (anti-bypass)",
    "- Regra: mais de 3 tokens (inclui separação por símbolos/espaços) é apagado.",
    "- Duração: 5 minutos x severidade.",
  ].join("\n")
}

function getRandomDifferentLetters(total = 2) {
  const amount = Math.max(2, Math.floor(Number(total) || 2))
  const source = LETTER_ALPHABET.split("")
  const picked = []
  while (picked.length < amount && source.length > 0) {
    const index = crypto.randomInt(0, source.length)
    const [letter] = source.splice(index, 1)
    picked.push(letter)
  }
  return picked
}

function getRandomWordList(requiredCount = 1) {
  const amount = Math.max(1, Math.floor(Number(requiredCount) || 1))
  const source = [...WORD_LIST_POOL]
  const picked = []
  while (picked.length < amount && source.length > 0) {
    const index = crypto.randomInt(0, source.length)
    const [word] = source.splice(index, 1)
    picked.push(word)
  }
  return picked
}

function stripWhitespaceExceptSpace(text = "") {
  return text.replace(/[\t\n\r\f\v\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, "")
}

function isEmojiOnlyMessage(text = "") {
  const compact = text.replace(/\s+/g, "")
  if (!compact) return false
  const emojiCluster = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)+$/u
  return emojiCluster.test(compact)
}

function isStickerMessage(msg = null) {
  return Boolean(msg?.message?.stickerMessage)
}

function normalizeComparableText(value = "") {
  const ascii = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  let sequenced = ascii
  for (const [pattern, replacement] of LEET_MULTI_CHAR_REPLACERS) {
    sequenced = sequenced.replace(pattern, replacement)
  }

  let normalized = ""
  for (const ch of sequenced) {
    const mapped = LEET_CHAR_MAP[ch] || ch
    if (/^[a-z0-9]$/.test(mapped)) {
      normalized += mapped
    }
  }

  return normalized
}

function normalizeBlockedLetters(letters = []) {
  return [...new Set((letters || [])
    .map((letter) => normalizeComparableText(letter))
    .filter((letter) => /^[a-z]$/.test(letter))
  )]
}

function messageContainsBlockedLetters(text = "", letters = []) {
  const blockedLetters = normalizeBlockedLetters(letters)
  if (blockedLetters.length === 0) return false

  const normalizedText = normalizeComparableText(text)
  if (!normalizedText) return false
  return blockedLetters.some((letter) => normalizedText.includes(letter))
}

function isUnlockLettersMessage(text = "", letters = []) {
  const requiredLetters = normalizeBlockedLetters(letters)
  if (!requiredLetters.length) return false

  const normalizedText = normalizeComparableText(text)
  if (!normalizedText) return false

  const requiredSet = new Set(requiredLetters)
  const seen = new Set()
  for (const ch of normalizedText) {
    if (!requiredSet.has(ch)) return false
    seen.add(ch)
  }

  return requiredLetters.every((letter) => seen.has(letter))
}

function countWordTokensStrict(text = "") {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const tokens = normalized.match(/[a-z0-9]+/g) || []
  return tokens.length
}

function containsWordListTerms(text = "", words = [], minRequired = 1) {
  if (!words.length) return true
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const tokenSet = new Set(normalized.match(/[a-z0-9]+/g) || [])
  let hits = 0
  for (const word of words) {
    if (tokenSet.has(word)) hits++
  }
  return hits >= Math.max(1, Math.floor(Number(minRequired) || 1))
}

function hasLetters(text = "") {
  return /[a-z]/i.test(String(text || ""))
}

function isSingleLetterMessage(text = "") {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
  return /^[a-z]$/.test(normalized) ? normalized : ""
}

function matchesUrgentPrefix(text = "", requiredPrefix = "🚨URGENTE:") {
  const raw = String(text || "")
  const trimmedStart = raw.trimStart()
  if (!trimmedStart) return false

  // Require EXACT prefix match - no variations allowed
  const strictPrefix = String(requiredPrefix || "🚨URGENTE:").trim()
  return strictPrefix && trimmedStart.startsWith(strictPrefix)
}

function getResendText(msg, text = "") {
  const trimmed = String(text || "").trim()
  if (trimmed) return trimmed
  if (msg?.message?.stickerMessage) return "[figurinhas não podem ser reenviadas pelo bot]"
  if (msg?.message?.imageMessage) return "[imagens não podem ser reenviadas pelo bot]"
  if (msg?.message?.videoMessage) return "[vídeos não podem ser reenviados pelo bot]"
  if (msg?.message?.audioMessage) return "[áudios não podem ser reenviados pelo bot]"
  return "[mensagem reenviada pelo bot]"
}

async function resendPunishedContent(sock, from, sender, msg, text = "") {
  const mentionTag = `${formatMentionTag(sender)}`
  const resendPrefix = `📢 Repost de ${mentionTag}: `

  const sendFallbackText = async () => {
    const resendText = getResendText(msg, text)
    await sock.sendMessage(from, {
      text: `${resendPrefix}${resendText}`,
      mentions: normalizeMentionArray([sender]),
    })
  }

  try {
    if (msg?.message?.stickerMessage) {
      const stickerBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, { sticker: stickerBuffer })
      await sock.sendMessage(from, {
        text: `${resendPrefix}[figurinha reenviada pelo bot]`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.imageMessage) {
      const imageBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: `${resendPrefix}${getResendText(msg, text)}`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.videoMessage) {
      const videoBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        video: videoBuffer,
        caption: `${resendPrefix}${getResendText(msg, text)}`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.audioMessage) {
      const audioBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: Boolean(msg?.message?.audioMessage?.ptt),
      })
      await sock.sendMessage(from, {
        text: `${resendPrefix}[audio reenviado pelo bot]`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }
  } catch (e) {
    console.error("Erro ao reenviar mídia na punição 10", e)
  }

  await sendFallbackText()
}

function normalizeUserId(value = "") {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const lowered = raw.toLowerCase()
  const jidMatch = lowered.match(/^([^@\s:]+)(?::\d+)?@([^@\s]+)$/)
  if (jidMatch) {
    return `${jidMatch[1]}@${jidMatch[2]}`
  }
  return lowered
}

function buildUserIdentityAliases(value = "") {
  const normalized = normalizeUserId(value)
  if (!normalized) return []

  const aliases = new Set([normalized])
  const userPart = normalized.includes("@") ? getMentionHandleFromJid(normalized) : normalized
  if (userPart) {
    aliases.add(userPart)
    aliases.add(`${userPart}@s.whatsapp.net`)
    aliases.add(`${userPart}@lid`)
  }

  return Array.from(aliases).filter(Boolean)
}

function identitiesMatch(left = "", right = "") {
  const leftAliases = new Set(buildUserIdentityAliases(left))
  if (leftAliases.size === 0) return false
  const rightAliases = buildUserIdentityAliases(right)
  return rightAliases.some((alias) => leftAliases.has(alias))
}

function findMatchingUserKey(map = {}, userId = "") {
  if (!map || typeof map !== "object") return ""
  const normalized = normalizeUserId(userId)
  if (normalized && Object.prototype.hasOwnProperty.call(map, normalized)) {
    return normalized
  }

  const targetAliases = new Set(buildUserIdentityAliases(userId))
  if (targetAliases.size === 0) return ""

  for (const key of Object.keys(map)) {
    const keyAliases = buildUserIdentityAliases(key)
    if (keyAliases.some((alias) => targetAliases.has(alias))) {
      return key
    }
  }

  return ""
}

function clearPendingPunishment(groupId, playerId) {
  const coinPunishmentPending = storage.getCoinPunishmentPending()
  if (!coinPunishmentPending[groupId]?.[playerId]) {
    return
  }
  delete coinPunishmentPending[groupId][playerId]
  if (Object.keys(coinPunishmentPending[groupId]).length === 0) delete coinPunishmentPending[groupId]
  storage.setCoinPunishmentPending(coinPunishmentPending)
}

function clearPunishment(groupId, userId) {
  const normalizedUser = normalizeUserId(userId) || String(userId || "")
  const activePunishments = storage.getActivePunishments()
  const groupPunishments = activePunishments[groupId]
  const matchedKey = findMatchingUserKey(groupPunishments, normalizedUser)
  if (!matchedKey) {
    return
  }

  const stack = normalizePunishmentStack(groupPunishments[matchedKey])
  for (const entry of stack) {
    if (entry?.timerId) {
      clearTimeout(entry.timerId)
    }
  }

  delete groupPunishments[matchedKey]
  if (Object.keys(groupPunishments).length === 0) {
    delete activePunishments[groupId]
  }
  storage.setActivePunishments(activePunishments)
}

function appendPunishmentForUser(activePunishments = {}, groupId = "", userId = "", punishmentState = null, sock = null) {
  if (!groupId) return { state: null, stackSize: 0, userKey: "" }
  if (!activePunishments[groupId]) {
    activePunishments[groupId] = {}
  }

  const groupPunishments = activePunishments[groupId]
  const normalizedUser = normalizeUserId(userId) || String(userId || "")
  const matchedKey = findMatchingUserKey(groupPunishments, normalizedUser)
  let userKey = matchedKey || normalizedUser

  if (matchedKey && matchedKey !== normalizedUser && !groupPunishments[normalizedUser]) {
    groupPunishments[normalizedUser] = groupPunishments[matchedKey]
    delete groupPunishments[matchedKey]
    userKey = normalizedUser
  }

  const stack = normalizePunishmentStack(groupPunishments[userKey])
  const normalizedState = ensurePunishmentStateMeta(punishmentState)
  if (!normalizedState) {
    return { state: null, stackSize: stack.length, userKey }
  }

  normalizedState.targetUserId = normalizeUserId(normalizedState.targetUserId || normalizedUser) || normalizedUser
  stack.push(normalizedState)
  setPunishmentStackForUser(groupPunishments, userKey, stack)

  if (normalizedState.endsAt) {
    schedulePunishmentExpiryTimer(sock, groupId, normalizedState.targetUserId, normalizedState)
  }

  return {
    state: normalizedState,
    stackSize: stack.length,
    userKey,
  }
}

async function applyPunishment(sock, groupId, userId, punishmentId, options = {}) {
  console.log("[punishment] applyPunishment START", { groupId, userId, punishmentId, origin: options?.origin })
  const origin = options?.origin || "admin"
  const normalizedTarget = normalizeUserId(userId)
  const targetUserId = normalizedTarget || String(userId || "")
  const normalizedPunishmentId = normalizePunishmentId(punishmentId)
  const normalizedBot = normalizeUserId(options?.botUserId || sock?.user?.id || "")
  if (!targetUserId) {
    console.log("[punishment] applyPunishment BLOCKED - invalid target", { reason: "invalid-target" })
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "invalid-target",
      punishmentId: String(punishmentId || ""),
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "invalid-target",
    })
    return { blocked: true, reason: "invalid-target" }
  }
  if (!normalizedPunishmentId) {
    console.log("[punishment] applyPunishment BLOCKED - invalid punishment id", { reason: "invalid-id" })
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "invalid-id",
      punishmentId: String(punishmentId || ""),
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "invalid-id",
    })
    return { blocked: true, reason: "invalid-id" }
  }
  if (identitiesMatch(normalizedTarget, normalizedBot)) {
    console.log("[punishment] applyPunishment BLOCKED - bot cannot be punished")
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "bot-target",
      punishmentId: normalizedPunishmentId,
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "bot-target",
    })
    await sock.sendMessage(groupId, {
      text: "🤖 O bot não pode receber punições.",
    })
    return { blocked: true, reason: "bot-target" }
  }

  if (origin !== "admin") {
    const blocked = economyService.consumeShield(targetUserId)
    if (blocked) {
      console.log("[punishment] applyPunishment BLOCKED - shield active")
      telemetry.incrementCounter("punishment.blocked", 1, {
        origin,
        reason: "shield",
        punishmentId: String(punishmentId || ""),
      })
      telemetry.appendEvent("punishment.blocked", {
        groupId,
        userId,
        origin,
        punishmentId,
        reason: "shield",
      })
      await sock.sendMessage(groupId, {
        text: `🛡️ ${formatMentionTag(targetUserId)} bloqueou a punição com escudo!`,
        mentions: normalizeMentionArray([targetUserId]),
      })
      return { blockedByShield: true }
    }
  }

  const severityMultiplierRaw = Number(options?.severityMultiplier || 1)
  const severityMultiplier = Number.isFinite(severityMultiplierRaw) && severityMultiplierRaw > 1
    ? Math.floor(severityMultiplierRaw)
    : 1
  const activePunishments = storage.getActivePunishments()

  const mentionTag = `${formatMentionTag(targetUserId)}`
  const now = Date.now()
  let punishmentState = null
  let warningText = ""

  if (normalizedPunishmentId === "1") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "max5chars",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: suas mensagens só podem ter até *5 caracteres* por *${Math.floor(durationMs / 60_000)} minutos* (espaço conta). Mensagens fora disso serão apagadas.`
  }

  if (normalizedPunishmentId === "2") {
    const durationMs = 10 * 60_000 * severityMultiplier
    punishmentState = {
      type: "rate20s",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
      lastAllowedAt: 0
    }
    warningText = `${mentionTag}, punição ativada: você só pode enviar *1 mensagem a cada 20 segundos* por *${Math.floor(durationMs / 60_000)} minutos*. Mensagens acima da taxa serão apagadas.`
  }

  if (normalizedPunishmentId === "3") {
    const letters = getRandomDifferentLetters(severityMultiplier + 1)
    const lettersLabel = letters
      .map((letter) => String(letter || "").trim().toUpperCase())
      .filter(Boolean)
      .join(", ")

    punishmentState = {
      type: "lettersBlock",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      letters
    }
    warningText = `${mentionTag}, punição ativada: ${letters.length} letras bloqueadas (indefinido).\nPara sair, envie *UMA* mensagem que contenha *todas* as ${letters.length} letras bloqueadas, pelo menos 1x cada, usando apenas essas letras + espaços/quebras de linha.\nSe faltar 1 letra ou tiver qualquer caractere extra, a mensagem é apagada.\nExemplos válidos (supondo que as letras bloqueadas são A, B, C, D, E):\n"A B C D E", "ABCDE". Exemplo inválido: "ABCDEF".`
  }

  if (normalizedPunishmentId === "4") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "emojiOnly",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* você só pode enviar mensagens formadas por emojis ou figurinhas. Qualquer mensagem com texto fora desse formato será apagada.`
  }

  if (normalizedPunishmentId === "5") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "mute5m",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: *mute total por ${Math.floor(durationMs / 60_000)} minutos*. Qualquer mensagem sua será apagada.`
  }

  if (normalizedPunishmentId === "6") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "noVowels",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: sem vogais por *${Math.floor(durationMs / 60_000)} minutos*. Mensagens com vogais serão apagadas (anti-bypass: 4->A, |_|->U).`
  }

  if (normalizedPunishmentId === "7") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "urgentPrefix",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
      requiredPrefix: "🚨URGENTE:",
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* toda mensagem deve começar com *🚨URGENTE:* (deve ser EXATAMENTE como descrito).`
  }

  if (normalizedPunishmentId === "8") {
    const durationMs = Math.ceil(5 * 60_000 * getLinear15xSeverityScale(severityMultiplier))
    const requiredWordsCount = Math.max(1, severityMultiplier)
    const wordList = getRandomWordList(requiredWordsCount)
    punishmentState = {
      type: "wordListRequired",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
      wordList,
      minRequiredWords: requiredWordsCount,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* cada mensagem deve conter pelo menos *${requiredWordsCount}* palavra(s) desta lista: ${wordList.join(", ")}.`
  }

  if (normalizedPunishmentId === "9") {
    const durationMin = 10 * severityMultiplier
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "allCaps",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* toda mensagem deve estar em CAIXA ALTA.`
  }

  if (normalizedPunishmentId === "10") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "deleteAndRepost",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* suas mensagens serão apagadas e repostadas pelo bot.`
  }

  if (normalizedPunishmentId === "11") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "sexualReaction",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* suas mensagens receberão reações sugestivas.`
  }

  if (normalizedPunishmentId === "12") {
    const durationMs = 60 * 60_000
    const deleteChance = Math.min(1, (20 + (Math.max(1, severityMultiplier) - 1) * 4) / 100)
    punishmentState = {
      type: "randomDeleteChance",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
      deleteChance,
    }
    warningText = `${mentionTag}, punição ativada: por *60 minutos* suas mensagens têm *${Math.ceil(deleteChance * 100)}%* de chance de serem apagadas.`
  }

  if (normalizedPunishmentId === "13") {
    const durationMin = 5 * severityMultiplier
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "max3wordsStrict",
      punishmentId: normalizedPunishmentId,
      severityMultiplier,
      appliedAt: now,
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* você pode enviar no máximo *3 palavras* por mensagem.`
  }

  if (!punishmentState) return

  const appendResult = appendPunishmentForUser(
    activePunishments,
    groupId,
    targetUserId,
    punishmentState,
    sock
  )
  const appliedState = appendResult.state
  if (!appliedState) {
    return
  }

  storage.setActivePunishments(activePunishments)
  telemetry.incrementCounter("punishment.applied", 1, {
    origin,
    punishmentId: normalizedPunishmentId,
  })
  telemetry.appendEvent("punishment.applied", {
    groupId,
    userId,
    origin,
    punishmentId: normalizedPunishmentId,
    severityMultiplier,
    timed: Boolean(appliedState?.endsAt),
  })
  economyService.incrementStat(targetUserId, "punishmentsReceivedTotal", 1)
  if (origin === "admin") {
    economyService.incrementStat(targetUserId, "punishmentsReceivedAdmin", 1)
  } else {
    economyService.incrementStat(targetUserId, "punishmentsReceivedGame", 1)
  }

  await sock.sendMessage(groupId, {
    text: warningText,
    mentions: normalizeMentionArray([targetUserId])
  })
  console.log("[punishment] applyPunishment COMPLETE", {
    groupId,
    targetUserId,
    type: appliedState?.type,
    stackSize: appendResult.stackSize,
  })
}

async function handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, skipForCommand = false, botIsAdmin = true) {
  if (!isGroup) {
    return false
  }
  if (skipForCommand) {
    return false
  }

  const botUserId = normalizeUserId(sock?.user?.id || "")
  const senderId = normalizeUserId(sender) || String(sender || "")
  if (botUserId && senderId && identitiesMatch(normalizeUserId(sender), botUserId)) {
    return false
  }

  const singleLetter = isSingleLetterMessage(text)

  if (singleLetter && !LETTER_DUMP_WHITELIST.has(singleLetter)) {
    const dumpState = storage.getGameState(from, LETTER_DUMP_STATE_KEY) || {}
    const current = dumpState[senderId] && typeof dumpState[senderId] === "object"
      ? dumpState[senderId]
      : { sequence: [], offenseCount: 0, lastOffenseAt: 0 }
    const now = Date.now()
    current.sequence = (Array.isArray(current.sequence) ? current.sequence : []).filter((ts) => now - ts <= 30_000)
    current.sequence.push(now)

    if (current.sequence.length >= 4) {
      if (now - (Number(current.lastOffenseAt) || 0) > 60 * 60 * 1000) {
        current.offenseCount = 0
      }
      current.offenseCount += 1
      current.lastOffenseAt = now
      current.sequence = []

      const activePunishments = storage.getActivePunishments()

      if (current.offenseCount >= 3) {
        appendPunishmentForUser(activePunishments, from, senderId, {
          type: "mute5m",
          punishmentId: "5",
          severityMultiplier: 1,
          appliedAt: now,
          targetUserId: senderId,
          endsAt: now + (5 * 60 * 1000),
        }, sock)
        economyService.debitCoinsFlexible(senderId, 50, {
          type: "anti-letter-dump-fine",
          details: "Multa por spam de letras",
          meta: { groupId: from },
        })
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. 3ª ocorrência: mute de 5 minutos + multa de 50 moedas.`,
          mentions: normalizeMentionArray([senderId]),
        })
      } else if (current.offenseCount >= 2) {
        appendPunishmentForUser(activePunishments, from, senderId, {
          type: "mute5m",
          punishmentId: "5",
          severityMultiplier: 1,
          appliedAt: now,
          targetUserId: senderId,
          endsAt: now + 60_000,
        }, sock)
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. 2ª ocorrência: mute temporário de 1 minuto.`,
          mentions: normalizeMentionArray([senderId]),
        })
      } else {
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. Evite flood de letras isoladas.`,
          mentions: normalizeMentionArray([senderId]),
        })
      }

      storage.setActivePunishments(activePunishments)
      dumpState[senderId] = current
      storage.setGameState(from, LETTER_DUMP_STATE_KEY, dumpState)
      return true
    }

    dumpState[senderId] = current
    storage.setGameState(from, LETTER_DUMP_STATE_KEY, dumpState)
  }

  const activePunishments = storage.getActivePunishments()
  const groupPunishments = activePunishments[from] || {}
  let matchedKey = findMatchingUserKey(groupPunishments, senderId)
  if (!matchedKey) {
    return false
  }

  let stack = normalizePunishmentStack(groupPunishments[matchedKey])
  let shouldPersistState = false

  if (matchedKey !== senderId && !groupPunishments[senderId]) {
    // Lazy migration keeps future lookups consistent even if old keys were stored as @lid/@s variants.
    groupPunishments[senderId] = stack
    delete groupPunishments[matchedKey]
    matchedKey = senderId
    shouldPersistState = true
  } else if (!Array.isArray(groupPunishments[matchedKey])) {
    groupPunishments[matchedKey] = stack
    shouldPersistState = true
  }

  const now = Date.now()
  const expiredPunishments = []
  const activeStack = []
  for (const punishment of stack) {
    const endsAt = Number(punishment?.endsAt) || 0
    if (endsAt && now >= endsAt) {
      if (punishment?.timerId) {
        clearTimeout(punishment.timerId)
      }
      expiredPunishments.push(punishment)
      shouldPersistState = true
      continue
    }
    activeStack.push(punishment)
  }
  stack = activeStack

  if (shouldPersistState) {
    setPunishmentStackForUser(groupPunishments, matchedKey, stack)
    if (Object.keys(groupPunishments).length === 0) {
      delete activePunishments[from]
    }
    storage.setActivePunishments(activePunishments)
  }

  if (expiredPunishments.length > 0) {
    for (const expired of expiredPunishments) {
      await sendPunishmentExpiredMessage(sock, from, senderId, expired)
    }
  }

  if (stack.length === 0) {
    return false
  }

  let shouldDelete = false
  let shouldRepostAfterDelete = false
  let stackMutated = false
  const deleteTriggeredTypes = new Set()
  const releaseMessages = []
  const nextStack = []

  for (const punishment of stack) {
    let keepEntry = true
    let entryShouldDelete = false

    if (punishment.type === "max5chars") {
      const measured = stripWhitespaceExceptSpace(text)
      entryShouldDelete = measured.length > 5
    }

    if (punishment.type === "rate20s") {
      if (punishment.lastAllowedAt && now - punishment.lastAllowedAt < 20_000) {
        entryShouldDelete = true
      } else {
        punishment.lastAllowedAt = now
        stackMutated = true
      }
    }

    if (punishment.type === "lettersBlock") {
      const letters = punishment.letters || []
      if (isUnlockLettersMessage(text, letters)) {
        const lettersLabel = letters
          .map((letter) => String(letter || "").trim().toUpperCase())
          .filter(Boolean)
          .join(", ")
        keepEntry = false
        stackMutated = true
        releaseMessages.push(`${formatMentionTag(senderId)}, você cumpriu a condição e foi liberado da punição das letras (${lettersLabel}).`)
      } else {
        entryShouldDelete = messageContainsBlockedLetters(text, letters)
      }
    }

    if (punishment.type === "emojiOnly") {
      const isEmoji = isEmojiOnlyMessage(text)
      const hasSticker = isStickerMessage(msg)
      entryShouldDelete = !isEmoji && !hasSticker
    }

    if (punishment.type === "mute5m") {
      entryShouldDelete = true
    }

    if (punishment.type === "noVowels") {
      const normalizedText = normalizeComparableText(text)
      const hasVowels = /[aeiou]/.test(normalizedText)
      entryShouldDelete = hasVowels
    }

    if (punishment.type === "urgentPrefix") {
      const prefix = String(punishment.requiredPrefix || "🚨URGENTE:")
      const matches = matchesUrgentPrefix(text, prefix)
      entryShouldDelete = !matches
    }

    if (punishment.type === "wordListRequired") {
      const words = Array.isArray(punishment.wordList) ? punishment.wordList : []
      const minRequired = Math.max(1, Math.floor(Number(punishment.minRequiredWords) || 1))
      const hasWords = containsWordListTerms(text, words, minRequired)
      entryShouldDelete = !hasWords
    }

    if (punishment.type === "allCaps") {
      const raw = String(text || "")
      if (!raw.trim() || !hasLetters(raw)) {
        entryShouldDelete = false
      } else {
        entryShouldDelete = raw !== raw.toUpperCase()
      }
    }

    if (punishment.type === "deleteAndRepost") {
      entryShouldDelete = true
      shouldRepostAfterDelete = true
    }

    if (punishment.type === "sexualReaction") {
      const emoji = REPOST_REACTION_EMOJIS[crypto.randomInt(0, REPOST_REACTION_EMOJIS.length)]
      try {
        await sock.sendMessage(from, {
          react: {
            text: emoji,
            key: msg.key,
          },
        })
      } catch (e) {
        console.error("[punishment] Erro ao reagir", e)
      }
    }

    if (punishment.type === "randomDeleteChance") {
      const chance = Math.max(0, Math.min(1, Number(punishment.deleteChance) || 0.2))
      const roll = Math.random()
      entryShouldDelete = roll < chance
    }

    if (punishment.type === "max3wordsStrict") {
      const wordCount = countWordTokensStrict(text)
      entryShouldDelete = wordCount > 3
    }

    if (keepEntry) {
      nextStack.push(punishment)
    }

    if (entryShouldDelete) {
      shouldDelete = true
      deleteTriggeredTypes.add(String(punishment.type || "unknown"))
    }
  }

  if (stackMutated) {
    setPunishmentStackForUser(groupPunishments, matchedKey, nextStack)
    if (Object.keys(groupPunishments).length === 0) {
      delete activePunishments[from]
    }
    storage.setActivePunishments(activePunishments)
    stack = nextStack
  }

  if (releaseMessages.length > 0) {
    for (const releaseText of releaseMessages) {
      await sock.sendMessage(from, {
        text: releaseText,
        mentions: normalizeMentionArray([senderId]),
      })
    }
  }

  if (!shouldDelete) {
    return false
  }

  const deleteTypes = Array.from(deleteTriggeredTypes)
  const primaryDeleteType = deleteTypes[0] || "stacked"
  console.log("[punishment] handlePunishmentEnforcement - DELETING", { senderId, types: deleteTypes })
  telemetry.incrementCounter("punishment.enforcement", 1, {
    type: primaryDeleteType,
    action: "delete",
  })
  telemetry.appendEvent("punishment.enforcement", {
    groupId: from,
    userId: senderId,
    type: primaryDeleteType,
    types: deleteTypes,
    action: "delete",
  })

  let deleteSucceeded = false
  deleteSucceeded = await deleteMessageWithRetry(sock, from, msg.key)
  if (deleteSucceeded && shouldRepostAfterDelete) {
    try {
      await resendPunishedContent(sock, from, senderId, msg, text)
    } catch (e) {
      console.error("[punishment] Erro ao repostar conteúdo da punição", e)
    }
  }
  if (!deleteSucceeded) {
    return true
  }
  return true
}

async function handlePendingPunishmentChoice({
  sock,
  from,
  sender,
  text,
  mentioned,
  contextInfo,
  isGroup,
  senderIsAdmin,
  isCommand,
}) {
  console.log("[punishment] handlePendingPunishmentChoice START", { from, sender })
  if (!isGroup) {
    return false
  }

  if (!storage.isResenhaEnabled(from)) {
    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]?.[sender]) {
      clearPendingPunishment(from, sender)
      return false
    }
    return false
  }

  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const pending = coinPunishmentPending[from]?.[sender]
  if (!pending || (senderIsAdmin && isCommand)) {
    return false
  }

  const hasEligibilityMetadata = Object.prototype.hasOwnProperty.call(pending, "punishmentEligible") ||
    Object.prototype.hasOwnProperty.call(pending, "minPunishmentBet") ||
    Object.prototype.hasOwnProperty.call(pending, "roundBet")
  if (hasEligibilityMetadata) {
    const explicitEligible = pending.punishmentEligible !== false
    const minPunishmentBet = Number.parseInt(String(pending.minPunishmentBet ?? 0), 10)
    const roundBet = Number.parseInt(String(pending.roundBet ?? 0), 10)
    const thresholdViolated = Number.isFinite(minPunishmentBet) && minPunishmentBet > 0 &&
      Number.isFinite(roundBet) && roundBet > 0 && roundBet < minPunishmentBet

    if (!explicitEligible || thresholdViolated) {
      clearPendingPunishment(from, sender)
      await sock.sendMessage(from, {
        text: "Essa escolha de punição expirou por elegibilidade de aposta. Inicie uma nova rodada.",
      })
      return true
    }
  }

  const punishmentChoice = getPunishmentChoiceFromText(text)
  let target = pending.target

  if (pending.mode === "target") {
    const targetResolution = resolveSingleTargetFromMentionOrReply({
      mentioned,
      contextInfo: contextInfo || {},
      sender,
      requireSingleMention: true,
      allowSelf: true,
      allowBot: true,
    })

    if (targetResolution.ok) {
      target = targetResolution.target
    } else if (targetResolution.reason === "multiple-mentions") {
      await sock.sendMessage(from, {
        text: "Mencione apenas 1 usuário ou responda a mensagem dele.",
      })
      return true
    } else if (targetResolution.reason === "quoted-target-missing") {
      await sock.sendMessage(from, {
        text: "Usuário não encontrado.",
      })
      return true
    }
  }

  if (pending.mode === "target" && target && target !== pending.target) {

    if (Array.isArray(pending.allowedTargets) && pending.allowedTargets.length > 0 && !pending.allowedTargets.includes(target)) {
      await sock.sendMessage(from, {
        text: "Esse alvo não é válido para esta escolha."
      })
      return true
    }

    coinPunishmentPending[from][sender].target = target
    storage.setCoinPunishmentPending(coinPunishmentPending)
  }

  if (pending.mode === "target" && !target) {
    await sock.sendMessage(from, {
      text: "Marque primeiro quem vai receber a punição.\n" + getPunishmentMenuText()
    })
    return true
  }

  if (!punishmentChoice) {
    await sock.sendMessage(from, {
      text: "Escolha inválida.\n" + getPunishmentMenuText()
    })
    return true
  }

  const punishedUser = pending.mode === "self" ? sender : target
  await applyPunishment(sock, from, punishedUser, punishmentChoice, {
    severityMultiplier: pending.severityMultiplier || 1,
    origin: pending.origin || "game",
  })
  clearPendingPunishment(from, sender)
  return true
}

async function rehydrateActivePunishments(sock) {
  console.log("[punishment] rehydrateActivePunishments START")
  const activePunishments = storage.getActivePunishments()
  const now = Date.now()
  let changed = false

  for (const [groupId, users] of Object.entries(activePunishments || {})) {
    if (!users || typeof users !== "object") {
      delete activePunishments[groupId]
      changed = true
      continue
    }

    for (const [userIdRaw] of Object.entries(users)) {
      const currentEntry = users[userIdRaw]
      const userId = normalizeUserId(userIdRaw) || String(userIdRaw || "")
      if (!userId || !currentEntry || typeof currentEntry !== "object") {
        delete users[userIdRaw]
        changed = true
        continue
      }

      let userKey = userIdRaw
      let stack = normalizePunishmentStack(currentEntry)

      if (userId !== userIdRaw) {
        const existingStack = normalizePunishmentStack(users[userId])
        stack = [...existingStack, ...stack]
        users[userId] = stack
        delete users[userIdRaw]
        userKey = userId
        changed = true
      } else if (!Array.isArray(users[userKey])) {
        users[userKey] = stack
        changed = true
      }

      const rehydratedStack = []
      for (const entry of stack) {
        if (entry?.timerId) {
          clearTimeout(entry.timerId)
          delete entry.timerId
          changed = true
        }

        const endsAt = Number(entry?.endsAt) || 0
        if (endsAt) {
          const remainingMs = endsAt - now
          if (remainingMs <= 0) {
            changed = true
            continue
          }
          schedulePunishmentExpiryTimer(sock, groupId, userId, entry)
          changed = true
        }

        rehydratedStack.push(entry)
      }

      if (!setPunishmentStackForUser(users, userKey, rehydratedStack)) {
        changed = true
      }
    }

    if (Object.keys(users).length === 0) {
      delete activePunishments[groupId]
      changed = true
    }
  }

  if (changed) {
    storage.setActivePunishments(activePunishments)
  }
  console.log("[punishment] rehydrateActivePunishments COMPLETE")
}



module.exports = {
  getPunishmentChoiceFromText,
  getRandomPunishmentChoice,
  getPunishmentNameById,
  getPunishmentMenuText,
  getPunishmentDetailsText,
  clearPendingPunishment,
  clearPunishment,
  applyPunishment,
  handlePunishmentEnforcement,
  handlePendingPunishmentChoice,
  rehydrateActivePunishments,
}
