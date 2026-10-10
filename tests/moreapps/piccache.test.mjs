// PicCache (Batch B, B2.2): the one program-wide cache of decoded
// pictures (plan R4). Node-tested with a fake decode and fake bitmaps
// whose close() is a spy.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createPicCache, picView, CACHE, decodeSize, bucketOf}
  from '../../tools/moreapps/!Word/PicCache';

/** A fake bitmap w x h with a close spy. */
const bitmap = (w = 10, h = 10) => {
  const b = {width: w, height: h, closed: 0};
  b.close = () => { b.closed++; };
  return b;
};

/** A decode whose promises the test resolves or rejects by hand. */
function manual() {
  const calls = [];
  const decode = (bytes, mime, info) => new Promise((res, rej) => {
    calls.push({bytes, mime, info, res, rej});
  });
  return {calls, decode};
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INFO = {w: 10, h: 10};
const bytesN = (n) => Array.from({length: n}, () => new Uint8Array(4));

describe('PicCache', () => {
  it('decodes once', async () => {
    const m = manual();
    const c = createPicCache({decode: m.decode});
    const b = new Uint8Array(8);
    let a1 = 0, a2 = 0;
    assert.equal(c.get(b, 'image/png', INFO, () => a1++).state,
      'pending');
    assert.equal(c.get(b, 'image/png', INFO, () => a2++).state,
      'pending');
    assert.equal(m.calls.length, 1);
    assert.deepEqual(c.stats(), {count: 0, bytes: 0, pending: 1,
      decodes: 1});
    const bm = bitmap();
    m.calls[0].res(bm);
    await tick();
    assert.equal(a1, 1);
    assert.equal(a2, 1);
    const r = c.get(b, 'image/png', INFO, () => a1++);
    assert.equal(r.state, 'ready');
    assert.equal(r.bitmap, bm);
    assert.equal(m.calls.length, 1);
    assert.deepEqual(c.stats(), {count: 1, bytes: 400, pending: 0,
      decodes: 1});
    assert.equal(a1, 1, 'a hit calls no onReady');
  });

  it('lru', async () => {
    const bms = [];
    const c = createPicCache({recent: 0, decode: async () => {
      const b = bitmap(); bms.push(b); return b;
    }});
    const bs = bytesN(33);
    for (const b of bs.slice(0, 32)) c.get(b, 'image/png', INFO);
    await tick();
    // the second is used again: the first is now the oldest
    assert.equal(c.get(bs[1], 'image/png', INFO).state, 'ready');
    c.get(bs[32], 'image/png', INFO);
    await tick();
    assert.equal(c.stats().count, 32);
    assert.equal(bms[0].closed, 1);
    assert.ok(bms.slice(1).every((b) => b.closed === 0));
    assert.equal(c.get(bs[1], 'image/png', INFO).state, 'ready');
    // the first again: decoded anew
    assert.equal(c.get(bs[0], 'image/png', INFO).state, 'pending');
    assert.equal(c.stats().decodes, 34);
  });

  it('bytes cap', async () => {
    const big = () => bitmap(5000, 4194);   // 83,880,000 bytes
    const made = [];
    const c = createPicCache({recent: 0, decode: async () => {
      const b = big(); made.push(b); return b;
    }});
    const [x, y] = bytesN(2);
    c.get(x, 'image/png', INFO);
    await tick();
    c.get(y, 'image/png', INFO);
    await tick();
    assert.equal(made[0].closed, 1);
    assert.equal(made[1].closed, 0);
    assert.deepEqual(c.stats(), {count: 1, bytes: 5000 * 4194 * 4,
      pending: 0, decodes: 2});
    assert.equal(c.get(y, 'image/png', INFO).state, 'ready');
  });

  it('in view is kept: no decode loop over 32 pictures', async () => {
    let t = 0, n = 0;
    const c = createPicCache({now: () => t, decode: async () => {
      n++; return bitmap();
    }});
    const bs = bytesN(40);
    const paint = () => bs.map((b) => c.get(b, 'image/png', INFO).state);
    paint();
    await tick();
    t += 16;
    assert.ok(paint().every((s) => s === 'ready'), '40 in view held');
    assert.equal(n, 40);
    for (let i = 0; i < 5; i++) { t += 16; paint(); await tick(); }
    assert.equal(n, 40, 'repaints decode nothing');
    assert.equal(c.stats().count, 40);
    // scrolled away: the next decode makes room down to the caps
    t += 5000;
    c.get(new Uint8Array(1), 'image/png', INFO);
    await tick();
    assert.equal(c.stats().count, 32);
    c.clear();
  });

  it('at twice the bytes cap: deferred, then retried', async () => {
    let n = 0;
    const c = createPicCache({recent: 30, decode: async () => {
      n++; return bitmap(4096, 4096);   // 64 MB each
    }});
    const BIG = {w: 4096, h: 4096};
    const bs = bytesN(6);
    const st = bs.map((b) => c.get(b, 'image/png', BIG).state);
    await tick();
    assert.equal(n, 4, 'four fit in twice the cap');
    assert.deepEqual(st.slice(4), ['deferred', 'deferred']);
    assert.equal(c.stats().bytes, 4 * 67108864);
    let again = 0;
    const more = new Uint8Array(1);
    assert.equal(c.get(more, 'image/png', BIG, () => again++).state,
      'deferred');
    assert.equal(n, 4, 'no decode started while over');
    // the four go out of view: within `recent` ms the refused one is
    // told to ask again, and then fits
    await sleep(80);
    assert.equal(again, 1);
    assert.ok(c.stats().bytes <= 134217728, 'trimmed by the timer');
    assert.equal(c.get(more, 'image/png', BIG).state, 'pending');
    assert.equal(n, 5);
    c.clear();
  });

  it('a timed trim: back to the caps without a new decode', async () => {
    const bms = [];
    const c = createPicCache({recent: 30, decode: async () => {
      const b = bitmap(); bms.push(b); return b;
    }});
    const keep = bytesN(40);
    for (const b of keep) c.get(b, 'image/png', INFO);
    await tick();
    assert.equal(c.stats().count, 40, 'all in view: held');
    await sleep(100);
    assert.equal(c.stats().count, 32);
    assert.equal(bms.filter((b) => b.closed).length, 8);
    c.clear();
  });

  it('a bitmap whose bytes are gone is dropped first', {skip:
    typeof globalThis.gc !== 'function' && 'needs node --expose-gc'},
  async () => {
    const c = createPicCache({recent: 0, decode: async () => bitmap()});
    (() => { c.get(new Uint8Array(8), 'image/png', INFO); })();
    await tick();
    globalThis.gc();
    await sleep(10);
    c.get(new Uint8Array(8), 'image/png', INFO);
    await tick();
    assert.equal(c.stats().count, 1);
  });

  it('decoded at about the size shown (a power of two)', async () => {
    const asked = [];
    const c = createPicCache({decode: async (b, m, i, o) => {
      asked.push(o);
      return o ? bitmap(o.resizeWidth, o.resizeHeight)
        : bitmap(i.w, i.h);
    }});
    const PHOTO = {w: 4032, h: 3024};
    const photos = bytesN(6);
    for (const b of photos) c.get(b, 'image/jpeg', PHOTO, null, 150);
    await tick();
    assert.deepEqual(asked[0], {resizeWidth: 256, resizeHeight: 192,
      resizeQuality: 'medium'});
    assert.ok(c.stats().bytes < 6 * 256 * 192 * 4 + 1, 'six stay small');
    // shown bigger: decoded once more, the bigger replaces the smaller
    const old = c.get(photos[0], 'image/jpeg', PHOTO, null, 150).bitmap;
    let r = c.get(photos[0], 'image/jpeg', PHOTO, null, 900);
    assert.equal(r.state, 'ready', 'the small one meanwhile');
    assert.equal(r.bitmap, old);
    c.get(photos[0], 'image/jpeg', PHOTO, null, 1000);
    assert.equal(asked.length, 7, 'one decode for the bigger bucket');
    assert.equal(asked[6].resizeWidth, 1024);
    await tick();
    r = c.get(photos[0], 'image/jpeg', PHOTO, null, 900);
    assert.equal(r.bitmap.width, 1024);
    assert.equal(old.closed, 1);
    // smaller again: the bigger one serves, no decode
    c.get(photos[0], 'image/jpeg', PHOTO, null, 100);
    assert.equal(asked.length, 7);
    // never past the picture's own size, nor 4096
    c.get(photos[1], 'image/jpeg', PHOTO, null, 100000);
    assert.equal(asked[7], null, 'its own size');
    const small = new Uint8Array(2);
    c.get(small, 'image/png', {w: 40, h: 20}, null, 1000);
    assert.equal(asked[8], null);
    assert.equal(bucketOf({w: 40, h: 20}, 5), 32);
    assert.equal(bucketOf({w: 4032, h: 3024}), 4032);
    assert.equal(bucketOf({w: 8000, h: 100}, 100000), 4096);
    assert.equal(bucketOf({w: 4032, h: 3024}, 300), 512);
  });

  it('failed is remembered', async () => {
    let n = 0, ready = 0;
    const c = createPicCache({decode: async () => {
      n++; throw new Error('bad');
    }});
    const b = new Uint8Array(3);
    assert.equal(c.get(b, 'image/png', INFO, () => ready++).state,
      'pending');
    await tick();
    assert.equal(c.get(b, 'image/png', INFO).state, 'failed');
    assert.equal(c.get(b, 'image/png', INFO).state, 'failed');
    assert.equal(n, 1);
    assert.equal(ready, 1, 'onReady also after a failure (repaint)');
    assert.equal(c.stats().pending, 0);
  });

  it('a decode that throws at once is a failure too', () => {
    const c = createPicCache({decode: () => { throw new Error('x'); }});
    const b = new Uint8Array(3);
    assert.equal(c.get(b, 'image/png', INFO).state, 'failed');
    assert.equal(c.get(b, 'image/png', INFO).state, 'failed');
    assert.equal(c.stats().decodes, 1);
  });

  it('clear closes all', async () => {
    const bms = [];
    const m = manual();
    const c = createPicCache({decode: (...a) => {
      if (bms.length < 3) {
        const b = bitmap(); bms.push(b); return Promise.resolve(b);
      }
      return m.decode(...a);
    }});
    const bs = bytesN(4);
    for (const b of bs) c.get(b, 'image/png', INFO);
    await tick();
    c.clear();
    assert.ok(bms.every((b) => b.closed === 1));
    assert.deepEqual(c.stats(), {count: 0, bytes: 0, pending: 0,
      decodes: 4});
    // one still decoding when cleared: its bitmap is closed on arrival
    const late = bitmap();
    m.calls[0].res(late);
    await tick();
    assert.equal(late.closed, 1);
    assert.equal(c.stats().count, 0);
  });

  it('decodeSize: at most 4096 a side, proportions kept', () => {
    assert.equal(decodeSize({w: 100, h: 50}), null);
    assert.deepEqual(decodeSize({w: 8192, h: 2048}),
      {resizeWidth: 4096, resizeHeight: 1024,
        resizeQuality: 'medium'});
    assert.deepEqual(decodeSize({w: 1000, h: 16384}),
      {resizeWidth: 250, resizeHeight: 4096,
        resizeQuality: 'medium'});
    assert.deepEqual(decodeSize({w: 1, h: 16384}),
      {resizeWidth: 1, resizeHeight: 4096, resizeQuality: 'medium'});
  });

  it('picView: get over the one CACHE with its own onReady', () => {
    const v = picView(() => {});
    assert.equal(typeof v.get, 'function');
    assert.equal(typeof CACHE.stats().decodes, 'number');
  });
});

describe('PicCache: a closed document lets go (A6)', () => {
  it('forget closes the bitmap and frees its bytes; a running ' +
    'decode closes its bitmap when it ends', async () => {
    const m = manual();
    const c = createPicCache({decode: m.decode});
    const [a, b] = bytesN(2);
    c.get(a, 'image/png', INFO);
    c.get(b, 'image/png', INFO);
    const bm = bitmap();
    m.calls[0].res(bm);
    await tick();
    assert.equal(c.stats().count, 1);
    c.forget(a);
    assert.equal(bm.closed, 1);
    assert.deepEqual([c.stats().count, c.stats().bytes], [0, 0]);
    c.forget(b);                       // still decoding
    const late = bitmap();
    m.calls[1].res(late);
    await tick();
    assert.equal(late.closed, 1);
    assert.deepEqual([c.stats().count, c.stats().pending], [0, 0]);
    c.forget(new Uint8Array(1));       // unknown: nothing
    assert.equal(c.get(a, 'image/png', INFO).state, 'pending',
      'asked again: decoded again');
  });

  it('releasePics: the closed document\'s parts, not those an open ' +
    'one shares', async () => {
    const {releasePics} = await import(
      '../../tools/moreapps/!Word/PicRelease');
    const m = manual();
    const c = createPicCache({decode: m.decode});
    const [own, shared, other] = bytesN(3);
    const bms = [bitmap(), bitmap(), bitmap()];
    for (const x of [own, shared, other]) c.get(x, 'image/png', INFO);
    m.calls.forEach((q, i) => q.res(bms[i]));
    await tick();
    const doc = {parts: new Map([['word/media/image1.png', own],
      ['word/media/image2.png', shared]])};
    const open = {parts: new Map([['word/media/image1.png', shared],
      ['word/media/image2.png', other]])};
    releasePics(doc, [doc, open], c);
    assert.deepEqual(bms.map((x) => x.closed), [1, 0, 0]);
    assert.equal(c.stats().count, 2);
  });
});
