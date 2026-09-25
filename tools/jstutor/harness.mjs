// Runs the tutorial's example programs in the desktop, for tests/jstutor (do they run cleanly and print what
// they should?) and tools/jstutor/shots.mjs (screenshots for the book). prepare() first copies the programs from
// tools/jstutor/examples/ into $.Examples.JS in the page (so the disc needn't be rebuilt). The runs are listed
// in tools/jstutor/runs/*.json (one file per chapter), each an array of:
//   { "run": "Hello",            program, below $.Examples.JS ("Doodle3.Main", "!Snake" ...)
//     "args": "",                command tail
//     "input": ["Ann"],          answers for input()
//     "expect": ["Hello, Ann"],  text that print() must have produced
//     "act": "...",              JavaScript run in the page once it has started, with w (its first window), W (all
//                                its windows), t (its task), click(x, y, button), key(code or char), sleep(ms)
//     "wait": 600,               ms to wait after starting (and again after act)
//     "shot": "Hello",           tools/jstutor/pics/<shot>.png: its windows (shots.mjs)
//     "shotAll": false,          the whole screen instead
//     "realErrors": true }       show error boxes (for a screenshot of one) instead of collecting them
// An entry without "run" only does its "act" (e.g. opening !Edit on an example for a picture).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleFiles } from './examplefiles.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNS = path.join(ROOT, 'tools/jstutor/runs');
export const list = () => fs.readdirSync(RUNS).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')).map((e) => ({ ...e, from: f })));

export async function prepare(page) {
  const files = exampleFiles().map((f) => ({ parts: f.parts, dir: !!f.dir, type: f.type ? parseInt(f.type, 16) : 0, b64: f.data?.toString('base64') }));
  await page.evaluate((files) => {
    const base = 'ADFS::HardDisc4.$.Examples.JS';
    os.vfs.mkdir(base, { parents: true });
    for (const f of files) {
      const p = `${base}.${f.parts.join('.')}`;
      if (f.dir) { os.vfs.mkdir(p); continue; }
      os.vfs.writeFile(p, Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)), { filetype: f.type });
    }
  }, files);
  await page.evaluate(() => {
    window.__jt = { msgs: [], out: '', real: false };
    const W = os.wimp, orig = W.reportError.bind(W);
    W.reportError = (m, o) => { if (__jt.real) return orig(m, o); __jt.msgs.push(`${m} [${o?.appName ?? ''}]`); return Promise.resolve(1); };
    os.hooks.jsOutput = (task, t) => { __jt.out += t; };
  });
}

/** Run one example; resolves {msgs, out, rect (of its windows)}; leaves it running (call finish()). */
export async function runExample(page, e) {
  await page.evaluate(async (e) => {
    __jt.msgs = []; __jt.out = ''; __jt.real = !!e.realErrors;
    __jt.before = new Set(os.wimp.tasks);
    __jt.beforeWins = new Set(os.wimp.stack);
    os.hooks.jsInput = [...(e.input ?? [])];
    if (e.run) await os.cli.run(`Run ADFS::HardDisc4.$.Examples.JS.${e.run}${e.args ? ' ' + e.args : ''}`).catch((err) => __jt.msgs.push('CLI: ' + err.message));
  }, e);
  await page.waitForTimeout(e.wait ?? 600);
  if (e.act) {
    await page.evaluate(async (e) => {
      const tasks = os.wimp.tasks.filter((x) => !__jt.before.has(x));
      const t = tasks[tasks.length - 1];
      const W = tasks.flatMap((x) => [...x.windows]);
      const w = W.find((x) => !x._jsOutput) ?? W[0];
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const click = (x, y, button = 'select', win = w) => win.emit('click', { button, x, y, sx: x, sy: y, window: win, icon: null });
      const key = (k, win = w) => win.emit('key', typeof k === 'number' ? { code: k, char: String.fromCharCode(k) } : { code: k.charCodeAt(0), char: k });
      // eslint-disable-next-line no-new-func
      await new Function('w', 'W', 't', 'click', 'key', 'sleep', 'os', `return (async () => { ${e.act} })()`)(w, W, t, click, key, sleep, os);
    }, e);
    await page.waitForTimeout(e.wait ?? 600);
  }
  return page.evaluate(() => {
    const tasks = os.wimp.tasks.filter((x) => !__jt.before.has(x));
    // its windows, and any other windows opened meanwhile (error boxes, menus, Edit ...), except the backdrop
    const wins = new Set([...tasks.flatMap((x) => [...x.windows]), ...os.wimp.stack.filter((w) => !__jt.beforeWins.has(w))]);
    const rects = [...wins].filter((w) => w.isOpen && !w._isIconbar).map((w) => w.el.getBoundingClientRect());
    const rect = rects.length ? { x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)), x1: Math.max(...rects.map((r) => r.right)), y1: Math.max(...rects.map((r) => r.bottom)) } : null;
    return { msgs: __jt.msgs, out: __jt.out, rect, tasks: tasks.map((x) => x.name) };
  });
}

/** Quit whatever the last example started. */
export async function finish(page) {
  await page.evaluate(() => {
    for (const t of os.wimp.tasks.filter((x) => !__jt.before.has(x))) t.quit();
    for (const w of os.wimp.stack.filter((x) => !__jt.beforeWins.has(x) && x.isOpen && !x._isIconbar)) { try { w.close(); } catch { /* */ } }
    os.wimp.menus?.close?.();
    __jt.real = false;
  });
}
