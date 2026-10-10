// !Word's pictures drawn in the real desktop (Batch B, B2.2): a PNG, a
// JPEG and a GIF drawn from their bitmaps (PicCache, createImageBitmap),
// a floating picture outlined dashed, an EMF part and a missing part as
// labelled boxes; only pictures in view are decoded, each once (the
// task.word.pics counters); 1000 pictures open in under 2 s; at 200%
// a picture is twice as wide on screen; a window closed while a
// decode runs gives no error; a closed window's bitmaps are let go.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';
import { picDocx, pngBytes, jpegBytes, gifBytes } from './pic-fixtures.mjs';
import { p, r } from './build-docx.mjs';

const RED = [220, 20, 30];
const EMF = new Uint8Array([1, 0, 0, 0, 0x6c, 0, 0, 0, ...new Array(80).fill(0)]);
const HALF = 457200;                   // 0.5 in in EMU (48 px)
const PICS = [
  { bytes: pngBytes(40, 20, { rgb: RED }), cx: 1828800, cy: 914400 },     // 2 in x 1 in
  { bytes: jpegBytes(1, 1), ext: 'jpeg', cx: HALF, cy: HALF },
  { bytes: gifBytes(10, 10), ext: 'gif', cx: HALF, cy: HALF },
  { bytes: pngBytes(8, 8, { rgb: RED }), kind: 'anchor', cx: 914400, cy: HALF },
  { bytes: EMF, ext: 'emf', cx: 914400, cy: HALF },
  { bytes: null, cx: 914400, cy: HALF },
];
const many = (n, rgb) => picDocx({ pics: Array.from({ length: n }, (_, i) =>
  ({ bytes: pngBytes(4 + (i % 5), 4, { rgb }), cx: HALF, cy: HALF })) });
const files = {
  Pics: Array.from(await picDocx({ pics: PICS, body: p(r('The end.')) })),
  Many: Array.from(await many(1000, [0, 90, 200])),
  Photo: Array.from(await picDocx({ pics: [{ bytes: pngBytes(1000, 1000, { rgb: [200, 0, 200] }), cx: HALF, cy: HALF }] })),
  Late: Array.from(await picDocx({ pics: [{ bytes: pngBytes(600, 600, { rgb: [10, 200, 10] }) }] })),
};

const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v && !process.env.DETAIL ? '' : ' ' + JSON.stringify(detail).slice(0, 900)}`);
const { browser, page, logs } = await launch();
const ev = (fn, arg) => page.evaluate(fn, arg);

/** Boot, put the files on the RAM disc, the helpers. */
async function start() {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await ev((files) => {
    window.__msgs = [];
    globalThis.__riscos.reportError = (m) => { window.__msgs.push(String(m)); return Promise.resolve(1); };
    for (const [k, v] of Object.entries(files)) os.vfs.writeFile('RAM::RamDisc0.$.' + k, new Uint8Array(v), { filetype: 0xA7E });
    window.__sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    window.__frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    window.__word = () => os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    window.__doc = (title) => window.__word()?.word.docs.find((d) => d.win.title === title);
    /** No decode running, and the window drawn after it. */
    window.__settle = async () => {
      for (let i = 0; i < 200 && window.__word().word.pics.pending; i++) await window.__sleep(20);
      await window.__frames(3);
    };
    /** Every picture item: its box in layout px. */
    window.__pics = (d) => {
      const L = d.view.layout || d.view.L, res = [];
      for (const it of L.items) {
        for (const ln of it.lines || []) {
          for (const x of ln.items) {
            if (x.kind !== 'pic') continue;
            const base = it.y + ln.y + ln.base;
            res.push({ x: L.left + x.x, y: base - x.pic.h, w: x.pic.w, h: x.pic.h, floating: x.pic.floating, alt: x.pic.alt });
          }
        }
      }
      return res;
    };
    /** Canvas pixel [r, g, b] at layout point x, y of d's window. */
    window.__px = (d, x, y) => {
      const w = d.win, cv = w._canvas, k = cv.width / w.w, z = d.view.zoom, t = (d.view.layout || d.view.L).top;
      const sx = x * z, sy = t + (y - t) * z;
      const q = cv.getContext('2d').getImageData(Math.floor((sx - w.scrollX) * k), Math.floor((sy - w.scrollY) * k), 1, 1).data;
      return [q[0], q[1], q[2]];
    };
    /** The pictures whose box is in d's window now (indices). */
    window.__inView = (d) => {
      const w = d.win, z = d.view.zoom, t = (d.view.layout || d.view.L).top;
      const y0 = t + (w.scrollY + t - t) / z, y1 = t + (w.scrollY + w.h - t) / z;
      return window.__pics(d).map((b, i) => (b.y + b.h > y0 && b.y < y1 ? i : -1)).filter((i) => i >= 0);
    };
  }, files);
}

const red = (c) => c[0] > 180 && c[1] < 70 && c[2] < 70;
const grey = (c) => Math.abs(c[0] - 128) < 24 && Math.abs(c[1] - 128) < 24 && Math.abs(c[2] - 128) < 24;

try {
  await start();
  // ---------------------------------------------------- one of each
  const a = await ev(async () => {
    const t = window.__word() ?? null;
    const before = t ? t.word.pics.decodes : 0;
    await os.filer.run('RAM::RamDisc0.$.Pics');
    for (let i = 0; i < 100 && !window.__doc('Pics'); i++) await window.__sleep(50);
    const d = window.__doc('Pics');
    d.win.open({ x: 100, y: 40, w: 860, h: 900, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__settle();
    const b = window.__pics(d), word = window.__word().word;
    const mid = (i) => window.__px(d, b[i].x + b[i].w / 2, b[i].y + b[i].h / 2);
    // the anchor's top edge, 1 px above its box: dashes and gaps
    const an = b[3], edge = [];
    for (let x = Math.round(an.x) + 2; x < an.x + an.w - 2; x++) edge.push(window.__px(d, x + 0.5, Math.round(an.y) - 0.5));
    const dark = edge.filter((c) => c[0] < 160 && Math.abs(c[0] - c[2]) < 30).length;
    const light = edge.filter((c) => c[0] > 230 && c[1] > 230).length;
    // ink inside the EMF box and the missing box (the label), at its left
    const ink = (bx) => {
      let n = 0;
      for (let y = bx.y + 3; y < bx.y + bx.h - 3; y++) for (let x = bx.x + 3; x < bx.x + Math.min(bx.w, 140); x++) {
        const c = window.__px(d, x, y);
        if (c[0] < 200) n++;
      }
      return n;
    };
    const inView = window.__inView(d);
    return { n: b.length, boxes: b, inView, png: mid(0), jpeg: mid(1), gif: mid(2), anchor: mid(3), dark, light,
      emf: ink(b[4]), missing: ink(b[5]), emfMid: mid(4), decodes: word.pics.decodes - before, stats: word.pics, msgs: window.__msgs };
  });
  ok('the document opens with six pictures, all in view', a.n === 6 && a.inView.length === 6 && !a.msgs.length, a);
  ok('the PNG is drawn: red at its centre', red(a.png), a.png);
  ok('the JPEG and the GIF are drawn (their grey)', grey(a.jpeg) && grey(a.gif), [a.jpeg, a.gif]);
  ok('the floating PNG is drawn, its edge dashed', red(a.anchor) && a.dark >= 4 && a.light >= 4, a);
  ok('the EMF box and the missing box show their labels', a.emf > 10 && a.missing > 10 && !red(a.emfMid), a);
  ok('decodes: the decodable pictures in view (3 + the anchor)', a.decodes === 4 && a.stats.count >= 4 && a.stats.pending === 0, a);
  // repaints are cache hits
  const rp = await ev(async () => {
    const d = window.__doc('Pics'), word = window.__word().word, n = word.pics.decodes;
    for (let i = 0; i < 5; i++) { d.win.invalidate(); await window.__frames(2); }
    return { more: word.pics.decodes - n };
  });
  ok('repainting decodes nothing more', rp.more === 0, rp);

  // ---------------------------------------------------- 200%
  const z = await ev(async () => {
    const d = window.__doc('Pics'), w = d.win;
    const row = () => {
      const b = window.__pics(d)[0], cv = w._canvas, k = cv.width / w.w, zz = d.view.zoom, t = d.view.layout.top;
      const sy = t + (b.y + b.h / 2 - t) * zz;
      const px = cv.getContext('2d').getImageData(0, Math.floor((sy - w.scrollY) * k), cv.width, 1).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 180 && px[i + 1] < 70 && px[i + 2] < 70) n++;
      return n / k;
    };
    const at100 = row();
    d.setZoom(200);
    await window.__frames(4);
    w.scrollTo(0, 0);
    await window.__settle();
    const at200 = row();
    d.setZoom(100);
    await window.__frames(4);
    return { at100, at200, decodes: window.__word().word.pics };
  });
  ok('at 200% the picture is twice as wide on screen', Math.abs(z.at100 - 192) <= 2 && Math.abs(z.at200 - 384) <= 3, z);

  // ---------------------------------------------------- 1000 pictures
  const m = await ev(async () => {
    const word = window.__word().word, n0 = word.pics.decodes;
    const t0 = performance.now();
    const d = await word.open('RAM::RamDisc0.$.Many');
    d.win.open({ x: 120, y: 40, w: 860, h: 700, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(1);
    const ms = performance.now() - t0;
    await window.__settle();
    const first = window.__inView(d);
    const decodes = word.pics.decodes - n0;
    // scroll down over 100 pictures, a window at a time
    const seen = new Set(first);
    const b = window.__pics(d), stop = b[first.length + 100].y;
    for (let i = 0; i < 40 && d.win.scrollY < stop; i++) {
      d.win.scrollTo(0, d.win.scrollY + d.win.h / 2);
      await window.__frames(2);
      await window.__settle();
      for (const k of window.__inView(d)) seen.add(k);
    }
    const scrolled = word.pics.decodes - n0;
    for (let i = 0; i < 5; i++) { d.win.invalidate(); await window.__frames(2); }
    const again = word.pics.decodes - n0 - scrolled;
    // those scrolled away are let go by the timed trim (no decode)
    await window.__sleep(2200);
    return { ms, n: b.length, first: first.length, decodes, seen: seen.size, scrolled, again, stats: word.pics };
  });
  ok('1000 pictures open in under 2 s', m.n === 1000 && m.ms < 2000, m);
  ok('... decoding only those in the first screen', m.decodes > 0 && m.decodes <= m.first, m);
  ok('scrolling 100 pictures into view decodes each once', m.seen >= 100 && m.scrolled === m.seen && m.again === 0, m);
  ok('a timed trim brings the cache back to 32 bitmaps', m.stats.count <= 32, m.stats);

  // ---------------------------------------------------- 100 in view
  const v = await ev(async () => {
    const word = window.__word().word, d = window.__doc('Many');
    d.setZoom(10);
    await window.__frames(4);
    d.win.scrollTo(0, 0);
    await window.__frames(2);
    await window.__settle();
    await window.__settle();
    const inView = window.__inView(d).length, n = word.pics.decodes;
    for (let i = 0; i < 10; i++) { d.win.invalidate(); await window.__frames(2); }
    const more = word.pics.decodes - n;
    // every one in view drawn: blue at its centre
    const b = window.__pics(d), blue = window.__inView(d).filter((i) => {
      const c = window.__px(d, b[i].x + b[i].w / 2, b[i].y + b[i].h / 2);
      return c[2] > 150 && c[0] < 60;
    }).length;
    d.setZoom(100);
    await window.__frames(4);
    return { inView, more, blue, stats: word.pics };
  });
  ok('100 pictures in view: drawn, and repaints decode nothing (no decode loop past 32)', v.inView >= 100 && v.more === 0
    && v.blue === v.inView && v.stats.count >= v.inView, v);

  // ---------------------------------------------------- decoded small
  const ph = await ev(async () => {
    const word = window.__word().word, s0 = word.pics;
    const d = await word.open('RAM::RamDisc0.$.Photo');
    d.win.open({ x: 160, y: 40, w: 700, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    await window.__frames(2);
    await window.__settle();
    const s1 = word.pics;
    d.setZoom(400);
    await window.__frames(3);
    {
      const q = window.__pics(d)[0], t = d.view.L.top;
      d.win.scrollTo(Math.max(0, q.x * 4 - 40), Math.max(0, (q.y - t) * 4 - 20));
    }
    await window.__frames(3);
    await window.__settle();
    const s2 = word.pics;
    for (let i = 0; i < 3; i++) { d.win.invalidate(); await window.__frames(2); }
    const s3 = word.pics, b = window.__pics(d)[0], mid = window.__px(d, b.x + b.w / 2, b.y + b.h / 2);
    d.close();
    return { one: s1.decodes - s0.decodes, bytes: s1.bytes - s0.bytes, two: s2.decodes - s1.decodes, three: s3.decodes - s2.decodes, mid };
  });
  ok('a 1000 x 1000 picture shown 48 px wide is decoded at 64 x 64', ph.one === 1 && ph.bytes === 64 * 64 * 4, ph);
  ok('at 400% it is decoded once more, bigger, and drawn', ph.two === 1 && ph.three === 0 && ph.mid[0] > 150 && ph.mid[1] < 60, ph);

  // ---------------------------------------------------- close
  const c = await ev(async () => {
    const word = window.__word().word;
    await window.__sleep(2200);        // (the timed trim done)
    const many = window.__doc('Many'), count0 = word.pics.count;
    many.dw.close();
    await window.__frames(3);
    const afterClose = word.pics.count;
    // closed while its decode runs
    const d = await word.open('RAM::RamDisc0.$.Late');
    d.win.open({ x: 140, y: 40, w: 600, h: 500, behind: 'top', scrollX: 0, scrollY: 0 });
    let redraws = 0;
    const f = d.win.invalidate.bind(d.win);
    await window.__frames(1);
    const pend = word.pics.pending;
    d.close();
    d.win.invalidate = (...a) => { redraws++; return f(...a); };
    await window.__settle();
    await window.__sleep(100);
    return { count0, afterClose, pend, redraws, stats: word.pics, open: word.docs.map((x) => x.leaf), msgs: window.__msgs };
  });
  ok('A6: closing a window lets its bitmaps go at once (not at the next decode)', c.count0 > 0 && c.afterClose < c.count0, c);
  ok('a window closed while decoding: no redraw asked, no error', c.redraws === 0 && c.stats.pending === 0
    && !c.open.includes('Late') && !c.msgs.length, c);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
await browser.close();
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR|^error:/.test(l));
if (errs.length) console.log(errs.join('\n'));
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
