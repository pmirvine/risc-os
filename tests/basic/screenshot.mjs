// Playwright screenshots of the standalone BASIC page.
// Usage: node tests/basic/screenshot.mjs [program.bas ...]   (server: node serve.mjs)
// Finds playwright via PLAYWRIGHT_MODULE, the project, or the npx cache (~/.npm/_npx).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function loadPW() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  try {
    const npx = path.join(os.homedir(), '.npm/_npx');
    for (const d of fs.readdirSync(npx)) {
      const f = path.join(npx, d, 'node_modules/playwright/index.mjs');
      if (fs.existsSync(f)) cands.push(f);
    }
  } catch { /* none */ }
  for (const c of cands) { try { return await import(c); } catch { /* next */ } }
  throw new Error('playwright not found (npx -y playwright@1 --version to install, or set PLAYWRIGHT_MODULE)');
}
const { chromium } = await loadPW();

const base = process.env.BASE || 'http://localhost:8371/src/basic/demo.html';
const progs = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1020 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

async function shot(url, file, fn) {
  await page.goto(url);
  await page.waitForFunction(() => window.basic && window.basic.vdu);
  if (fn) await fn();
  await page.waitForTimeout(600);
  await page.screenshot({ path: file });
  console.log('saved', file);
}

// 1. the prompt: banner then type a line
await shot(base, 'tests/screens/basic-banner.png', async () => {
  await page.waitForTimeout(300);
  await page.keyboard.type('PRINT "Hello from BBC BASIC V";2^10\n');
  await page.keyboard.type('10 FOR I=1 TO 5:PRINT I,I^2:NEXT\nRUN\n');
  await page.keyboard.type('LIST\n');
});
for (const p of progs) {
  await shot(base + '?run=' + p, `tests/screens/basic-${p.replace(/\.bas$/, '')}.png`, async () => {
    await page.waitForFunction(() => !window.basic.busy, null, { timeout: 60000 }).catch(() => {});
  });
}
await browser.close();
