/**
 * capture.js — Playwright Capture Engine
 *
 * Launches headless Chromium, navigates a set of named routes, and saves
 * full-page screenshots. Designed to be called by the orchestrator or watcher,
 * but can also be run directly:
 *
 *   node flows/web/capture.js --output after
 *   node flows/web/capture.js --output current_state
 *
 * Configuration lives in .env (see .env.example).
 *
 * Environment variables:
 *   TARGET_URL   Base URL of the running dev server (default: http://localhost:3000)
 *   ROUTES       JSON array of {name, path} objects (default: home screen only)
 *                e.g. '[{"name":"home","path":"/"},{"name":"settings","path":"/settings"}]'
 *   VIEWPORT_W   Viewport width  (default: 1280)
 *   VIEWPORT_H   Viewport height (default: 800)
 */

require("dotenv").config();
const { chromium } = require("playwright");
const path = require("path");
const { DIRS, ensureDirs, label, checkServerStatus } = require("../../src/utils");

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL    = process.env.TARGET_URL  || "http://localhost:3000";
const VIEWPORT_W  = parseInt(process.env.VIEWPORT_W  || "1280", 10);
const VIEWPORT_H  = parseInt(process.env.VIEWPORT_H  || "800",  10);

const DEFAULT_ROUTES = [{ name: "home", path: "/" }];
let ROUTES;
try {
  ROUTES = process.env.ROUTES
    ? JSON.parse(process.env.ROUTES)
    : DEFAULT_ROUTES;
} catch {
  console.error("⚠  ROUTES env var is not valid JSON — falling back to home only.");
  ROUTES = DEFAULT_ROUTES;
}

// ── CLI arg: --output <folder-key>  (before | after | current_state) ──────────

const outputArg = (() => {
  const idx = process.argv.indexOf("--output");
  return idx !== -1 ? process.argv[idx + 1] : "after";
})();

// ── Capture ───────────────────────────────────────────────────────────────────

async function captureAll(outputKey = outputArg) {
  const isUp = await checkServerStatus(BASE_URL);
  if (!isUp) {
    console.error(`\n  ✖  Cannot reach ${BASE_URL}.`);
    console.error(`     Please ensure your dev server is running before capturing.\n`);
    return [];
  }

  if (!Array.isArray(ROUTES) || !ROUTES.length || ROUTES.some(route =>
    !route || typeof route.name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(route.name) ||
    typeof route.path !== "string" || !route.path.startsWith("/") || route.path.startsWith("//")) ||
    new Set(ROUTES.map(route => route.name)).size !== ROUTES.length) {
    throw new Error("ROUTES must contain unique safe names and same-origin paths");
  }
  const outputDir = DIRS[outputKey] || DIRS.after;
  ensureDirs();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error("✖  Failed to launch Chromium:", err.message);
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  });

  const results = [];

  for (const route of ROUTES) {
    const url      = `${BASE_URL}${route.path}`;
    const filename = `${route.name}.png`;
    const outPath  = path.join(outputDir, filename);

    const page = await context.newPage();
    try {
      console.log(`  📷  ${label(route.name)} → ${url}`);
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
      if (!response || !response.ok()) throw new Error(`HTTP capture failed: ${response?.status()}`);

      // Optional: wait for a custom ready signal if configured
      if (process.env.WAIT_FOR_READY_SIGNAL === "true") {
        const readyTimeout = parseInt(process.env.READY_TIMEOUT || "5000", 10);
        console.log(`  ⏳  Waiting up to ${readyTimeout}ms for window.__cyclops_ready...`);
        await page.waitForFunction(() => window.__cyclops_ready === true, { timeout: readyTimeout }).catch(() => {
          console.log(`  ⚠  Ready signal timed out, proceeding with capture.`);
        });
      }

      await page.screenshot({ path: outPath, fullPage: true });
      results.push({ route: route.name, path: outPath, ok: true });
    } catch (err) {
      const isConnRefused =
        err.message.includes("ERR_CONNECTION_REFUSED") ||
        err.message.includes("net::ERR_");

      if (isConnRefused) {
        console.error(`\n  ✖  Cannot reach ${url}`);
        console.error(`     Is your dev server running on ${BASE_URL}?`);
        console.error(`     Start it, then re-run this script.\n`);
      } else {
        console.error(`  ✖  ${label(route.name)} failed: ${err.message}`);
      }
      results.push({ route: route.name, path: outPath, ok: false, error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  return results;
}

// ── Standalone entry ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log(`\n🎬  Cyclops Capture Engine`);
    console.log(`    Target:   ${BASE_URL}`);
    console.log(`    Output:   screenshots/${outputArg}/`);
    console.log(`    Routes:   ${ROUTES.map((r) => r.name).join(", ")}\n`);

    const results = await captureAll(outputArg);
    if (results.length === 0) process.exit(1);
    
    const ok  = results.filter((r) => r.ok).length;
    const bad = results.filter((r) => !r.ok).length;

    console.log(`\n    ✅  ${ok} captured   ❌  ${bad} failed\n`);
    process.exit(bad > 0 ? 1 : 0);
  })();
}

module.exports = { captureAll };
