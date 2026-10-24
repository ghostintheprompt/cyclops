/**
 * discover.js — Automated Route Discovery Crawler
 *
 * Navigates a target app, follows internal links, and builds a list
 * of routes for automated screenshot capture.
 *
 * Usage:
 *   npm run qa:discover
 *   node src/discover.js --url http://localhost:3000
 */

require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { ROOT, label, checkServerStatus, updateEnv } = require("./utils");

const BASE_URL = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : process.env.TARGET_URL || "http://localhost:3000";

const MAX_PAGES = 50;
const MAX_DEPTH = 3;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});


/** Generate a friendly filename from a URL path. */
function nameFromPath(p) {
  if (p === "/" || p === "") return "home";
  return p
    .replace(/^\/+/, "") // remove leading slash
    .replace(/\/+$/, "") // remove trailing slash
    .replace(/[^a-z0-9]/gi, "-") // non-alphanumeric to hyphens
    .toLowerCase();
}

async function discover() {
  console.log(`\n🕵️  Cyclops Auto-Discovery Crawler`);
  console.log(`    Target:   ${BASE_URL}`);
  console.log(`    Limit:    ${MAX_PAGES} pages, depth ${MAX_DEPTH}\n`);

  const isUp = await checkServerStatus(BASE_URL);
  if (!isUp) {
    console.log(`  ✖  Cannot reach ${BASE_URL}.`);
    console.log(`     Please ensure your dev server is running before crawling.`);
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error("✖  Failed to launch Chromium:", err.message);
    process.exit(1);
  }

  const context = await browser.newContext();
  const visited = new Set();
  const queue = [{ path: "/", depth: 0 }];
  const routes = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const { path: currentPath, depth } = queue.shift();
    const url = new URL(currentPath, BASE_URL).href;

    if (visited.has(url)) continue;
    visited.add(url);

    const page = await context.newPage();
    try {
      console.log(`  🔗  Crawling: ${currentPath} (Depth ${depth})`);
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 10_000 });
      if (!response || !response.ok()) throw new Error(`HTTP ${response?.status()}`);

      // Record this route
      routes.push({ name: nameFromPath(currentPath), path: currentPath });

      if (depth < MAX_DEPTH) {
        // Find all links on the page
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("a[href]")).map((a) =>
            a.getAttribute("href")
          );
        });

        for (let link of links) {
          // Normalize and filter internal links
          try {
            const linkUrl = new URL(link, url);
            const isInternal = linkUrl.origin === new URL(BASE_URL).origin;
            const cleanPath = linkUrl.pathname + linkUrl.search;

            if (isInternal && !visited.has(linkUrl.href)) {
              // Avoid common non-page links
              if (!cleanPath.match(/\.(png|jpg|jpeg|gif|pdf|zip|css|js)$/i)) {
                queue.push({ path: cleanPath, depth: depth + 1 });
              }
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }
    } catch (err) {
      console.error(`  ✖  Failed to crawl ${currentPath}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  if (routes.length === 0) {
    console.log("\n✖  No routes discovered. Is the server running?");
    process.exit(1);
  }

  console.log(`\n✨  Discovered ${routes.length} routes:\n`);
  routes.forEach((r) => console.log(`    • ${label(r.name, 15)} → ${r.path}`));

  const save = await rl.question("\n💾  Save these routes to your .env? (y/N): ");
  if (save.toLowerCase() === "y") {
    updateEnv("ROUTES", JSON.stringify(routes));
    console.log("\n✅  .env updated! You can now run: npm run qa:capture");
  } else {
    console.log("\n⏭️  Skipped .env update.");
  }

  rl.close();
}

discover().catch((err) => {
  console.error("\n✖  Crawler error:", err.message);
  process.exit(1);
});
