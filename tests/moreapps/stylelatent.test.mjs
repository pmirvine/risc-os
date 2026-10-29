// Latent built-in styles: offered by StyleList, added on first use.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ensureBuiltin} from '../../tools/moreapps/!Letters/StyleCmd';
import * as SL from '../../tools/moreapps/!Letters/StyleList';
import * as SA from '../../tools/moreapps/!Letters/StyleApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {STYLES} from './word-docs.mjs';
import {mk, P, SEL, C} from './edit-docs.mjs';

/** A document whose styles lack Heading 1 (and the other headings). */
function lacking(blocks = ['abcd']) {
  const d = mk(blocks);
  const m = new Map(d.doc.styles.styles);
  for (const k of [...m.keys()]) if (/^Heading/.test(k)) m.delete(k);
  d.doc.styles = {...d.doc.styles, styles: m};
  return d;
}

describe('StyleCmd.ensureBuiltin', () => {
  it('adds Heading 1 with its Normal base when missing', () => {
    const d = lacking();
    const before = d.doc.styles;
    const m = new Map(before.styles);
    m.delete('Normal');
    const t = ensureBuiltin({...before, styles: m}, 'Heading1');
    assert.equal(t.styles.get('Heading1').basedOn, 'Normal');
    assert.ok(t.styles.get('Normal'));
    assert.equal(before.styles.has('Heading1'), false);
    // no Heading 1 Char: StylesBuiltin defines no linked style
    assert.equal(t.styles.get('Heading1').link, undefined);
  });
  it('a missing Normal added as a base becomes the default', () => {
    const d = lacking();
    const m = new Map(d.doc.styles.styles);
    m.delete('Normal');
    const t = ensureBuiltin({...d.doc.styles, styles: m,
      defaults: {...d.doc.styles.defaults, paragraph: null}},
    'Heading1');
    assert.equal(t.defaults.paragraph, 'Normal');
  });
  it('returns null when present', () => {
    const d = mk(['a']);
    assert.equal(ensureBuiltin(d.doc.styles, 'Heading1'), null);
  });
  it('returns null for a non-built-in id', () => {
    const d = mk(['a']);
    assert.equal(ensureBuiltin(d.doc.styles, 'Nope'), null);
  });
  it('returns null when the name is taken by another id', () => {
    const d = lacking();
    const m = new Map(d.doc.styles.styles);
    m.set('H1', {id: 'H1', type: 'paragraph', name: 'heading 1',
      pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null});
    assert.equal(ensureBuiltin({...d.doc.styles, styles: m},
      'Heading1'), null);
  });
  it('strict documents get the strict option passed through', () => {
    const d = lacking();
    const t = ensureBuiltin(d.doc.styles, 'Heading1', {strict: true});
    assert.ok(t.styles.get('Heading1'));
    assert.equal(ensureBuiltin(d.doc.styles, 'TableGrid',
      {strict: true}).styles.get('TableGrid').extra[0].children[0]
      .children.some((c) => c.name === 'w:end' ||
        c.name === 'w:start' || c.name === 'w:insideH'), true);
  });
});

/** A table whose Normal has id Standard (default) and which lacks
 *  the headings. */
function standard() {
  const d = lacking();
  const m = new Map(d.doc.styles.styles);
  const n = {...m.get('Normal'), id: 'Standard', name: 'normal'};
  m.delete('Normal');
  m.set('Standard', n);
  return {...d.doc.styles, styles: m,
    defaults: {...d.doc.styles.defaults, paragraph: 'Standard'}};
}

describe('ensureBuiltin and names', () => {
  it('refers to a same-name base and next under another id', () => {
    const t = ensureBuiltin(standard(), 'Heading1');
    const h = t.styles.get('Heading1');
    assert.equal(h.basedOn, 'Standard');
    assert.equal(h.next, 'Standard');
    assert.equal(t.styles.has('Normal'), false);
    assert.equal(t.defaults.paragraph, 'Standard');
  });
  it('matches names whatever their case', () => {
    for (const nm of ['HEADING 1', 'Heading 1', 'hEaDiNg 1']) {
      const tb = lacking().doc.styles;
      const m = new Map(tb.styles);
      m.set('X', {id: 'X', type: 'paragraph', name: nm,
        pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null});
      assert.equal(ensureBuiltin({...tb, styles: m}, 'Heading1'),
        null, nm);
    }
  });
  it('a same-name style of the wrong type blocks Title', () => {
    const d = mk(['a']);
    const m = new Map(d.doc.styles.styles);
    m.delete('Title');
    m.set('Title', {id: 'Title', type: 'character', name: 'Title',
      pPr: {extra: []}, rPr: {extra: []}, extra: [], raw: null});
    const tb = {...d.doc.styles, styles: m};
    assert.equal(ensureBuiltin(tb, 'Title'), null);
    const dd = {doc: {...d.doc, styles: tb}};
    assert.equal(SL.gallery(dd.doc).filter((e) => e.id === 'Title' &&
      e.latent).length, 0);
  });
  it('a latent style keeps a differently named default', () => {
    const tb = standard();
    const t = ensureBuiltin(tb, 'Heading2');
    assert.equal(t.defaults.paragraph, 'Standard');
    assert.equal(t.styles.get('Standard').isDefault,
      tb.styles.get('Standard').isDefault);
  });
});

describe('StyleList latent built-ins', () => {
  it('gallery lists latent Heading 1 for a table without it', () => {
    const d = lacking();
    const e = SL.gallery(d.doc).find((x) => x.id === 'Heading1');
    assert.equal(e.latent, true);
    assert.equal(e.name, 'Heading 1');
    assert.equal(e.preview.bold, true);
    assert.equal(d.doc.styles.styles.has('Heading1'), false);
    assert.ok(SL.all(d.doc).some((x) => x.id === 'Heading1' &&
      x.latent));
  });
  it('a defined style is listed once, not latent', () => {
    const d = mk(['a']);
    const l = SL.gallery(d.doc).filter((x) => x.id === 'Heading1');
    assert.equal(l.length, 1);
    assert.equal(l[0].latent, undefined);
  });
});

describe('applying a latent style', () => {
  it('creates it and applies it in one undo step', () => {
    const d = lacking();
    const t = new Typing(d);
    SA.applyStyle(d, t, C(d, 0, 1), 'Heading1');
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.ok(d.doc.styles.styles.has('Heading1'));
    assert.equal(d.undoDepth, 1);
  });
  it('undo removes the added styles too', () => {
    const d = lacking();
    const old = d.doc.styles;
    SA.applyStyle(d, new Typing(d), SEL(d, 0, 0, 0, 4), 'Heading2');
    d.undo();
    assert.equal(P(d, 0).pStyle, undefined);
    assert.equal(d.doc.styles.styles.has('Heading2'), false);
    assert.equal(d.doc.styles.styles.size, old.styles.size);
  });
  it('redo after undo applies the latent style again', () => {
    const d = lacking();
    SA.applyStyle(d, new Typing(d), C(d, 0, 1), 'Heading1');
    d.undo();
    d.redo();
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.ok(d.doc.styles.styles.has('Heading1'));
  });
  it('an unknown id still throws RangeError', () => {
    const d = lacking();
    assert.throws(() => SA.applyStyle(d, null, C(d, 0, 0), 'Zork'),
      RangeError);
  });
  it('listing never changes the table', () => {
    const d = lacking();
    const t = d.doc.styles;
    SL.gallery(d.doc);
    SL.all(d.doc);
    assert.equal(d.doc.styles, t);
    assert.equal(d.undoDepth, 0);
  });
});

describe('latent styles: one default per type', () => {
  const count = async (d) => {
    const out = await readZip(await writeDocx(d.doc));
    const xml = new TextDecoder().decode(out.get('word/styles.xml'));
    return (xml.match(/<w:style [^>]*w:type="paragraph"[^>]*>/g) || [])
      .filter((x) => /w:default="(1|true)"/.test(x));
  };
  it('a document whose default is Body gets one default only',
    async () => {
      const d = lacking();
      const m = new Map(d.doc.styles.styles);
      m.delete('Normal');
      m.set('Body', {id: 'Body', type: 'paragraph', name: 'Body Text',
        isDefault: true, pPr: {extra: []}, rPr: {extra: []},
        extra: [], raw: null});
      d.doc.styles = {...d.doc.styles, styles: m,
        defaults: {...d.doc.styles.defaults, paragraph: 'Body'}};
      SA.applyStyle(d, null, C(d, 0, 0), 'Heading1');
      assert.ok(d.doc.styles.styles.has('Normal'));
      assert.equal(d.doc.styles.defaults.paragraph, 'Body');
      assert.equal((await count(d)).length, 1);
    });
  it('without any default Normal becomes it', async () => {
    const d = lacking();
    const m = new Map(d.doc.styles.styles);
    m.delete('Normal');
    d.doc.styles = {...d.doc.styles, styles: m,
      defaults: {...d.doc.styles.defaults, paragraph: null}};
    SA.applyStyle(d, null, C(d, 0, 0), 'Heading1');
    assert.equal(d.doc.styles.defaults.paragraph, 'Normal');
    assert.equal((await count(d)).length, 1);
  });
});

describe('latent styles and files', () => {
  it('loading and saving never adds a latent style', async () => {
    const d = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x'))),
      'word/styles.xml': STYLES}));
    assert.equal(d.styles.styles.has('Heading1'), false);
    assert.ok(SL.gallery(d).some((e) => e.id === 'Heading1'));
    const out = await readZip(await writeDocx(d));
    const xml = new TextDecoder().decode(out.get('word/styles.xml'));
    assert.equal(xml.includes('Heading1'), false);
    const again = await readZip(await writeDocx(
      await readDocx(await buildDocx({
        'word/document.xml': documentXml(p(r('x'))),
        'word/styles.xml': STYLES}))));
    assert.deepEqual(out.get('word/styles.xml'),
      again.get('word/styles.xml'));
    assert.equal(d.styles.styles.has('Heading1'), false);
  });
  it('strict documents get strict-safe definitions', () => {
    const d = lacking();
    d.doc.meta = {...d.doc.meta, conformance: 'strict'};
    SA.applyStyle(d, null, C(d, 0, 0), 'Heading1');
    assert.ok(d.doc.styles.styles.has('Heading1'));
    const e = SL.gallery(d.doc).find((x) => x.id === 'Heading2');
    assert.equal(e.latent, true);
  });
});
