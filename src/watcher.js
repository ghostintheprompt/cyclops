/**
 * watcher.js — Auto-Polish File Watcher
 *
 * Monitors your frontend source directory. On file save:
 *   1. Waits 2 s for hot-reload to settle
 *   2. Re-captures all configured routes to screenshots/current_state/
 *   3. Logs "📸 UI updated!" so AI assistants know new screenshots are ready
 *
 * Usage:
 *   npm run qa:watch
 *   node src/watcher.js --watch ../my-app/src
 *
 * Configuration (in .env or CLI):
 *   WATCH_DIR   Directory to monitor  (default: ../  — watches whole sibling project)
 *   TARGET_URL  Base URL              (default: http://localhost:3000)
 */

require("dotenv").config();
const chokidar  = require("chokidar");
const path      = require("path");
const { captureAll } = require("../flows/web/capture");
const { ensureDirs }  = require("./utils");

// ── Config ─────────────────────────────────────────────────────────────────────

const watchArg = (() => {
  const idx = process.argv.indexOf("--watch");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const WATCH_DIR = path.resolve(path.resolve(__dirname, ".."), watchArg || process.env.WATCH_DIR || "../");  // parent dir as safe default

const DEBOUNCE_MS  = parseInt(process.env.DEBOUNCE_MS  || "2000", 10);
const HOT_RELOAD_S = parseInt(process.env.HOT_RELOAD_S || "2",    10);

// Ignore patterns — don't re-trigger on the screenshots we just wrote
const IGNORED = [
  /node_modules/,
  /\.git/,
  /screenshots/,
  /\.DS_Store/,
  /\.png$/,
  /\.jpg$/,
  /\.gif$/,
];

// ── State ─────────────────────────────────────────────────────────────────────

let debounceTimer = null;
let isCapturing   = false;
let captureCount  = 0;

// ── Watch Loop ────────────────────────────────────────────────────────────────

async function triggerCapture(changedFile) {
  if (isCapturing) return;   // don't queue — just let the current run finish
  isCapturing = true;
  captureCount += 1;

  const rel = path.relative(WATCH_DIR, changedFile);
  console.log(`\n  💾  Change detected: ${rel}`);
  console.log(`  ⏳  Waiting ${HOT_RELOAD_S}s for hot-reload…`);

  await new Promise((res) => setTimeout(res, HOT_RELOAD_S * 1000));

  console.log(`  📸  Capturing current state…`);
  try {
    const results = await captureAll("current");
    const ok  = results.filter((r) => r.ok);
    const bad = results.filter((r) => !r.ok);
    if (!ok.length) throw new Error("No screenshots captured; UI review was not updated");

    console.log(
      `\n  📸  UI updated! New screenshot${ok.length !== 1 ? "s" : ""} saved for AI review.`
    );
    console.log(
      `      ${ok.length} captured in screenshots/current_state/` +
      (bad.length ? `  (${bad.length} failed — is the server running?)` : "")
    );
    console.log(`      Run #${captureCount} complete. Watching for next save…\n`);
  } catch (err) {
    console.error(`  ✖  Capture error: ${err.message}`);
  } finally {
    isCapturing = false;
  }
}

function startWatcher() {
  ensureDirs();

  console.log(`\n👁  Cyclops Auto-Polish Watcher`);
  console.log(`    Watching: ${WATCH_DIR}`);
  console.log(`    Output:   screenshots/current_state/`);
  console.log(`    Debounce: ${DEBOUNCE_MS}ms after last save`);
  console.log(`\n    Waiting for file changes… (Ctrl+C to stop)\n`);

  const watcher = chokidar.watch(WATCH_DIR, {
    ignored: IGNORED,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  const handler = (filePath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerCapture(filePath), DEBOUNCE_MS);
  };

  watcher
    .on("change", handler)
    .on("add",    handler)
    .on("error",  (err) => console.error("  ✖  Watcher error:", err));

  process.on("SIGINT", () => {
    console.log("\n\n  👋  Watcher stopped.\n");
    watcher.close();
    process.exit(0);
  });
}

startWatcher();
