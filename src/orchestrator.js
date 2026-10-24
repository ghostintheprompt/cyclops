/** Capture, compare, and optionally publish a baseline-update PR. */
require('dotenv').config();
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { captureAll } = require('../flows/web/capture');
const { diffAll } = require('./differ');
const { timestamp, ROOT } = require('./utils');

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function repoRelative(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Screenshot is outside the repository');
  return relative;
}
function buildPRBody(results, repo, branch) {
  const image = (file, ref) => `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${repoRelative(file).split('/').map(encodeURIComponent).join('/')}`;
  const rows = results.map(r => `| ${r.name.replaceAll('|', '\\|')} | ${r.mismatch} | ![before](${image(r.beforePath, branch)}) | ![after](${image(r.afterPath, branch)}) | ![diff](${image(r.diffPath, branch)}) |`);
  return `## Visual Regression Report\n\n| Screen | Changed pixels | Before | After | Diff |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nMerge this PR to accept the new visual baseline. The previous baseline is preserved in screenshots/review-before/.\n`;
}
async function runPipeline() {
  const captured = await captureAll('after');
  if (!captured.length || captured.some(r => !r.ok)) throw new Error('Capture incomplete; no comparison or Git operations performed');
  const names = captured.map(r => r.route);
  const results = diffAll(names);
  if (results.length !== names.length || results.some(r => r.skipped)) throw new Error('Baseline incomplete; run npm run qa:baseline before comparing');
  const changed = results.filter(r => r.mismatch > 0);
  if (!changed.length) { console.log('No visual changes detected.'); return; }
  const repo = process.env.GITHUB_REPO || '';
  if (!repo) { console.log(`${changed.length} changed screen(s). GITHUB_REPO is unset; results remain local.`); return; }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('GITHUB_REPO must be owner/repo');
  const base = process.env.BASE_BRANCH || 'main';
  run('git', ['check-ref-format', '--branch', base]);
  if (run('git', ['status', '--porcelain'])) throw new Error('Working tree must be clean before publishing');
  if (run('git', ['branch', '--show-current']) !== base) throw new Error(`Switch to ${base} before publishing`);
  run('gh', ['auth', 'status']);
  run('git', ['fetch', 'origin', base]);
  if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', `origin/${base}`])) throw new Error('Local base differs from origin; synchronize before publishing');
  const branch = `codex/visual-qa-${timestamp()}-${Date.now()}`;
  run('git', ['checkout', '-b', branch]);
  const files = [];
  for (const result of changed) {
    const prior = path.join(ROOT, 'screenshots', 'review-before', `${result.name}.png`);
    fs.mkdirSync(path.dirname(prior), { recursive: true });
    fs.copyFileSync(result.beforePath, prior);
    fs.copyFileSync(result.afterPath, result.beforePath);
    files.push(prior, result.beforePath, result.afterPath, result.diffPath);
    result.beforePath = prior;
  }
  // Captures/diffs are deliberately ignored during normal local operation.
  run('git', ['add', '-f', '--', ...files.map(repoRelative)]);
  run('git', ['commit', '-m', `chore: update visual baseline for ${changed.length} screen(s)`]);
  run('git', ['push', '-u', 'origin', branch]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cyclops-pr-'));
  try {
    const bodyFile = path.join(temporary, 'body.md');
    fs.writeFileSync(bodyFile, buildPRBody(changed, repo, branch));
    const args = ['pr', 'create', '--repo', repo, '--head', branch, '--base', base,
      '--title', `Visual changes: ${changed.map(r => r.name).join(', ')}`, '--body-file', bodyFile];
    if (process.env.PR_LABEL) args.push('--label', process.env.PR_LABEL);
    console.log(run('gh', args));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) runPipeline().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runPipeline, buildPRBody, repoRelative };
