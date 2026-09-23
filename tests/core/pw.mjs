// Shared Playwright helper for core tests. Finds playwright in the project's node_modules, or
// via PLAYWRIGHT_MODULE, and uses the cached Chromium headless shell when present.
import fs from 'fs';
import path from 'path';
import os from 'os';
async function loadPW() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const c of cands) { try { return await import(c); } catch { /* next */ } }
  throw new Error('playwright not found: npm i -D playwright or set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs');
}
export async function launch({ width = 1024, height = 768, zoom = 1 } = {}) {
  const { chromium } = await loadPW();
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  let executablePath;
  try {
    const d = fs.readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().pop();
    if (d) { const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); if (fs.existsSync(p)) executablePath = p; }
  } catch { /* default */ }
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: zoom });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
  return { browser, page, logs };
}
export const BASE_URL = process.env.URL ?? 'http://localhost:8371/';
export const SHOTS = path.join(path.dirname(new globalThis.URL(import.meta.url).pathname), '..', 'screens');
