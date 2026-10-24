const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/orchestrator.js'), 'utf8');
function harness({ captures = [{ route: 'home', ok: true }], results, env = {}, fail } = {}) {
  const commands = [], copies = [];
  const changed = results || [{ name: 'home', mismatch: 3, beforePath: `${root}/screenshots/before/home.png`, afterPath: `${root}/screenshots/after/home.png`, diffPath: `${root}/screenshots/diffs/home_diff.png` }];
  const module = { exports: {} };
  const fakeFs = { mkdirSync() {}, copyFileSync(a,b) { copies.push([a,b]); }, mkdtempSync() { return '/tmp/cyclops-test'; }, writeFileSync() {}, rmSync() {} };
  const modules = {
    dotenv: { config() {} },
    'node:child_process': { execFileSync(cmd,args) {
      commands.push([cmd,...args]);
      if (fail && fail(cmd,args)) throw new Error('forced command failure');
      if (args[0] === 'branch') return 'main\n';
      if (args[0] === 'rev-parse') return 'same-sha\n';
      return '';
    } },
    'node:path': path, 'node:fs': fakeFs, 'node:os': os,
    '../flows/web/capture': { captureAll: async () => captures },
    './differ': { diffAll: names => { assert.deepEqual(Array.from(names), ['home']); return changed; } },
    './utils': { ROOT: root, timestamp: () => 'test' }
  };
  vm.runInNewContext(source, { require: Object.assign(name => modules[name], { main: null }), module, process: { env }, console: { log() {}, error() {} } });
  return { ...module.exports, commands, copies };
}
test('incomplete captures fail before comparison or git', async () => {
  const h = harness({ captures: [{ route: 'home', ok: false }] });
  await assert.rejects(h.runPipeline(), /Capture incomplete/); assert.equal(h.commands.length,0);
});
test('missing reference fails rather than reporting clean', async () => {
  const h=harness({ results: [{ skipped: true }] });
  await assert.rejects(h.runPipeline(), /Baseline incomplete/); assert.equal(h.commands.length,0);
});
test('unset repository keeps comparison local', async () => {
  const h=harness(); await h.runPipeline(); assert.equal(h.commands.length,0); assert.equal(h.copies.length,0);
});
test('git failure prevents commit and push', async () => {
  const h=harness({ env: { GITHUB_REPO: 'owner/repo' }, fail: (cmd,args) => args[0] === 'fetch' });
  await assert.rejects(h.runPipeline(), /forced/);
  assert.ok(!h.commands.some(c => c.includes('commit') || c.includes('push')));
});
test('publish preserves old reference, stages ignored images, and updates baseline', async () => {
  const h=harness({ env: { GITHUB_REPO: 'owner/repo' } }); await h.runPipeline();
  assert.equal(h.copies.length,2);
  assert.ok(h.copies[0][1].endsWith('/review-before/home.png'));
  assert.ok(h.copies[1][1].endsWith('/before/home.png'));
  const add=h.commands.find(c => c[1] === 'add');
  assert.ok(add.includes('-f')); assert.ok(add.includes('screenshots/before/home.png'));
  const body=h.buildPRBody([{ name:'home',mismatch:3,beforePath:`${root}/screenshots/review-before/home.png`,afterPath:`${root}/screenshots/after/home.png`,diffPath:`${root}/screenshots/diffs/home.png` }], 'owner/repo','codex/review');
  assert.match(body,/raw.githubusercontent.com\/owner\/repo\/codex%2Freview/);
});
test('real pixel comparison detects changed pixels, skips missing baseline, and filters stale routes', () => {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cyclops-diff-'));
  const { DIRS }=require('../src/utils'); const original={...DIRS};
  try {
    for (const key of Object.keys(DIRS)) DIRS[key]=path.join(temporary,key);
    require('../src/utils').ensureDirs();
    const image=new PNG({width:8,height:8}); image.data.fill(255);
    fs.writeFileSync(path.join(DIRS.before,'home.png'),PNG.sync.write(image));
    fs.writeFileSync(path.join(DIRS.after,'home.png'),PNG.sync.write(image));
    const {diffScreen,diffAll}=require('../src/differ');
    assert.equal(diffScreen('home').mismatch,0);
    for(let i=0;i<image.data.length;i+=4) { image.data[i]=0;image.data[i+1]=0;image.data[i+2]=0; }
    fs.writeFileSync(path.join(DIRS.after,'home.png'),PNG.sync.write(image));
    fs.writeFileSync(path.join(DIRS.after,'stale.png'),PNG.sync.write(image));
    assert.equal(diffScreen('home').mismatch,64);
    assert.equal(diffScreen('missing').skipped,true);
    assert.deepEqual(diffAll(['home']).map(r=>r.name),['home']);
  } finally { Object.assign(DIRS,original);fs.rmSync(temporary,{recursive:true,force:true}); }
});
test('release metadata loads and tag failure prevents push', () => {
  const script=fs.readFileSync(path.join(root,'src/release.js'),'utf8'); const commands=[];
  const sentinel=new Error('exit');
  assert.throws(() => vm.runInNewContext(script, { require(name) {
    if(name === '../package.json') return { version:'1.0.0' };
    if(name === 'shelljs') return { which:()=>true, exec:cmd=>{ commands.push(cmd); return {code:1}; } };
    throw new Error(`unexpected import: ${name}`);
  },console:{log(){},error(){}},process:{exit(){throw sentinel;}} }),error=>error===sentinel);
  assert.equal(commands.length,1); assert.match(commands[0],/^git tag /);
});
