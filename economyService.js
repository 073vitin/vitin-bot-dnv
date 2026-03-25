const fs = require("fs")
const path = require("path")
const telemetry = require("./telemetryService")

const DATA_DIR = path.join(__dirname, ".data")
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json")
const DEFAULT_COINS = 0
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_COINS_BALANCE = 2_000_000_000
const MAX_COIN_OPERATION = 50_000_000
const MAX_ITEM_STACK = 100_000
const MAX_ITEM_OPERATION = 10_000
const MAX_LOOTBOX_OPEN_PER_CALL = 10
const MAX_FORGE_QUANTITY = 1_000
const DAILY_QUEST_COUNT = 3
const WEEKLY_QUEST_COUNT = 5
const BASE_XP_TO_LEVEL = 95
const XP_GROWTH_MIN = 0.15
const XP_GROWTH_MAX = 0.5
const XP_BASE_GROWTH_CEILING = 0.43
const LEVEL_MILESTONE_INTERVAL = 5
const MAX_LEVEL = 100
const SEASON_DURATION_MS = 42 * DAY_MS

// 50 daily quest options (randomly selected 3 per player per day)
const DAILY_QUEST_POOL = [
  // Work & Income (6)
  { key: "works", title: "Concluir trabalhos", targetMin: 2, targetMax: 5, rewardXp: 120, rewardCoins: 220 },
  { key: "worksCompleted", title: "Completar 3+ trabalhos", targetMin: 3, targetMax: 6, rewardXp: 140, rewardCoins: 260 },
  { key: "stealSuccessCount", title: "Roubos bem sucedidos", targetMin: 1, targetMax: 3, rewardXp: 110, rewardCoins: 200 },
  { key: "stealAttempts", title: "Tentar roubos", targetMin: 2, targetMax: 3, rewardXp: 115, rewardCoins: 170 },
  { key: "coinsLifetimeEarned", title: "Ganhar moedas totais", targetMin: 500, targetMax: 2000, rewardXp: 130, rewardCoins: 240 },
  { key: "dailyClaimCount", title: "Resgatar o daily", targetMin: 1, targetMax: 1, rewardXp: 90, rewardCoins: 130 },
  
  // Casino & Games (8)
  { key: "casinoPlays", title: "Jogar no cassino", targetMin: 2, targetMax: 4, rewardXp: 100, rewardCoins: 180 },
  { key: "gameCoinWin", title: "Vencer Cara ou Coroa", targetMin: 1, targetMax: 3, rewardXp: 125, rewardCoins: 160 },
  { key: "gameGuessingWin", title: "Vencer Adivinhação", targetMin: 1, targetMax: 2, rewardXp: 135, rewardCoins: 190 },
  { key: "gameDadosWin", title: "Vencer Duelo de Dados", targetMin: 1, targetMax: 2, rewardXp: 120, rewardCoins: 175 },
  { key: "gamesPlayed", title: "Jogar qualquer jogo", targetMin: 5, targetMax: 10, rewardXp: 140, rewardCoins: 210 },
  { key: "coinStreakMax", title: "Streak de Cara ou Coroa", targetMin: 3, targetMax: 5, rewardXp: 150, rewardCoins: 230 },
  { key: "gameRRWin", title: "Ganhar Roleta Russa", targetMin: 1, targetMax: 2, rewardXp: 160, rewardCoins: 250 },
  { key: "duelWins", title: "Vencer duelos", targetMin: 2, targetMax: 4, rewardXp: 125, rewardCoins: 185 },
  
  // Items & Inventory (6)
  { key: "lootboxesOpened", title: "Abrir lootboxes", targetMin: 1, targetMax: 3, rewardXp: 140, rewardCoins: 210 },
  { key: "itemsBought", title: "Comprar itens na loja", targetMin: 2, targetMax: 4, rewardXp: 145, rewardCoins: 225 },
  { key: "itemsSold", title: "Vender itens", targetMin: 1, targetMax: 3, rewardXp: 110, rewardCoins: 165 },
  { key: "shieldsUsed", title: "Usar escudos", targetMin: 1, targetMax: 2, rewardXp: 100, rewardCoins: 155 },
  { key: "tradeCompleted", title: "Completar trocas", targetMin: 1, targetMax: 2, rewardXp: 135, rewardCoins: 195 },
  { key: "punishmentPassesUsed", title: "Usar passes de punição", targetMin: 1, targetMax: 2, rewardXp: 120, rewardCoins: 180 },
  
  // Social & Teams (5)
  { key: "groupInteractions", title: "Interagir no grupo", targetMin: 10, targetMax: 30, rewardXp: 100, rewardCoins: 140 },
  { key: "mentionsReceived", title: "Ser mencionado", targetMin: 3, targetMax: 8, rewardXp: 95, rewardCoins: 135 },
  { key: "teamContributions", title: "Contribuir para equipe", targetMin: 3, targetMax: 6, rewardXp: 150, rewardCoins: 240 },
  { key: "tradingVolume", title: "Volume em trocas", targetMin: 500, targetMax: 2000, rewardXp: 140, rewardCoins: 220 },
  { key: "coopcompletes", title: "Completar co-op", targetMin: 1, targetMax: 3, rewardXp: 160, rewardCoins: 260 },
  
  // Punishment & Moderation (4)
  { key: "punishmentsReceived", title: "Receber punições", targetMin: 2, targetMax: 5, rewardXp: 80, rewardCoins: 100 },
  { key: "violationsFlagged", title: "Violações detectadas", targetMin: 1, targetMax: 3, rewardXp: 90, rewardCoins: 120 },
  { key: "timesPunished", title: "Ser punido", targetMin: 1, targetMax: 2, rewardXp: 70, rewardCoins: 90 },
  { key: "mutesBypass", title: "Violar restrições", targetMin: 1, targetMax: 3, rewardXp: 60, rewardCoins: 80 },
  
  // XP & Leveling (5)
  { key: "xpGained", title: "Ganhar XP", targetMin: 400, targetMax: 1000, rewardXp: 150, rewardCoins: 180 },
  { key: "levelUps", title: "Subir de nível", targetMin: 1, targetMax: 2, rewardXp: 200, rewardCoins: 300 },
  { key: "milestoneReached", title: "Atingir milestone", targetMin: 1, targetMax: 1, rewardXp: 180, rewardCoins: 280 },
  { key: "seasonProgress", title: "Progressão de season", targetMin: 500, targetMax: 1500, rewardXp: 140, rewardCoins: 210 },
  { key: "questsClaimed", title: "Resgatar missões", targetMin: 1, targetMax: 2, rewardXp: 130, rewardCoins: 195 },
  
  // Challenges & Achievements (7)
  { key: "winStreak", title: "Ganhar sequência", targetMin: 3, targetMax: 7, rewardXp: 155, rewardCoins: 235 },
  { key: "highRiskWins", title: "Vencer com grande aposta", targetMin: 2, targetMax: 4, rewardXp: 165, rewardCoins: 270 },
  { key: "lootboxJackpots", title: "Ganhar jackpot em lootbox", targetMin: 1, targetMax: 2, rewardXp: 180, rewardCoins: 290 },
  { key: "tradingProfits", title: "Lucrar em trocas", targetMin: 200, targetMax: 800, rewardXp: 135, rewardCoins: 200 },
  { key: "timesMuted", title: "Ser silenciado", targetMin: 1, targetMax: 3, rewardXp: 75, rewardCoins: 105 },
  { key: "escapeSecrets", title: "Encontrar segredos", targetMin: 1, targetMax: 2, rewardXp: 200, rewardCoins: 320 },
  { key: "experimentalGames", title: "Jogar jogos experimentais", targetMin: 1, targetMax: 3, rewardXp: 140, rewardCoins: 215 },
]

// 50 weekly quest options (5 selected per player per week)
const WEEKLY_QUEST_POOL = [
  // Weekly Grinds (10)
  { key: "weeklyWorks", title: "50+ trabalhos na semana", targetMin: 50, targetMax: 100, rewardXp: 500, rewardCoins: 1200 },
  { key: "weeklyGameWins", title: "Vencer 15+ jogos", targetMin: 15, targetMax: 30, rewardXp: 600, rewardCoins: 1400 },
  { key: "weeklyCoinWins", title: "Vencer 10+ Cara ou Coroas", targetMin: 10, targetMax: 20, rewardXp: 550, rewardCoins: 1300 },
  { key: "weeklyXpEarned", title: "Ganhar 3000+ XP", targetMin: 3000, targetMax: 7000, rewardXp: 700, rewardCoins: 1600 },
  { key: "weeklyCoinsEarned", title: "Ganhar 5000+ moedas", targetMin: 5000, targetMax: 15000, rewardXp: 650, rewardCoins: 1500 },
  { key: "weeklyStealAttempts", title: "Tentar 20+ roubos", targetMin: 20, targetMax: 40, rewardXp: 520, rewardCoins: 1250 },
  { key: "weeklyLootboxes", title: "Abrir 10+ lootboxes", targetMin: 10, targetMax: 25, rewardXp: 580, rewardCoins: 1350 },
  { key: "weeklyTrades", title: "Completar 8+ trocas", targetMin: 8, targetMax: 15, rewardXp: 620, rewardCoins: 1450 },
  { key: "weeklyShields", title: "Usar 5+ escudos", targetMin: 5, targetMax: 12, rewardXp: 480, rewardCoins: 1100 },
  { key: "weeklySocialScore", title: "Alcançar 200 score social", targetMin: 200, targetMax: 500, rewardXp: 540, rewardCoins: 1280 },
  
  // Weekly Social (8)
  { key: "teamCoopComplete", title: "5+ co-ops com equipe", targetMin: 5, targetMax: 15, rewardXp: 700, rewardCoins: 1700 },
  { key: "teamContrib", title: "Empresa equipe 3000+ moedas", targetMin: 3000, targetMax: 8000, rewardXp: 650, rewardCoins: 1550 },
  { key: "groupParticipation", title: "Participar em 30+ eventos", targetMin: 30, targetMax: 70, rewardXp: 560, rewardCoins: 1320 },
  { key: "mentionedByOthers", title: "Ser mencionado 15+ vezes", targetMin: 15, targetMax: 40, rewardXp: 500, rewardCoins: 1200 },
  { key: "duelWithDifferent", title: "Duelar com 8+ jogadores", targetMin: 8, targetMax: 20, rewardXp: 620, rewardCoins: 1480 },
  { key: "tradingWithTeam", title: "Trocar com 5  + membros", targetMin: 5, targetMax: 15, rewardXp: 580, rewardCoins: 1380 },
  { key: "leaderboardTopTen", title: "Top 10 em ranking", targetMin: 1, targetMax: 1, rewardXp: 1000, rewardCoins: 2500 },
  { key: "seasonParticipation", title: "80% season points progresso", targetMin: 1, targetMax: 1, rewardXp: 800, rewardCoins: 1900 },
  
  // Weekly Challenges (10)
  { key: "riskWinStreak", title: "3+ vitórias em apostas altas", targetMin: 3, targetMax: 8, rewardXp: 750, rewardCoins: 1800 },
  { key: "jackpotHunt", title: "Ganhar 2+ jackpots", targetMin: 2, targetMax: 5, rewardXp: 850, rewardCoins: 2100 },
  { key: "survivalChallenge", title: "Sobreviver 10+ rodadas RR", targetMin: 10, targetMax: 25, rewardXp: 700, rewardCoins: 1700 },
  { key: "tradeProfitMilestone", title: "Lucrar 2000+ em trocas", targetMin: 2000, targetMax: 6000, rewardXp: 750, rewardCoins: 1850 },
  { key: "noMutesWeek", title: "Semana sem silenciar", targetMin: 1, targetMax: 1, rewardXp: 600, rewardCoins: 1400 },
  { key: "perfectAttendance", title: "Daily todos os dias", targetMin: 7, targetMax: 7, rewardXp: 650, rewardCoins: 1550 },
  { key: "questMaster", title: "Resgatar 15+ missões", targetMin: 15, targetMax: 30, rewardXp: 580, rewardCoins: 1380 },
  { key: "itemCollector", title: "Coletar 10+ itens diferentes", targetMin: 10, targetMax: 25, rewardXp: 520, rewardCoins: 1250 },
  { key: "levelSpike", title: "Subir 3+ níveis", targetMin: 3, targetMax: 8, rewardXp: 800, rewardCoins: 1950 },
  { key: "secretsUnlocked", title: "Desbloquear 3+ segredos", targetMin: 3, targetMax: 6, rewardXp: 900, rewardCoins: 2200 },
  
  // Weekly Milestones (14)
  { key: "crownMilestone", title: "Adquirir coroa", targetMin: 1, targetMax: 1, rewardXp: 400, rewardCoins: 1000 },
  { key: "treasureDiscovery", title: "Descobrir tesouro", targetMin: 1, targetMax: 1, rewardXp: 450, rewardCoins: 1150 },
  { key: "masterTheft", title: "Roubo master (5000+ moedas)", targetMin: 1, targetMax: 3, rewardXp: 650, rewardCoins: 1550 },
  { key: "vastWealthMilestone", title: "100k+ moedas totais", targetMin: 1, targetMax: 1, rewardXp: 900, rewardCoins: 2200 },
  { key: "xpMilestone", title: "10k+ XP na semana", targetMin: 1, targetMax: 1, rewardXp: 1000, rewardCoins: 2400 },
  { key: "teamRichdom", title: "Equipe 50k+ pool", targetMin: 1, targetMax: 1, rewardXp: 850, rewardCoins: 2050 },
  { key: "legendaryItem", title: "Adquirir item lendário", targetMin: 1, targetMax: 1, rewardXp: 950, rewardCoins: 2300 },
  { key: "redemptionWeek", title: "Semana de redenção", targetMin: 1, targetMax: 1, rewardXp: 500, rewardCoins: 1200 },
  { key: "communityHero", title: "100+ membros mencionam", targetMin: 100, targetMax: 200, rewardXp: 700, rewardCoins: 1700 },
  { key: "tradingTycoon", title: "1M volume em trocas", targetMin: 1000000, targetMax: 5000000, rewardXp: 1200, rewardCoins: 2900 },
  { key: "undefeated", title: "Semana invicta (10+ jogos)", targetMin: 10, targetMax: 25, rewardXp: 800, rewardCoins: 1950 },
  { key: "immortal", title: "Sobreviver tudo", targetMin: 1, targetMax: 1, rewardXp: 1500, rewardCoins: 3600 },
  { key: "forgemaster", title: "Fabricar 5+ passes", targetMin: 5, targetMax: 10, rewardXp: 700, rewardCoins: 1700 },
  { key: "chronicler", title: "Completar jogo/semana changelog", targetMin: 1, targetMax: 1, rewardXp: 600, rewardCoins: 1450 },
  
  // Weekly Community (8)
  { key: "votingParticipant", title: "Participar em 10+ votações", targetMin: 10, targetMax: 25, rewardXp: 450, rewardCoins: 1050 },
  { key: "eventAttendee", title: "Participar em 3+ events", targetMin: 3, targetMax: 8, rewardXp: 550, rewardCoins: 1300 },
  { key: "giverOfHelp", title: "Ajudar 5+ novatos", targetMin: 5, targetMax: 15, rewardXp: 600, rewardCoins: 1450 },
  { key: "novelExplorer", title: "Experimentar feature nova", targetMin: 3, targetMax: 10, rewardXp: 500, rewardCoins: 1200 },
  { key: "bugReporter", title: "Reportar bug/issue", targetMin: 1, targetMax: 3, rewardXp: 400, rewardCoins: 950 },
  { key: "communityFeedback", title: "Dar feedback útil", targetMin: 3, targetMax: 8, rewardXp: 450, rewardCoins: 1100 },
  { key: "eventUnlocker", title: "Desbloquear evento especial", targetMin: 1, targetMax: 3, rewardXp: 700, rewardCoins: 1700 },
  { key: "badgeCollector", title: "Coletar 5+ badges", targetMin: 5, targetMax: 10, rewardXp: 550, rewardCoins: 1320 },
]

const PUNISHMENT_TYPE_NAMES = {
  1: "max. 5 caracteres",
  2: "1 msg/20s",
  3: "bloqueio 2 letras",
  4: "somente emojis/figurinhas",
  5: "mute total",
  6: "sem vogais",
  7: "prefixo urgente",
  8: "palavras da lista",
  9: "somente caixa alta",
  10: "repost pelo bot",
  11: "reação sugestiva",
  12: "chance de apagar",
  13: "máx. 3 palavras",
}

const PUNISHMENT_PASS_BASE_SELL = {
  // Light punishments (warnings, mute 5min): 50-100
  1: 75,    // max 5 chars
  2: 85,    // 1 msg/20s
  // Moderate punishments (mute 10-30min, small fine): 100-200
  3: 120,   // block 2 letters
  4: 140,   // only emojis
  5: 170,   // total mute (shorter)
  // Heavy punishments (mute 1h+, significant fine): 200-500
  6: 250,   // no vowels
  7: 280,   // urgent prefix
  8: 320,   // blocked words
  9: 380,   // uppercase only
  10: 420,  // repost by bot
  // Severe punishments (extended mute, major losses): 500+
  11: 550,  // suggestive reaction
  12: 650,  // chance to delete
  13: 750,  // max 3 words
}

function normalizePassSeverity(value, fallback = 1) {
  const parsed = Math.floor(Number(value) || 0)
  return parsed > 0 ? parsed : fallback
}

function isValidPunishmentType(type) {
  const parsed = Math.floor(Number(type) || 0)
  return parsed >= 1 && parsed <= 13
}

function buildPunishmentPassKey(type, severity = 1) {
  const safeType = Math.floor(Number(type) || 0)
  const safeSeverity = normalizePassSeverity(severity, 1)
  return `passPunicao${safeType}x${safeSeverity}`
}

function parsePunishmentPassKey(itemKey = "") {
  const raw = String(itemKey || "")
  const match = raw.match(/^passPunicao(1[0-3]|[1-9])x(\d+)$/i)
  if (!match) return null
  const type = Number.parseInt(match[1], 10)
  const severity = normalizePassSeverity(match[2], 1)
  return { type, severity, key: buildPunishmentPassKey(type, severity) }
}

function getPunishmentPassDefinition(type, severity = 1) {
  if (!isValidPunishmentType(type)) return null
  const parsedType = Math.floor(Number(type) || 0)
  const parsedSeverity = normalizePassSeverity(severity, 1)
  const baseSell = Number(PUNISHMENT_PASS_BASE_SELL[parsedType]) || 400
  const sellValue = Math.floor(baseSell * parsedSeverity)
  return {
    key: buildPunishmentPassKey(parsedType, parsedSeverity),
    aliases: [],
    name: `Passe de Punição ${parsedType} (${parsedSeverity}x)`,
    price: sellValue,
    sellRate: 1,
    stackable: true,
    buyable: false,
    punishmentType: parsedType,
    severity: parsedSeverity,
    description: `Permite aplicar punição '${PUNISHMENT_TYPE_NAMES[parsedType]}' com severidade ${parsedSeverity}x. Item não comprável na loja.`,
  }
}

function pickRandomPunishmentType(excludedType = null) {
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((type) => type !== excludedType)
  return options[Math.floor(Math.random() * options.length)]
}

const ITEM_DEFINITIONS = {
  // ===== REGULAR PURCHASABLE ITEMS (15) =====
  // Defense
  escudo: {
    key: "escudo",
    aliases: ["escudob"],
    name: "Escudo Básico",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Protege automaticamente contra 1 punição não administrativa.",
  },
  escudoReforcado: {
    key: "escudoReforcado",
    aliases: ["escudoforte"],
    name: "Escudo Reforçado",
    price: 2500,
    sellRate: 0.8,
    stackable: true,
    rarity: 3,
    description: "Protege automaticamente contra 3 punições não administrativas.",
  },
  // Risk Protection
  antiRouboCharm: {
    key: "pingenteAntiRoubo",
    aliases: ["pingenteantiroubo", "pingentear"],
    name: "Pingente Anti-Roubo",
    price: 1200,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Para 1 tentativa de roubo bem sucedida contra você.",
  },
  casinoInsurance: {
    key: "seguroCassino",
    aliases: ["tokensegurocassino"],
    name: "Token de Seguro no Cassino",
    price: 1800,
    sellRate: 0.8,
    stackable: true,
    rarity: 3,
    description: "Para você de perder moedas em uma rodada de cassino.",
  },
  // Utility
  workSafetyToken: {
    key: "seguroTrabalho",
    aliases: ["tokentrabalhoseguro"],
    name: "Token de Seguro no Trabalho",
    price: 600,
    sellRate: 0.8,
    stackable: true,
    rarity: 1,
    description: "Garante sucesso em um trabalho (!trabalho).",
  },
  rrFocusToken: {
    key: "tokenSorteRR",
    aliases: ["tokensorterr"],
    name: "Token de Sorte na RR",
    price: 1400,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Melhora sua sorte na Roleta Russa. +20% chance de sobreviver próxima puxada de gatilho.",
  },
  cooldownReducer: {
    key: "redutorCooldowns1",
    aliases: ["redutor"],
    name: "Redutor de Cooldowns Leve",
    price: 1100,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Reduz cooldowns de economia por 30 minutos.",
  },
  questRerollToken: {
    key: "questRerollToken",
    aliases: ["rerollmissao"],
    name: "Token de Re-rolagem",
    price: 800,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Troca uma missão diária por outra aleatória.",
  },
  streakSaver: {
    key: "streakSaver",
    aliases: ["salvadorstreak"],
    name: "Salva-guarda de Streak",
    price: 1300,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Salva sua sequência de vitórias quando perde uma rodada.",
  },
  salvageToken: {
    key: "salvageToken",
    aliases: ["salvagem"],
    name: "Salvage Token",
    price: 2000,
    sellRate: 0.75,
    stackable: true,
    rarity: 3,
    description: "Recupera moedas de uma perda em jogo de alto risco.",
  },
  // Boosters
  xpBooster: {
    key: "xpBooster",
    aliases: ["boosterxp"],
    name: "XP Booster Light",
    price: 700,
    sellRate: 0.8,
    stackable: true,
    rarity: 1,
    description: "+15% XP para próximas 3 atividades.",
  },
  questPointBooster: {
    key: "questPointBooster",
    aliases: ["boostermissao"],
    name: "Quest Point Booster",
    price: 950,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "+25% recompensas de missões por 24 horas.",
  },
  claimMultiplier: {
    key: "claimMultiplier",
    aliases: ["multiplicador"],
    name: "Claim Multiplier Token",
    price: 1500,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Dobra recompensa do !daily e !trabalho próxima vez.",
  },
  // Social
  teamContribBooster: {
    key: "teamContribBooster",
    aliases: ["boostertime"],
    name: "Team Contribution Booster",
    price: 1600,
    sellRate: 0.75,
    stackable: true,
    rarity: 3,
    description: "+50% contribuição para pool de equipe por 7 dias.",
  },
  coopLuckCharm: {
    key: "coopLuckCharm",
    aliases: ["charmcoop"],
    name: "Co-op Luck Charm",
    price: 1100,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "+30% chance de ganhar em co-op games.",
  },

  // ===== DISCOUNT COUPONS (buyable and earnable) =====
  coupon5pct: {
    key: "coupon5pct",
    aliases: ["cupom5"],
    name: "Discount Coupon (5%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 1,
    buyable: false,
    description: "5% desconto em uma compra de itens. Use: !usarcupom 5",
  },
  coupon10pct: {
    key: "coupon10pct",
    aliases: ["cupom10"],
    name: "Discount Coupon (10%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 1,
    buyable: false,
    description: "10% desconto em uma compra de itens. Use: !usarcupom 10",
  },
  coupon25pct: {
    key: "coupon25pct",
    aliases: ["cupom25"],
    name: "Discount Coupon (25%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 2,
    buyable: false,
    description: "25% desconto em uma compra de itens. Use: !usarcupom 25",
  },
  coupon40pct: {
    key: "coupon40pct",
    aliases: ["cupom40"],
    name: "Discount Coupon (40%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 3,
    buyable: false,
    description: "40% desconto máximo em uma compra de itens. Use: !usarcupom 40",
  },

  // ===== KRONOS CROWNS (Special) =====
  kronosQuebrada: {
    key: "kronosQuebrada",
    aliases: ["coroakronosquebrada"],
    name: "Coroa Kronos (Quebrada)",
    price: 18000,
    sellRate: 0.8,
    stackable: true,
    rarity: 5,
    durationMs: 10 * DAY_MS,
    description: "+30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia.",
  },
  kronosVerdadeira: {
    key: "kronosVerdadeira",
    aliases: ["coroakronosverdadeira"],
    name: "Coroa Kronos Verdadeira",
    price: 70000,
    sellRate: 0.8,
    stackable: false,
    rarity: 5,
    permanent: true,
    description: "+30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia. PERMANENTE!",
  },

  // ===== LOOTBOX & REGULAR ITEMS =====
  lootbox: {
    key: "lootbox",
    aliases: ["caixa", "lootcaixa"],
    name: "Lootbox",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "Use !lootbox <quantidade> para abrir (máx. 10 por comando). Cada lootbox contém efeitos aleatórios incríveis!",
  },

  // ===== SECRET ITEMS (non-tradable, non-shop) =====
  milestoneRelic: {
    key: "milestoneRelic",
    aliases: ["relicmilestone"],
    name: "Milestone Relic",
    price: 0,
    sellRate: 500,
    stackable: true,
    rarity: 4,
    buyable: false,
    tradable: false,
    description: "Item raro obtido ao atingir milestones de nível. Símbolo de dedicação.",
  },
  teamLegacyBadge: {
    key: "teamLegacyBadge",
    aliases: ["badgeheranca"],
    name: "Team Legacy Badge",
    price: 0,
    sellRate: 600,
    stackable: true,
    rarity: 4,
    buyable: false,
    tradable: false,
    description: "Conquistado por membros de equipe bem-sucedidas. Não pode ser trocado.",
  },
  jackpotArtifact: {
    key: "jackpotArtifact",
    aliases: ["artefatojackpot"],
    name: "Jackpot Artifact",
    price: 0,
    sellRate: 1200,
    stackable: true,
    rarity: 5,
    buyable: false,
    tradable: false,
    description: "Artefato legendário raro, obtido ao ganhar jackpots. Símbolo de sorte.",
  },
  eventTrophy: {
    key: "eventTrophy",
    aliases: ["trofeuevento"],
    name: "Event Trophy",
    price: 0,
    sellRate: 400,
    stackable: true,
    rarity: 3,
    buyable: false,
    tradable: false,
    description: "Troféu de evento exclusivo. Marcador de participação histórica.",
  },
  adminCommemorative: {
    key: "adminCommemorative",
    aliases: ["lembrancinhaadmin"],
    name: "Admin Commemorative",
    price: 0,
    sellRate: 2000,
    stackable: false,
    rarity: 5,
    buyable: false,
    tradable: false,
    description: "Item exclusivo concedido por administradores. Um privilégio especial.",
  },

  // ===== COLLECTIBLE SETS =====
  collectibleSetA1: {
    key: "collectibleSetA1",
    aliases: ["colecionavel-a-1"],
    name: "Collectible Set A (Piece 1)",
    price: 2000,
    sellRate: 1.5,
    stackable: false,
    rarity: 3,
    description: "Primeira peça da coleção A. Completa o set para bonus.",
  },
  collectibleSetA2: {
    key: "collectibleSetA2",
    aliases: ["colecionavel-a-2"],
    name: "Collectible Set A (Piece 2)",
    price: 2200,
    sellRate: 1.5,
    stackable: false,
    rarity: 3,
    description: "Segunda peça da coleção A. Completa o set para bonus.",
  },
  collectibleSetA3: {
    key: "collectibleSetA3",
    aliases: ["colecionavel-a-3"],
    name: "Collectible Set A (Piece 3)",
    price: 2400,
    sellRate: 1.5,
    stackable: false,
    rarity: 3,
    description: "Terceira peça da coleção A. Completa o set para bonus +50% XP",
  },
  collectibleSetB1: {
    key: "collectibleSetB1",
    aliases: ["colecionavel-b-1"],
    name: "Collectible Set B (Piece 1)",
    price: 3000,
    sellRate: 2.0,
    stackable: false,
    rarity: 4,
    description: "Primeira peça da coleção B rara. Completa o set para bonus.",
  },
  collectibleSetB2: {
    key: "collectibleSetB2",
    aliases: ["colecionavel-b-2"],
    name: "Collectible Set B (Piece 2)",
    price: 3200,
    sellRate: 2.0,
    stackable: false,
    rarity: 4,
    description: "Segunda peça da coleção B rara. Completa o set para bonus.",
  },
  collectibleSetB3: {
    key: "collectibleSetB3",
    aliases: ["colecionavel-b-3"],
    name: "Collectible Set B (Piece 3)",
    price: 3500,
    sellRate: 2.0,
    stackable: false,
    rarity: 4,
    description: "Terceira peça da coleção B rara. Completa o set para +100% moedas ganhadas",
  },
}

const SHIELD_PRICE = ITEM_DEFINITIONS.escudo.price

// Punishment pass pricing by type (following masterplan brackets)
const PUNISHMENT_PASS_PRICING = {
  // Light punishments (1-2): 50-100 coins
  1: { lightPrice: 50, moderatePrice: 75, heavyPrice: 100 },
  2: { lightPrice: 60, moderatePrice: 85, heavyPrice: 110 },
  // Moderate punishments (3-5): 100-200 coins
  3: { lightPrice: 100, moderatePrice: 150, heavyPrice: 200 },
  4: { lightPrice: 110, moderatePrice: 160, heavyPrice: 210 },
  5: { lightPrice: 120, moderatePrice: 170, heavyPrice: 220 },
  // Heavy punishments (6-8): 200-500 coins
  6: { lightPrice: 200, moderatePrice: 300, heavyPrice: 450 },
  7: { lightPrice: 220, moderatePrice: 330, heavyPrice: 480 },
  8: { lightPrice: 240, moderatePrice: 360, heavyPrice: 500 },
  // Severe punishments (9-13): 500+ coins
  9: { lightPrice: 500, moderatePrice: 750, heavyPrice: 1000 },
  10: { lightPrice: 550, moderatePrice: 800, heavyPrice: 1100 },
  11: { lightPrice: 600, moderatePrice: 900, heavyPrice: 1200 },
  12: { lightPrice: 700, moderatePrice: 1000, heavyPrice: 1400 },
  13: { lightPrice: 800, moderatePrice: 1200, heavyPrice: 1600 },
}

const DEFAULT_USER_STATS = {
  casinoPlays: 0,
  works: 0,
  steals: 0,
  stealAttempts: 0,
  stealFailedCount: 0,
  gameGuessExact: 0,
  gameGuessClosest: 0,
  gameGuessTie: 0,
  gameGuessLoss: 0,
  gameBatataWin: 0,
  gameBatataLoss: 0,
  gameCoinWin: 0,
  gameCoinLoss: 0,
  gameDobroWin: 0,
  gameDobroLoss: 0,
  gameDadosWin: 0,
  gameDadosLoss: 0,
  gameEmbaralhadoWin: 0,
  gameEmbaralhadoLoss: 0,
  gameMemoriaWin: 0,
  gameMemoriaLoss: 0,
  gameReacaoWin: 0,
  gameReacaoLoss: 0,
  gameRrTrigger: 0,
  gameRrBetWin: 0,
  gameRrShotLoss: 0,
  gameRrWin: 0,
  gameComandoWin: 0,
  gameComandoLoss: 0,
  lobbiesCreated: 0,
  lobbiesJoined: 0,
  lobbiesStarted: 0,
  moneyGameWon: 0,
  moneyGameLost: 0,
  moneyCasinoWon: 0,
  moneyCasinoLost: 0,
  dailyClaimCount: 0,
  lootboxesOpened: 0,
  lootboxPositiveRolls: 0,
  lootboxNegativeRolls: 0,
  punishmentsReceivedTotal: 0,
  punishmentsReceivedAdmin: 0,
  punishmentsReceivedGame: 0,
  coinsLifetimeEarned: 0,
  stealVictimCount: 0,
  stealVictimCoinsLost: 0,
  stealSuccessCount: 0,
  stealSuccessCoins: 0,
  itemsBought: 0,
  shieldsUsed: 0,
  questsCompleted: 0,
}

const DEFAULT_PROGRESSION = {
  level: 1,
  xp: 0,
  seasonPoints: 0,
  lastQuestDayKey: null,
  dailyQuests: [],
  teamId: null,
  milestones: {},
  lastTradeByBracket: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  },
  season: {
    startDate: 0,
    endDate: 0,
    coinsAtReset: 0,
    itemsAtReset: {},
    xpAtReset: 0,
  },
  permanentCrown: false,
}

function buildDefaultProgression() {
  return {
    ...DEFAULT_PROGRESSION,
    milestones: {},
    lastTradeByBracket: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
    season: {
      startDate: 0,
      endDate: 0,
      coinsAtReset: 0,
      itemsAtReset: {},
      xpAtReset: 0,
    },
    dailyQuests: [],
  }
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let economyCache = {
  users: {}, // [userJid]: { coins, items, buffs, cooldowns, stats, createdAt, updatedAt }
  seasonState: buildDefaultSeasonState(),
}

function normalizeUserId(userId = "") {
  return String(userId || "").trim().toLowerCase()
}

function capPositiveInt(value, cap, fallback = 0) {
  const parsed = Math.floor(Number(value) || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, Math.max(1, Math.floor(Number(cap) || 1)))
}

function getOperationLimits() {
  return {
    maxCoinsBalance: MAX_COINS_BALANCE,
    maxCoinOperation: MAX_COIN_OPERATION,
    maxItemStack: MAX_ITEM_STACK,
    maxItemOperation: MAX_ITEM_OPERATION,
    maxLootboxOpenPerCall: MAX_LOOTBOX_OPEN_PER_CALL,
    maxForgeQuantity: MAX_FORGE_QUANTITY,
  }
}

function getPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0
  const clamped = Math.max(0, Math.min(1, Number(percentile) || 0))
  const index = Math.floor((sortedValues.length - 1) * clamped)
  return Math.floor(Number(sortedValues[index]) || 0)
}

function buildEconomyHealthSnapshot() {
  const users = Object.values(economyCache.users || {})
  const totalUsers = users.length
  const balances = users
    .map((user) => Math.max(0, Math.floor(Number(user?.coins) || 0)))
    .sort((a, b) => a - b)

  const totalCoins = balances.reduce((sum, value) => sum + value, 0)
  const fundedUsers = balances.filter((value) => value > 0).length
  const zeroBalanceUsers = totalUsers - fundedUsers
  const meanCoins = totalUsers > 0 ? Math.floor(totalCoins / totalUsers) : 0
  const medianCoins = getPercentile(balances, 0.5)
  const p75Coins = getPercentile(balances, 0.75)
  const p90Coins = getPercentile(balances, 0.9)
  const p99Coins = getPercentile(balances, 0.99)
  const maxCoins = balances.length > 0 ? balances[balances.length - 1] : 0

  const kronosActiveUsers = users.filter((user) => {
    const hasVerdadeira = Boolean(user?.buffs?.kronosVerdadeiraActive)
    const kronosExpiresAt = Number(user?.buffs?.kronosExpiresAt) || 0
    return hasVerdadeira || kronosExpiresAt > Date.now()
  }).length

  const topBalance = maxCoins
  const topSharePct = totalCoins > 0
    ? Number(((topBalance / totalCoins) * 100).toFixed(2))
    : 0

  return {
    totalUsers,
    fundedUsers,
    zeroBalanceUsers,
    totalCoins,
    meanCoins,
    medianCoins,
    p75Coins,
    p90Coins,
    p99Coins,
    maxCoins,
    topSharePct,
    kronosActiveUsers,
  }
}

function recordDailyEconomyHealthSnapshot(reason = "runtime") {
  if (typeof telemetry.recordDailySnapshot !== "function") return
  const dayKey = getDayKey()
  const snapshot = buildEconomyHealthSnapshot()
  telemetry.recordDailySnapshot("economy", dayKey, {
    reason,
    ...snapshot,
  })
}

function loadEconomy() {
  try {
    if (!fs.existsSync(ECONOMY_FILE)) return
    const now = Date.now()
    const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
    economyCache = {
      users: {},
      seasonState: buildDefaultSeasonState(now),
      ...data,
    }
    if (!economyCache.users || typeof economyCache.users !== "object") {
      economyCache.users = {}
    }
    if (!economyCache.seasonState || typeof economyCache.seasonState !== "object") {
      economyCache.seasonState = buildDefaultSeasonState(now)
    }
    economyCache.seasonState.currentSeason = Number.isFinite(economyCache.seasonState.currentSeason) && economyCache.seasonState.currentSeason > 0
      ? Math.floor(economyCache.seasonState.currentSeason)
      : 1
    economyCache.seasonState.startDate = Number.isFinite(economyCache.seasonState.startDate) && economyCache.seasonState.startDate > 0
      ? Math.floor(economyCache.seasonState.startDate)
      : now
    economyCache.seasonState.endDate = Number.isFinite(economyCache.seasonState.endDate) && economyCache.seasonState.endDate > 0
      ? Math.floor(economyCache.seasonState.endDate)
      : (economyCache.seasonState.startDate + SEASON_DURATION_MS)
    economyCache.seasonState.resetPolicy = economyCache.seasonState.resetPolicy === "hard" ? "hard" : "soft"
    recordDailyEconomyHealthSnapshot("load")
  } catch (err) {
    console.error("Erro ao carregar economia:", err)
    economyCache = { users: {}, seasonState: buildDefaultSeasonState() }
  }
}

function getDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getWeekKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  // ISO 8601 week definition: week starts on Monday, week 1 is the first week with 4+ days in Jan
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - jan4.getDay() + (jan4.getDay() === 0 ? -6 : 1))
  const diff = d - monday
  const weekNumber = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  const ww = String(weekNumber).padStart(2, "0")
  return `${yyyy}-W${ww}`
}

function stableHash(input = "") {
  let hash = 0
  const text = String(input || "")
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function buildDefaultSeasonState(now = Date.now()) {
  const startDate = Math.max(0, Math.floor(Number(now) || Date.now()))
  return {
    currentSeason: 1,
    startDate,
    endDate: startDate + SEASON_DURATION_MS,
    resetPolicy: "soft",
  }
}

function getBaseXpRequiredForLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const current = Number(levelRequirements[safeLevel])
  if (Number.isFinite(current) && current > 0) {
    return current
  }
  return Number(levelRequirements[levelRequirements.length - 1]) || BASE_XP_TO_LEVEL
}

function getXpGrowthRateForLevel(level = 1, maxLevel = MAX_LEVEL) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const safeMax = Math.max(2, Math.floor(Number(maxLevel) || MAX_LEVEL))
  const progress = Math.max(0, Math.min(1, (safeLevel - 1) / (safeMax - 1)))
  const eased = Math.pow(progress, 1.15)
  const baseGrowth = XP_GROWTH_MIN + ((XP_BASE_GROWTH_CEILING - XP_GROWTH_MIN) * eased)

  let milestoneBonus = 0
  if (safeLevel % 10 === 0) {
    milestoneBonus = 0.07
  } else if (safeLevel % LEVEL_MILESTONE_INTERVAL === 0) {
    milestoneBonus = 0.04
  }

  return Math.max(XP_GROWTH_MIN, Math.min(XP_GROWTH_MAX, baseGrowth + milestoneBonus))
}

function buildLevelThresholds(maxLevel = MAX_LEVEL) {
  const safeMax = Math.max(1, Math.floor(Number(maxLevel) || MAX_LEVEL))
  const thresholds = [0]
  const requirements = [0]
  let cumulative = 0
  let previousRequired = BASE_XP_TO_LEVEL
  for (let level = 1; level <= safeMax; level++) {
    let required = previousRequired
    if (level === 1) {
      required = BASE_XP_TO_LEVEL
    } else {
      const growth = getXpGrowthRateForLevel(level, safeMax)
      const minNext = Math.ceil(previousRequired * (1 + XP_GROWTH_MIN))
      const maxNext = Math.floor(previousRequired * (1 + XP_GROWTH_MAX))
      const candidate = Math.round(previousRequired * (1 + growth))
      required = Math.max(minNext, Math.min(maxNext, candidate))
    }

    requirements[level] = Math.max(BASE_XP_TO_LEVEL, required)
    previousRequired = requirements[level]
    cumulative += requirements[level]
    thresholds[level] = cumulative
  }
  return {
    thresholds,
    requirements,
  }
}

const xpCurve = buildLevelThresholds(MAX_LEVEL)
const levelThresholds = xpCurve.thresholds
const levelRequirements = xpCurve.requirements

function getXpRequiredForLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  if (safeLevel > MAX_LEVEL) return getBaseXpRequiredForLevel(MAX_LEVEL)
  const current = Number(levelThresholds[safeLevel]) || 0
  const previous = Number(levelThresholds[safeLevel - 1]) || 0
  const delta = current - previous
  return delta > 0 ? delta : getBaseXpRequiredForLevel(safeLevel)
}

function getLevelMilestoneReward(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  if (safeLevel % LEVEL_MILESTONE_INTERVAL !== 0) return null

  const reward = {
    level: safeLevel,
    coins: 250 + (safeLevel * 35),
    items: [],
  }

  if (safeLevel % 10 === 0) {
    reward.items.push({ key: "lootbox", quantity: 1 })
  }
  if (safeLevel % 20 === 0) {
    reward.items.push({ key: "escudo", quantity: 1 })
  }

  return reward
}

let saveTimeout = null
function saveEconomy(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify(economyCache, null, 2), "utf8")
      recordDailyEconomyHealthSnapshot("save")
    } catch (err) {
      console.error("Erro ao salvar economia:", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 1500)
}

function migrateUserShape(user) {
  if (!user || typeof user !== "object") return
  if (!user.items || typeof user.items !== "object") user.items = {}
  
  // Migrar dados antigos de "kronos" para "kronosQuebrada"
  if (user.items.kronos && user.items.kronos > 0) {
    user.items.kronosQuebrada = (Number(user.items.kronosQuebrada) || 0) + Number(user.items.kronos)
    delete user.items.kronos
  }

  // Migrar item antigo de silenciar/mute para passe de punição tipo 5 (1x)
  if (user.items.mute && user.items.mute > 0) {
    const passKey = buildPunishmentPassKey(5, 1)
    user.items[passKey] = (Number(user.items[passKey]) || 0) + Number(user.items.mute)
    delete user.items.mute
  }
  
  if (!user.buffs || typeof user.buffs !== "object") {
    user.buffs = {
      kronosExpiresAt: 0,
      kronosTempShieldDayKey: null,
      kronosTempShields: 0,
      kronosVerdadeiraActive: false,
    }
  }
  if (!Number.isFinite(user.buffs.kronosExpiresAt)) user.buffs.kronosExpiresAt = 0
  if (typeof user.buffs.kronosTempShieldDayKey !== "string" && user.buffs.kronosTempShieldDayKey !== null) {
    user.buffs.kronosTempShieldDayKey = null
  }
  if (!Number.isFinite(user.buffs.kronosTempShields)) user.buffs.kronosTempShields = 0
  if (typeof user.buffs.kronosVerdadeiraActive !== "boolean") user.buffs.kronosVerdadeiraActive = false
  if (!user.cooldowns || typeof user.cooldowns !== "object") {
    user.cooldowns = {
      dailyClaimKey: null,
      workAt: 0,
      stealAt: 0,
      stealDailyKey: null,
      stealTargets: {},
      stealAttemptsToday: 0,
      carePackageLastClaimedAt: 0,
    }
  }
  if (!user.cooldowns.stealTargets || typeof user.cooldowns.stealTargets !== "object") {
    user.cooldowns.stealTargets = {}
  }
  if (!Number.isFinite(user.cooldowns.workAt) || user.cooldowns.workAt < 0) {
    user.cooldowns.workAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAt) || user.cooldowns.stealAt < 0) {
    user.cooldowns.stealAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAttemptsToday)) {
    user.cooldowns.stealAttemptsToday = 0
  }
  if (typeof user.cooldowns.stealDailyKey !== "string" && user.cooldowns.stealDailyKey !== null) {
    user.cooldowns.stealDailyKey = null
  }
  if (!Number.isFinite(user.cooldowns.carePackageLastClaimedAt)) {
    user.cooldowns.carePackageLastClaimedAt = 0
  }
  if (!user.stats || typeof user.stats !== "object") {
    user.stats = { ...DEFAULT_USER_STATS }
  }
  Object.keys(DEFAULT_USER_STATS).forEach((key) => {
    if (!Number.isFinite(user.stats[key])) {
      user.stats[key] = DEFAULT_USER_STATS[key]
    }
  })
  if (!Array.isArray(user.transactions)) user.transactions = []
  if (!user.preferences || typeof user.preferences !== "object") {
    user.preferences = {
      mentionOptIn: false,
      publicLabel: "",
    }
  }
  if (typeof user.preferences.mentionOptIn !== "boolean") {
    user.preferences.mentionOptIn = false
  }
  if (typeof user.preferences.publicLabel !== "string") {
    user.preferences.publicLabel = ""
  }
  if (!user.progression || typeof user.progression !== "object") {
    user.progression = buildDefaultProgression()
  }
  if (!Number.isFinite(user.progression.level) || user.progression.level <= 0) {
    user.progression.level = DEFAULT_PROGRESSION.level
  }
  if (!Number.isFinite(user.progression.xp) || user.progression.xp < 0) {
    user.progression.xp = DEFAULT_PROGRESSION.xp
  }
  if (!Number.isFinite(user.progression.seasonPoints) || user.progression.seasonPoints < 0) {
    user.progression.seasonPoints = DEFAULT_PROGRESSION.seasonPoints
  }
  if (typeof user.progression.lastQuestDayKey !== "string" && user.progression.lastQuestDayKey !== null) {
    user.progression.lastQuestDayKey = null
  }
  if (!Array.isArray(user.progression.dailyQuests)) {
    user.progression.dailyQuests = []
  }
  if (typeof user.progression.teamId !== "string" && user.progression.teamId !== null) {
    user.progression.teamId = null
  }
  if (!user.progression.milestones || typeof user.progression.milestones !== "object") {
    user.progression.milestones = {}
  }
  if (!user.progression.lastTradeByBracket || typeof user.progression.lastTradeByBracket !== "object") {
    user.progression.lastTradeByBracket = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  }
  for (const bracket of [1, 2, 3, 4, 5]) {
    const current = Number(user.progression.lastTradeByBracket[bracket])
    user.progression.lastTradeByBracket[bracket] = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0
  }
  if (!user.progression.season || typeof user.progression.season !== "object") {
    user.progression.season = {
      startDate: 0,
      endDate: 0,
      coinsAtReset: 0,
      itemsAtReset: {},
      xpAtReset: 0,
    }
  }
  if (!Number.isFinite(user.progression.season.startDate) || user.progression.season.startDate < 0) {
    user.progression.season.startDate = 0
  }
  if (!Number.isFinite(user.progression.season.endDate) || user.progression.season.endDate < 0) {
    user.progression.season.endDate = 0
  }
  if (!Number.isFinite(user.progression.season.coinsAtReset) || user.progression.season.coinsAtReset < 0) {
    user.progression.season.coinsAtReset = 0
  }
  if (!user.progression.season.itemsAtReset || typeof user.progression.season.itemsAtReset !== "object") {
    user.progression.season.itemsAtReset = {}
  }
  if (!Number.isFinite(user.progression.season.xpAtReset) || user.progression.season.xpAtReset < 0) {
    user.progression.season.xpAtReset = 0
  }
  if (typeof user.progression.permanentCrown !== "boolean") {
    user.progression.permanentCrown = false
  }
  if (user.items.kronosVerdadeira && user.items.kronosVerdadeira > 0) {
    user.progression.permanentCrown = true
  }

  // retroompatibilidade com sistema antigo (caso eu volte algum commit).
  if (Number.isFinite(user.shields) && user.shields > 0) {
    user.items.escudo = (Number(user.items.escudo) || 0) + Math.floor(user.shields)
    delete user.shields
  }
}

function ensureUser(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null

  if (!economyCache.users[normalized]) {
    const now = Date.now()
    economyCache.users[normalized] = {
      coins: DEFAULT_COINS,
      items: {},
      buffs: {
        kronosExpiresAt: 0,
        kronosTempShieldDayKey: null,
        kronosTempShields: 0,
        kronosVerdadeiraActive: false,
      },
      cooldowns: {
        dailyClaimKey: null,
        workAt: 0,
        stealAt: 0,
        stealDailyKey: null,
        stealTargets: {},
        stealAttemptsToday: 0,
        carePackageLastClaimedAt: 0,
      },
      stats: {
        ...DEFAULT_USER_STATS,
      },
      preferences: {
        mentionOptIn: false,
        publicLabel: "",
      },
      progression: {
        ...buildDefaultProgression(),
      },
      createdAt: now,
      updatedAt: now,
    }
    saveEconomy()
  }

  migrateUserShape(economyCache.users[normalized])
  return economyCache.users[normalized]
}

function deleteUserProfile(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return false
  if (!economyCache.users[normalized]) return false
  delete economyCache.users[normalized]
  saveEconomy()
  return true
}

function touchUser(user) {
  user.updatedAt = Date.now()
}

function pushTransaction(userId, entry = {}) {
  const user = ensureUser(userId)
  if (!user) return
  const next = {
    at: Date.now(),
    type: String(entry.type || "system"),
    deltaCoins: Math.floor(Number(entry.deltaCoins) || 0),
    balanceAfter: getCoins(userId),
    details: entry.details || "",
    meta: entry.meta || null,
  }
  user.transactions.push(next)
  if (user.transactions.length > 200) {
    user.transactions = user.transactions.slice(-200)
  }
  touchUser(user)
  saveEconomy()
}

function getCoins(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Number.isFinite(user.coins) ? user.coins : DEFAULT_COINS
}

function setCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  if (!user) return { ok: false, balance: 0, delta: 0 }

  const previous = getCoins(userId)
  const next = Math.min(MAX_COINS_BALANCE, Math.max(0, Math.floor(Number(amount) || 0)))
  user.coins = next
  touchUser(user)
  saveEconomy()

  const delta = next - previous
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: delta,
    })
  }

  return { ok: true, previous, balance: next, delta }
}

function creditCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = capPositiveInt(amount, MAX_COIN_OPERATION, 0)
  if (!user || parsedAmount <= 0) return 0

  const current = getCoins(userId)
  const room = Math.max(0, MAX_COINS_BALANCE - current)
  const applied = Math.min(parsedAmount, room)
  if (applied <= 0) return 0

  user.coins = Math.max(0, current + applied)
  user.stats.coinsLifetimeEarned = Math.max(0, Math.floor(Number(user.stats.coinsLifetimeEarned) || 0) + applied)
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: applied,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.minted", applied, { source: txType })
  telemetry.appendEvent("economy.credit", {
    userId: normalizeUserId(userId),
    amount: applied,
    source: txType,
  })
  return applied
}

function debitCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return false

  if (getCoins(userId) < parsedAmount) return false

  user.coins = getCoins(userId) - parsedAmount
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -parsedAmount,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.burned", parsedAmount, { source: txType })
  telemetry.appendEvent("economy.debit", {
    userId: normalizeUserId(userId),
    amount: parsedAmount,
    source: txType,
  })
  return true
}

function debitCoinsFlexible(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return 0
  const available = getCoins(userId)
  const taken = Math.min(available, parsedAmount)
  user.coins = available - taken
  touchUser(user)
  saveEconomy()
  if (transaction && taken > 0) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -taken,
    })
  }
  if (taken > 0) {
    const txType = transaction?.type || "unspecified"
    telemetry.incrementCounter("economy.burned", taken, { source: txType })
    telemetry.appendEvent("economy.debitFlexible", {
      userId: normalizeUserId(userId),
      requested: parsedAmount,
      taken,
      source: txType,
    })
  }
  return taken
}

function normalizeItemKey(itemKey = "") {
  const normalized = String(itemKey || "").trim().toLowerCase()
  if (!normalized) return null

  if (["mute", "silenciar", "silencio", "silêncio"].includes(normalized)) {
    return buildPunishmentPassKey(5, 1)
  }

  const passAlias = normalized.match(/^(?:passe|pass)(?:punicao)?(1[0-3]|[1-9])(?:x(\d+))?$/)
  if (passAlias) {
    const type = Number.parseInt(passAlias[1], 10)
    const severity = normalizePassSeverity(passAlias[2], 1)
    return buildPunishmentPassKey(type, severity)
  }

  const passKey = parsePunishmentPassKey(normalized)
  if (passKey) {
    return passKey.key
  }

  const entries = Object.values(ITEM_DEFINITIONS)
  const found = entries.find((item) => {
    const canonical = String(item.key || "").toLowerCase()
    const aliases = (item.aliases || []).map((alias) => String(alias || "").toLowerCase())
    return canonical === normalized || aliases.includes(normalized)
  })
  return found?.key || null
}

function getItemDefinition(itemKey = "") {
  const key = normalizeItemKey(itemKey)
  if (!key) return null
  const passParsed = parsePunishmentPassKey(key)
  if (passParsed) {
    return getPunishmentPassDefinition(passParsed.type, passParsed.severity)
  }
  return ITEM_DEFINITIONS[key] || null
}

function getItemQuantity(userId, itemKey) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  return Math.max(0, Math.floor(Number(user.items[key]) || 0))
}

function setItemQuantity(userId, itemKey, quantity) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  const next = Math.max(0, Math.floor(Number(quantity) || 0))
  if (next <= 0) {
    delete user.items[key]
  } else {
    user.items[key] = next
  }
  touchUser(user)
  saveEconomy()
  return next
}

function grantKronosBenefits(userId, itemKey = "kronosQuebrada", quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const def = getItemDefinition(itemKey)
  if (!user || !def) return
  
  const now = Date.now()
  
  if (itemKey === "kronosVerdadeira") {
    // Coroa Kronos Verdadeira é permanente
    user.buffs.kronosVerdadeiraActive = true
    touchUser(user)
    saveEconomy()
  } else {
    // Coroa Kronos Quebrada tem duração temporária
    const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
    user.buffs.kronosExpiresAt = currentEnd + (def.durationMs * qty)
    touchUser(user)
    saveEconomy()
  }
}

function removeKronosDuration(userId, itemKey = "kronosQuebrada", quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const def = getItemDefinition(itemKey)
  if (!user || !def) return
  
  if (itemKey === "kronosVerdadeira") {
    // Não pode remover Coroa Kronos Verdadeira (é permanente)
    return
  }
  
  const now = Date.now()
  const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
  user.buffs.kronosExpiresAt = Math.max(now, currentEnd - (def.durationMs * qty))
  touchUser(user)
  saveEconomy()
}

function addItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = setItemQuantity(userId, key, Math.min(MAX_ITEM_STACK, current + qty))
  if (key === "kronosQuebrada") {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, "kronosQuebrada", applied)
  } else if (key === "kronosVerdadeira") {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, "kronosVerdadeira", applied)
  }
  return next
}

function removeItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = Math.max(0, current - qty)
  setItemQuantity(userId, key, next)
  if (key === "kronosQuebrada") {
    removeKronosDuration(userId, "kronosQuebrada", Math.min(current, qty))
  } else if (key === "kronosVerdadeira") {
    // Não pode remover Coroa Kronos Verdadeira
  }
  return next
}

function getShields(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return 0
  const permanentShields = getItemQuantity(userId, "escudo")
  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  return permanentShields + temporaryShields
}

function addShields(userId, quantity = 1) {
  return addItem(userId, "escudo", quantity)
}

function consumeShield(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return false

  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  if (temporaryShields > 0) {
    user.buffs.kronosTempShields = temporaryShields - 1
    touchUser(user)
    saveEconomy()
    incrementStat(userId, "shieldsUsed", 1)
    return true
  }

  if (getItemQuantity(userId, "escudo") <= 0) return false
  removeItem(userId, "escudo", 1)
  incrementStat(userId, "shieldsUsed", 1)
  return true
}

function buyShield(userId) {
  return buyItem(userId, "escudo", 1, userId).ok
}

function hasActiveKronos(userId) {
  const user = ensureUser(userId)
  if (!user) return false
  
  // Verifica Coroa Kronos Verdadeira (permanente)
  if (user.buffs.kronosVerdadeiraActive) {
    return true
  }
  
  // Verifica Coroa Kronos Quebrada (temporária)
  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  return expiresAt > Date.now()
}

function refreshKronosTemporaryShields(userId) {
  const user = ensureUser(userId)
  if (!user) return

  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  const kronosQuebradaActive = expiresAt > Date.now()
  const kronosVerdadeiraActive = Boolean(user.buffs.kronosVerdadeiraActive)
  const kronosActive = kronosQuebradaActive || kronosVerdadeiraActive
  const dayKey = getDayKey()

  if (!kronosActive) {
    if ((Number(user.buffs.kronosTempShields) || 0) > 0 || user.buffs.kronosTempShieldDayKey !== null) {
      user.buffs.kronosTempShields = 0
      user.buffs.kronosTempShieldDayKey = null
      touchUser(user)
      saveEconomy()
    }
    return
  }

  if (user.buffs.kronosTempShieldDayKey !== dayKey) {
    user.buffs.kronosTempShieldDayKey = dayKey
    user.buffs.kronosTempShields = 2
    touchUser(user)
    saveEconomy()
  }
}

function applyKronosGainMultiplier(userId, amount, type = "generic") {
  const base = Math.max(0, Math.floor(Number(amount) || 0))
  if (base <= 0) return 0
  if (!hasActiveKronos(userId)) return base
  if (type === "daily") return Math.floor(base * 1.1)
  if (type === "casino" || type === "steal" || type === "work") return Math.floor(base * 1.3)
  return base
}

function getStealSuccessChance(victimId, thiefId = "") {
  const baseChance = 0.3
  const protection = hasActiveKronos(victimId) ? 0.1 : 0
  const thiefBuff = hasActiveKronos(thiefId) ? 0.1 : 0
  return Math.max(0.05, Math.min(0.95, baseChance - protection + thiefBuff))
}

function canAttemptSteal(thiefId, victimId) {
  const user = ensureUser(thiefId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const dayKey = getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
    touchUser(user)
    saveEconomy()
  }

  const victim = normalizeUserId(victimId)
  if (user.cooldowns.stealTargets[victim]) {
    return { ok: false, reason: "same-target-today" }
  }

  if ((user.cooldowns.stealAttemptsToday || 0) >= 3) {
    return { ok: false, reason: "daily-limit-reached" }
  }

  return { ok: true }
}

function registerStealAttempt(thiefId, victimId) {
  const user = ensureUser(thiefId)
  if (!user) return
  const dayKey = getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
  }
  const victim = normalizeUserId(victimId)
  user.cooldowns.stealTargets[victim] = true
  user.cooldowns.stealAttemptsToday = (Math.floor(Number(user.cooldowns.stealAttemptsToday) || 0) + 1)
  touchUser(user)
  saveEconomy()
}

function buyItem(buyerId, itemKey, quantity = 1, recipientId = buyerId) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) {
    return { ok: false, reason: "invalid-item" }
  }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const recipientCurrent = getItemQuantity(recipientId, item.key)
  if (recipientCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: recipientCurrent,
    }
  }

  if (item.buyable === false) {
    return { ok: false, reason: "not-for-sale" }
  }

  let totalCost = item.price * qty
  let couponDiscount = 0
  let appliedCoupon = null

  // Check for active coupon in buyer's progression
  const user = storage.economyCache?.users?.[buyerId]
  if (user?.progression?.activeCoupon) {
    const coupon = user.progression.activeCoupon
    couponDiscount = Math.floor(totalCost * (coupon.percentage / 100))
    totalCost = totalCost - couponDiscount
    appliedCoupon = coupon.couponKey
    // Clear the active coupon after use
    delete user.progression.activeCoupon
  }

  if (!debitCoins(buyerId, totalCost, {
    type: "buy",
    details: `Compra de ${qty}x ${item.key}${appliedCoupon ? ` (cupom: -${couponDiscount} moedas)` : ""}`,
    meta: { 
      item: item.key, 
      quantity: qty, 
      recipientId: normalizeUserId(recipientId),
      couponDiscount,
      appliedCoupon,
    },
  })) {
    return { ok: false, reason: "insufficient-funds", totalCost }
  }

  addItem(recipientId, item.key, qty)
  incrementStat(buyerId, "itemsBought", qty)
  if (normalizeUserId(recipientId) !== normalizeUserId(buyerId)) {
    pushTransaction(recipientId, {
      type: "buy-received",
      deltaCoins: 0,
      details: `Recebeu ${qty}x ${item.key} via compra de ${normalizeUserId(buyerId)}`,
      meta: { buyer: normalizeUserId(buyerId), item: item.key, quantity: qty },
    })
  }
  telemetry.incrementCounter("economy.item.buy", qty, {
    item: item.key,
    hasCoupon: appliedCoupon ? 1 : 0,
  })
  telemetry.appendEvent("economy.item.buy", {
    buyerId: normalizeUserId(buyerId),
    recipientId: normalizeUserId(recipientId),
    item: item.key,
    quantity: qty,
    totalCost,
    couponDiscount,
    appliedCoupon,
  })
  return { ok: true, totalCost, itemKey: item.key, quantity: qty, couponDiscount, appliedCoupon }
}

function sellItem(userId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const available = getItemQuantity(userId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(userId, item.key, qty)
  const valuePerUnit = Math.floor(item.price * (Number(item.sellRate) || 0.8))
  const total = valuePerUnit * qty
  creditCoins(userId, total, {
    type: "sell",
    details: `Venda de ${qty}x ${item.key}`,
    meta: { item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.sell", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.sell", {
    userId: normalizeUserId(userId),
    item: item.key,
    quantity: qty,
    total,
  })
  return { ok: true, total, quantity: qty, itemKey: item.key }
}

function transferCoins(fromUserId, toUserId, amount) {
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (parsedAmount <= 0) return { ok: false, reason: "invalid-amount" }
  if (parsedAmount > MAX_COIN_OPERATION) {
    return { ok: false, reason: "amount-too-large", maxAmount: MAX_COIN_OPERATION }
  }

  const receiverCoins = getCoins(toUserId)
  const room = Math.max(0, MAX_COINS_BALANCE - receiverCoins)
  if (room <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  const effectiveAmount = Math.min(parsedAmount, room)
  if (effectiveAmount <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  if (!debitCoins(fromUserId, effectiveAmount, {
    type: "donate-out",
    details: `Doação para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId) },
  })) return { ok: false, reason: "insufficient-funds" }
  creditCoins(toUserId, effectiveAmount, {
    type: "donate-in",
    details: `Recebido de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId) },
  })
  telemetry.incrementCounter("economy.coins.transfer", effectiveAmount)
  telemetry.appendEvent("economy.coins.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    amount: effectiveAmount,
  })
  return { ok: true, amount: effectiveAmount }
}

function transferItem(fromUserId, toUserId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const receiverCurrent = getItemQuantity(toUserId, item.key)
  if (receiverCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: receiverCurrent,
    }
  }

  const available = getItemQuantity(fromUserId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(fromUserId, item.key, qty)
  addItem(toUserId, item.key, qty)
  pushTransaction(fromUserId, {
    type: "donate-item-out",
    deltaCoins: 0,
    details: `Doou ${qty}x ${item.key} para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId), item: item.key, quantity: qty },
  })
  pushTransaction(toUserId, {
    type: "donate-item-in",
    deltaCoins: 0,
    details: `Recebeu ${qty}x ${item.key} de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId), item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.transfer", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    item: item.key,
    quantity: qty,
  })
  return { ok: true, itemKey: item.key, quantity: qty }
}

function attemptSteal(thiefId, victimId, requestedAmount = 0, options = {}) {
  if (normalizeUserId(thiefId) === normalizeUserId(victimId)) {
    return { ok: false, reason: "same-user" }
  }

  const canSteal = canAttemptSteal(thiefId, victimId)
  if (!canSteal.ok) {
    return { ok: false, reason: canSteal.reason }
  }

  registerStealAttempt(thiefId, victimId)
  incrementStat(thiefId, "stealAttempts", 1)

  const victimCoins = getCoins(victimId)
  if (victimCoins <= 0) {
    return { ok: false, reason: "victim-empty" }
  }

  const baseChance = getStealSuccessChance(victimId, thiefId)
  const modifierRaw = Number(options?.successChanceDelta)
  const modifier = Number.isFinite(modifierRaw)
    ? Math.max(-0.2, Math.min(0.2, modifierRaw))
    : 0
  const chance = Math.max(0.01, Math.min(0.99, baseChance + modifier))
  const roll = Math.random()
  const success = roll <= chance

  if (!success) {
    const penalty = Math.max(20, Math.floor(Math.min(getCoins(thiefId), 50 + Math.random() * 100)))
    const lost = debitCoinsFlexible(thiefId, penalty, {
      type: "steal-failed",
      details: `Falhou ao roubar ${normalizeUserId(victimId)}`,
      meta: { victim: normalizeUserId(victimId) },
    })
    incrementStat(thiefId, "stealFailedCount", 1)
    return {
      ok: true,
      success: false,
      lost,
      baseSuccessChance: baseChance,
      successChanceDelta: modifier,
      successChance: chance,
      rolled: roll,
    }
  }

  const requested = Math.max(0, Math.floor(Number(requestedAmount) || 0))
  const randomBase = Math.floor(50 + Math.random() * 151)
  const baseAmount = requested > 0 ? requested : randomBase
  const stealBase = Math.min(victimCoins, baseAmount)

  if (stealBase <= 0) {
    return { ok: false, reason: "invalid-amount" }
  }

  const gained = applyKronosGainMultiplier(thiefId, stealBase, "steal")
  const removed = debitCoinsFlexible(victimId, stealBase, {
    type: "stolen-from",
    details: `Roubado por ${normalizeUserId(thiefId)}`,
    meta: { thief: normalizeUserId(thiefId) },
  })
  creditCoins(thiefId, gained, {
    type: "steal-success",
    details: `Roubo em ${normalizeUserId(victimId)}`,
    meta: { victim: normalizeUserId(victimId), base: stealBase },
  })

  if (removed > 0) {
    incrementStat(victimId, "stealVictimCount", 1)
    incrementStat(victimId, "stealVictimCoinsLost", removed)
  }
  if (gained > 0) {
    incrementStat(thiefId, "stealSuccessCount", 1)
    incrementStat(thiefId, "stealSuccessCoins", gained)
  }

  return {
    ok: true,
    success: true,
    baseSuccessChance: baseChance,
    successChanceDelta: modifier,
    successChance: chance,
    rolled: roll,
    stolenFromVictim: removed,
    gained,
  }
}

function claimDaily(userId, baseAmount = 100) {
  const user = ensureUser(userId)
  const base = Math.max(0, Math.floor(Number(baseAmount) || 0))
  if (!user || base <= 0) return { ok: false, reason: "invalid" }

  const dayKey = getDayKey()
  if (user.cooldowns.dailyClaimKey === dayKey) {
    return { ok: false, reason: "already-claimed", dayKey }
  }

  const finalAmount = applyKronosGainMultiplier(userId, base, "daily")
  user.cooldowns.dailyClaimKey = dayKey
  touchUser(user)
  saveEconomy()
  creditCoins(userId, finalAmount, {
    type: "daily",
    details: "Resgate diário",
    meta: { dayKey },
  })
  incrementStat(userId, "dailyClaimCount", 1)

  return {
    ok: true,
    amount: finalAmount,
    dayKey,
    kronosBonus: finalAmount > base,
  }
}

const _attemptSteal = attemptSteal
attemptSteal = function wrappedAttemptSteal(thiefId, victimId, requestedAmount = 0) {
  const startedAt = Date.now()
  const result = _attemptSteal(thiefId, victimId, requestedAmount)
  const status = result?.ok ? (result.success ? "success" : "failed") : (result?.reason || "rejected")
  telemetry.incrementCounter("economy.steal.attempt", 1, { status })
  telemetry.observeDuration("economy.steal.latency", Date.now() - startedAt, { status })
  telemetry.appendEvent("economy.steal", {
    thiefId: normalizeUserId(thiefId),
    victimId: normalizeUserId(victimId),
    status,
    gained: result?.gained || 0,
    lost: result?.lost || 0,
    reason: result?.reason || null,
  })
  return result
}

const _claimDaily = claimDaily
claimDaily = function wrappedClaimDaily(userId, baseAmount = 100) {
  const result = _claimDaily(userId, baseAmount)
  telemetry.incrementCounter("economy.daily.claim", 1, {
    status: result?.ok ? "ok" : (result?.reason || "rejected"),
  })
  if (result?.ok) {
    telemetry.appendEvent("economy.daily.claimed", {
      userId: normalizeUserId(userId),
      amount: result.amount,
      kronosBonus: Boolean(result.kronosBonus),
    })
  }
  return result
}

function claimCarePackage(userId) {
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  // TODO: Check for season start date (must be at least 3 days into the season)
  // This is blocked by the lack of a season management system.

  const coins = getCoins(userId)
  if (coins > 500) {
    return { ok: false, reason: "ineligible-coins", coins }
  }

  const SEVEN_DAYS_MS = 7 * DAY_MS
  const lastClaimedAt = Number(user.cooldowns.carePackageLastClaimedAt) || 0
  const remainingMs = (lastClaimedAt + SEVEN_DAYS_MS) - Date.now()
  if (remainingMs > 0) {
    return { ok: false, reason: "cooldown", remainingMs }
  }

  const coinsReward = 300
  const shieldsReward = 2

  creditCoins(userId, coinsReward, {
    type: "care-package",
    details: "Resgate de pacote de ajuda",
  })
  addShields(userId, shieldsReward)

  user.cooldowns.carePackageLastClaimedAt = Date.now()
  touchUser(user)
  saveEconomy()

  telemetry.incrementCounter("economy.carepackage.claim", 1)
  telemetry.appendEvent("economy.carepackage.claim", {
    userId: normalizeUserId(userId),
    coins: coinsReward,
    shields: shieldsReward,
  })

  return { ok: true, coins: coinsReward, shields: shieldsReward }
}

function getAllUsersSortedByCoins() {
  return Object.keys(economyCache.users)
    .map((userId) => ({ userId, coins: getCoins(userId) }))
    .sort((a, b) => (b.coins - a.coins) || a.userId.localeCompare(b.userId))
}

function getAllUserIds() {
  return Object.keys(economyCache.users)
}

function getAllUsersSortedByXp() {
  return Object.keys(economyCache.users)
    .map((userId) => {
      const profile = getXpProfile(userId)
      return {
        userId,
        level: Math.max(1, Math.floor(Number(profile?.level) || 1)),
        xp: Math.max(0, Math.floor(Number(profile?.xp) || 0)),
        xpToNextLevel: Math.max(1, Math.floor(Number(profile?.xpToNextLevel) || getXpRequiredForLevel(1))),
        seasonPoints: Math.max(0, Math.floor(Number(profile?.seasonPoints) || 0)),
      }
    })
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level
      if (b.xp !== a.xp) return b.xp - a.xp
      if (b.seasonPoints !== a.seasonPoints) return b.seasonPoints - a.seasonPoints
      return a.userId.localeCompare(b.userId)
    })
}

function getGlobalRanking(limit = 10) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins().slice(0, safeLimit)
}

function getUserGlobalPosition(userId) {
  const normalized = normalizeUserId(userId)
  const ranking = getAllUsersSortedByCoins()
  const idx = ranking.findIndex((entry) => entry.userId === normalized)
  return idx >= 0 ? idx + 1 : null
}

function getGroupRanking(memberIds = [], limit = 10) {
  const members = new Set((memberIds || []).map((id) => normalizeUserId(id)).filter(Boolean))
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins()
    .filter((entry) => members.has(entry.userId))
    .slice(0, safeLimit)
}

function getGlobalXpRanking(limit = 10) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByXp().slice(0, safeLimit)
}

function getGroupXpRanking(memberIds = [], limit = 10) {
  const members = new Set((memberIds || []).map((id) => normalizeUserId(id)).filter(Boolean))
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByXp()
    .filter((entry) => members.has(entry.userId))
    .slice(0, safeLimit)
}

function getUserGlobalXpPosition(userId) {
  const normalized = normalizeUserId(userId)
  const ranking = getAllUsersSortedByXp()
  const idx = ranking.findIndex((entry) => entry.userId === normalized)
  return idx >= 0 ? idx + 1 : null
}

function getItemCatalog() {
  return Object.values(ITEM_DEFINITIONS).map((item) => ({ ...item }))
}

function getShopIndexText() {
  const lines = ["Loja (indice)"]
  const catalog = getItemCatalog().filter((item) => item.buyable !== false)
  catalog.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.name} (${item.key}) - ${item.price} Epsteincoins`)
  })
  lines.push("")
  lines.push("Compre com: !comprar <item> [quantidade]")
  lines.push("Compre para outro: !comprarpara @usuario <item> [quantidade]")
  return lines.join("\n")
}

function getProfile(userId) {
  const user = ensureUser(userId)
  if (!user) {
    return {
      coins: DEFAULT_COINS,
      shields: 0,
      items: {},
      buffs: {
        kronosActive: false,
        kronosExpiresAt: 0,
      },
    }
  }

  return {
    coins: getCoins(userId),
    shields: getShields(userId),
    items: { ...user.items },
    buffs: {
      kronosActive: hasActiveKronos(userId),
      kronosExpiresAt: Number(user.buffs?.kronosExpiresAt) || 0,
      kronosVerdadeiraActive: Boolean(user.buffs?.kronosVerdadeiraActive),
    },
    cooldowns: { ...user.cooldowns },
    stats: { ...user.stats },
    preferences: { ...user.preferences },
    progression: {
      level: Math.max(1, Math.floor(Number(user.progression?.level) || 1)),
      xp: Math.max(0, Math.floor(Number(user.progression?.xp) || 0)),
      xpToNextLevel: getXpRequiredForLevel(Math.max(1, Math.floor(Number(user.progression?.level) || 1))),
      seasonPoints: Math.max(0, Math.floor(Number(user.progression?.seasonPoints) || 0)),
      teamId: typeof user.progression?.teamId === "string" ? user.progression.teamId : null,
      permanentCrown: Boolean(user.progression?.permanentCrown),
      season: {
        startDate: Math.max(0, Math.floor(Number(user.progression?.season?.startDate) || 0)),
        endDate: Math.max(0, Math.floor(Number(user.progression?.season?.endDate) || 0)),
        coinsAtReset: Math.max(0, Math.floor(Number(user.progression?.season?.coinsAtReset) || 0)),
        itemsAtReset: user.progression?.season?.itemsAtReset && typeof user.progression.season.itemsAtReset === "object"
          ? { ...user.progression.season.itemsAtReset }
          : {},
        xpAtReset: Math.max(0, Math.floor(Number(user.progression?.season?.xpAtReset) || 0)),
      },
      lastTradeByBracket: user.progression?.lastTradeByBracket && typeof user.progression.lastTradeByBracket === "object"
        ? { ...user.progression.lastTradeByBracket }
        : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    },
  }
}

function getStatValue(user, key) {
  if (!user || typeof user !== "object") return 0
  return Math.max(0, Math.floor(Number(user?.stats?.[key]) || 0))
}

function buildQuestProgress(user, quest = {}) {
  const baseline = Math.max(0, Math.floor(Number(quest.baseline) || 0))
  const target = Math.max(1, Math.floor(Number(quest.target) || 1))
  const currentStat = getStatValue(user, quest.key)
  const progress = Math.max(0, currentStat - baseline)
  const completed = progress >= target
  return {
    ...quest,
    progress,
    completed,
  }
}

function ensureDailyQuestsForUser(userId, dayKey = getDayKey()) {
  const user = ensureUser(userId)
  if (!user) return []

  const currentDayKey = String(dayKey || getDayKey())
  if (user.progression.lastQuestDayKey === currentDayKey && Array.isArray(user.progression.dailyQuests) && user.progression.dailyQuests.length > 0) {
    return user.progression.dailyQuests
  }

  const seed = `${normalizeUserId(userId)}:${currentDayKey}`
  const used = new Set()
  const quests = []
  for (let i = 0; i < DAILY_QUEST_COUNT; i++) {
    let pickIndex = stableHash(`${seed}:pick:${i}`) % DAILY_QUEST_POOL.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % DAILY_QUEST_POOL.length
    }
    used.add(pickIndex)

    const template = DAILY_QUEST_POOL[pickIndex]
    const targetRange = Math.max(1, template.targetMax - template.targetMin + 1)
    const target = template.targetMin + (stableHash(`${seed}:target:${i}`) % targetRange)
    quests.push({
      id: `Q${i + 1}`,
      key: template.key,
      title: template.title,
      target,
      rewardXp: template.rewardXp,
      rewardCoins: template.rewardCoins,
      baseline: getStatValue(user, template.key),
      claimed: false,
    })
  }

  user.progression.lastQuestDayKey = currentDayKey
  user.progression.dailyQuests = quests
  touchUser(user)
  saveEconomy()
  return quests
}

function getDailyQuestState(userId, dayKey = getDayKey()) {
  const user = ensureUser(userId)
  if (!user) return { dayKey, quests: [] }
  const quests = ensureDailyQuestsForUser(userId, dayKey)
  return {
    dayKey,
    quests: quests.map((quest) => buildQuestProgress(user, quest)),
  }
}

function addXp(userId, amount = 0, meta = {}) {
  const user = ensureUser(userId)
  const parsedAmount = Math.max(0, Math.floor(Number(amount) || 0))
  if (!user || parsedAmount <= 0) {
    return {
      ok: false,
      reason: "invalid-amount",
      granted: 0,
      level: Math.max(1, Math.floor(Number(user?.progression?.level) || 1)),
      xp: Math.max(0, Math.floor(Number(user?.progression?.xp) || 0)),
      xpToNextLevel: getXpRequiredForLevel(Math.max(1, Math.floor(Number(user?.progression?.level) || 1))),
      levelsGained: 0,
      levelRewards: [],
    }
  }

  user.progression.level = Math.max(1, Math.floor(Number(user.progression.level) || 1))
  user.progression.xp = Math.max(0, Math.floor(Number(user.progression.xp) || 0))
  user.progression.xp += parsedAmount
  user.progression.seasonPoints = Math.max(0, Math.floor(Number(user.progression.seasonPoints) || 0) + parsedAmount)

  let levelsGained = 0
  const levelRewards = []
  let required = getXpRequiredForLevel(user.progression.level)
  while (user.progression.xp >= required) {
    user.progression.xp -= required
    user.progression.level += 1
    levelsGained += 1

    const milestoneReward = getLevelMilestoneReward(user.progression.level)
    if (milestoneReward) {
      const grantedCoins = creditCoins(userId, milestoneReward.coins, {
        type: "xp-level-reward",
        details: `Recompensa de nível ${milestoneReward.level}`,
        meta: {
          level: milestoneReward.level,
          source: String(meta?.source || "xp"),
        },
      })

      const grantedItems = []
      for (const item of (milestoneReward.items || [])) {
        const key = normalizeItemKey(item?.key)
        const qty = capPositiveInt(item?.quantity, MAX_ITEM_OPERATION, 0)
        if (!key || qty <= 0) continue
        const before = getItemQuantity(userId, key)
        const after = addItem(userId, key, qty)
        const granted = Math.max(0, Math.floor(Number(after) || 0) - before)
        if (granted > 0) {
          grantedItems.push({ key, quantity: granted })
        }
      }

      levelRewards.push({
        level: milestoneReward.level,
        coins: grantedCoins,
        items: grantedItems,
      })
    }

    required = getXpRequiredForLevel(user.progression.level)
  }

  touchUser(user)
  saveEconomy()
  telemetry.incrementCounter("economy.xp.granted", parsedAmount, {
    source: String(meta?.source || "unspecified"),
  })

  return {
    ok: true,
    granted: parsedAmount,
    level: user.progression.level,
    xp: user.progression.xp,
    xpToNextLevel: required,
    levelsGained,
    levelRewards,
  }
}

function getXpProfile(userId) {
  const user = ensureUser(userId)
  if (!user) {
    return {
      level: 1,
      xp: 0,
      xpToNextLevel: getXpRequiredForLevel(1),
      seasonPoints: 0,
    }
  }
  const level = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const xp = Math.max(0, Math.floor(Number(user.progression?.xp) || 0))
  return {
    level,
    xp,
    xpToNextLevel: getXpRequiredForLevel(level),
    seasonPoints: Math.max(0, Math.floor(Number(user.progression?.seasonPoints) || 0)),
  }
}

function getSeasonState() {
  const state = economyCache.seasonState && typeof economyCache.seasonState === "object"
    ? economyCache.seasonState
    : buildDefaultSeasonState()
  return {
    currentSeason: Math.max(1, Math.floor(Number(state.currentSeason) || 1)),
    startDate: Math.max(0, Math.floor(Number(state.startDate) || 0)),
    endDate: Math.max(0, Math.floor(Number(state.endDate) || 0)),
    resetPolicy: state.resetPolicy === "hard" ? "hard" : "soft",
  }
}

function setSeasonState(nextState = {}) {
  const current = getSeasonState()
  const normalized = {
    currentSeason: Number.isFinite(nextState.currentSeason) && nextState.currentSeason > 0
      ? Math.floor(nextState.currentSeason)
      : current.currentSeason,
    startDate: Number.isFinite(nextState.startDate) && nextState.startDate > 0
      ? Math.floor(nextState.startDate)
      : current.startDate,
    endDate: Number.isFinite(nextState.endDate) && nextState.endDate > 0
      ? Math.floor(nextState.endDate)
      : current.endDate,
    resetPolicy: nextState.resetPolicy === "hard" ? "hard" : "soft",
  }
  economyCache.seasonState = normalized
  saveEconomy()
  return { ...normalized }
}

function getLevelThresholds() {
  return [...levelThresholds]
}

function claimDailyQuest(userId, questId = "") {
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }
  const dayKey = getDayKey()
  const quests = ensureDailyQuestsForUser(userId, dayKey)
  const normalizedQuestId = String(questId || "").trim().toUpperCase()
  const quest = quests.find((entry) => String(entry.id || "").toUpperCase() === normalizedQuestId)
  if (!quest) {
    return { ok: false, reason: "invalid-quest" }
  }
  if (quest.claimed) {
    return { ok: false, reason: "already-claimed", questId: quest.id }
  }

  const snapshot = buildQuestProgress(user, quest)
  if (!snapshot.completed) {
    return {
      ok: false,
      reason: "not-completed",
      questId: quest.id,
      progress: snapshot.progress,
      target: snapshot.target,
    }
  }

  quest.claimed = true
  touchUser(user)
  saveEconomy()

  const userLevel = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const levelMultiplier = 1 + 0.02 * (userLevel - 1)
  const scaledXp = Math.floor(quest.rewardXp * levelMultiplier)
  const scaledCoins = Math.floor(quest.rewardCoins * levelMultiplier)

  const xpResult = addXp(userId, scaledXp, {
    source: "daily-quest",
    questId: quest.id,
    key: quest.key,
  })
  const coinGain = creditCoins(userId, scaledCoins, {
    type: "quest-claim",
    details: `Missão diária ${quest.id}`,
    meta: { questId: quest.id, key: quest.key, dayKey },
  })
  incrementStat(userId, "questsCompleted", 1)

  telemetry.incrementCounter("economy.quest.claim", 1, {
    questKey: String(quest.key || "unknown"),
  })

  return {
    ok: true,
    questId: quest.id,
    key: quest.key,
    title: quest.title,
    rewardXp: quest.rewardXp,
    rewardCoins: coinGain,
    xpResult,
  }
}

function ensureWeeklyQuestsForUser(userId, weekKey = getWeekKey()) {
  const user = ensureUser(userId)
  if (!user) return []

  const currentWeekKey = String(weekKey || getWeekKey())
  if (user.progression.lastQuestWeekKey === currentWeekKey && Array.isArray(user.progression.weeklyQuests) && user.progression.weeklyQuests.length > 0) {
    return user.progression.weeklyQuests
  }

  const seed = `${normalizeUserId(userId)}:${currentWeekKey}`
  const used = new Set()
  const quests = []
  for (let i = 0; i < WEEKLY_QUEST_COUNT; i++) {
    let pickIndex = stableHash(`${seed}:pick:${i}`) % WEEKLY_QUEST_POOL.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % WEEKLY_QUEST_POOL.length
    }
    used.add(pickIndex)

    const template = WEEKLY_QUEST_POOL[pickIndex]
    const targetRange = Math.max(1, template.targetMax - template.targetMin + 1)
    const target = template.targetMin + (stableHash(`${seed}:target:${i}`) % targetRange)
    quests.push({
      id: `W${i + 1}`,
      key: template.key,
      title: template.title,
      target,
      rewardXp: template.rewardXp,
      rewardCoins: template.rewardCoins,
      baseline: getStatValue(user, template.key),
      claimed: false,
    })
  }

  user.progression.lastQuestWeekKey = currentWeekKey
  user.progression.weeklyQuests = quests
  touchUser(user)
  saveEconomy()
  return quests
}

function getWeeklyQuestState(userId, weekKey = getWeekKey()) {
  const user = ensureUser(userId)
  if (!user) return { weekKey, quests: [] }
  const quests = ensureWeeklyQuestsForUser(userId, weekKey)
  return {
    weekKey,
    quests: quests.map((quest) => buildQuestProgress(user, quest)),
  }
}

function claimWeeklyQuest(userId, questId = "") {
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }
  const weekKey = getWeekKey()
  const quests = ensureWeeklyQuestsForUser(userId, weekKey)
  const normalizedQuestId = String(questId || "").trim().toUpperCase()
  const quest = quests.find((entry) => String(entry.id || "").toUpperCase() === normalizedQuestId)
  if (!quest) {
    return { ok: false, reason: "invalid-quest" }
  }
  if (quest.claimed) {
    return { ok: false, reason: "already-claimed", questId: quest.id }
  }

  const snapshot = buildQuestProgress(user, quest)
  if (!snapshot.completed) {
    return {
      ok: false,
      reason: "not-completed",
      questId: quest.id,
      progress: snapshot.progress,
      target: snapshot.target,
    }
  }

  quest.claimed = true
  touchUser(user)
  saveEconomy()

  const userLevel = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const levelMultiplier = 1 + 0.02 * (userLevel - 1)
  const scaledXp = Math.floor(quest.rewardXp * levelMultiplier)
  const scaledCoins = Math.floor(quest.rewardCoins * levelMultiplier)

  const xpResult = addXp(userId, scaledXp, {
    source: "weekly-quest",
    questId: quest.id,
    key: quest.key,
  })
  const coinGain = creditCoins(userId, scaledCoins, {
    type: "quest-claim",
    details: `Missão semanal ${quest.id}`,
    meta: { questId: quest.id, key: quest.key, weekKey },
  })
  incrementStat(userId, "questsCompleted", 1)

  telemetry.incrementCounter("economy.quest.claim", 1, {
    questKey: String(quest.key || "unknown"),
    type: "weekly",
  })

  return {
    ok: true,
    questId: quest.id,
    key: quest.key,
    title: quest.title,
    rewardXp: quest.rewardXp,
    rewardCoins: coinGain,
    xpResult,
  }
}

function getStablePublicLabel(userId = "") {
  const normalized = normalizeUserId(userId)
  const user = ensureUser(normalized)
  const custom = String(user?.preferences?.publicLabel || "").trim()
  if (custom) return custom
  const userPart = normalized.split("@")[0] || normalized || "anon"
  const suffix = userPart.slice(-4).toUpperCase().padStart(4, "0")
  return `USR-${suffix}`
}

function isMentionOptIn(userId = "") {
  const user = ensureUser(userId)
  return Boolean(user?.preferences?.mentionOptIn)
}

function setMentionOptIn(userId = "", enabled = false) {
  const user = ensureUser(userId)
  if (!user) return false
  user.preferences.mentionOptIn = Boolean(enabled)
  touchUser(user)
  saveEconomy()
  return true
}

function setPublicLabel(userId = "", label = "") {
  const user = ensureUser(userId)
  if (!user) return false
  user.preferences.publicLabel = String(label || "").trim().slice(0, 32)
  touchUser(user)
  saveEconomy()
  return true
}

function incrementStat(userId, key, amount = 1) {
  const user = ensureUser(userId)
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1))
  if (!user) return 0
  if (!Number.isFinite(user.stats[key])) user.stats[key] = 0
  user.stats[key] = Math.max(0, Math.floor(Number(user.stats[key]) || 0) + safeAmount)
  touchUser(user)
  saveEconomy()
  return user.stats[key]
}

function getStatement(userId, limit = 10) {
  const user = ensureUser(userId)
  if (!user) return []
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return (user.transactions || []).slice(-safeLimit).reverse()
}

// Sistema de Lootbox
const LOOTBOX_EFFECTS = [
  { id: "daily_reset", name: "Resetar cooldown !daily", weight: 30, description: "Reseta !daily" },
  { id: "work_reset", name: "Resetar cooldown !trabalho", weight: 30, description: "Reseta !trabalho" },
  { id: "coins_1000_gain", name: "Ganhar 1000 coins", weight: 6, description: "+1000 moedas" },
  { id: "coins_1000_loss", name: "Perder 1000 coins", weight: 5, description: "-1000 moedas" },
  { id: "coins_2500_gain", name: "Ganhar 2500 coins", weight: 4, description: "+2500 moedas" },
  { id: "coins_2500_loss", name: "Perder 2500 coins", weight: 3, description: "-2500 moedas" },
  { id: "shield_1_gain", name: "Ganhar 1 escudo", weight: 4, description: "+1 escudo" },
  { id: "shield_1_loss", name: "Perder 1 escudo", weight: 3, description: "-1 escudo" },
  { id: "shield_3_gain", name: "Ganhar 3 escudos", weight: 3, description: "+3 escudos" },
  { id: "shield_3_loss", name: "Perder 3 escudos", weight: 2, description: "-3 escudos" },
  { id: "kronos_quebrada", name: "Ganhar Coroa Kronos (Quebrada)", weight: 1, description: "+1 Coroa Kronos (Quebrada)" },
  { id: "punishment_pass_1x", name: "Passe de Punição (1x)", weight: 2, description: "+1 Passe de Punição (1x)" },
  { id: "punishment_1x", name: "Punição (1x)", weight: 4, description: "Punição aleatória (1x)" },
  { id: "punishment_pass_5x", name: "Passe de Punição (5x)", weight: 1, description: "+1 Passe de Punição (5x)" },
  { id: "punishment_5x", name: "Punição (5x)", weight: 3, description: "Punição aleatória (5x)" },
]

function selectRandomEffect() {
  const totalWeight = LOOTBOX_EFFECTS.reduce((sum, effect) => sum + effect.weight, 0)
  let random = Math.random() * totalWeight
  
  for (const effect of LOOTBOX_EFFECTS) {
    random -= effect.weight
    if (random <= 0) {
      return effect
    }
  }
  
  return LOOTBOX_EFFECTS[0]
}

function openLootbox(userId, quantity = 1, groupMembers = []) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  if (qty > MAX_LOOTBOX_OPEN_PER_CALL) {
    return {
      ok: false,
      reason: "quantity-too-large",
      maxQuantity: MAX_LOOTBOX_OPEN_PER_CALL,
    }
  }
  
  const available = getItemQuantity(userId, "lootbox")
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available }
  }
  
  removeItem(userId, "lootbox", qty)
  incrementStat(userId, "lootboxesOpened", qty)
  
  const results = []
  const ownerNormalized = normalizeUserId(userId)
  const eligibleMembers = Array.from(new Set(groupMembers || []))
    .filter((memberId) => {
      const normalized = normalizeUserId(memberId)
      if (!normalized || normalized === ownerNormalized) return false
      const existing = economyCache.users[normalized]
      return Boolean(existing && Number.isFinite(existing.coins) && existing.coins >= 100)
    })

  for (let i = 0; i < qty; i++) {
    const effect = selectRandomEffect()
    
    // Decide se o efeito vai para o usuário ou para outro membro
    let targetUser = userId
    const isNegativeEffect = effect.id.includes("loss") || effect.id.includes("punishment")
    incrementStat(userId, isNegativeEffect ? "lootboxNegativeRolls" : "lootboxPositiveRolls", 1)
    
    if (!isNegativeEffect && eligibleMembers.length > 0) {
      // 25% chance para efeitos positivos irem para outro jogador
      if (Math.random() < 0.25) {
        if (eligibleMembers.length > 0) {
          targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
        }
      }
    } else if (isNegativeEffect && eligibleMembers.length > 0) {
      // Efeitos negativos tem chance menor (20%) de ir para outro jogador
      if (Math.random() < 0.2) {
        if (eligibleMembers.length > 0) {
          targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
        }
      }
    }
    
    let resultText = ""
    const targetIsOther = normalizeUserId(targetUser) !== normalizeUserId(userId)
    const targetPrefix = targetIsOther ? `@${targetUser.split("@")[0]}: ` : "Você: "
    let punishment = null
    
    // Aplica o efeito
    switch (effect.id) {
      case "coins_1000_gain":
        creditCoins(targetUser, 1000, { type: "lootbox", details: "Efeito: +1000 coins" })
        resultText = `${targetPrefix}+1000 moedas`
        break
      case "coins_1000_loss":
        debitCoinsFlexible(targetUser, 1000, { type: "lootbox", details: "Efeito: -1000 coins" })
        resultText = `${targetPrefix}-1000 moedas`
        break
      case "coins_2500_gain":
        creditCoins(targetUser, 2500, { type: "lootbox", details: "Efeito: +2500 coins" })
        resultText = `${targetPrefix}+2500 moedas`
        break
      case "coins_2500_loss":
        debitCoinsFlexible(targetUser, 2500, { type: "lootbox", details: "Efeito: -2500 coins" })
        resultText = `${targetPrefix}-2500 moedas`
        break
      case "shield_1_gain":
        addShields(targetUser, 1)
        resultText = `${targetPrefix}+1 escudo`
        break
      case "shield_1_loss":
        removeItem(targetUser, "escudo", 1)
        resultText = `${targetPrefix}-1 escudo`
        break
      case "shield_3_gain":
        addShields(targetUser, 3)
        resultText = `${targetPrefix}+3 escudos`
        break
      case "shield_3_loss":
        removeItem(targetUser, "escudo", 3)
        resultText = `${targetPrefix}-3 escudos`
        break
      case "kronos_quebrada":
        addItem(targetUser, "kronosQuebrada", 1)
        resultText = `${targetPrefix}+1 Coroa Kronos (Quebrada)`
        break
      case "punishment_pass_1x":
        {
          const passType = pickRandomPunishmentType()
          const passKey = buildPunishmentPassKey(passType, 1)
          addItem(targetUser, passKey, 1)
          resultText = `${targetPrefix}+1 Passe de Punição ${passType} (1x)`
        }
        break
      case "punishment_1x":
        {
          const punishmentType = pickRandomPunishmentType()
          punishment = {
            type: punishmentType,
            severity: 1,
          }
          resultText = `${targetPrefix}Punição sorteada ${punishmentType} (1x)`
        }
        break
      case "punishment_pass_5x":
        {
          const passType = pickRandomPunishmentType()
          const passKey = buildPunishmentPassKey(passType, 5)
          addItem(targetUser, passKey, 1)
          resultText = `${targetPrefix}+1 Passe de Punição ${passType} (5x)`
        }
        break
      case "punishment_5x":
        {
          const punishmentType = pickRandomPunishmentType()
          punishment = {
            type: punishmentType,
            severity: 5,
          }
          resultText = `${targetPrefix}Punição sorteada ${punishmentType} (5x)`
        }
        break
      case "daily_reset":
        {
          const targetProfile = ensureUser(targetUser)
          if (targetProfile) {
            targetProfile.cooldowns.dailyClaimKey = null
            touchUser(targetProfile)
            saveEconomy()
          }
        }
        resultText = `${targetPrefix}Cooldown de !daily resetado`
        break
      case "work_reset":
        setWorkCooldown(targetUser, 0)
        resultText = `${targetPrefix}Cooldown de !trabalho resetado`
        break
    }
    
    results.push({
      effect: effect.name,
      description: effect.description,
      result: resultText,
      targetUser,
      targetIsOther,
      punishment,
    })
  }
  
  return {
    ok: true,
    quantity: qty,
    results,
  }
}

function setWorkCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.workAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getWorkCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.workAt) || 0)
}

function setStealCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.stealAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getStealCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.stealAt) || 0)
}

function forgePunishmentPass(userId, punishmentType, severity = 1, quantity = 1, options = {}) {
  if (!isValidPunishmentType(punishmentType)) {
    return { ok: false, reason: "invalid-type" }
  }

  const safeSeverity = normalizePassSeverity(severity, 1)
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) return { ok: false, reason: "invalid-quantity" }
  if (qty > MAX_FORGE_QUANTITY) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_FORGE_QUANTITY }
  }

  const selectedKey = buildPunishmentPassKey(punishmentType, safeSeverity)
  const available = getItemQuantity(userId, selectedKey)
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available, selectedKey }
  }

  const boostedOdds = Boolean(options?.boostedOdds)
  const deferTypeSelection = Boolean(options?.deferTypeSelection)
  const forgeCostMultiplier = boostedOdds ? 2 : 1
  const forgeCost = 100 * qty * forgeCostMultiplier
  if (!debitCoins(userId, forgeCost, {
    type: "forge-fee",
    details: `Taxa de falsificacao de ${qty}x ${selectedKey}`,
    meta: { punishmentType, severity: safeSeverity, quantity: qty, boostedOdds },
  })) {
    return { ok: false, reason: "insufficient-funds", forgeCost }
  }

  const roll = Math.random()
  const multiplyThreshold = boostedOdds ? 0.20 : 0.10
  const upgradeThreshold = boostedOdds ? 0.40 : 0.20
  const changeTypeThreshold = boostedOdds ? 0.80 : 0.40

  if (roll < multiplyThreshold) {
    const bonus = Math.ceil(qty * 0.5)
    addItem(userId, selectedKey, bonus)
    return {
      ok: true,
      outcome: "multiply",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      bonus,
      finalQuantity: getItemQuantity(userId, selectedKey),
    }
  }

  if (roll < upgradeThreshold) {
    const upgradedSeverity = safeSeverity + 1
    const upgradedKey = buildPunishmentPassKey(punishmentType, upgradedSeverity)
    removeItem(userId, selectedKey, qty)
    addItem(userId, upgradedKey, qty)
    return {
      ok: true,
      outcome: "upgrade-severity",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      upgradedSeverity,
      upgradedKey,
    }
  }

  if (roll < changeTypeThreshold) {
    removeItem(userId, selectedKey, qty)

    if (deferTypeSelection) {
      return {
        ok: true,
        outcome: "change-type-pending",
        forgeCost,
        boostedOdds,
        selectedKey,
        quantity: qty,
        fromType: punishmentType,
        severity: safeSeverity,
      }
    }

    const nextType = pickRandomPunishmentType(Math.floor(Number(punishmentType) || 0))
    const convertedKey = buildPunishmentPassKey(nextType, safeSeverity)
    addItem(userId, convertedKey, qty)
    return {
      ok: true,
      outcome: "change-type",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      fromType: punishmentType,
      toType: nextType,
      convertedKey,
    }
  }

  const lost = Math.ceil(qty / 2)
  removeItem(userId, selectedKey, lost)
  return {
    ok: true,
    outcome: "lose-half",
    forgeCost,
    boostedOdds,
    selectedKey,
    quantity: qty,
    lost,
    remaining: getItemQuantity(userId, selectedKey),
  }
}

function applyForgedPassTypeChoice(userId, fromType, toType, severity = 1, quantity = 1) {
  if (!isValidPunishmentType(fromType) || !isValidPunishmentType(toType)) {
    return { ok: false, reason: "invalid-type" }
  }
  const safeSeverity = normalizePassSeverity(severity, 1)
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) return { ok: false, reason: "invalid-quantity" }
  const chosenType = Math.floor(Number(toType) || 0)
  const convertedKey = buildPunishmentPassKey(chosenType, safeSeverity)
  addItem(userId, convertedKey, qty)
  return {
    ok: true,
    toType: chosenType,
    convertedKey,
    quantity: qty,
    severity: safeSeverity,
  }
}

function createPunishmentPassKey(punishmentType, severity = 1) {
  if (!isValidPunishmentType(punishmentType)) return null
  return buildPunishmentPassKey(punishmentType, normalizePassSeverity(severity, 1))
}

// Team system functions
function getTeamProfile(teamId, storage) {
  if (!storage) return null
  const team = storage.getTeam(teamId)
  if (!team) return null
  return {
    teamId: team.teamId,
    name: team.name,
    createdBy: team.createdBy,
    createdAt: team.createdAt,
    memberCount: team.members.length,
    poolCoins: team.poolCoins || 0,
    poolItems: team.poolItems || {},
  }
}

function getTeamStats(teamId, storage) {
  if (!storage) return null
  const team = storage.getTeam(teamId)
  if (!team) return null
  const members = team.members || []
  let totalCoins = 0
  let totalXp = 0
  let totalLevel = 0
  members.forEach(userId => {
    totalCoins += getCoins(userId)
    const profile = getXpProfile(userId)
    totalXp += Math.max(0, profile?.xp || 0)
    totalLevel += Math.max(1, Math.floor(profile?.level || 1))
  })
  return {
    teamId,
    memberCount: members.length,
    totalCoins,
    totalXp,
    totalLevel,
    poolCoins: team.poolCoins || 0,
    poolItems: Object.keys(team.poolItems || {}).length,
  }
}

function getTeamMembers(teamId, storage) {
  if (!storage) return []
  const members = storage.getTeamMembers(teamId)
  return members.map(userId => ({
    userId,
    coins: getCoins(userId),
    level: Math.max(1, Math.floor(getXpProfile(userId)?.level || 1)),
    xp: Math.max(0, getXpProfile(userId)?.xp || 0),
  }))
}

function getTeamPoolCoins(teamId, storage) {
  if (!storage) return 0
  return storage.getTeamPoolCoins(teamId)
}

function getTeamPoolItems(teamId, storage) {
  if (!storage) return {}
  return storage.getTeamPoolItems(teamId)
}

loadEconomy()

module.exports = {
  DEFAULT_COINS,
  ITEM_DEFINITIONS,
  SHIELD_PRICE,
  loadEconomy,
  saveEconomy,
  getCoins,
  setCoins,
  creditCoins,
  debitCoins,
  debitCoinsFlexible,
  normalizeItemKey,
  getItemDefinition,
  getItemCatalog,
  getItemQuantity,
  addItem,
  removeItem,
  getShields,
  addShields,
  consumeShield,
  buyShield,
  buyItem,
  sellItem,
  transferCoins,
  transferItem,
  attemptSteal,
  claimDaily,
  claimCarePackage,
  hasActiveKronos,
  applyKronosGainMultiplier,
  getStealSuccessChance,
  canAttemptSteal,
  getGlobalRanking,
  getAllUserIds,
  getGroupRanking,
  getUserGlobalPosition,
  getGlobalXpRanking,
  getGroupXpRanking,
  getUserGlobalXpPosition,
  getShopIndexText,
  pushTransaction,
  getStatement,
  incrementStat,
  setWorkCooldown,
  getWorkCooldown,
  setStealCooldown,
  getStealCooldown,
  getProfile,
  getStablePublicLabel,
  isMentionOptIn,
  setMentionOptIn,
  setPublicLabel,
  openLootbox,
  forgePunishmentPass,
  applyForgedPassTypeChoice,
  createPunishmentPassKey,
  getOperationLimits,
  deleteUserProfile,
  levelThresholds,
  getLevelThresholds,
  getSeasonState,
  setSeasonState,
  getXpRequiredForLevel,
  getXpProfile,
  addXp,
  getDayKey,
  getWeekKey,
  getDailyQuestState,
  claimDailyQuest,
  getWeeklyQuestState,
  claimWeeklyQuest,
  getTeamProfile,
  getTeamStats,
  getTeamMembers,
  getTeamPoolCoins,
  getTeamPoolItems,
}
