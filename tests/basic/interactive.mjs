// Drive the demo page like a user: type a program, use copy-key editing, run it, press Escape.
// Usage: node tests/basic/interactive.mjs   (needs `node serve.mjs`)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function loadPW() {
  const cands = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  try {
    const npx = path.join(os.homedir(), '.npm/_npx');
    for (const d of fs.readdirSync(npx)) { const f = path.join(npx, d, 'node_modules/playwright/index.mjs'); if (fs.existsSync(f)) cands.push(f); }
  } catch { /* none */ }
  for (const c of cands) { try { return await import(c); } catch { /* next */ } }
  throw new Error('playwright not found');
}
const { chromium } = await loadPW();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1020 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.BASE || 'http://localhost:8371/src/basic/demo.html') + '?speed=0');
await page.waitForFunction(() => window.basic && window.basic.vdu);
await page.click('#screen');
const type = async (s) => { await page.keyboard.type(s, { delay: 2 }); };
await type('10 MODE 12:OFF\n20 FOR R%=20 TO 500 STEP 20\n30 GCOL R% DIV 20 MOD 15+1\n40 CIRCLE 640,512,R%\n50 NEXT\n');
// copy-key editing: go up to line 40, copy it with a changed radius
await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
for (let i = 0; i < 17; i++) await page.keyboard.press('End'); // copy "40 CIRCLE 640,512"
await type(',R%/2:CIRCLE FILL 640,512,20');
await page.keyboard.press('Enter');
await type('LIST\n');
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/screens/basic-typing.png' });
await type('RUN\n');
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/screens/basic-run.png' });
await type('20 REPEAT:PRINT "loop ";:UNTIL FALSE\nRUN\n');
await page.waitForTimeout(300);
await page.click('#esc');
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/screens/basic-escape.png' });
const text = await page.evaluate(() => window.basic.vdu.textLines().filter((l) => l.trim()).slice(-3).join('\n'));
console.log(text);
console.log('page errors:', errors);
await browser.close();
