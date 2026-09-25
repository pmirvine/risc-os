// Shared Playwright helper for core tests. Finds playwright in the project's node_modules, or
// via PLAYWRIGHT_MODULE, and uses the cached Chromium headless shell when present.
import fs from 'fs';
import path from 'path';
import os from 'os';
async function loadPW() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  try {   // the npx cache (npx -y playwright@1.61 ...), newest 1.61.x first: it matches the cached Chromium
    const npx = path.join(os.homedir(), '.npm/_npx');
    const found = fs.readdirSync(npx).map((d) => path.join(npx, d, 'node_modules/playwright'))
      .filter((d) => fs.existsSync(path.join(d, 'index.mjs')))
      .map((d) => ({ f: path.join(d, 'index.mjs'), v: JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version }));
    found.sort((a, b) => (b.v.startsWith('1.61') - a.v.startsWith('1.61')) || b.v.localeCompare(a.v, undefined, { numeric: true }));
    cands.push(...found.map((x) => x.f));
  } catch { /* no npx cache */ }
  for (const c of cands) { try { return await import(c); } catch { /* next */ } }
  throw new Error('playwright not found: npm i -D playwright or set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs');
}
// Most scripts were written for the two-button mapping (right = Menu, Shift+left = Adjust), so pages start
// with it unless buttons: 'acorn' (the default desktop mapping: right = Adjust, Ctrl+left = Menu) is asked for.
export async function launch({ width = 1024, height = 768, zoom = 1, buttons = process.env.BUTTONS || 'menu' } = {}) {
  const { chromium } = await loadPW();
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  let executablePath;
  try {
    const d = fs.readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().pop();
    if (d) { const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); if (fs.existsSync(p)) executablePath = p; }
  } catch { /* default */ }
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: zoom });
  if (buttons !== 'acorn') {
    await page.addInitScript(() => {
      try {
        const k = 'riscos371.config', v = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {};
        if (!v.rightButton) localStorage.setItem(k, JSON.stringify({ ...v, rightButton: 'menu', buttonsVersion: 2 }));
      } catch { /* no storage */ }
    });
  }
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
  return { browser, page, logs };
}
export const BASE_URL = process.env.URL ?? 'http://localhost:8371/';
export const SHOTS = process.env.SHOTS || path.join(path.dirname(new globalThis.URL(import.meta.url).pathname), '..', 'screens');
