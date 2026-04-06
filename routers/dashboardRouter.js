const express = require("express")
const fs = require("fs")
const path = require("path")
const { execFile } = require("child_process")
const { renderSimpleDashboardPage, renderFullDashboardPage } = require("../services/dashboardPageService")

function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function shouldServeSimpleDashboard(req, env = process.env) {
  const paramSimple = String(req.query?.simple || "").trim().toLowerCase()
  const envToggle = String(env.SIMPLE_DASHBOARD || env.SERVE_SIMPLE_PAGE || "").trim().toLowerCase()
  const isSimple = [paramSimple, envToggle].some((value) => value === "1" || value === "true" || value === "yes")
  return {
    isSimple,
    paramSimple,
    envToggle,
  }
}

function logDashboardHeaders(route, req) {
  try {
    console.log(`GET ${route} - headers:`, {
      accept: req.headers.accept,
      referer: req.headers.referer,
      "user-agent": req.headers["user-agent"],
      host: req.headers.host,
    })
  } catch (error) {
    // no-op
  }
}

function registerDashboardRoutes(app, options = {}) {
  const getDashboardPayload = typeof options.getDashboardPayload === "function"
    ? options.getDashboardPayload
    : () => ({ authReady: false, qrImage: null, snapshot: null })
  const getDashboardDebugPayload = typeof options.getDashboardDebugPayload === "function"
    ? options.getDashboardDebugPayload
    : () => ({ authReady: false, hasQr: false, qrLength: 0 })
  const baseDir = String(options.baseDir || process.cwd())
  const staticDir = String(options.staticDir || path.join(baseDir, "public"))

  app.use("/public", express.static(staticDir))

  app.get("/profiler-data", (req, res) => {
    logDashboardHeaders("/profiler-data", req)
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.json(getDashboardPayload())
  })

  app.get("/dashboard-data", (req, res) => {
    logDashboardHeaders("/dashboard-data", req)
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.json(getDashboardPayload())
  })

  app.get("/dashboard-debug", (req, res) => {
    res.json(getDashboardDebugPayload())
  })

  app.get("/download-data", async (req, res) => {
    const dataDir = path.join(baseDir, ".data")
    if (!fs.existsSync(dataDir)) {
      res.status(404).json({ ok: false, error: "data-folder-not-found" })
      return
    }

    const tmpZip = path.join(baseDir, `vitin-bot-data-${Date.now()}.zip`)
    try {
      if (process.platform === "win32") {
        await execFileAsync("powershell.exe", [
          "-NoProfile",
          "-Command",
          `Compress-Archive -Path \"${path.join(dataDir, "*")}\" -DestinationPath \"${tmpZip}\" -Force`,
        ])
      } else {
        await execFileAsync("tar", ["-czf", tmpZip, "-C", baseDir, ".data"])
      }

      res.download(tmpZip, "vitin-bot-data.zip", () => {
        fs.unlink(tmpZip, () => {})
      })
    } catch (err) {
      fs.unlink(tmpZip, () => {})
      console.error("Erro ao gerar export da pasta .data", err)
      res.status(500).json({ ok: false, error: "export-failed" })
    }
  })

  app.get("/", (req, res) => {
    const { isSimple, paramSimple, envToggle } = shouldServeSimpleDashboard(req)
    console.log(`[Dashboard] Request for /, simple param: "${paramSimple}", env toggle: "${envToggle}", isSimple: ${isSimple}`)

    if (isSimple) {
      console.log("Serving simple dashboard page (simple mode active). paramSimple=", paramSimple, "env=", envToggle)
      res.send(renderSimpleDashboardPage())
      return
    }

    res.send(renderFullDashboardPage())
  })
}

module.exports = {
  registerDashboardRoutes,
}
