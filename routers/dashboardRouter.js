const express = require("express")
const fs = require("fs")
const path = require("path")
const { execFile } = require("child_process")
const { renderSimpleDashboardPage, renderFullDashboardPage } = require("../services/dashboardPageService")



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
    //logDashboardHeaders("/profiler-data", req)
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.json(getDashboardPayload())
  })

  app.get("/dashboard-data", (req, res) => {
    //logDashboardHeaders("/dashboard-data", req)
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.json(getDashboardPayload())
  })

  app.get("/dashboard-debug", (req, res) => {
    res.json(getDashboardDebugPayload())
  })



  app.get("/", (req, res) => {
    const { isSimple } = shouldServeSimpleDashboard(req)
    res.send(isSimple ? renderSimpleDashboardPage() : renderFullDashboardPage())
  })
}

module.exports = {
  registerDashboardRoutes,
}
