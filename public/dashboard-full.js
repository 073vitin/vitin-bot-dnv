(() => {
  const POLLING_MS = 1000
  const pollingStatusEl = document.getElementById("polling-status")
  const qrSectionEl = document.getElementById("qr-section")
  const perfSectionEl = document.getElementById("perf-section")
  const usersSectionEl = document.getElementById("users-section")
  const commandsSectionEl = document.getElementById("commands-section")
  const terminalSectionEl = document.getElementById("terminal-section")

  if (!pollingStatusEl || !qrSectionEl || !perfSectionEl || !usersSectionEl || !commandsSectionEl || !terminalSectionEl) {
    return
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  function formatMs(value) {
    return Number(value || 0).toFixed(1) + " ms"
  }

  function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000))
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return h + "h " + m + "m " + s + "s"
  }

  function formatDateTime(value) {
    if (!value) return "-"
    const shifted = new Date(Number(value) - (3 * 60 * 60 * 1000))
    return shifted.toISOString().replace("T", " ").slice(0, 19) + " (UTC-3)"
  }

  function readPath(obj, path, fallback) {
    let current = obj
    for (let i = 0; i < path.length; i++) {
      if (!current || typeof current !== "object") return fallback
      current = current[path[i]]
    }
    return current === undefined || current === null ? fallback : current
  }

  function renderMetricRow(label, bucket) {
    return `
      <tr>
        <td style="text-align:left;border-bottom:1px solid #eee;padding:4px">${escapeHtml(label)}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:4px">${Number(readPath(bucket, ["count"], 0))}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:4px">${formatMs(readPath(bucket, ["lastMs"], 0))}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:4px">${formatMs(readPath(bucket, ["avgMs"], 0))}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:4px">${formatMs(readPath(bucket, ["p95Ms"], 0))}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:4px">${formatMs(readPath(bucket, ["maxMs"], 0))}</td>
      </tr>
    `
  }

  function renderQr(authReady, qrImage) {
    if (!authReady && qrImage) {
      qrSectionEl.style.display = "block"
      qrSectionEl.innerHTML =
        "<h3 style='margin:0 0 10px 0'>Escaneie o QR Code</h3>" +
        "<img src='" + qrImage + "' style='max-width:320px;width:100%;height:auto'>"
      return
    }

    qrSectionEl.style.display = "block"
    qrSectionEl.innerHTML =
      "<h3 style='margin:0'>" + (authReady ? "Bot conectado" : "Aguardando autenticacao") + "</h3>"
  }

  function renderPerf(snapshot) {
    if (!snapshot) {
      perfSectionEl.style.display = "none"
      return
    }

    const stageRows = (readPath(snapshot, ["metrics", "stages"], []) || [])
      .map((stage) => renderMetricRow("stage:" + stage.name, stage))
      .join("")

    perfSectionEl.style.display = "block"
    perfSectionEl.innerHTML = `
      <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
        <h3 style="margin:0 0 10px 0">Performance</h3>
        <p style="margin:4px 0">Estado da conexao: <b>${escapeHtml(snapshot.connectionState)}</b></p>
        <p style="margin:4px 0">Uptime do bot (sessao atual): <b>${formatElapsed(snapshot.uptimeMs)}</b> | Desde autenticacao atual: <b>${formatElapsed(snapshot.authUptimeMs)}</b></p>
        <p style="margin:4px 0">Autenticado em: <b>${formatDateTime(snapshot.authenticatedAt)}</b> | Conectado em: <b>${formatDateTime(snapshot.connectedAt)}</b></p>
        <p style="margin:4px 0">Mensagens recebidas: <b>${Number(snapshot.messagesReceived || 0)}</b> | Erros: <b>${Number(snapshot.messagesErrored || 0)}</b> | Ignoradas (sem conteudo): <b>${Number(snapshot.ignoredNoMessage || 0)}</b> | Ignoradas (fromMe): <b>${Number(snapshot.ignoredFromMe || 0)}</b></p>
        <p style="margin:4px 0">Lifetime desde <b>${formatDateTime(readPath(snapshot, ["lifetime", "sinceAt"], 0))}</b>: mensagens <b>${Number(readPath(snapshot, ["lifetime", "messagesReceived"], 0))}</b>, erros <b>${Number(readPath(snapshot, ["lifetime", "messagesErrored"], 0))}</b>, ignoradas sem conteudo <b>${Number(readPath(snapshot, ["lifetime", "ignoredNoMessage"], 0))}</b>, ignoradas fromMe <b>${Number(readPath(snapshot, ["lifetime", "ignoredFromMe"], 0))}</b>, comandos <b>${Number(readPath(snapshot, ["lifetime", "commandsExecuted"], 0))}</b>, reconexoes <b>${Number(readPath(snapshot, ["lifetime", "reconnects"], 0))}</b>, uptime autenticado <b>${formatElapsed(readPath(snapshot, ["lifetime", "authUptimeMs"], 0))}</b>, boots <b>${Number(readPath(snapshot, ["lifetime", "bootCount"], 0))}</b></p>
        <p style="margin:4px 0">Ultimo comando: <b>${escapeHtml(snapshot.lastCommand || "-")}</b> | Ultimo processamento: <b>${formatDateTime(snapshot.lastProcessedAt)}</b> | Reconexoes: <b>${Number(snapshot.reconnects || 0)}</b></p>
        <p style="margin:4px 0">Memoria: heap <b>${Number(readPath(snapshot, ["memory", "heapUsed"], 0))} MB</b> | rss <b>${Number(readPath(snapshot, ["memory", "rss"], 0))} MB</b> | Registrados <b>${Number(snapshot.registeredUsers || 0)}</b></p>
        <table style="width:100%;margin-top:12px;border-collapse:collapse;font-family:monospace;font-size:12px">
          <thead>
            <tr>
              <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Metrica</th>
              <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Count</th>
              <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Last</th>
              <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Avg</th>
              <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">P95</th>
              <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Max</th>
            </tr>
          </thead>
          <tbody>
            ${renderMetricRow("message.processing", readPath(snapshot, ["metrics", "processing"], {}))}
            ${renderMetricRow("message.queueDelay", readPath(snapshot, ["metrics", "queueDelay"], {}))}
            ${renderMetricRow("sock.sendMessage", readPath(snapshot, ["metrics", "sendMessage"], {}))}
            ${renderMetricRow("sock.groupMetadata", readPath(snapshot, ["metrics", "groupMetadata"], {}))}
            ${renderMetricRow("eventLoop.lag", readPath(snapshot, ["metrics", "eventLoopLag"], {}))}
            ${stageRows}
          </tbody>
        </table>
      </section>
    `
  }

  function renderRegisteredUsers(snapshot) {
    if (!snapshot) {
      usersSectionEl.style.display = "none"
      return
    }

    const users = Array.isArray(snapshot.registeredUsersList)
      ? snapshot.registeredUsersList
      : []

    const rows = users
      .map((entry) => {
        const command = readPath(entry, ["lastCommand", "command"], "-")
        const commandAt = formatDateTime(readPath(entry, ["lastCommand", "at"], 0))

        return `
          <tr>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["waNumber"], "-"))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["waName"], "-"))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["nickname"], "-"))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc;text-align:right">${Number(readPath(entry, ["coins"], 0)).toLocaleString("pt-BR")}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(command)}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(commandAt)}</td>
          </tr>
        `
      })
      .join("")

    usersSectionEl.style.display = "block"
    usersSectionEl.innerHTML = `
      <section style="margin-top:20px;max-width:980px">
        <details open style="padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
          <summary style="cursor:pointer;font-weight:700">Usuarios registrados (${users.length})</summary>
          <div style="margin-top:10px;overflow:auto">
            <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:12px">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">WhatsApp n</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Nome WhatsApp</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Apelido escolhido</th>
                  <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Coins</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Ultimo comando</th>
                  <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Quando</th>
                </tr>
              </thead>
              <tbody>${rows || "<tr><td colspan='6' style='padding:6px'>Sem usuarios registrados.</td></tr>"}</tbody>
            </table>
          </div>
        </details>
      </section>
    `
  }

  function renderCommands(snapshot) {
    if (!snapshot) {
      commandsSectionEl.style.display = "none"
      return
    }

    const rows = (snapshot.commandHistory || [])
      .slice(-10)
      .map((entry) => {
        return `
          <tr>
            <td style="padding:4px;border-bottom:1px solid #ccc">${formatDateTime(readPath(entry, ["at"], 0))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["command"], "-"))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["senderName"], "-"))}</td>
            <td style="padding:4px;border-bottom:1px solid #ccc">${escapeHtml(readPath(entry, ["groupName"], "-"))}</td>
          </tr>
        `
      })
      .join("")

    commandsSectionEl.style.display = "block"
    commandsSectionEl.innerHTML = `
      <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
        <h3 style="margin:0 0 10px 0">Ultimos 10 comandos</h3>
        <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:12px">
          <thead>
            <tr>
              <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Quando</th>
              <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Comando</th>
              <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Usuario</th>
              <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Grupo</th>
            </tr>
          </thead>
          <tbody>${rows || "<tr><td colspan='4' style='padding:6px'>Sem comandos registrados.</td></tr>"}</tbody>
        </table>
      </section>
    `
  }

  function renderTerminal(snapshot) {
    if (!snapshot) {
      terminalSectionEl.style.display = "none"
      return
    }

    const terminalText =
      (snapshot.terminalLines || [])
        .map((line) => {
          return (
            "[" +
            formatDateTime(readPath(line, ["at"], 0)) +
            "] " +
            readPath(line, ["source"], "log") +
            ": " +
            readPath(line, ["line"], "")
          )
        })
        .join("\n") || "Sem saida capturada ainda."

    terminalSectionEl.style.display = "block"
    terminalSectionEl.innerHTML = `
      <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
        <h3 style="margin:0 0 10px 0">Terminal (somente leitura)</h3>
        <pre style="max-height:260px;overflow:auto;background:#0d1117;color:#c9d1d9;padding:10px;border-radius:8px;font-size:12px;white-space:pre-wrap">${escapeHtml(terminalText)}</pre>
      </section>
    `
  }

  function renderDashboard(payload) {
    const authReady = Boolean(readPath(payload, ["authReady"], false))
    const snapshot = readPath(payload, ["snapshot"], null)

    renderQr(authReady, readPath(payload, ["qrImage"], null))
    renderPerf(snapshot)
    renderRegisteredUsers(snapshot)
    renderCommands(snapshot)
    renderTerminal(snapshot)
  }

  let refreshInFlight = false

  async function refreshDashboard() {
    if (refreshInFlight) return

    refreshInFlight = true
    try {
      const response = await fetch("/dashboard-data", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("HTTP " + response.status)
      }

      const payload = await response.json()
      renderDashboard(payload)

      pollingStatusEl.textContent =
        "Atualizando automaticamente a cada 1000ms. Ultima atualizacao: " +
        new Date().toLocaleTimeString("pt-BR")
    } catch (err) {
      const errMessage = err && err.message ? err.message : err
      pollingStatusEl.textContent =
        "Falha ao atualizar painel: " + String(errMessage)
    } finally {
      refreshInFlight = false
    }
  }

  refreshDashboard()
  setInterval(refreshDashboard, POLLING_MS)
})()
