// Letters Light (the Calibri Light stand-in made from Lato Light by
// tools/moreapps-light-font.mjs): both files are TrueType, named
// "Letters Light" with no Lato in the family names, every character in
// the set has the advance recorded in lightfont-widths.json (which
// is Calibri Light's, to rounding), the line metrics match Carlito
// Regular's, kerning/ligatures are gone, and the files stay small.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as FM from '../../tools/moreapps/!Letters/FontMetrics';

const DIR = new URL('../../tools/moreapps/!Letters/Fonts/',
  import.meta.url);
const bytes = (leaf) => new Uint8Array(readFileSync(new URL(leaf, DIR)));
const WIDTHS = JSON.parse(readFileSync(
  new URL('./lightfont-widths.json', import.meta.url), 'utf8'));
// The generator's declared character set (its one-line SET).
const SET = (() => {
  const py = readFileSync(new URL('../../tools/moreapps-light-font.py',
    import.meta.url), 'latin1');
  const m = /^SET = '([^']*)'$/m.exec(py);
  assert.ok(m, 'SET line in moreapps-light-font.py');
  const out = [];
  for (const r of m[1].split(' ')) {
    const [a, b = a] = r.split('-').map((h) => parseInt(h, 16));
    for (let c = a; c <= b; c++) out.push(c);
  }
  return out;
})();
const FACES = [['LettersLight-Regular', 'regular', false],
  ['LettersLight-Italic', 'italic', true]];

const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
function tables(b) {
  const v = dv(b), out = {};
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const r = 12 + i * 16;
    out[String.fromCharCode(...b.subarray(r, r + 4))] =
      {off: v.getUint32(r + 8), len: v.getUint32(r + 12)};
  }
  return out;
}
function names(b, t) {
  const v = dv(b), o = t.name.off, out = new Map();
  for (let i = 0, n = v.getUint16(o + 2); i < n; i++) {
    const r = o + 6 + i * 12;
    if (v.getUint16(r) !== 3) continue;
    const s = o + v.getUint16(o + 4) + v.getUint16(r + 10);
    let str = '';
    for (let k = 0; k < v.getUint16(r + 8); k += 2) {
      str += String.fromCharCode(v.getUint16(s + k));
    }
    out.set(v.getUint16(r + 6), str);
  }
  return out;
}
function cmap(b, t) {   // format 4 subtable (3,1) -> Map cp -> gid
  const v = dv(b), o = t.cmap.off, map = new Map();
  for (let i = 0, n = v.getUint16(o + 2); i < n; i++) {
    const r = o + 4 + i * 8;
    if (v.getUint16(r) !== 3 || v.getUint16(r + 2) !== 1) continue;
    const s = o + v.getUint32(r + 4);
    assert.equal(v.getUint16(s), 4, 'cmap format 4');
    const sc = v.getUint16(s + 6) / 2, endO = s + 14,
      startO = endO + sc * 2 + 2, deltaO = startO + sc * 2,
      rangeO = deltaO + sc * 2;
    for (let k = 0; k < sc; k++) {
      const end = v.getUint16(endO + k * 2),
        start = v.getUint16(startO + k * 2),
        delta = v.getInt16(deltaO + k * 2),
        ro = v.getUint16(rangeO + k * 2);
      for (let c = start; c <= end && c < 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          g = v.getUint16(rangeO + k * 2 + ro + (c - start) * 2);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  }
  return map;
}
function advance(b, t, gid) {
  const v = dv(b), nh = v.getUint16(t.hhea.off + 34);
  return v.getUint16(t.hmtx.off + Math.min(gid, nh - 1) * 4);
}
function featureTags(b, t, tag) {
  if (!t[tag]) return new Set();
  const v = dv(b), o = t[tag].off, f = o + v.getUint16(o + 6),
    out = new Set();
  for (let i = 0, n = v.getUint16(f); i < n; i++) {
    out.add(String.fromCharCode(...b.subarray(f + 2 + i * 6,
      f + 6 + i * 6)));
  }
  return out;
}

describe('Letters Light faces', () => {
  for (const [leaf, key, italic] of FACES) {
    describe(leaf, () => {
      const b = bytes(leaf), t = tables(b), v = dv(b);
      it('is TrueType and under 400 KB', () => {
        assert.equal(v.getUint32(0), 0x00010000);
        assert.ok(b.length < 400 * 1024, `${b.length} bytes`);
      });
      it('is named Letters Light, without Lato in the family names',
        () => {
          const n = names(b, t);
          const style = italic ? 'Italic' : 'Regular';
          assert.equal(n.get(1), 'Letters Light');
          assert.equal(n.get(2), style);
          assert.equal(n.get(4), italic ? 'Letters Light Italic'
            : 'Letters Light');
          assert.equal(n.get(6), `LettersLight-${style}`);
          for (const id of [1, 2, 4, 6]) {
            assert.ok(!/lato/i.test(n.get(id)), `name ${id}`);
          }
          for (const id of [3, 7, 16, 17]) {
            assert.ok(!n.has(id), `name ${id} absent`);
          }
          assert.match(n.get(0), /Lato/);
          assert.match(n.get(0), /Modified/);
          assert.match(n.get(13), /Modified/);
        });
      it('has the italic flag only on Italic', () => {
        const mac = v.getUint16(t.head.off + 44),
          sel = v.getUint16(t['OS/2'].off + 62);
        assert.equal((mac & 2) !== 0, italic);
        assert.equal((sel & 1) !== 0, italic);
        assert.equal((sel & 0x40) !== 0, !italic);
      });
      it('has no kerning, ligatures or contextual alternates', () => {
        assert.ok(!t.kern, 'no kern table');
        for (const tag of ['GSUB', 'GPOS']) {
          const f = featureTags(b, t, tag);
          for (const bad of ['kern', 'liga', 'dlig', 'calt']) {
            assert.ok(!f.has(bad), `${tag} has ${bad}`);
          }
        }
      });
      it('has the recorded advance for every character in the set',
        () => {
          const cm = cmap(b, t), upm = v.getUint16(t.head.off + 18),
            w = WIDTHS[key], cps = Object.keys(w);
          const miss = WIDTHS.missing[key];
          assert.deepEqual([...cps.map(Number), ...miss]
            .sort((x, y) => x - y), SET, 'keys + missing = the set');
          assert.deepEqual(miss, [], 'no character missing');
          for (const cp of cps) {
            const g = cm.get(Number(cp));
            assert.ok(g, `U+${Number(cp).toString(16)} mapped`);
            assert.equal(advance(b, t, g) * 1000 / upm, w[cp],
              `U+${Number(cp).toString(16)}`);
          }
        });
      it('is lighter than Carlito Regular (weight 300, not bold)', () => {
        const c = bytes('Carlito-Regular'), ct = tables(c);
        assert.equal(v.getUint16(t['OS/2'].off + 4), 300);
        assert.equal(dv(c).getUint16(ct['OS/2'].off + 4), 400);
        assert.equal(v.getUint16(t.head.off + 44) & 1, 0, 'macStyle bold');
        assert.equal(v.getUint16(t['OS/2'].off + 62) & 0x20, 0,
          'fsSelection bold');
      });
      it('has line metric ratios equal to Carlito Regular\'s', () => {
        FM.register('LL', false, italic, b);
        FM.register('CR', false, false, bytes('Carlito-Regular'));
        const a = FM.ratiosOf('LL', false, italic),
          c = FM.ratiosOf('CR', false, false);
        assert.ok(Math.abs(a.nat - c.nat) <= 0.001, `${a.nat} ${c.nat}`);
        assert.ok(Math.abs(a.desc - c.desc) <= 0.001);
      });
    });
  }
  it('widths JSON: same set in both faces, on the half-unit grid',
    () => {
      // CI has no Word: Calibri Light's own advances are not stored
      // beside the JSON, which is them rounded to the 2000 unit grid
      // (largest difference 0.25 per mille), so the JSON is what the
      // faces are compared with; check its shape and sanity here.
      assert.deepEqual(Object.keys(WIDTHS.regular),
        Object.keys(WIDTHS.italic));
      for (const k of ['regular', 'italic']) {
        for (const x of Object.values(WIDTHS[k])) {
          assert.ok(x >= 200 && x <= 1100, `${x}`);
          assert.equal(x * 2, Math.round(x * 2));
        }
      }
      assert.equal(WIDTHS.regular[32], 226);
    });
});
