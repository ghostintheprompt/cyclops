/**
 * release.js — MDRN Corp Release Script
 * 
 * Automates version tagging and GitHub release preparation.
 */

const shell = require("shelljs");
const pkg = require("../package.json");

console.log(`\n🚀  Releasing Cyclops v${pkg.version}...\n`);

if (!shell.which("git")) {
  console.error("✖  Git not found.");
  process.exit(1);
}

// 1. Tag
const tag = `v${pkg.version}`;
console.log(`🏷️   Tagging ${tag}...`);
const tagResult = shell.exec(`git tag -a ${tag} -m "Release ${tag}"`);

if (tagResult.code !== 0) {
  console.error("Tag creation failed; release stopped.");
  process.exit(1);
}

// 2. Push tags
console.log("📡  Pushing tags...");
if (shell.exec(`git push origin ${tag}`).code !== 0) process.exit(1);

// 3. GitHub Release
if (shell.which("gh")) {
  console.log("📦  Creating GitHub Release...");
  if (shell.exec(`gh release create ${tag} --title "Cyclops ${tag}" --notes "MDRN Corp open-source release."`).code !== 0) process.exit(1);
} else {
  console.error("gh CLI missing; GitHub release not created.");
  process.exit(1);
}

console.log("\n✅  Release complete!\n");
