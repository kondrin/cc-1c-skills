#!/usr/bin/env node
// build-webtest-db v0.1 — Собирает синтетическую web-test конфигурацию в постоянные пути
// и накатывает её в зарегистрированную базу `webtest` (см. .v8-project.json).
//
// Usage:
//   node tests/skills/build-webtest-db.mjs                 # пересобрать с нуля
//   node tests/skills/build-webtest-db.mjs --runtime python
//   node tests/skills/build-webtest-db.mjs --skip-platform # только XML, без db-create/load/update
//
// После завершения база готова к /web-publish + web-test сессии.

import { execFile } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';

const ROOT      = resolve(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/i, '$1'));
const REPO_ROOT = resolve(ROOT, '../..');
const SKILLS    = resolve(REPO_ROOT, '.claude/skills');

// ── CLI ────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { runtime: 'powershell', skipPlatform: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--runtime' && argv[i + 1]) { opts.runtime = argv[++i]; continue; }
  if (a === '--skip-platform') { opts.skipPlatform = true; continue; }
  if (a === '-h' || a === '--help') {
    console.log('Usage: build-webtest-db.mjs [--runtime powershell|python] [--skip-platform]');
    process.exit(0);
  }
}

// ── Locate webtest DB in .v8-project.json ──────────────────────────────────────
const projectFile = join(REPO_ROOT, '.v8-project.json');
if (!existsSync(projectFile)) { console.error('.v8-project.json not found'); process.exit(1); }
const proj = JSON.parse(readFileSync(projectFile, 'utf8'));
const webtestDb = proj.databases?.find(d => d.id === 'webtest');
if (!webtestDb) { console.error('Database "webtest" not registered in .v8-project.json'); process.exit(1); }

const v8path  = proj.v8path;
const v8exe   = join(v8path, '1cv8.exe');
const dbPath  = webtestDb.path;
const configSrc = resolve(REPO_ROOT, webtestDb.configSrc);

if (!opts.skipPlatform && !existsSync(v8exe)) {
  console.error(`1cv8.exe not found at ${v8exe}`);
  process.exit(1);
}

// ── Reset target dirs ──────────────────────────────────────────────────────────
console.log(`[build-webtest-db] configSrc: ${configSrc}`);
console.log(`[build-webtest-db] dbPath:    ${dbPath}`);
console.log(`[build-webtest-db] runtime:   ${opts.runtime}`);
console.log('');

if (existsSync(configSrc)) {
  console.log(`Removing existing configSrc...`);
  rmSync(configSrc, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
mkdirSync(configSrc, { recursive: true });

if (!opts.skipPlatform && existsSync(dbPath)) {
  console.log(`Removing existing IB...`);
  rmSync(dbPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// ── Import build steps ─────────────────────────────────────────────────────────
const buildModule = await import(`file://${join(ROOT, 'integration/build-webtest-config.test.mjs').replace(/\\/g, '/')}`);
const buildSteps = buildModule.steps;

// Append platform load steps (same as old platform-webtest-config.test.mjs)
const platformSteps = opts.skipPlatform ? [] : [
  {
    name: 'db-create: создание файловой ИБ',
    script: 'db-create/scripts/db-create',
    args: { '-V8Path': '{v8path}', '-InfoBasePath': '{dbPath}' },
  },
  {
    name: 'db-load-xml: загрузка конфигурации',
    script: 'db-load-xml/scripts/db-load-xml',
    args: { '-V8Path': '{v8path}', '-InfoBasePath': '{dbPath}', '-ConfigDir': '{workDir}' },
  },
  {
    name: 'db-update: обновление БД',
    script: 'db-update/scripts/db-update',
    args: { '-V8Path': '{v8path}', '-InfoBasePath': '{dbPath}' },
  },
];

const allSteps = [...buildSteps, ...platformSteps];

// ── Step executor (mirrors runner.mjs runIntegrationTest) ──────────────────────
function resolveScript(scriptRelPath) {
  const ext = opts.runtime === 'python' ? '.py' : '.ps1';
  const full = join(SKILLS, scriptRelPath + ext);
  if (!existsSync(full)) throw new Error(`Script not found: ${full}`);
  return full;
}

function execSkill(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const cmd = opts.runtime === 'python'
      ? [process.env.PYTHON || 'python', [scriptPath, ...args]]
      : ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]];
    execFile(cmd[0], cmd[1], { encoding: 'utf8', timeout: 120_000, cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(stderr?.trim() || stdout?.trim() || err.message);
        reject(e);
      } else {
        resolve(stdout);
      }
    });
  });
}

const replacePlaceholders = (s) => String(s)
  .replace('{workDir}', configSrc)
  .replace('{v8path}', v8path)
  .replace('{dbPath}', dbPath);

const t0 = Date.now();
let failed = false;

for (let i = 0; i < allSteps.length; i++) {
  const step = allSteps[i];
  const stepT0 = Date.now();

  // writeFile shortcut
  if (step.writeFile) {
    try {
      const target = replacePlaceholders(step.writeFile);
      const abs = target.includes(':') || target.startsWith('/') ? target : join(configSrc, target);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, step.content ?? '', 'utf8');
      const ms = Date.now() - stepT0;
      console.log(`  [${i + 1}/${allSteps.length}] OK  ${step.name}  (${(ms / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.error(`  [${i + 1}/${allSteps.length}] FAIL ${step.name}: ${e.message}`);
      failed = true;
      break;
    }
    continue;
  }

  // Input JSON
  let inputFile = null;
  if (step.input) {
    inputFile = join(configSrc, '__input.json');
    writeFileSync(inputFile, JSON.stringify(step.input, null, 2), 'utf8');
  }

  // Resolve args
  const script = resolveScript(step.script);
  const args = [];
  for (const [flag, value] of Object.entries(step.args || {})) {
    args.push(flag);
    if (value === true) continue;
    let v = String(value).replace('{inputFile}', inputFile || '');
    v = replacePlaceholders(v);
    args.push(v);
  }

  try {
    await execSkill(script, args);
    if (inputFile && existsSync(inputFile)) rmSync(inputFile);
    const ms = Date.now() - stepT0;
    console.log(`  [${i + 1}/${allSteps.length}] OK  ${step.name}  (${(ms / 1000).toFixed(1)}s)`);
  } catch (e) {
    if (inputFile && existsSync(inputFile)) rmSync(inputFile);
    console.error(`  [${i + 1}/${allSteps.length}] FAIL ${step.name}`);
    console.error(`    ${e.message.split('\n').join('\n    ').substring(0, 1500)}`);
    failed = true;
    break;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
if (failed) {
  console.error(`Build FAILED after ${elapsed}s`);
  process.exit(1);
}
console.log(`Build OK (${elapsed}s)`);
console.log('');
console.log(`  configSrc: ${configSrc}`);
if (!opts.skipPlatform) {
  console.log(`  IB:        ${dbPath}`);
  console.log('');
  console.log(`  Next: /web-publish webtest  →  open in browser`);
}
