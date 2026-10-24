<p align="center">
  <img src="public/icon.png" width="520" alt="Cyclops Icon">
</p>

# Cyclops

**Visual Regression & App Store Screenshot Engine — v1.0**

Free. Open-source. No subscriptions. No telemetry. Built by [MDRN Corp](https://mdrn.app).

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Platform: Node.js](https://img.shields.io/badge/Platform-Node.js-green.svg)](https://nodejs.org)
[![Release: v1.0.0](https://img.shields.io/badge/Release-v1.0.0-orange.svg)](https://github.com/ghostintheprompt/cyclops/releases)

---

Cyclops automates the most tedious parts of app development: verifying visual integrity across updates and generating high-fidelity screenshots for App Store listings. It follows same-origin HTML links in a running web app, captures configured routes, and renders screenshots in a CSS phone silhouette. Native app navigation is not supported.

| Feature | Description |
|---------|-------------|
| **Auto-Discovery** | Follows same-origin HTML links, up to 50 pages and three link levels. Routes behind forms, authentication or button-only navigation require manual configuration. |
| **Visual Regression** | Diffs new captures against a baseline to catch UI bugs instantly. |
| **Pro-Framer** | Wraps raw screenshots in sleek device frames with beautiful backgrounds. |
| **GitOps Integration** | Automatically opens GitHub PRs with side-by-side visual diffs. |
| **AI Polish Loop** | A file watcher saves screenshots for an external assistant to review. Cyclops does not call an AI model or modify UI code. |

---

## Installation

```bash
git clone https://github.com/ghostintheprompt/cyclops
cd cyclops
npm install
npx playwright install chromium
```

## Usage

The easiest way to use Cyclops is through the interactive **Command Center**. Just run:

```bash
npm start
```

This will guide you through:
1. **Importing** a project from GitHub.
2. **Discovering** linked web routes in that project.
3. **Generating** professional App Store shots with device frames.
4. **Auditing** visual regressions with full GitHub PR support.

---

## Command Reference

While `npm start` is recommended, you can run individual modules:

| Command | Action |
|---------|--------|
| `npm run qa:import` | Onboard a new repo |
| `npm run qa:discover` | Auto-map app routes |
| `npm run qa:capture` | Take raw screenshots |
| `npm run qa:frame` | Apply device frames |
| `npm run qa:watch` | Start AI-polish mode |

---

## Visual audit workflow

Run `npm run qa:capture`, inspect the results, then run `npm run qa:baseline` to establish the initial reference images. Subsequent `npm run qa:run` runs compare only successfully captured configured routes; an incomplete capture or missing baseline fails the audit.

With `GITHUB_REPO` unset, changed images remain local. To publish a baseline-update PR, configure the GitHub repository containing this Cyclops checkout, authenticate `gh`, and start on a clean base branch synchronized with `origin`. The pipeline stops on command failure. It commits captures, diffs, previous reference images and updated baselines on a new branch; merging accepts those baselines. Screenshots become visible to readers of that repository. This is a pixel comparison, not a semantic or accessibility audit. Removing a route from configuration does not report it as a deleted screen.

Run `npm test` for the local regression checks. With Chromium installed, `node test/browser-smoke.js` exercises real capture, framing and an HTTP-error response against a temporary local server.

The framer crops images to fill its screen and produces a fixed 1284 by 2778 PNG with a CSS phone silhouette; it does not certify current App Store submission requirements. The release command tags and publishes a GitHub release and must be run deliberately.

## Privacy Statement
Image processing is local. The command-line pipeline does not call an AI service. The dashboard can check target-server availability; the update-check helper, when invoked, contacts GitHub. All screenshots are captured and processed on your machine. No images or telemetry are ever uploaded to external servers, except for GitHub if you explicitly configure PR creation.

---

Built by **MDRN Corp** — [mdrn.app](https://mdrn.app)  
Read the full article: [One Eye on Everything](https://ghostintheprompt.com/articles/cyclops)
