/**
 * onboard.js — Cyclops Repo Importer Wizard
 *
 * Automates onboarding of a new target repo:
 *  1. Clones the repo into projects/
 *  2. Detects the framework (Flutter, React, etc.)
 *  3. Scaffolds initial Cyclops configuration
 */

require("dotenv").config();
const { execFileSync } = require("node:child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline/promises");
const { DIRS, ensureDirs, updateEnv } = require("./utils");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});


async function start() {
  console.log("\n🚀  Cyclops Repo Importer Wizard\n");

  const repoUrl = await rl.question("📋  Enter a GitHub URL (or path to local repo): ");
  if (!repoUrl) {
    console.log("✖  No URL provided. Aborting.");
    process.exit(0);
  }

  // Extract repo name for directory
  const repoName = repoUrl
    .split("/")
    .pop()
    .replace(".git", "") || "unknown-project";

  if (!/^[a-zA-Z0-9_.-]+$/.test(repoName) || repoName === "." || repoName === "..") {
    throw new Error("Repository name must be a safe directory name");
  }
  const targetPath = path.join(DIRS.projects, repoName);

  ensureDirs();

  if (fs.existsSync(targetPath)) {
    console.log(`\n⚠️   Directory already exists: ${targetPath}`);
    const overwrite = await rl.question("    Overwrite? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("    Aborting.");
      process.exit(0);
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  console.log(`\n📡  Cloning ${repoName}...`);
  execFileSync("git", ["clone", "--depth", "1", "--", repoUrl, targetPath], { stdio: "inherit" });

  console.log(`✅  Cloned into projects/${repoName}`);

  // ── Framework Detection ───────────────────────────────────────────────────

  console.log("\n🔍  Analyzing framework...");
  let framework = "Unknown";
  let defaultPort = "3000";

  if (fs.existsSync(path.join(targetPath, "pubspec.yaml"))) {
    framework = "Flutter";
    defaultPort = "8080";
  } else if (fs.existsSync(path.join(targetPath, "package.json"))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(targetPath, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["react-native"]) {
      framework = "React Native";
      defaultPort = "8081";
    } else if (deps["next"] || deps["react"] || deps["vue"] || deps["svelte"]) {
      framework = "Web App (" + (deps["next"] ? "Next.js" : deps["react"] ? "React" : "Vue/Svelte") + ")";
      defaultPort = deps["vite"] ? "5173" : (deps["next"] ? "3000" : "3000");
    }
  }

  console.log(`✨  Detected: ${framework}`);
  
  console.log("\n⚙️  Configuration");
  const port = await rl.question(`    What port does your dev server run on? [${defaultPort}]: `);
  const finalPort = port.trim() || defaultPort;
  const targetUrl = `http://localhost:${finalPort}`;
  
  updateEnv("TARGET_URL", targetUrl);
  updateEnv("WATCH_DIR", `projects/${repoName}`);
  
  console.log(`\n✅  Automatically configured .env:`);
  console.log(`      TARGET_URL = ${targetUrl}`);
  console.log(`      WATCH_DIR  = projects/${repoName}`);

  console.log("\n🏁  Next Steps:");
  console.log(`    1. Open a new terminal and start your dev server in projects/${repoName}`);
  console.log("    2. Return to the Command Center to Auto-Map Screens");

  console.log("\n🎉  Onboarding complete!\n");
  rl.close();
}

start().catch((err) => {
  console.error("\n✖  Wizard error:", err.message);
  process.exit(1);
});
