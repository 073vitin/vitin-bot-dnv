// Block Command Service
// Gerencia bloqueio de comandos por grupo

const { COMMAND_HELP } = require("../commandHelp")

const ALL_COMMANDS = new Set()
for (const [cmdKey, cmdInfo] of Object.entries(COMMAND_HELP || {})) {
  ALL_COMMANDS.add(cmdKey.toLowerCase())
  if (Array.isArray(cmdInfo?.aliases)) {
    for (const alias of cmdInfo.aliases) {
      ALL_COMMANDS.add(String(alias || "").toLowerCase())
    }
  }
}

/**
 * Normaliza um comando (remove prefixo se presente)
 * @param {string} command - comando a normalizar
 * @param {string} prefix - prefixo do bot
 * @returns {string} - comando normalizado
 */
function normalizeCommand(command = "", prefix = "!") {
  const prefixStr = String(prefix || "").trim()
  let cmd = String(command || "").trim().toLowerCase()
  
  if (prefixStr && cmd.startsWith(prefixStr)) {
    cmd = cmd.slice(prefixStr.length)
  }
  
  // Retorna apenas o nome do comando, sem argumentos
  const commandName = cmd.split(/\s+/)[0]
  return commandName
}

/**
 * Verifica se um comando está bloqueado para um grupo
 * @param {object} storage - instância de storage
 * @param {string} groupId - ID do grupo
 * @param {string} command - comando a verificar
 * @param {string} prefix - prefixo do bot
 * @returns {boolean} - true se bloqueado
 */
function isCommandBlocked(storage, groupId = "", command = "", prefix = "!") {
  const normalizedCmd = normalizeCommand(command, prefix)
  if (!normalizedCmd) return false
  
  // !blockcmd nunca pode ser bloqueado a si mesmo
  if (normalizedCmd === "blockcmd") return false
  // !listblockcmd nunca pode ser bloqueado
  if (normalizedCmd === "listblockcmd") return false

  return storage.isCommandBlocked(groupId, normalizedCmd)
}

/**
 * Bloqueia ou desbloqueia um comando (toggle)
 * @param {object} storage - instância de storage
 * @param {string} groupId - ID do grupo
 * @param {string} command - comando a bloquear
 * @param {string} prefix - prefixo do bot
 * @returns {object} - resultado da operação
 */
function toggleCommandBlock(storage, groupId = "", command = "", prefix = "!") {
  const normalized = String(command || "").trim().toLowerCase()
  if (!normalized) {
    return { ok: false, reason: "empty-argument" }
  }

  // Normalizar o comando
  const normalizedCmd = normalizeCommand(normalized, prefix)
  
  // !blockcmd não pode ser bloqueado a si mesmo
  if (normalizedCmd === "blockcmd") {
    return { ok: false, reason: "cannot-block-blockcmd" }
  }

  // Bloquear comando específico
  const result = storage.toggleBlockedCommand(groupId, normalizedCmd)
  return result
}

/**
 * Lista todos os comandos bloqueados em um grupo
 * @param {object} storage - instância de storage
 * @param {string} groupId - ID do grupo
 * @param {string} prefix - prefixo do bot
 * @returns {object} - objeto com comandos bloqueados
 */
function getBlockedCommandsList(storage, groupId = "", prefix = "!") {
  const blockedList = storage.getBlockedCommandsList(groupId)
  
  const result = {
    commands: [],
    total: 0,
  }

  for (const cmd of blockedList) {
    result.commands.push({
      name: cmd,
      displayName: `${prefix}${cmd}`,
    })
  }

  result.total = result.commands.length
  return result
}

/**
 * Valida se um comando existe ou é válido
 * @param {string} command - comando
 * @returns {boolean} - true se válido
 */
function isValidCommand(command = "") {
  const normalized = String(command || "").trim().toLowerCase()
  if (!normalized) return false
  
  // É um comando conhecido?
  if (ALL_COMMANDS.has(normalized)) return true
  
  return false
}

module.exports = {
  normalizeCommand,
  isCommandBlocked,
  toggleCommandBlock,
  getBlockedCommandsList,
  isValidCommand,
  ALL_COMMANDS,
}
