/**
 * differ.js — Visual Diff Engine
 *
 * Compares before/after PNG pairs using pixelmatch and writes highlighted
 * diff images to screenshots/diffs/.
 *
 * Usage (standalone):
 *   node src/differ.js
 *
 * Returns an array of per-screen diff results that the orchestrator consumes.
 */

const fs   = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default;
// pixelmatch@7+ ships ESM-only (package.json "type": "module"); Node's CJS
// interop puts the real function on .default, not on the module object itself.
const { DIRS, ensureDirs, label } = require("./utils");

/**
 * Compare a single before/after pair.
 *
 * @param {string} name   Screen name, e.g. "home"
 * @returns {{ name, mismatch, diffPath, beforePath, afterPath, skipped, reason }}
 */
function diffScreen(name) {
  const beforePath = path.join(DIRS.before, `${name}.png`);
  const afterPath  = path.join(DIRS.after,  `${name}.png`);
  const diffPath   = path.join(DIRS.diffs,  `${name}_diff.png`);

  if (!fs.existsSync(beforePath)) {
    return { name, mismatch: 0, diffPath, beforePath, afterPath,
             skipped: true, reason: "no baseline — run `npm run qa:baseline` first" };
  }
  if (!fs.existsSync(afterPath)) {
    return { name, mismatch: 0, diffPath, beforePath, afterPath,
             skipped: true, reason: "no 'after' screenshot for this screen" };
  }

  const imgBefore = PNG.sync.read(fs.readFileSync(beforePath));
  const imgAfter  = PNG.sync.read(fs.readFileSync(afterPath));

  // Handle dimension mismatches by padding to the maximum dimensions
  const maxWidth = Math.max(imgBefore.width, imgAfter.width);
  const maxHeight = Math.max(imgBefore.height, imgAfter.height);

  let dataBefore = imgBefore.data;
  let dataAfter = imgAfter.data;

  if (imgBefore.width !== maxWidth || imgBefore.height !== maxHeight) {
    const paddedBefore = new PNG({ width: maxWidth, height: maxHeight });
    PNG.bitblt(imgBefore, paddedBefore, 0, 0, imgBefore.width, imgBefore.height, 0, 0);
    dataBefore = paddedBefore.data;
  }

  if (imgAfter.width !== maxWidth || imgAfter.height !== maxHeight) {
    const paddedAfter = new PNG({ width: maxWidth, height: maxHeight });
    PNG.bitblt(imgAfter, paddedAfter, 0, 0, imgAfter.width, imgAfter.height, 0, 0);
    dataAfter = paddedAfter.data;
  }

  const diffImg = new PNG({ width: maxWidth, height: maxHeight });

  const mismatch = pixelmatch(
    dataBefore,
    dataAfter,
    diffImg.data,
    maxWidth,
    maxHeight,
    {
      threshold: 0.1,        // tolerance per channel (0–1); 0.1 catches real changes, ignores antialiasing
      includeAA: false,      // don't flag anti-aliased pixels
      alpha: 0.3,            // fade unchanged pixels so diffs pop visually
      diffColor: [255, 0, 80],   // hot-pink diff markers — easy to spot in PR screenshots
      aaColor:   [255, 165, 0],  // orange for anti-aliasing regions
    }
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diffImg));

  return { name, mismatch, diffPath, beforePath, afterPath, skipped: false };
}

/**
 * Diff all screens that have an "after" screenshot.
 * @returns {Array} results array
 */
function diffAll(names) {
  ensureDirs();

  // Collect screen names from the "after" directory
  const afterFiles = fs.existsSync(DIRS.after)
    ? fs.readdirSync(DIRS.after).filter((f) => f.endsWith(".png"))
    : [];

  if (afterFiles.length === 0) {
    console.log("  ⚠  No screenshots found in screenshots/after/");
    console.log("     Run `npm run qa:capture` first.\n");
    return [];
  }

  const results = [];

  for (const file of afterFiles.filter(f => !names || names.includes(f.slice(0, -4)))) {
    const name = file.replace(".png", "");
    const result = diffScreen(name);

    if (result.skipped) {
      console.log(`  ⏭  ${label(name)}  (skipped: ${result.reason})`);
    } else if (result.mismatch < 0) {
      console.log(`  ⚠  ${label(name)}  ${result.reason}`);
    } else if (result.mismatch === 0) {
      console.log(`  ✅  ${label(name)}  pixel-perfect — no changes`);
    } else {
      const pct = ((result.mismatch / (result.mismatch + 1)) * 100).toFixed(2);
      console.log(`  🔴  ${label(name)}  ${result.mismatch.toLocaleString()} px changed`);
    }

    results.push(result);
  }

  return results;
}

if (require.main === module) {
  console.log("\n🔬  Cyclops Diff Engine\n");
  const results = diffAll();
  const changed = results.filter((r) => !r.skipped && r.mismatch > 0);
  console.log(`\n    ${changed.length} screen(s) with visual changes.\n`);
}

module.exports = { diffScreen, diffAll };
