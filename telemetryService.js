const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, ".data")
const TELEMETRY_DIR = path.join(DATA_DIR, "telemetry")
const METRICS_FILE = path.join(TELEMETRY_DIR, "metrics.json")

if (!fs.existsSync(TELEMETRY_DIR)) {
  fs.mkdirSync(TELEMETRY_DIR, { recursive: true })
}

let metricsCache = {
  counters: {},
  durations: {},
  updatedAt: Date.now(),
}

function safeString(value) {
  if (value === null || value === undefined) return ""
  return String(value)
}

function sanitizeTags(tags = {}) {
  const safe = {}
  Object.keys(tags || {}).forEach((key) => {
    const normalizedKey = safeString(key).trim()
    if (!normalizedKey) return
    safe[normalizedKey] = safeString(tags[key]).trim()
  })
  return safe
}

function buildSeriesKey(name, tags = {}) {
  const safeName = safeString(name).trim()
  const normalizedTags = sanitizeTags(tags)
  const tagKeys = Object.keys(normalizedTags).sort()
  if (tagKeys.length === 0) return safeName
  const suffix = tagKeys.map((key) => `${key}=${normalizedTags[key]}`).join("|")
  return `${safeName}|${suffix}`
}

function getDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getEventsFilePath(ts = Date.now()) {
  return path.join(TELEMETRY_DIR, `events-${getDayKey(ts)}.ndjson`)
}

function loadMetrics() {
  try {
    if (!fs.existsSync(METRICS_FILE)) return
    const parsed = JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"))
    metricsCache = {
      counters: parsed?.counters || {},
      durations: parsed?.durations || {},
      updatedAt: Date.now(),
    }
  } catch (err) {
    console.error("Erro ao carregar métricas de telemetria:", err)
    metricsCache = {
      counters: {},
      durations: {},
      updatedAt: Date.now(),
    }
  }
}

let saveTimeout = null
function saveMetrics(immediate = false) {
  const doSave = () => {
    try {
      const payload = {
        ...metricsCache,
        updatedAt: Date.now(),
      }
      fs.writeFileSync(METRICS_FILE, JSON.stringify(payload, null, 2), "utf8")
    } catch (err) {
      console.error("Erro ao salvar métricas de telemetria:", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 2000)
}

function appendEvent(type, payload = {}) {
  try {
    const now = Date.now()
    const evt = {
      at: now,
      type: safeString(type).trim() || "unknown",
      payload: payload || {},
    }
    fs.appendFileSync(getEventsFilePath(now), `${JSON.stringify(evt)}\n`, "utf8")
  } catch (err) {
    console.error("Erro ao registrar evento de telemetria:", err)
  }
}

function incrementCounter(name, value = 1, tags = {}) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return
  const seriesKey = buildSeriesKey(name, tags)
  if (!seriesKey) return
  const current = Number(metricsCache.counters[seriesKey] || 0)
  metricsCache.counters[seriesKey] = current + amount
  saveMetrics()
}

function observeDuration(name, ms, tags = {}) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return
  const seriesKey = buildSeriesKey(name, tags)
  if (!seriesKey) return
  if (!metricsCache.durations[seriesKey]) {
    metricsCache.durations[seriesKey] = {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      minMs: value,
    }
  }
  const bucket = metricsCache.durations[seriesKey]
  bucket.count += 1
  bucket.totalMs += value
  bucket.maxMs = Math.max(bucket.maxMs, value)
  bucket.minMs = Math.min(bucket.minMs, value)
  saveMetrics()
}

function markCommand(commandName, metadata = {}) {
  const cmd = safeString(commandName).trim().toLowerCase()
  if (!cmd) return
  incrementCounter("command.received", 1, { command: cmd })
  appendEvent("command.received", {
    command: cmd,
    ...metadata,
  })
}

function getMetricsSnapshot() {
  return {
    counters: { ...metricsCache.counters },
    durations: JSON.parse(JSON.stringify(metricsCache.durations || {})),
    updatedAt: metricsCache.updatedAt,
  }
}

loadMetrics()

module.exports = {
  appendEvent,
  incrementCounter,
  observeDuration,
  markCommand,
  getMetricsSnapshot,
  saveMetrics,
}
