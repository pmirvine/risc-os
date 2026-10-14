// !Letters loads the fonts of headers and footers before a document's
// first paint (Batch D P6.3, D11/D35: ./Info facts(doc).fonts covers
// the stories): a document whose footer alone uses Cambria has
// Caladea loaded when its window is made; a document without that
// footer does not load Caladea. Each document's windows are watched
// as the task makes them (task.createWindow wrapped, restored after).
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { p, r } from './build-docx.mjs';
import { withHeaders } from './story-fixtures.mjs';

const CAL = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>';
const CAM = '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>';
const body = p(r('The body is in Calibri.', CAL));
const files = {
  Plain: Array.from(await withHeaders(body, { default: { ftr: p(r('A footer in Calibri.', CAL)) } })),
  Foot: Array.from(await withHeaders(body, { default: { ftr: p(r('A footer in Cambria.', CAM)) } })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const s0 = await ev(async (files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [n, b] of Object.entries(files)) os.vfs.writeFile(`RAM::RamDisc0.$.${n}`, new Uint8Array(b), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Letters');
    window.__caladea = () => [...document.fonts].filter((f) => /Caladea/.test(f.family)).map((f) => f.status);
    await os.cli.run('Run ADFS::HardDisc4.$.MoreApps.!Letters');
    for (let i = 0; i < 100 && !window.__word()?.word; i++) await window.__sleep(50);
    return { word: !!window.__word()?.word, caladea: window.__caladea() };
  }, files);
  ok('!Letters starts with no Caladea face on the page', s0.word && s0.caladea.length === 0, s0);

  /** Open leaf: the Caladea faces' status at each window the task
   *  makes while it opens (the first is made before any paint). */
  const openWatch = (leaf) => ev(async (leaf) => {
    const t = window.__word(), real = t.createWindow, seen = [];
    t.createWindow = function (...a) {
      seen.push(window.__caladea().join());
      return real.apply(this, a);
    };
    try {
      const dw = await t.word.open(`RAM::RamDisc0.$.${leaf}`);
      return { opened: !!dw, seen, info: t.word.docs.find((d) => d.leaf === leaf)?.summary ?? null, msgs: window.__msgs };
    } finally {
      t.createWindow = real;
    }
  }, leaf);

  const a = await openWatch('Plain');
  ok('a document whose footer is in Calibri opens without loading Caladea',
    a.opened && a.seen.length > 0 && a.seen.every((s) => s === '') && !a.msgs.length, a);
  const b = await openWatch('Foot');
  ok('a document whose footer alone uses Cambria has Caladea loaded when its first window is made (before the first paint)',
    b.opened && b.seen.length > 0 && /^loaded/.test(b.seen[0]) && b.seen.every((s) => /^loaded/.test(s)), b);
  ok('... its Info names Caladea among its fonts', /Caladea/.test(b.info ?? ''), b.info);
  const c = await ev(() => window.__caladea());
  ok('... the Caladea faces stay loaded', c.length > 0 && c.every((s) => s === 'loaded'), c);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
