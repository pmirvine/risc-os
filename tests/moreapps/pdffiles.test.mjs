// PdfFiles (Batch G1, task 4): canvas font strings to font files.
// The strings are ones the painters set (Fmt.runFmt css,
// MarkPaint RULE_FONT, ItemPaint's italic 13px).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFont, keyOf, fileLoader}
  from '../../tools/moreapps/!Letters/PdfFiles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const bytesOf = (p) => new Uint8Array(fs.readFileSync(p));

describe('parseFont', () => {
  it('reads a painter string with italic and bold', () => {
    assert.deepEqual(
      parseFont('italic bold 16px "Liberation Sans", sans-serif'),
      {family: 'Liberation Sans',
        families: ['Liberation Sans', 'sans-serif'],
        px: 16, bold: true, italic: true});
  });
  it('reads a family with spaces and 12.5px', () => {
    const p = parseFont('12.5px "Times New Roman", "Liberation Serif", '
      + 'serif');
    assert.equal(p.px, 12.5);
    assert.equal(p.family, 'Times New Roman');
    assert.equal(p.bold, false);
    assert.equal(p.italic, false);
    assert.equal(p.families.length, 3);
  });
  it('keeps an apostrophe inside a double-quoted name', () => {
    const p = parseFont('italic 13px "Bob\'s Font", "Liberation Sans", '
      + 'sans-serif');
    assert.equal(p.family, "Bob's Font");
    assert.equal(p.italic, true);
    assert.equal(p.px, 13);
  });
  it('weights from 600 are bold; oblique is italic', () => {
    assert.equal(parseFont('600 10px Arial').bold, true);
    assert.equal(parseFont('500 10px Arial').bold, false);
    assert.equal(parseFont('900 10px Arial').bold, true);
    assert.equal(parseFont('oblique 10px Arial').italic, true);
  });
  it('never throws on rubbish', () => {
    for (const v of [undefined, null, 5, '', '"', '12px', 'px bold',
      "'''", {}]) {
      assert.doesNotThrow(() => parseFont(v));
    }
    assert.equal(parseFont('bold').px, 0);
  });
  it('reads bolder, a missing size, and pt sizes', () => {
    assert.equal(parseFont('bolder 10px Arial').bold, true);
    const none = parseFont('italic bold Arial, sans-serif');
    assert.equal(none.px, 0);
    assert.equal(none.italic, true);
    assert.deepEqual(none.families, ['Arial', 'sans-serif']);
    const pt = parseFont('12pt Arial');
    assert.equal(pt.px, 16);
    assert.deepEqual(pt.families, ['Arial']);
    assert.equal(keyOf('12pt Calibri').family, 'Carlito');
    assert.equal(keyOf('12pt Calibri').px, 16);
  });
  it('zero, negative and hex sizes are no size', () => {
    for (const s of ['0x10px', '-5px', '0px', '0pt', '1e2px']) {
      const p = parseFont(`bold ${s} Arial, serif`);
      assert.equal(p.px, 0, s);
      assert.equal(p.bold, true, s);
      assert.deepEqual(p.families, ['Arial', 'serif'], s);
    }
  });
});

describe('keyOf', () => {
  it('maps Calibri to Carlito', () => {
    assert.deepEqual(keyOf('11px Calibri, sans-serif'),
      {family: 'Carlito', bold: false, italic: false, px: 11});
  });
  it('maps Arial bold italic to Liberation Sans', () => {
    const k = keyOf('italic bold 16px "Arial", sans-serif');
    assert.deepEqual(k, {family: 'Liberation Sans', bold: true,
      italic: true, px: 16});
  });
  it('an unknown name gets the sans substitute', () => {
    assert.equal(keyOf('12px "Zapf Nonesuch", "Liberation Sans", '
      + 'sans-serif').family, 'Liberation Sans');
    assert.equal(keyOf('12px Nonesuch').family, 'Liberation Sans');
  });
  it('keeps Homerton and the generics', () => {
    assert.equal(keyOf('12px "Homerton", "Liberation Sans"').family,
      'Homerton');
    assert.equal(keyOf('12px serif').family, 'Liberation Serif');
    assert.equal(keyOf('12px Sassoon, sans-serif').family,
      'Liberation Sans');
  });
});

describe('fileLoader', () => {
  const mk = () => {
    const reads = [];
    const fetches = [];
    const loader = fileLoader({
      dir: 'F',
      readBytes: async (p) => {
        reads.push(p);
        const leaf = p.slice(2);
        const f = path.join(FONTS, leaf);
        return fs.existsSync(f) ? bytesOf(f) : null;
      },
      fetchBytes: async (u) => {
        fetches.push(u);
        const f = path.join(ROOT, u);
        if (!fs.existsSync(f)) throw new Error('404');
        return bytesOf(f);
      },
    });
    return {loader, reads, fetches};
  };
  it('reads a bundled face and sets kind ttf', async () => {
    const {loader, reads} = mk();
    const r = await loader({family: 'Liberation Sans', bold: true,
      italic: true});
    assert.equal(r.kind, 'ttf');
    assert.ok(r.bytes.length > 1000);
    assert.deepEqual(reads, ['F.LiberationSans-BoldItalic']);
  });
  it('fetches a RISC OS face and sets kind otf', async () => {
    const {loader, fetches} = mk();
    const r = await loader({family: 'Homerton', bold: false,
      italic: true});
    assert.equal(r.kind, 'otf');
    assert.deepEqual(fetches,
      ['assets/fonts/Homerton-MediumItalic.otf']);
  });
  it('null for an unreadable file; reads once per key', async () => {
    const {loader, reads, fetches} = mk();
    assert.equal(await loader({family: 'Trinity', bold: false,
      italic: false}) !== null, true);
    const bad = fileLoader({dir: 'F', readBytes: async () => {
      throw new Error('no');
    }, fetchBytes: async () => null});
    assert.equal(await bad({family: 'Carlito'}), null);
    assert.equal(await fileLoader({dir: 'F',
      readBytes: async () => new Uint8Array(8),
      fetchBytes: async () => null})({family: 'Carlito'}), null);
    const key = {family: 'Carlito', bold: false, italic: false};
    await loader(key);
    await loader({...key});
    await loader(key);
    assert.equal(reads.length, 1);
    assert.equal(fetches.length, 1);
  });
  it('faces read separately; null is not kept', async () => {
    const {loader, reads, fetches} = mk();
    for (const bold of [false, true]) {
      for (const italic of [false, true]) {
        await loader({family: 'Carlito', bold, italic});
        await loader({family: 'Corpus', bold, italic});
      }
    }
    assert.equal(new Set(reads).size, 4);
    assert.equal(reads.length, 4);
    assert.equal(new Set(fetches).size, 4);
    assert.equal(fetches.length, 4);
    await loader({family: 'Homerton', bold: false, italic: false});
    assert.equal(fetches.length, 5);
    let n = 0;
    const gone = fileLoader({dir: 'F', readBytes: async () => {
      n++;
      return null;
    }, fetchBytes: async () => null});
    const key = {family: 'Carlito', bold: true, italic: false};
    assert.equal(await gone(key), null);
    assert.equal(await gone(key), null);
    assert.equal(n, 2, 'a failed read is tried again');
    // concurrent calls share the one read
    n = 0;
    const [a, b] = await Promise.all([gone(key), gone(key)]);
    assert.equal(a, null);
    assert.equal(b, null);
    assert.equal(n, 1);
  });
  it('a failed fetch, then a good one: the later call gets the font',
    async () => {
      let calls = 0;
      const real = fileLoader({dir: 'F', readBytes: async () => null,
        fetchBytes: async () => {
          calls++;
          return calls === 1 ? null : new Uint8Array(
            fs.readFileSync(path.join(FONTS, 'Carlito-Regular')));
        }});
      const key = {family: 'Homerton', bold: false, italic: false};
      assert.equal(await real(key), null);
      const r = await real(key);
      assert.ok(r && r.kind, 'loaded the second time');
      assert.equal(await real(key), r, 'then kept');
      assert.equal(calls, 2);
    });
  it('an unknown family uses the substitute file', async () => {
    const {loader, reads} = mk();
    const r = await loader({family: 'Nonesuch', bold: false,
      italic: false});
    assert.equal(r.kind, 'ttf');
    assert.deepEqual(reads, ['F.LiberationSans-Regular']);
  });
});
