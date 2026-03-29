function normalizeComparable(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s!_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function damerauLevenshteinDistance(a = "", b = "") {
  const left = String(a || "")
  const right = String(b || "")
  const alen = left.length
  const blen = right.length
  if (alen === 0) return blen
  if (blen === 0) return alen

  const dp = Array.from({ length: alen + 1 }, () => Array(blen + 1).fill(0))

  for (let i = 0; i <= alen; i++) dp[i][0] = i
  for (let j = 0; j <= blen; j++) dp[0][j] = j

  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }

  return dp[alen][blen]
}

function jaroWinklerSimilarity(a = "", b = "", prefixScale = 0.1) {
  const left = String(a || "")
  const right = String(b || "")
  if (left === right) return 1
  if (!left || !right) return 0

  const maxLen = Math.max(left.length, right.length)
  const matchDistance = Math.max(0, Math.floor(maxLen / 2) - 1)
  const leftMatches = new Array(left.length).fill(false)
  const rightMatches = new Array(right.length).fill(false)

  let matches = 0
  for (let i = 0; i < left.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, right.length)
    for (let j = start; j < end; j++) {
      if (rightMatches[j]) continue
      if (left[i] !== right[j]) continue
      leftMatches[i] = true
      rightMatches[j] = true
      matches += 1
      break
    }
  }

  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < left.length; i++) {
    if (!leftMatches[i]) continue
    while (!rightMatches[k]) k += 1
    if (left[i] !== right[k]) transpositions += 1
    k += 1
  }
  transpositions /= 2

  const m = matches
  const jaro = ((m / left.length) + (m / right.length) + ((m - transpositions) / m)) / 3

  let prefix = 0
  for (let i = 0; i < Math.min(4, left.length, right.length); i++) {
    if (left[i] !== right[i]) break
    prefix += 1
  }

  return jaro + (prefix * prefixScale * (1 - jaro))
}

function normalizeDistanceSimilarity(a = "", b = "") {
  const left = String(a || "")
  const right = String(b || "")
  const maxLen = Math.max(1, left.length, right.length)
  const distance = damerauLevenshteinDistance(left, right)
  return Math.max(0, 1 - (distance / maxLen))
}

function scoreCandidate(input = "", candidate = "", metric = "damerau-levenshtein") {
  const left = normalizeComparable(input)
  const right = normalizeComparable(candidate)
  if (!left || !right) return 0
  if (metric === "jaro-winkler") {
    return jaroWinklerSimilarity(left, right)
  }
  return normalizeDistanceSimilarity(left, right)
}

function isBoundedChoiceToken(token = "") {
  const normalized = String(token || "").trim().toLowerCase()
  if (!normalized) return false
  if (!normalized.includes("|")) return false
  if (/[@<>{}\[\]]/.test(normalized)) return false
  if (/user|usuario|quant|qtd|item|nome|titulo|resposta|lobby|codigo|mensagem|valor/.test(normalized)) return false
  return true
}

function extractUsageBoundedChoiceGroups(usage = "") {
  const groups = []
  const raw = String(usage || "")
  const regex = /<([^>]+)>|\[([^\]]+)\]/g
  let match
  while ((match = regex.exec(raw)) !== null) {
    const token = (match[1] || match[2] || "").trim()
    if (!isBoundedChoiceToken(token)) continue
    const options = token
      .split("|")
      .map((entry) => normalizeComparable(entry))
      .filter(Boolean)
      .slice(0, 10)
    if (options.length > 0) groups.push(options)
  }
  return groups
}

function buildAliasCandidates(commandHelp = {}, prefix = "!") {
  const candidates = []
  const unique = new Set()

  const addCandidate = (phrase) => {
    const normalized = normalizeComparable(phrase)
    if (!normalized || unique.has(normalized)) return
    unique.add(normalized)
    candidates.push(String(phrase || "").trim())
  }

  for (const info of Object.values(commandHelp || {})) {
    const aliases = Array.isArray(info?.aliases)
      ? info.aliases.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
      : []
    if (aliases.length === 0) continue

    const choiceGroups = extractUsageBoundedChoiceGroups(info?.usage)
    for (const alias of aliases) {
      const base = `${prefix}${alias}`
      addCandidate(base)

      if (choiceGroups.length === 0) continue

      let phrases = [base]
      for (const group of choiceGroups.slice(0, 2)) {
        const next = []
        for (const phrase of phrases) {
          for (const option of group) {
            next.push(`${phrase} ${option}`)
          }
        }
        phrases = next.slice(0, 24)
      }

      for (const phrase of phrases) {
        addCandidate(phrase)
      }
    }
  }

  return candidates
}

function rankCandidates(input, candidates = [], metric = "damerau-levenshtein") {
  return (candidates || [])
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(input, candidate, metric),
    }))
    .sort((a, b) => b.score - a.score)
}

function chooseBestMetric(input = "", candidates = []) {
  const dlRank = rankCandidates(input, candidates, "damerau-levenshtein")
  const jwRank = rankCandidates(input, candidates, "jaro-winkler")

  const dlTop = dlRank[0] || { score: 0, candidate: "" }
  const dlSecond = dlRank[1] || { score: 0 }
  const jwTop = jwRank[0] || { score: 0, candidate: "" }
  const jwSecond = jwRank[1] || { score: 0 }

  const normalizedInput = normalizeComparable(input)
  const normalizedDlTop = normalizeComparable(dlTop.candidate)
  const dlDistance = damerauLevenshteinDistance(normalizedInput, normalizedDlTop)

  if (dlTop.candidate && dlTop.candidate === jwTop.candidate && dlDistance <= 2 && normalizedInput.length >= 5) {
    return "damerau-levenshtein"
  }

  const dlConfidence = dlTop.score + Math.max(0, dlTop.score - dlSecond.score) * 0.4
  const jwConfidence = jwTop.score + Math.max(0, jwTop.score - jwSecond.score) * 0.4
  return dlConfidence >= jwConfidence ? "damerau-levenshtein" : "jaro-winkler"
}

function getLikelyCommandSuggestions({
  input = "",
  commandHelp = {},
  prefix = "!",
  maxSuggestions = 3,
  minScore = 0.72,
} = {}) {
  const normalizedInput = normalizeComparable(input)
  if (!normalizedInput.startsWith(prefix)) return { metric: "damerau-levenshtein", suggestions: [] }

  const candidates = buildAliasCandidates(commandHelp, prefix)
  if (candidates.length === 0) return { metric: "damerau-levenshtein", suggestions: [] }

  const metric = chooseBestMetric(normalizedInput, candidates)
  const ranked = rankCandidates(normalizedInput, candidates, metric)

  const suggestions = []
  const seen = new Set()
  for (const entry of ranked) {
    if (entry.score < minScore) break
    const normalized = normalizeComparable(entry.candidate)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    suggestions.push({
      text: entry.candidate,
      score: entry.score,
    })
    if (suggestions.length >= maxSuggestions) break
  }

  return { metric, suggestions }
}

module.exports = {
  normalizeComparable,
  damerauLevenshteinDistance,
  jaroWinklerSimilarity,
  scoreCandidate,
  chooseBestMetric,
  buildAliasCandidates,
  getLikelyCommandSuggestions,
}