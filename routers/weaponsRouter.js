const { normalizeMentionArray, formatMentionTag } = require("../services/mentionService")
const { applyPunishment, getRandomPunishmentChoice, clearAllPunishmentsFromGroup } = require("../services/punishmentService")

const WEAPON_MUTE_DURATION_MS = 3 * 60 * 1000
const WEAPON_PRELUDE_DELAY_MS = 1000
const WEAPON_ACTION_DELAY_MS = 300

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pickRandomOverrideJid() {
  const overrides = [
    process.env.VITIN_ID || "183563009966181@lid",
    process.env.JESSE_ID || "279202939035898@lid",
  ]
  return overrides[Math.floor(Math.random() * overrides.length)]
}

function getCommandName(text = "") {
  const normalized = String(text || "").toLowerCase().trim()
  const parts = normalized.split(/\s+/).filter(Boolean)
  return parts[0] || ""
}

function getGroupTargets(participants = [], botJid = "") {
  return (participants || []).filter((participant) => participant?.id && participant.id !== botJid)
}

function upsertGroupMutes(storage, groupId, targetIds = [], durationMs = WEAPON_MUTE_DURATION_MS) {
  const mutedUsers = storage.getMutedUsers() || {}
  if (!mutedUsers[groupId] || typeof mutedUsers[groupId] !== "object") {
    mutedUsers[groupId] = {}
  }

  const expiresAt = Date.now() + durationMs
  for (const targetId of targetIds) {
    if (!targetId) continue
    mutedUsers[groupId][targetId] = expiresAt
  }

  storage.setMutedUsers(mutedUsers)
}

async function sendWeaponPrelude(sock, from, overrideJid, battleText) {
  await sock.sendMessage(from, {
    text: `O CORNO DO ${formatMentionTag(overrideJid)} TA PUTO`,
    mentions: normalizeMentionArray([overrideJid]),
  })
  await sleep(WEAPON_PRELUDE_DELAY_MS)
  await sock.sendMessage(from, { text: battleText })
}

async function handleWeaponsMenu({ sock, from, prefix }) {
  const armasMenu = `
╭━━━〔 ⚔️ MENU: ARMAS 〕━━━╮
│ Comandos exclusivos para overrides
│
│ ${prefix}hiroshima
│ └─ Aplica 1 punição aleatória
│    para TODOS os membros do grupo
│    (afeta overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (afeta overrides)
│
│ ${prefix}chernobyl
│ └─ Muta metade do grupo e aplica
│    punição aleatória na outra metade
│
│ ${prefix}removerradiacao
│ └─ Remove TODAS punições e mutes
│
│ ⚠️ Cuidado: Essas armas afetam
│    TODOS os membros simultaneamente!
╰━━━━━━━━━━━━━━━━━━━━╯
    `

  await sock.sendMessage(from, { text: armasMenu })
}

async function executeHiroshima({ sock, from, overrideJid }) {
  const metadata = await sock.groupMetadata(from)
  const targets = getGroupTargets(metadata?.participants || [], sock.user?.id)
  if (!targets.length) return

  await sendWeaponPrelude(sock, from, overrideJid, "VAI BOTAR TODO MUNDO DE CASTIGO KKKKKKKKKKKKKKKKK")

  for (const target of targets) {
    const punishment = getRandomPunishmentChoice()
    await applyPunishment(sock, from, target.id, punishment, {
      origin: "weapon",
      ignoreShield: true,
    })
    await sleep(WEAPON_ACTION_DELAY_MS)
  }
}

async function executeNagasaki({ sock, from, storage, overrideJid }) {
  const metadata = await sock.groupMetadata(from)
  const targets = getGroupTargets(metadata?.participants || [], sock.user?.id)

  await sendWeaponPrelude(sock, from, overrideJid, "GERAL CALADO POR 3 MINUTOS KKKKKKKKKKK")
  upsertGroupMutes(storage, from, targets.map((participant) => participant.id), WEAPON_MUTE_DURATION_MS)
}

async function executeChernobyl({ sock, from, storage, overrideJid }) {
  const metadata = await sock.groupMetadata(from)
  const targets = getGroupTargets(metadata?.participants || [], sock.user?.id)
  if (targets.length < 2) return

  await sendWeaponPrelude(sock, from, overrideJid, "CHERNOBYL ATIVADO!")

  const shuffled = [...targets].sort(() => 0.5 - Math.random())
  const splitIndex = Math.ceil(shuffled.length / 2)
  const mutedHalf = shuffled.slice(0, splitIndex)
  const punishedHalf = shuffled.slice(splitIndex)

  upsertGroupMutes(storage, from, mutedHalf.map((participant) => participant.id), WEAPON_MUTE_DURATION_MS)

  for (const participant of punishedHalf) {
    const punishment = getRandomPunishmentChoice()
    await applyPunishment(sock, from, participant.id, punishment, {
      origin: "weapon",
      ignoreShield: true,
    })
    await sleep(WEAPON_ACTION_DELAY_MS)
  }
}

async function executeRemoverRadiacao({ sock, from, storage }) {
  const mutedUsers = storage.getMutedUsers() || {}
  mutedUsers[from] = {}
  storage.setMutedUsers(mutedUsers)

  await clearAllPunishmentsFromGroup(from)
  await sock.sendMessage(from, {
    text: "☢️ RADIAÇÃO REMOVIDA! Tudo voltou ao normal (eu acho).",
  })
}

async function handleWeaponsCommand(ctx) {
  const {
    sock,
    from,
    text,
    isGroup,
    isOverrideSender,
    prefix,
    storage,
  } = ctx

  if (!isGroup) return false

  const cmdName = getCommandName(text)
  const menuCommand = `${prefix}armas`
  if (cmdName === menuCommand) {
    await handleWeaponsMenu({ sock, from, prefix })
    return true
  }

  const commandHandlers = {
    [`${prefix}hiroshima`]: executeHiroshima,
    [`${prefix}nagasaki`]: executeNagasaki,
    [`${prefix}chernobyl`]: executeChernobyl,
    [`${prefix}removerradiacao`]: executeRemoverRadiacao,
  }

  const weaponHandler = commandHandlers[cmdName]
  if (!weaponHandler) return false

  if (!isOverrideSender) {
    await sock.sendMessage(from, {
      text: "❌ Apenas overrides podem usar essa arma!",
    })
    return true
  }

  try {
    await weaponHandler({
      sock,
      from,
      storage,
      overrideJid: pickRandomOverrideJid(),
    })
  } catch (err) {
    const commandLabel = String(cmdName || "").replace(String(prefix || ""), "") || "arma"
    console.error(`Erro ao executar ${commandLabel}:`, err)
  }

  return true
}

module.exports = { handleWeaponsCommand }
