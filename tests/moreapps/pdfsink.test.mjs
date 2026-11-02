// PdfSink (Batch G1, task 5): the recording 2D context PDF export
// paints pages into. Each call is checked against the PDF operators
// it should give; a seeded fuzz run of random call sequences (bad
// numbers, unbalanced restore, empty text) must always end with
// balanced q / Q and no NaN, Infinity or exponent in the content.
// paintPage itself is run on it through sinkProxy, which throws for
// anything the sink does not implement. With an injected measure
// (9b-2) each run is fitted to it by a Tc, reset in its own BT.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PdfSink, SUPPORTED, EXTRAS, sinkProxy}
  from '../../tools/moreapps/!Letters/PdfSink';
import {keyOf} from '../../tools/moreapps/!Letters/PdfFiles';
import {FontSet, parseSfnt}
  from '../../tools/moreapps/!WimpLib/PdfFont';
import {PdfWriter} from '../../tools/moreapps/!WimpLib/PdfWrite';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {p, r} from './build-docx.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {imageObjects} from '../../tools/moreapps/!WimpLib/PdfImage';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const LIB = new Uint8Array(fs.readFileSync(
  path.join(FONTS, 'LiberationSans-Regular')));
const SANS = {family: 'Liberation Sans', bold: false, italic: false};
const F16 = '16px "Liberation Sans", sans-serif';

/** Every face is Liberation Sans Regular (enough for these tests). */
const loader = async () => ({bytes: LIB, kind: 'ttf'});

/** A sink with Liberation Sans loaded, and its page begun. */
async function sinkOf(opts = {}) {
  const fonts = new FontSet(new PdfWriter(), loader);
  await fonts.load(SANS);
  const s = new PdfSink({fonts, keyOf, unknown: 'throw', ...opts});
  s.begin(800, 1000);
  return s;
}

/** The content's lines after the initial transform. */
const body = (out) => out.content.split('\n').slice(1);

describe('PdfSink: operators', () => {
  it('starts each page with the px to points transform', async () => {
    const s = await sinkOf();
    s.begin(800, 1000);
    const out = s.end();
    assert.equal(out.content, '0.75 0 0 -0.75 0 750 cm');
    assert.equal(out.fonts.size, 0);
    assert.equal(out.gstates.size, 0);
    assert.equal(out.xobjects.size, 0);
    assert.equal(out.ready, true);
  });

  it('fillRect with a hex colour', async () => {
    const s = await sinkOf();
    s.fillStyle = '#ff0000';
    s.fillRect(10, 20, 30, 40);
    s.fillRect(1, 2, 3, 4);
    assert.deepEqual(body(s.end()),
      ['1 0 0 rg', '10 20 30 40 re', 'f', '1 2 3 4 re', 'f']);
  });

  it('a zero-size or bad fillRect draws nothing', async () => {
    const s = await sinkOf();
    s.fillRect(10, 20, 0, 40);
    s.fillRect(10, 20, 5, 0);
    s.fillRect(NaN, 0, 5, 5);
    s.fillRect(0, 0, Infinity, 5);
    assert.deepEqual(body(s.end()), []);
  });

  it('a stroked dashed line', async () => {
    const s = await sinkOf();
    s.strokeStyle = '#00ff00';
    s.lineWidth = 2;
    s.lineCap = 'round';
    s.lineJoin = 'bevel';
    s.setLineDash([4, 3]);
    s.lineDashOffset = 1;
    s.beginPath();
    s.moveTo(0, 0);
    s.lineTo(100, 0.5);
    s.stroke();
    assert.deepEqual(body(s.end()), ['0 1 0 RG', '2 w', '1 J',
      '2 j', '[4 3] 1 d', '0 0 m', '100 0.5 l', 'S']);
  });

  it('an odd dash list is doubled; a bad one ignored', async () => {
    const s = await sinkOf();
    s.setLineDash([5]);
    s.strokeRect(0, 0, 10, 10);
    s.setLineDash([1, NaN]);
    s.setLineDash([1, -2]);
    s.strokeRect(0, 0, 10, 10);
    s.setLineDash([]);
    s.strokeRect(0, 0, 10, 10);
    assert.deepEqual(body(s.end()), ['[5 5] 0 d', '0 0 10 10 re',
      'S', '0 0 10 10 re', 'S', '[] 0 d', '0 0 10 10 re', 'S']);
  });

  it('a clipped rect: rect + clip is W n', async () => {
    const s = await sinkOf();
    s.save();
    s.beginPath();
    s.rect(5, 6, 70, 80);
    s.clip();
    s.fillStyle = '#000000';
    s.fillRect(0, 0, 100, 100);
    s.restore();
    assert.deepEqual(body(s.end()), ['q', '5 6 70 80 re', 'W n',
      '0 0 100 100 re', 'f', 'Q']);
  });

  it('the path stays after fill, stroke and clip', async () => {
    const s = await sinkOf();
    s.beginPath();
    s.rect(0, 0, 10, 10);
    s.fill();
    s.stroke();
    s.closePath();
    s.beginPath();
    s.fill();
    assert.deepEqual(body(s.end()), ['0 0 10 10 re', 'f',
      '0 0 10 10 re', 'S']);
  });

  it('nested save / translate / restore', async () => {
    const s = await sinkOf();
    s.save();
    s.translate(10, 20);
    s.fillRect(0, 0, 5, 5);
    s.save();
    s.translate(1, 2);
    s.scale(2, 3);
    s.fillRect(0, 0, 5, 5);
    assert.deepEqual(s.getTransform(),
      {a: 2, b: 0, c: 0, d: 3, e: 11, f: 22});
    s.restore();
    s.fillRect(0, 0, 5, 5);
    s.restore();
    s.fillRect(0, 0, 5, 5);
    assert.deepEqual(s.getTransform(),
      {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    assert.deepEqual(body(s.end()), ['q', '10 20 5 5 re', 'f', 'q',
      '11 22 10 15 re', 'f', 'Q', '10 20 5 5 re', 'f', 'Q',
      '0 0 5 5 re', 'f']);
  });

  it('save keeps colours, line width and alpha', async () => {
    const s = await sinkOf();
    s.fillStyle = '#0000ff';
    s.lineWidth = 3;
    s.save();
    s.fillStyle = '#ff0000';
    s.lineWidth = 5;
    s.globalAlpha = 0.5;
    s.fillRect(0, 0, 1, 1);
    s.restore();
    assert.equal(s.fillStyle, '#0000ff');
    assert.equal(s.lineWidth, 3);
    assert.equal(s.globalAlpha, 1);
    s.fillRect(0, 0, 1, 1);
    s.strokeRect(0, 0, 1, 1);
    const out = s.end();
    assert.deepEqual(body(out), ['q', '1 0 0 rg', '/GS1 gs',
      '0 0 1 1 re', 'f', 'Q', '0 0 1 rg', '0 0 1 1 re', 'f', '3 w',
      '0 0 1 1 re', 'S']);
    assert.equal(out.gstates.get('GS1'),
      '<< /Type /ExtGState /ca 0.5 /CA 0.5 >>');
  });

  it('an unbalanced restore is ignored; end closes q', async () => {
    const s = await sinkOf();
    s.restore();
    s.save();
    s.save();
    s.fillRect(0, 0, 1, 1);
    assert.deepEqual(body(s.end()),
      ['q', 'q', '0 0 1 1 re', 'f', 'Q', 'Q']);
  });

  it('rgba alpha makes a gstate; one per alpha pair', async () => {
    const s = await sinkOf();
    s.fillStyle = 'rgba(255, 255, 255, 0.5)';
    s.fillRect(0, 0, 1, 1);
    s.fillRect(0, 0, 1, 1);
    s.fillStyle = '#000000';
    s.fillRect(0, 0, 1, 1);
    const out = s.end();
    assert.deepEqual(body(out), ['1 1 1 rg', '/GS1 gs', '0 0 1 1 re',
      'f', '0 0 1 1 re', 'f', '0 0 0 rg', '/GS2 gs', '0 0 1 1 re',
      'f']);
    assert.equal(out.gstates.get('GS1'),
      '<< /Type /ExtGState /ca 0.5 /CA 1 >>');
    assert.equal(out.gstates.get('GS2'),
      '<< /Type /ExtGState /ca 1 /CA 1 >>');
  });

  it('transparent fill draws nothing', async () => {
    const s = await sinkOf();
    s.fillStyle = 'transparent';
    s.fillRect(0, 0, 10, 10);
    s.fillText('Hi', 0, 0);
    s.beginPath();
    s.rect(0, 0, 4, 4);
    s.fill();
    s.globalAlpha = 0;
    s.fillStyle = '#000000';
    s.fillRect(0, 0, 10, 10);
    s.strokeRect(0, 0, 10, 10);
    assert.deepEqual(body(s.end()), []);
  });

  it('an unreadable style is black and noted', async () => {
    const s = await sinkOf();
    s.fillStyle = '#ff0000';
    s.fillStyle = 'hsl(0, 100%, 50%)';
    s.fillRect(0, 0, 1, 1);
    s.strokeStyle = {gradient: true};
    assert.deepEqual(body(s.end()), ['0 0 1 1 re', 'f']);
    assert.ok(s.unparsed.has('hsl(0, 100%, 50%)'));
    assert.equal(s.unparsed.size, 2);
  });

  it('the font reads back as set; a bad one is ignored',
    async () => {
      const s = await sinkOf();
      assert.equal(s.font, '10px sans-serif');
      s.font = F16;
      assert.equal(s.font, F16);
      s.font = 'nonsense';
      assert.equal(s.font, F16);
    });
});

describe('PdfSink: text', () => {
  let s, h, w;
  before(async () => {
    s = await sinkOf();
    s.font = F16;
    h = s.fonts.use(SANS, '');
    w = h.widthOf('Hello', 16);
  });
  const line = () => {
    const ls = body(s.end());
    s.begin(800, 1000);
    s.font = F16;
    return ls.filter((l) => l.startsWith('BT'))[0];
  };
  const tmOf = (l) => l.split(' Tm')[0].split(' ').slice(-6)
    .map(Number);

  it('fillText places the text with Tf and Tm', () => {
    s.fillText('Hello', 10, 20);
    const l = line();
    assert.equal(l, 'BT /F1 16 Tf 1 0 0 -1 10 20 Tm ' +
      h.encode('Hello') + ' Tj ET');
  });

  it('measureText of Hello is the hmtx advances x 16/2048', () => {
    const f = parseSfnt(LIB);
    let units = 0;
    for (const c of 'Hello') {
      units += f.advance(f.glyphFor(c.codePointAt(0)));
    }
    assert.equal(f.unitsPerEm, 2048);
    // Liberation Sans keeps Arial's widths: H e l l o
    assert.equal(units, 1479 + 1139 + 455 + 455 + 1139);
    const m = s.measureText('Hello');
    assert.equal(m.width, units * 16 / 2048);
    assert.ok(Math.abs(m.actualBoundingBoxAscent -
      16 * f.ascent / 2048) < 1e-9);
    assert.ok(Math.abs(m.actualBoundingBoxDescent +
      16 * f.descent / 2048) < 1e-9);
    assert.equal(s.measureText('').width, 0);
  });

  it('each textAlign shifts x by the width', () => {
    const want = {left: 10, start: 10, center: 10 - w / 2,
      right: 10 - w, end: 10 - w};
    for (const [a, x] of Object.entries(want)) {
      s.textAlign = a;
      assert.equal(s.textAlign, a);
      s.fillText('Hello', 10, 20);
      const t = tmOf(line());
      assert.ok(Math.abs(t[4] - x) < 0.001, a + ': ' + t[4]);
      assert.equal(t[5], 20);
    }
    s.textAlign = 'center';
    s.textAlign = 'sideways';
    assert.equal(s.textAlign, 'center');
    s.textAlign = 'start';
  });

  it('each textBaseline shifts y by ascent / descent', () => {
    const asc = h.ascent * 16, dsc = h.descent * 16;
    const want = {alphabetic: 20, top: 20 + asc, hanging: 20 + asc,
      middle: 20 + (asc + dsc) / 2, bottom: 20 + dsc,
      ideographic: 20 + dsc};
    for (const [b, y] of Object.entries(want)) {
      s.textBaseline = b;
      assert.equal(s.textBaseline, b);
      s.fillText('Hello', 10, 20);
      const t = tmOf(line());
      assert.ok(Math.abs(t[5] - y) < 0.001, b + ': ' + t[5]);
    }
    s.textBaseline = 'alphabetic';
  });

  it('text follows translate and scale; maxWidth squeezes', () => {
    s.translate(5, 6);
    s.scale(2, 2);
    s.fillText('Hello', 1, 1);
    assert.deepEqual(tmOf(line()), [2, 0, 0, -2, 7, 8]);
    s.fillText('Hello', 0, 0, w / 2);
    assert.deepEqual(tmOf(line()).slice(0, 4), [0.5, 0, 0, -1]);
    s.fillText('Hello', 0, 0, 0);
    s.fillText('', 0, 0);
    s.fillText('Hello', NaN, 0);
    assert.equal(line(), undefined);
  });

  it('end() lists the fonts the page used', () => {
    s.fillText('A', 0, 0);
    const out = s.end();
    assert.deepEqual([...out.fonts], ['F1']);
    s.begin(800, 1000);
    s.font = F16;
  });

  it('a face not loaded yet: not ready, painted again after load',
    async () => {
      const fonts = new FontSet(new PdfWriter(), loader);
      const t = new PdfSink({fonts, keyOf, unknown: 'throw'});
      t.begin(100, 100);
      t.font = F16;
      t.fillText('Hi', 1, 2);
      const first = t.end();
      assert.equal(first.ready, false);
      assert.ok(first.content.includes('<00000000> Tj'));
      assert.equal(fonts.pending.length, 1);
      await fonts.loadPending();
      t.begin(100, 100);
      t.font = F16;
      t.fillText('Hi', 1, 2);
      const again = t.end();
      assert.equal(again.ready, true);
      assert.ok(!again.content.includes('<00000000>'));
    });
});

describe('PdfSink: runs fitted to the measured width (9b-2)', () => {
  let h, w, enc, asked;
  // measure answers by the text: k x natural, or what got says
  let got = null, k = 1.03;
  const measure = (css, t) => {
    asked.push([css, t]);
    if (got) return got(t);
    return k * h.widthOf(t, 16);
  };
  const sink = async () => {
    const s = await sinkOf({measure});
    s.font = F16;
    return s;
  };
  before(async () => {
    const s = await sinkOf();
    h = s.fonts.use(SANS, 'Hello');
    w = h.widthOf('Hello', 16);
    enc = h.encode('Hello');
  });
  const lines = (s) => body(s.end()).filter((l) => l.startsWith('BT'));
  const tmOf = (l) => l.split(' Tm')[0].split(' ').slice(-6)
    .map(Number);
  const tcOf = (l) => {
    const a = l.split(' ');
    const i = a.indexOf('Tc');
    return i < 0 ? null : Number(a[i - 1]);
  };

  it('Tc spreads the difference over the gaps; reset after Tj',
    async () => {
      asked = [];
      got = null;
      const s = await sink();
      s.fillText('Hello', 10, 20);
      const tc = (1.03 * w - w) / 4;
      assert.deepEqual(asked, [[F16, 'Hello']]);
      assert.deepEqual(lines(s), ['BT /F1 16 Tf 1 0 0 -1 10 20 Tm ' +
        String(Math.round(tc * 1000) / 1000) + ' Tc ' + enc +
        ' Tj 0 Tc ET']);
    });

  it('measureText gives the measured width', async () => {
    asked = [];
    got = null;
    const s = await sink();
    assert.ok(Math.abs(s.measureText('Hello').width - 1.03 * w) <
      1e-9);
    assert.deepEqual(asked, [[F16, 'Hello']]);
    assert.equal(s.measureText('').width, 0);
  });

  it('alignment and maxWidth use the measured width', async () => {
    asked = [];
    got = null;
    const s = await sink();
    const W = 1.03 * w;
    const want = {left: 10, center: 10 - W / 2, right: 10 - W,
      end: 10 - W};
    for (const [a, x] of Object.entries(want)) {
      s.textAlign = a;
      s.fillText('Hello', 10, 20);
      const [l] = lines(s);
      s.begin(800, 1000);
      s.font = F16;
      // (to Tc's 3 decimals: the width drawn)
      assert.ok(Math.abs(tmOf(l)[4] - x) < 0.003, a + ': ' + l);
      assert.ok(tcOf(l) > 0, l);
    }
    s.textAlign = 'start';
    s.fillText('Hello', 0, 0, W / 2);
    const [l] = lines(s);
    assert.deepEqual(tmOf(l).slice(0, 4), [0.5, 0, 0, -1]);
    assert.equal(tcOf(l), Math.round((W - w) / 4 * 1000) / 1000);
  });

  it('Tc is in text space: the same under scale', async () => {
    got = null;
    asked = [];
    const s = await sink();
    s.scale(2, 2);
    s.fillText('Hello', 0, 0);
    const [l] = lines(s);
    assert.deepEqual(tmOf(l).slice(0, 4), [2, 0, 0, -2]);
    assert.equal(tcOf(l), Math.round((1.03 * w - w) / 4 * 1000) /
      1000);
  });

  it('later runs are unaffected; q/Q stay balanced', async () => {
    asked = [];
    let n = 0;
    got = (t) => (n++ === 0 ? 1.1 : 1) * h.widthOf(t, 16);
    const s = await sink();
    s.save();
    s.fillText('Hello', 0, 0);
    s.restore();
    s.fillText('Hello', 0, 0);
    const ls = body(s.end());
    assert.deepEqual(ls.filter((l) => l === 'q' || l === 'Q'),
      ['q', 'Q']);
    const bt = ls.filter((l) => l.startsWith('BT'));
    assert.ok(bt[0].endsWith(' Tj 0 Tc ET'), bt[0]);
    assert.equal(bt[1], 'BT /F1 16 Tf 1 0 0 -1 0 0 Tm ' + enc +
      ' Tj ET');
  });

  it('one glyph, a tiny difference: no Tc', async () => {
    asked = [];
    got = (t) => (t === 'A' ? 2 * h.widthOf('A', 16)
      : h.widthOf(t, 16) + 0.04);
    const s = await sink();
    s.fillText('A', 0, 0);
    s.fillText('Hello', 0, 0);
    for (const l of lines(s)) assert.equal(tcOf(l), null, l);
  });

  it('a measure out of 0.5..2 x natural, or not a number: ignored',
    async () => {
      for (const bad of [0.49 * w, 2.01 * w, NaN, Infinity,
        -Infinity, -w, 0, undefined, null, 'x', {}]) {
        asked = [];
        got = () => bad;
        const s = await sink();
        assert.equal(s.measureText('Hello').width, w, String(bad));
        s.textAlign = 'right';
        s.fillText('Hello', 100, 0);
        const [l] = lines(s);
        assert.equal(tcOf(l), null, l);
        assert.ok(Math.abs(tmOf(l)[4] - (100 - w)) < 0.001, l);
      }
      got = () => { throw new Error('no'); };
      const s = await sink();
      s.fillText('Hello', 0, 0);
      assert.equal(tcOf(lines(s)[0]), null);
    });

  it('a glyph the face lacks still counts as one', async () => {
    asked = [];
    got = null;
    const s = await sink();
    const t = 'A一B', nat = h.widthOf(t, 16);
    s.fillText(t, 0, 0);
    const [l] = lines(s);
    assert.equal(tcOf(l), Math.round((1.03 * nat - nat) / 2 * 1000) /
      1000);
  });

  it('tabs are measured as the spaces drawn', async () => {
    asked = [];
    got = null;
    const s = await sink();
    s.fillText('a\tb', 0, 0);
    assert.deepEqual(asked, [[F16, 'a b']]);
  });

  it('a page painted twice gives the same content', async () => {
    got = null;
    const s = await sink();
    const paint = () => {
      s.begin(200, 300);
      s.font = F16;
      s.textAlign = 'center';
      s.fillText('Hello', 50, 50);
      s.save();
      s.fillText('Hello world', 5, 5);
      s.restore();
      return s.end().content;
    };
    const a = paint();
    assert.ok(a.includes(' Tc '));
    assert.equal(paint(), a);
  });

  it('no measure: no Tc and the natural widths', async () => {
    const s = await sinkOf();
    s.font = F16;
    s.fillText('Hello', 0, 0);
    assert.equal(tcOf(lines(s)[0]), null);
    assert.equal(s.measureText('Hello').width, w);
  });
});

describe('PdfSink: begin() resets the page', () => {
  it('a page painted twice gives the same content', async () => {
    const s = await sinkOf();
    const paint = () => {
      s.begin(200, 300);
      s.restore();
      s.save();
      s.translate(3, 4);
      s.fillStyle = 'rgba(0, 0, 0, 0.5)';
      s.lineWidth = 4;
      s.setLineDash([2]);
      s.font = F16;
      s.textAlign = 'center';
      s.beginPath();
      s.rect(0, 0, 9, 9);
      s.fillRect(1, 1, 2, 2);
      s.strokeRect(1, 1, 2, 2);
      s.fillText('Hi', 1, 1);
      return s.end();
    };
    const a = paint(), b = paint();
    assert.equal(a.content, b.content);
    assert.deepEqual([...a.gstates], [...b.gstates]);
    s.begin(200, 300);
    assert.equal(s.fillStyle, '#000000');
    assert.equal(s.font, '10px sans-serif');
    assert.equal(s.textAlign, 'start');
    assert.deepEqual(s.getTransform(),
      {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    s.fill();
    assert.deepEqual(body(s.end()), []);
  });
});

describe('PdfSink: the surface', () => {
  it('has every name in SUPPORTED', async () => {
    const s = await sinkOf();
    assert.ok(SUPPORTED instanceof Set);
    assert.ok(SUPPORTED.has('getTransform'));
    for (const k of SUPPORTED) assert.ok(k in s, k);
  });

  it('sinkProxy throws for an unknown method or property',
    async () => {
      const g = sinkProxy(await sinkOf());
      g.fillRect(0, 0, 1, 1);
      assert.equal(typeof g.getTransform, 'function');
      assert.throws(() => g.arc(0, 0, 1, 0, 1), /arc/);
      assert.throws(() => { g.globalCompositeOperation = 'x'; },
        /globalCompositeOperation/);
      assert.equal(g.then, undefined);
    });

  it('in ignore mode unknown names are absent, not errors',
    async () => {
      const g = sinkProxy(await sinkOf({unknown: 'ignore'}));
      assert.equal(g.arc, undefined);
      g.globalCompositeOperation = 'x';
      g.fillRect(0, 0, 1, 1);
    });

  it('settle() resolves (pictures come in task 6)', async () => {
    const s = await sinkOf();
    s.drawImage({width: 1, height: 1}, 0, 0, 1, 1, 0, 0, 1, 1);
    await s.settle();
  });
});

describe('PdfSink: links (G1)', () => {
  it('link boxes in points, through the transform', async () => {
    const s = await sinkOf();                     // 800 x 1000 px
    s.link({url: 'https://example.com/'}, 100, 200, 300, 220);
    s.save();
    s.translate(40, 60);
    s.scale(2, 2);
    s.link({anchor: 'B'}, 10, 10, 20, 15);
    s.restore();
    const out = s.end();
    assert.deepEqual(out.links, [
      {rect: [75, 585, 225, 600], url: 'https://example.com/'},
      // (40 + 20, 60 + 20) .. (40 + 40, 60 + 30) px
      {rect: [45, 682.5, 60, 690], anchor: 'B'}]);
    assert.deepEqual(body(out), ['q', 'Q']);       // (draws nothing)
  });

  it('begin() resets them; none: an empty list', async () => {
    const s = await sinkOf();
    s.link({url: 'https://a.example/'}, 0, 0, 10, 10);
    s.begin(800, 1000);
    assert.deepEqual(s.end().links, []);
  });

  it('cut to the clip and the page; empty, bad or no target: none',
    async () => {
      const s = await sinkOf();
      s.beginPath();
      s.rect(0, 0, 400, 400);
      s.clip();
      s.link({url: 'https://a.example/'}, 300, 390, 500, 420);
      s.link({url: 'https://b.example/'}, 500, 0, 600, 10);  // outside
      s.link({url: 'https://c.example/'}, NaN, 0, 10, 10);
      s.link({url: 'https://d.example/'}, 10, 10, 10, 20);  // no width
      s.link(null, 0, 0, 10, 10);
      s.link({}, 0, 0, 10, 10);
      s.link({url: 7}, 0, 0, 10, 10);
      s.link({url: 'https://e.example/', anchor: 'x'}, 0, 0, 10, 10);
      // a box given right to left, bottom to top: the same box
      s.link({anchor: 'f'}, 20, 20, 10, 10);
      assert.deepEqual(s.end().links, [
        {rect: [225, 450, 300, 457.5], url: 'https://a.example/'},
        {rect: [0, 742.5, 7.5, 750], url: 'https://e.example/'},
        {rect: [7.5, 735, 15, 742.5], anchor: 'f'}]);
      // past the page's edge
      s.begin(800, 1000);
      s.link({anchor: 'g'}, -50, 990, 50, 1100);
      const page2 = s.end().links;
      assert.deepEqual(page2, [{rect: [0, 0, 37.5, 7.5], anchor: 'g'}]);
    });

  it('link is a sink extra: on the sink and through sinkProxy',
    async () => {
      assert.deepEqual([...EXTRAS], ['link']);
      for (const k of EXTRAS) assert.ok(!SUPPORTED.has(k), k);
      const g = sinkProxy(await sinkOf());
      assert.equal(typeof g.link, 'function');
      g.link({anchor: 'a'}, 0, 0, 1, 1);
    });
});

/** mulberry32: a small seeded generator. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUMS = [0, -0, 1, -1, 0.5, 12.345678, 1e21, -1e21, 1e300,
  NaN, Infinity, -Infinity, 5e-324, 800, -3, 1e-7];
const STYLES = ['#ff0000', '#abc', 'rgba(0,0,0,0.3)', 'transparent',
  'white', 'rgb(1e3,1,1)', '', 'bogus', 'rgba(1,2,3,NaN)'];
const TEXTS = ['', 'Hello', ' ', '\t\n', '\u{1F600}x', 'é',
  'a'.repeat(50)];
const FONTS_CSS = [F16, 'bold 1e21px x', 'NaNpx serif',
  '0px sans-serif', 'italic 13px "Carlito"', '-4px x'];

describe('PdfSink: fuzz', () => {
  // (with a measure too: any number, or none, for any text)
  for (const fit of [false, true]) {
    it('2,000 random sequences: balanced q/Q, no bad numbers' +
      (fit ? ', a measure given' : ''), async () => {
      const W = rng(7);
      const measure = (css, t) => (W() < 0.3 ? NUMS[Math.floor(W() *
        NUMS.length)] : t.length * 8 * (0.4 + W() * 2));
      const s = await sinkOf(fit ? {measure} : {});
      const R = rng(20261102);
      const pick = (a) => a[Math.floor(R() * a.length)];
      const n = () => pick(NUMS) * (R() < 0.5 ? 1 : R() * 1000);
      const calls = [
        () => s.save(), () => s.restore(), () => s.restore(),
        () => s.translate(n(), n()), () => s.scale(n(), n()),
        () => s.beginPath(), () => s.closePath(),
        () => s.rect(n(), n(), n(), n()), () => s.moveTo(n(), n()),
        () => s.lineTo(n(), n()), () => s.clip(), () => s.fill(),
        () => s.stroke(), () => s.fillRect(n(), n(), n(), n()),
        () => s.strokeRect(n(), n(), n(), n()),
        () => s.setLineDash([n(), n(), n()]),
        () => s.fillText(pick(TEXTS), n(), n(),
          R() < 0.2 ? n() : undefined),
        () => s.measureText(pick(TEXTS)),
        () => { s.font = pick(FONTS_CSS); },
        () => { s.fillStyle = pick(STYLES); },
        () => { s.strokeStyle = pick(STYLES); },
        () => { s.lineWidth = n(); },
        () => { s.globalAlpha = n(); },
        () => { s.lineDashOffset = n(); },
        () => { s.lineCap = pick(['round', 'square', 'x']); },
        () => { s.lineJoin = pick(['round', 'bevel', 'x']); },
        () => { s.textAlign = pick(['center', 'right', 'x']); },
        () => { s.textBaseline = pick(['top', 'middle', 'x']); },
        () => s.getTransform(),
        () => s.drawImage({width: 2, height: 2}, n(), n(), n(), n()),
      ];
      for (let i = 0; i < 2000; i++) {
        s.begin(n(), n());
        const k = 1 + Math.floor(R() * 40);
        for (let j = 0; j < k; j++) pick(calls)();
        const {content} = s.end();
        let depth = 0;
        for (const tok of content.split(/\s/)) {
          if (tok === 'q') depth++;
          if (tok === 'Q') depth--;
          assert.ok(depth >= 0, 'Q before q: ' + content);
        }
        assert.equal(depth, 0, content);
        for (const bad of ['NaN', 'Infinity', 'e+', 'e-',
          'undefined', 'null']) {
          assert.ok(!content.includes(bad), bad + ' in ' + content);
        }
        // each Tc set inside a BT is put back to 0 before its ET
        for (const l of content.split('\n')) {
          if (!l.includes(' Tc ')) continue;
          assert.ok(fit && l.startsWith('BT ') &&
            l.endsWith(' Tj 0 Tc ET'), l);
        }
      }
    });
  }
});

/** Every page of L laid out in Print layout. */
function printed(L, w = 800) {
  L.layout(w);
  const P = new Pages(printGalley(L));
  L.place = PlacePrint(L, P);
  L.layout(w);
  P.finish();
  return {P, Pl: L.place};
}

describe('PdfSink: paintPage', () => {
  before(loadStyles);

  it('paints text pages and a header picture through sinkProxy',
    async () => {
      const s = await sinkOf();
      const g = sinkProxy(s);
      const d = mk(['Hello world', 'second paragraph']);
      let {P, Pl} = printed(new DocLayout(d.doc, tm()));
      s.begin(816, 1056);
      paintPage(P, 0, g, {place: Pl, marks: false});
      let out = s.end();
      assert.ok(out.content.includes(' Tj ET'));
      assert.ok(out.fonts.size >= 1);
      const pics = {get: () => ({state: 'ready',
        bitmap: {width: 4, height: 2}})};
      const doc = await readDocx(await wordHf({pic: pngBytes(4, 2),
        default: {hdr: p(picRun('rIdP1') + r('Logo')),
          ftr: p(r('Foot'))}}));
      ({P, Pl} = printed(new DocLayout(doc, tm(), null, {pics})));
      s.begin(816, 1056);
      paintPage(P, 0, g, {place: Pl, marks: false});
      out = s.end();
      assert.ok(out.content.includes(' Tj ET'));
    });
});

/** An ImageSink over a writer: RGBA images, cached by the object. */
function imageSink(writer, calls = []) {
  const cache = new Map();
  return {calls, objectFor(img) {
    calls.push(img);
    if (!cache.has(img)) {
      cache.set(img, Promise.resolve(img.bad ? null : imageObjects(
        writer, {width: img.width, height: img.height,
          rgba: new Uint8Array(4 * img.width * img.height)
            .fill(255)})));
    }
    return cache.get(img);
  }};
}

/** A page's content lines after the initial transform, settled. */
async function pageOf(s) {
  await s.settle();
  return body(s.end());
}

describe('PdfSink: pictures', () => {
  const img = (w, h, extra) => ({width: w, height: h, ...extra});

  it('draws a whole image: cm maps the unit square, y flipped',
    async () => {
      const w = new PdfWriter();
      const s = await sinkOf({images: imageSink(w)});
      s.drawImage(img(4, 2), 10, 20, 100, 50);
      await s.settle();
      const out = s.end();
      assert.deepEqual(body(out),
        ['q', '100 0 0 -50 10 70 cm', '/Im1 Do', 'Q']);
      assert.deepEqual([...out.xobjects.keys()], ['Im1']);
      assert.ok(out.xobjects.get('Im1') >= 4);
    });

  it('the 3-argument form uses the natural size', async () => {
    const s = await sinkOf({images: imageSink(new PdfWriter())});
    s.drawImage(img(4, 2), 1, 2);
    assert.deepEqual(await pageOf(s),
      ['q', '4 0 0 -2 1 4 cm', '/Im1 Do', 'Q']);
  });

  it('goes through the current transform', async () => {
    const s = await sinkOf({images: imageSink(new PdfWriter())});
    s.translate(5, 6);
    s.scale(2, 3);
    s.drawImage(img(4, 2), 1, 1, 10, 10);
    assert.deepEqual(await pageOf(s),
      ['q', '20 0 0 -30 7 39 cm', '/Im1 Do', 'Q']);
  });

  it('a source rectangle clips and scales the image', async () => {
    const s = await sinkOf({images: imageSink(new PdfWriter())});
    // The right half of a 4 x 2 image into 50 x 20 at (10, 20): the
    // whole image would be 100 x 20 starting at x = -40.
    s.drawImage(img(4, 2), 2, 0, 2, 2, 10, 20, 50, 20);
    assert.deepEqual(await pageOf(s), ['q', '10 20 50 20 re',
      'W n', '100 0 0 -20 -40 40 cm', '/Im1 Do', 'Q']);
  });

  it('a source rectangle past the image is cut to it', async () => {
    const s = await sinkOf({images: imageSink(new PdfWriter())});
    s.drawImage(img(4, 2), 0, 0, 8, 2, 0, 0, 80, 20);
    assert.deepEqual(await pageOf(s),      // no clip: all of it shows
      ['q', '40 0 0 -20 0 20 cm', '/Im1 Do', 'Q']);
    s.begin(800, 1000);
    s.drawImage(img(4, 2), -2, 0, 4, 2, 0, 0, 80, 20);
    assert.deepEqual(await pageOf(s), ['q', '40 0 40 20 re', 'W n',
      '80 0 0 -20 40 20 cm', '/Im1 Do', 'Q']);
  });

  it('the same image twice shares one XObject and one request',
    async () => {
      const calls = [];
      const w = new PdfWriter();
      const s = await sinkOf({images: imageSink(w, calls)});
      const a = img(2, 2), b = img(2, 2);
      s.drawImage(a, 0, 0, 10, 10);
      s.drawImage(b, 20, 0, 10, 10);
      s.drawImage(a, 40, 0, 10, 10);
      await s.settle();
      const out = s.end();
      assert.equal(calls.length, 2);
      assert.equal(out.xobjects.size, 2);
      assert.equal(out.content.match(/\/Im1 Do/g).length, 2);
      assert.equal(out.content.match(/\/Im2 Do/g).length, 1);
      // and on the next page, the same object id again
      const id = out.xobjects.get('Im1');
      s.begin(800, 1000);
      s.drawImage(a, 0, 0, 10, 10);
      await s.settle();
      assert.equal(s.end().xobjects.get('Im1'), id);
      assert.equal(w.objs.length, 4 + 2);    // two images, no more
    });

  it('null, failing and unsettled images draw nothing', async () => {
    const images = {objectFor: (i) => i.boom
      ? Promise.reject(new Error('bang')) : Promise.resolve(null)};
    const s = await sinkOf({images});
    s.drawImage(img(2, 2), 0, 0, 10, 10);
    s.drawImage(img(2, 2, {boom: 1}), 0, 0, 10, 10);
    assert.deepEqual(body(s.end()), []);     // before settle
    s.begin(800, 1000);
    s.drawImage(img(2, 2), 0, 0, 10, 10);
    s.drawImage(img(2, 2, {boom: 1}), 0, 0, 10, 10);
    await s.settle();
    const out = s.end();
    assert.deepEqual(body(out), []);
    assert.equal(out.xobjects.size, 0);
    assert.deepEqual([...s.failed], ['bang']);
  });

  it('bad arguments draw nothing and never reach NaN', async () => {
    const calls = [];
    const s = await sinkOf({images: imageSink(new PdfWriter(), calls)});
    s.drawImage(null, 0, 0, 1, 1);
    s.drawImage(img(0, 0), 0, 0, 1, 1);
    s.drawImage(img(NaN, 2), 0, 0, 1, 1);
    s.drawImage(img(2, 2), NaN, 0, 1, 1);
    s.drawImage(img(2, 2), 0, 0, 0, 10);
    s.drawImage(img(2, 2), 0, 0, Infinity, 10);
    s.drawImage(img(2, 2), 0, 0, 0, 0, 0, 0, 5, 5);   // empty source
    s.drawImage(img(2, 2), 5, 5, 1, 1, 0, 0, 5, 5);   // off the image
    s.drawImage(img(2, 2), 1, 2, 3);                  // 3 arguments
    s.drawImage(img(2, 2), 1, 2, 3, 4, 5, 6);
    s.drawImage(img(2, 2));
    assert.deepEqual(await pageOf(s), []);
    assert.equal(calls.length, 0);
    const t = await sinkOf();                          // no images
    t.drawImage(img(2, 2), 0, 0, 5, 5);
    assert.deepEqual(await pageOf(t), []);
    const u = await sinkOf({images: imageSink(new PdfWriter())});
    u.drawImage(img(2, 2), 0, 0, 1e300, 1e300);
    assert.ok(!/NaN|Infinity|e\+/.test((await pageOf(u)).join(' ')));
  });

  it('alpha uses an ExtGState inside the picture\'s q', async () => {
    const s = await sinkOf({images: imageSink(new PdfWriter())});
    s.globalAlpha = 0.5;
    s.drawImage(img(2, 2), 0, 0, 10, 10);
    const lines = await pageOf(s);
    assert.deepEqual(lines.slice(0, 2), ['q', '/GS1 gs']);
    s.begin(800, 1000);
    s.globalAlpha = 0;
    s.drawImage(img(2, 2), 0, 0, 10, 10);
    assert.deepEqual(await pageOf(s), []);
  });

  it('paintPage draws a header picture through a bitmap provider',
    async () => {
      const s = await sinkOf({images: imageSink(new PdfWriter())});
      const bm = {width: 4, height: 2};
      const pics = {get: () => ({state: 'ready', bitmap: bm})};
      const doc = await readDocx(await wordHf({pic: pngBytes(4, 2),
        default: {hdr: p(picRun('rIdP1') + r('Logo')),
          ftr: p(r('Foot'))}}));
      const {P, Pl} = printed(new DocLayout(doc, tm(), null, {pics}));
      s.begin(816, 1056);
      paintPage(P, 0, sinkProxy(s), {place: Pl, marks: false});
      await s.settle();
      const out = s.end();
      assert.ok(/\/Im1 Do/.test(out.content));
      assert.equal(out.xobjects.size, 1);
    });
});
