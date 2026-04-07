function buildDownloadDataSection() {
  return `
    <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
      <h3 style="margin:0 0 10px 0">Download de dados</h3>
      <a href="/download-data" style="display:inline-block;padding:8px 12px;background:#0f766e;color:white;border-radius:6px;text-decoration:none">Baixar .data</a>
    </section>
  `
}

function renderSimpleDashboardPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>VIRJENS DASHBOARD</title>
  </head>
  <body style="font-family:Segoe UI,Arial,sans-serif;padding:16px">
    <section style="max-width:980px">
      <h2 style="margin:0 0 8px 0">VIRJENS</h2>
      <p id="polling-status" style="margin:0 0 12px 0;color:#555">Atualizando automaticamente a cada 1000ms.</p>
    </section>

    <section id="qr-section" style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px;display:none"></section>

${buildDownloadDataSection()}

    <script src="/public/dashboard-simple.js" defer></script>
  </body>
</html>`
}

function renderFullDashboardPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>VIRJENS Dashboard</title>
  </head>
  <body style="font-family:Segoe UI,Arial,sans-serif;padding:16px">
    <section style="max-width:980px">
      <h2 style="margin:0 0 8px 0">Painel VIRJENS</h2>
      <p id="polling-status" style="margin:0 0 12px 0;color:#555">Atualizando automaticamente a cada 1000ms.</p>
    </section>

    <section id="qr-section" style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px;display:none"></section>
    <section id="perf-section" style="display:none"></section>
    <section id="users-section" style="display:none"></section>
    <section id="commands-section" style="display:none"></section>
    <section id="terminal-section" style="display:none"></section>

${buildDownloadDataSection()}

    <script src="/public/dashboard-full.js" defer></script>
  </body>
</html>`
}

module.exports = {
  renderSimpleDashboardPage,
  renderFullDashboardPage,
}
