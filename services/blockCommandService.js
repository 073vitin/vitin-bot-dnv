// Block Command Service
// Gerencia bloqueio de comandos por grupo

// Lista de todos os comandos conhecidos (para validação)
const ALL_COMMANDS = new Set([
  "economia",
  "xp",
  "missao",
  "missoes",
  "perfil",
  "extrato",
  "coinsranking",
  "xpranking",
  "loja",
  "guia",
  "comprar",
  "comprarpara",
  "vender",
  "doarcoins",
  "doaritem",
  "roubar",
  "daily",
  "cassino",
  "blackjack",
  "bj",
  "21",
  "lootbox",
  "falsificar",
  "trabalho",
  "cupom",
  "loteria",
  "usaritem",
  "usarpasse",
  "setcoins",
  "addcoins",
  "removecoins",
  "additem",
  "removeitem",
  "trade",
  "time",
  "deletarconta",
  "deleteconta",
  "moeda",
  "aposta",
  "comecar",
  "começar",
  "start",
  "entrar",
  "join",
  "resposta",
  "passa",
  "rolar",
  "atirar",
  "jogos",
  "brincadeiras",
  "lobbies",
  "streak",
  "streakranking",
  "ajuda",
  "duvida",
  "pergunta",
  "feedback",
  "feedbackpriv",
  "bugbounty",
  "menu",
  "perf",
  "s",
  "fig",
  "sticker",
  "f",
  "register",
  "unregister",
  "jid",
  "punicoeslista",
  "puniçõeslista",
  "roleta",
  "ship",
  "mentions",
  "mention",
  "apelido",
  "comando", // alias para economia/economia
  "care", // carepackage
  "carepackage",
  "cestabasica",
  "cestabásica",
  "missaosemanal",
  "missoesemanais",
  "mute",
  "unmute",
  "ban",
  "adminadd",
  "adminrm",
  "filtros",
  "filtroadd",
  "filtroremove",
  "adm",
  "admeconomia",
  "listaitens",
  "timeranking",
  "mudarapelido",
  "cooldowns",
])

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
