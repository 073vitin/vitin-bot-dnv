(() => {
  const POLLING_MS = 1000
  const pollingStatusEl = document.getElementById("polling-status")
  const qrSectionEl = document.getElementById("qr-section")

  if (!pollingStatusEl || !qrSectionEl) return

  async function refreshSimple() {
    try {
      const response = await fetch("/dashboard-data", { cache: "no-store" })
      if (!response.ok) throw new Error("HTTP " + response.status)

      const payload = await response.json()
      const authReady = Boolean(payload.authReady)
      const qrImage = payload.qrImage || null

      if (!authReady && qrImage) {
        qrSectionEl.style.display = "block"
        qrSectionEl.innerHTML =
          "<h3 style='margin:0 0 10px 0'>Escaneie o QR Code</h3>" +
          "<img src='" + qrImage + "' style='max-width:320px;width:100%;height:auto'>"
      } else {
        qrSectionEl.style.display = "block"
        qrSectionEl.innerHTML =
          "<h3 style='margin:0'>" +
          (authReady ? "Bot conectado" : "Aguardando autenticacao") +
          "</h3>"
      }

      pollingStatusEl.textContent =
        "Atualizando automaticamente a cada 1000ms. Ultima atualizacao: " +
        new Date().toLocaleTimeString("pt-BR")
    } catch (err) {
      pollingStatusEl.textContent =
        "Falha ao atualizar painel: " +
        (err && err.message ? err.message : err)
      qrSectionEl.style.display = "none"
    }
  }

  refreshSimple()
  setInterval(refreshSimple, POLLING_MS)
})()
