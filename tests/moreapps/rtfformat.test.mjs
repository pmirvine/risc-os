// The format glue (Batch G2, task 10): ./Open's openDoc sniffs RTF
// or .docx and says which (format 'rtf' | 'docx'), with the RTF
// reader's notes; openDocx is unchanged; hostile files give the
// usual error box text (describe), never a throw out of describe;
// fileTypeOf; SaveState suggestName with a format; ./DocSave and
// ./CopySave write a window in its own format (RTF: &C32) and keep
// its name, path and clean flag; the boot files claim &C32.
// ('riscos' replaced by a stand-in: no window is opened; the
// desktop side is word-rtf.mjs.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {writeZip} from '../../tools/moreapps/!WimpLib/Zip';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {suggestName} from '../../tools/moreapps/!Letters/SaveState';

globalThis.__rf = {writes: [], boxes: [], files: new Map(), msgs: []};
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const s = globalThis.__rf;' +
  'export const wimp = {beep() {}, menus: {}, setCaret() {}};' +
  'export const vfs = {' +
  ' exists: (p) => s.files.has(p),' +
  ' leaf: (p) => p.slice(p.lastIndexOf(".") + 1),' +
  ' readFile: async (p) => { if (!s.files.has(p))' +
  '   throw new Error("File not found"); return s.files.get(p); },' +
  ' writeFile: (p, b, o) => { s.writes.push({p, b, o});' +
  '   s.files.set(p, b); return p; }};' +
  'export const saveAs = (o) => { const b = {o, icons: [{}],' +
  '  isOpen: false, name: o.filename, on() {}, emit() {},' +
  '  setFilename(f) { b.name = f; }, filename() { return b.name; },' +
  '  openCentred() { b.isOpen = true; }}; s.boxes.push(b);' +
  '  return b; };' +
  'export const reportError = (m, o) => { s.msgs.push([m, o]);' +
  '  return Promise.resolve(1); };' +
  'export const query = () => {}, Menu = class {}, os = {},' +
  ' textWidth = () => 0, TextArea = class {}, choices = {},' +
  ' infoBox = () => {};');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const L = '../../tools/moreapps/!Letters/';
const O = await import(L + 'Open');
const DS = await import(L + 'DocSave');
const {copyBox} = await import(L + 'CopySave');
const {pdfName} = await import(L + 'PdfBox');

const st = globalThis.__rf;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = ROOT + 'tools/moreapps/!Letters/';
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const RTF = '{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 Hello RTF.\\par}';
const texts = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p').map((b) => b.text);
const docx = () => buildDocx({'word/document.xml':
  documentXml(p(r('Hello docx.')))});
const fake = {readFile: (path) => st.files.get(path) ||
  Promise.reject(new Error('File not found'))};
const put = (path, bytes) => { st.files.set(path, bytes); return path; };
const open = (bytes) => O.openDoc(fake, put('D.$.F', bytes));
/** describe's text for what opening bytes throws (null: opened). */
async function said(bytes) {
  try {
    await open(bytes);
    return null;
  } catch (e) {
    return O.describe(e, 'F');
  }
}

describe('openDoc', () => {
  it('RTF bytes: format rtf, the text, the notes', async () => {
    const got = await open(enc(RTF));
    assert.equal(got.format, 'rtf');
    assert.deepEqual(texts(got.doc), ['Hello RTF.']);
    assert.ok(Array.isArray(got.notes));
  });
  it('a BOM and white space before {\\rtf: still RTF', async () => {
    const b = enc('\xef\xbb\xbf \r\n' + RTF);
    assert.equal((await open(b)).format, 'rtf');
  });
  it('a .docx: format docx, the same Doc openDocx gives', async () => {
    const bytes = await docx();
    const got = await open(bytes);
    assert.equal(got.format, 'docx');
    assert.deepEqual(got.notes, []);
    assert.deepEqual(texts(got.doc), ['Hello docx.']);
    const old = await O.openDocx(fake, 'D.$.F');
    assert.deepEqual(texts(old), ['Hello docx.']);
    assert.ok(old.sections, 'openDocx still gives the Doc itself');
  });
  it('openDocx on RTF bytes refuses as before (not a .docx)',
    async () => {
      put('D.$.F', enc(RTF));
      await assert.rejects(O.openDocx(fake, 'D.$.F'),
        (e) => e.name === 'DocxError' && e.code === 'not-docx');
    });
});

describe('hostile files: the usual error box', () => {
  const NOT = "'F' could not be opened: it is not a Word .docx file.";
  it('random bytes and an empty file: not a .docx (as before)',
    async () => {
      const rnd = new Uint8Array(4096);
      let x = 7;
      for (let i = 0; i < rnd.length; i++) {
        x = (x * 1103515245 + 12345) >>> 0;
        rnd[i] = x >>> 24;
      }
      rnd[0] = 0x41;                   // (never '{' or a BOM)
      assert.equal(await said(rnd), NOT);
      assert.equal(await said(new Uint8Array(0)), NOT);
    });
  it('a zip that is not a Word package: as before', async () => {
    const z = await writeZip([['a.txt', enc('hello')]]);
    assert.equal(await said(z), NOT);
  });
  it('RTF over the size cap is refused before it is read',
    async () => {
      const big = new Uint8Array(O.MAX_RTF_BYTES + 1).fill(0x61);
      big.set(enc('{\\rtf1 '));
      assert.equal(await said(big), "'F' could not be opened: it " +
        'is an RTF file of more than 16 MB, the most !Letters opens.');
      const ok = new Uint8Array(1024).fill(0x61);
      ok.set(enc('{\\rtf1 '));
      assert.equal(await said(ok), null);
    });
  it('the header alone opens (empty) with a note', async () => {
    for (const s of ['{\\rtf', '{\\rtf1', '{\\rtf1}']) {
      const got = await open(enc(s));
      assert.equal(got.format, 'rtf', s);
      assert.ok(texts(got.doc).length >= 1, s);
    }
    const cut = await open(enc('{\\rtf1 abc'));
    assert.ok(cut.notes.length >= 1);
  });
  it('an RTF the reader could not read at all: not an RTF file',
    () => {
      const e = new O.RtfError('not-rtf');
      assert.equal(O.describe(e, 'F'),
        "'F' could not be opened: it is not an RTF file.");
    });
  it('a file of RTF\'s type (&C32) that is not RTF (nor a zip): ' +
    'not an RTF file; of any other type, or a .doc: as before',
  async () => {
    let err;
    try {
      await open(enc('Just some text.'));
    } catch (e) {
      err = e;
    }
    assert.equal(O.describe(err, 'F', 0xC32),
      "'F' could not be opened: it is not an RTF file.");
    assert.equal(O.describe(err, 'F', 0xA7E), NOT);
    assert.equal(O.describe(err, 'F', 0xFFF), NOT);
    assert.equal(O.describe(err, 'F'), NOT);
    const ole = Object.assign(new Error('x'), {name: 'DocxError',
      code: 'not-docx', kind: 'ole2'});
    assert.ok(O.describe(ole, 'F', 0xC32).includes('older Word'));
    // the type, as the callers look it up
    assert.equal(O.typeAt({stat: () => ({filetype: 0xC32})}, 'p'), 0xC32);
    assert.equal(O.typeAt({stat: () => null}, 'p'), undefined);
    assert.equal(O.typeAt({stat: () => { throw new Error('x'); }}, 'p'),
      undefined);
  });
  it('describe never throws, whatever it is given', () => {
    for (const e of [null, undefined, 5, 'x', {}, new Error('m'),
      {name: 'RtfError'}, {name: 'RtfError', code: 'zz'}]) {
      assert.equal(typeof O.describe(e, 'F'), 'string');
    }
  });
  it('the docx messages are as they were', () => {
    const E = class extends Error {
      constructor(code, kind, part) {
        super(code);
        this.name = 'DocxError';
        Object.assign(this, {code, kind, part});
      }
    };
    assert.equal(O.describe(new E('bad-xml', undefined, 'w/d.xml'),
      'F'), "'F' could not be opened: part of it is damaged " +
      '(not well-formed XML) (w/d.xml).');
    assert.equal(O.describe(new E('not-docx', 'ole2'), 'F'),
      "'F' is an older Word (.doc) or password-protected file; " +
      '!Letters opens .docx files only.');
    assert.equal(O.describe(new E('unsupported', 'paragraphs'), 'F'),
      "'F' could not be opened: it has more than 200,000 " +
      'paragraphs, the most !Letters opens.');
  });
});

describe('the notes notice', () => {
  it('none for no notes', () => {
    assert.equal(O.notesNotice('F', []), null);
    assert.equal(O.notesNotice('F', undefined), null);
  });
  it('names the leaf and lists the notes', () => {
    const m = O.notesNotice('Letter/rtf', ['a note', 'another']);
    assert.equal(m, "'Letter/rtf' was opened, but: a note; another.");
  });
  it('is bounded however many and long the notes are', () => {
    const many = Array.from({length: 500}, (_, i) =>
      'note ' + i + ' ' + 'x'.repeat(400));
    const m = O.notesNotice('F', many);
    assert.ok(m.length <= O.MAX_NOTICE, m.length);
    assert.ok(m.includes('(and 4'), m.slice(-60));
  });
});

describe('fileTypeOf', () => {
  it('docx &A7E, rtf &C32, anything else docx', () => {
    assert.equal(O.fileTypeOf('docx'), 0xA7E);
    assert.equal(O.fileTypeOf('rtf'), 0xC32);
    assert.equal(O.fileTypeOf(undefined), 0xA7E);
    assert.equal(O.fileTypeOf('pdf'), 0xA7E);
    assert.deepEqual(O.FILETYPES, {docx: 0xA7E, rtf: 0xC32});
  });
});

describe('suggestName with a format', () => {
  it('no format: exactly as before', () => {
    assert.equal(suggestName({path: 'D.R/docx'}, 'D', undefined),
      'D.R/docx');
  });
  it("a leaf ending in the other format's extension is switched",
    () => {
      assert.equal(suggestName({path: 'D.R/docx'}, 'D', undefined,
        'rtf'), 'D.R/rtf');
      assert.equal(suggestName({path: 'D.R/RTF'}, 'D', undefined,
        'docx'), 'D.R/docx');
      assert.equal(suggestName({path: 'D.R/rtf'}, 'D', undefined,
        'rtf'), 'D.R/rtf');
      // (no extension: kept, the file type says what it is)
      assert.equal(suggestName({path: 'D.Report'}, 'D', undefined,
        'rtf'), 'D.Report');
      assert.equal(suggestName({leaf: 'Untitled'}, 'D', undefined,
        'docx'), 'D.Untitled');
      // (a directory with a dot-like name is not touched)
      assert.equal(suggestName({path: 'D.rtf'}, 'D', undefined,
        'docx'), 'D.rtf');
    });
  it('pdfName takes /rtf off as it does /docx', () => {
    assert.equal(pdfName({path: 'D.R/rtf'}, 'D'), 'D.R/pdf');
    assert.equal(pdfName({path: 'D.R/docx'}, 'D'), 'D.R/pdf');
  });
});

/** A window enough for ./DocSave and ./CopySave (no desktop). */
function win(doc, path, format) {
  const docs = new Map();
  const app = {task: {onMessage() { return () => {}; }}, docs,
    keyOf: (q) => String(q).toLowerCase(), rekey() {}, recent: [],
    noteRecent() {}};
  const dw = {app, path, leaf: path.slice(path.lastIndexOf('.') + 1),
    doc, d: new Document(doc), format, boxes: new Map(), closed: false,
    view: {comp: null}, retitled: 0,
    retitle() { this.retitled++; },
    saveBytes() { return DS.bytesOf(this); }};
  docs.set(app.keyOf(path), dw);
  return dw;
}

describe('saving a window in its format', () => {
  it('Save of an RTF window: RTF bytes, &C32, name and path kept,' +
    ' clean', async () => {
    st.writes.length = 0;
    const {doc} = readRtf(enc(RTF));
    const dw = win(doc, 'D.$.Letter/rtf', 'rtf');
    dw.d.markSavedAt(-1);              // (dirty: an old state saved)
    assert.equal(dw.d.dirty, true);
    assert.equal(await DS.saveAsTo(dw, null), true);
    assert.equal(st.writes.length, 1);
    const w = st.writes[0];
    assert.equal(w.p, 'D.$.Letter/rtf');
    assert.equal(w.o.filetype, 0xC32);
    const text = Buffer.from(w.b).toString('latin1');
    assert.ok(text.startsWith('{\\rtf1'), text.slice(0, 20));
    assert.deepEqual(texts(readRtf(w.b).doc), ['Hello RTF.']);
    assert.equal(dw.path, 'D.$.Letter/rtf');
    assert.equal(dw.leaf, 'Letter/rtf');
    assert.equal(dw.format, 'rtf');
    assert.equal(dw.d.dirty, false);
  });
  it('Save of a docx window: a .docx, &A7E (unchanged)', async () => {
    st.writes.length = 0;
    const doc = await O.openDocx(fake, put('D.$.F', await docx()));
    const dw = win(doc, 'D.$.Report/docx', 'docx');
    assert.equal(await DS.saveAsTo(dw, null), true);
    const w = st.writes[0];
    assert.equal(w.o.filetype, 0xA7E);
    assert.deepEqual([...w.b.slice(0, 2)], [0x50, 0x4b]);
  });
  it('a window with no format saves as .docx', async () => {
    st.writes.length = 0;
    const doc = await O.openDocx(fake, put('D.$.F', await docx()));
    const dw = win(doc, 'D.$.Old', undefined);
    await DS.saveAsTo(dw, null);
    assert.equal(st.writes[0].o.filetype, 0xA7E);
  });
  it('the Save as box and Save a copy follow the format',
    async () => {
      st.writes.length = 0;
      st.boxes.length = 0;
      const dw = win(readRtf(enc(RTF)).doc, 'D.$.Letter/rtf', 'rtf');
      const sb = DS.saveBox(dw);
      assert.equal(sb.o.filetype, 0xC32);
      const cb = copyBox(dw);
      assert.equal(cb.o.filetype, 0xC32);
      await cb.o.save('D.$.Copy/rtf');
      const w = st.writes.at(-1);
      assert.equal(w.p, 'D.$.Copy/rtf');
      assert.equal(w.o.filetype, 0xC32);
      assert.ok(Buffer.from(w.b).toString('latin1')
        .startsWith('{\\rtf1'));
      assert.equal(dw.path, 'D.$.Letter/rtf', 'a copy renames nothing');
      const dx = win(await O.openDocx(fake, put('D.$.F', await docx())),
        'D.$.R/docx', 'docx');
      assert.equal(DS.saveBox(dx).o.filetype, 0xA7E);
      assert.equal(copyBox(dx).o.filetype, 0xA7E);
    });
});

describe('registration: the boot files claim &C32', () => {
  for (const f of ['!Boot', '!Run']) {
    it(f, () => {
      const lines = fs.readFileSync(APP + f, 'latin1').split('\n');
      assert.ok(lines.includes('Set File$Type_C32 RTF'), f);
      assert.ok(lines.includes(
        'Set Alias$@RunType_C32 Run <Letters$Dir>.!Run %%*0'), f);
      assert.ok(lines.includes('Set File$Type_A7E MSWordX'), f);
    });
  }
  it('!RunImage accepts DataOpen for both types', () => {
    const src = fs.readFileSync(APP + '!RunImage', 'latin1');
    assert.ok(src.includes('formatOfType'), 'DataOpen by file type');
  });
  it('formatOfType: &A7E docx, &C32 rtf, others null', () => {
    assert.equal(O.formatOfType(0xA7E), 'docx');
    assert.equal(O.formatOfType(0xC32), 'rtf');
    assert.equal(O.formatOfType(0xFFF), null);
  });
});
