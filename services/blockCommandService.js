// Block Command Service
// Gerencia bloqueio de comandos e submenus por grupo

const KNOWN_SUBMENUS = {
  economia: "economia",
  jogos: "jogos",
  moderacao: "moderacao",
}

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
 * Verifica se um argumento é um submenu conhecido
 * @param {string} arg - argumento a verificar
 * @returns {string|null} - nome do submenu ou null
 */
function getSubmenuIfKnown(arg = "") {
  const normalized = String(arg || "").trim().toLowerCase()
  return KNOWN_SUBMENUS[normalized] || null
}

/**
 * Obtém todos os comandos de um submenu
 * @param {string} submenu - nome do submenu
 * @returns {Set} - conjunto de comandos do submenu
 */
function getSubmenuCommands(submenu = "") {
  const normalized = String(submenu || "").trim().toLowerCase()
  const submenuCommands = new Set()

  // Mapeamento de submenus para comandos
  const submenuMap = {
    economia: [
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
      "carepackage",
      "cestabasica",
      "cestabásica",
      "care",
      "missaosemanal",
      "missoesemanais",
      "listaitens",
      "timeranking",
      "mudarapelido",
      "cooldowns",
    ],
    jogos: [
      "jogos",
      "brincadeiras",
      "lobbies",
      "streak",
      "streakranking",
      "comecar",
      "começar",
      "start",
      "entrar",
      "join",
      "moeda",
      "aposta",
      "resposta",
      "passa",
      "rolar",
      "atirar",
    ],
    moderacao: [
      "mute",
      "unmute",
      "ban",
      "adminadd",
      "adminrm",
      "filtros",
      "filtroadd",
      "filtroremove",
      "adm",
      "blockcmd",
      "listblockcmd",
    ],
  }

  const commands = submenuMap[normalized] || []
  for (const cmd of commands) {
    submenuCommands.add(cmd)
  }

  return submenuCommands
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
  
  return cmd
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
 * Bloqueia ou desbloqueia um comando/submenu (toggle)
 * @param {object} storage - instância de storage
 * @param {string} groupId - ID do grupo
 * @param {string} commandOrSubmenu - comando ou submenu a bloquear
 * @param {string} prefix - prefixo do bot
 * @returns {object} - resultado da operação
 */
function toggleCommandBlock(storage, groupId = "", commandOrSubmenu = "", prefix = "!") {
  const normalized = String(commandOrSubmenu || "").trim().toLowerCase()
  if (!normalized) {
    return { ok: false, reason: "empty-argument" }
  }

  // Verificar se é um submenu
  const submenu = getSubmenuIfKnown(normalized)
  if (submenu) {
    // Bloquear todos os comandos do submenu
    const result = storage.toggleBlockedCommand(groupId, submenu)
    return {
      ...result,
      isSubmenu: true,
      submenu: submenu,
    }
  }

  // Verificar se é um comando válido
  const normalizedCmd = normalizeCommand(normalized, prefix)
  
  // !blockcmd não pode ser bloqueado a si mesmo
  if (normalizedCmd === "blockcmd") {
    return { ok: false, reason: "cannot-block-blockcmd" }
  }

  // Bloquear comando específico
  const result = storage.toggleBlockedCommand(groupId, normalizedCmd)
  return {
    ...result,
    isSubmenu: false,
  }
}

/**
 * Lista todos os comandos e submenus bloqueados em um grupo
 * @param {object} storage - instância de storage
 * @param {string} groupId - ID do grupo
 * @param {string} prefix - prefixo do bot
 * @returns {object} - objeto com submenus e comandos bloqueados
 */
function getBlockedCommandsList(storage, groupId = "", prefix = "!") {
  const blockedList = storage.getBlockedCommandsList(groupId)
  
  const result = {
    submenus: [],
    commands: [],
    total: 0,
  }

  for (const item of blockedList) {
    if (KNOWN_SUBMENUS[item]) {
      result.submenus.push({
        name: item,
        displayName: item.charAt(0).toUpperCase() + item.slice(1),
        commandCount: getSubmenuCommands(item).size,
      })
    } else {
      result.commands.push({
        name: item,
        displayName: `${prefix}${item}`,
      })
    }
  }

  result.total = result.submenus.length + result.commands.length
  return result
}

/**
 * Valida se um comando/submenu existe ou é válido
 * @param {string} commandOrSubmenu - comando ou submenu
 * @returns {boolean} - true se válido
 */
function isValidCommandOrSubmenu(commandOrSubmenu = "") {
  const normalized = String(commandOrSubmenu || "").trim().toLowerCase()
  if (!normalized) return false
  
  // É um submenu conhecido?
  if (KNOWN_SUBMENUS[normalized]) return true
  
  // É um comando conhecido?
  if (ALL_COMMANDS.has(normalized)) return true
  
  return false
}

module.exports = {
  getSubmenuIfKnown,
  getSubmenuCommands,
  normalizeCommand,
  isCommandBlocked,
  toggleCommandBlock,
  getBlockedCommandsList,
  isValidCommandOrSubmenu,
  KNOWN_SUBMENUS,
  ALL_COMMANDS,
}
