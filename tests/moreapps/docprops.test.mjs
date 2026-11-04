// .doc import, task 12: property modifiers (DocSprm), FKP pages and
// bin tables (DocFkp), character and paragraph formatting (DocChp,
// DocPap, DocChpx, DocPapx, DocPrm), the style sheet and the font
// table (DocStsh, DocStyles, DocFonts). Inputs are spec-derived
// fixtures (doc-helpers.mjs formattedDoc, written from [MS-DOC]), not
// files from an office program; the corpus test reads the real ones
// of the uncommitted corpus and skips when it is missing. Every Doc
// read must pass the Model checks, write as .docx and read back
// equal; emit() hands the .docx to the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc, openContext}
  from '../../tools/moreapps/!Letters/DocRead';
import {readSprms, OPS, BAD} from '../../tools/moreapps/!Letters/DocSprm';
import {readFkp, readBte} from '../../tools/moreapps/!Letters/DocFkp';
import {applyPap, DPARA, MAX_TABS} from '../../tools/moreapps/!Letters/DocPap';
import {applyChp, DCHAR} from '../../tools/moreapps/!Letters/DocChp';
import {charRuns} from '../../tools/moreapps/!Letters/DocChpx';
import {paraAt} from '../../tools/moreapps/!Letters/DocPapx';
import {MAX_CHAIN} from '../../tools/moreapps/!Letters/DocStyles';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {resolver, charOf} from '../../tools/moreapps/!Letters/FormatEff';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {formattedDoc, prl, grpprl, u16le, i16le, u32le, chpxPage,
  papxPage, plcBte, stsh} from './doc-helpers.mjs';
import {CORPUS} from './odt-corpus.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const read = (o, opts = {}) => readDoc(formattedDoc(o).bytes,
  {date: DATE, ...opts});
const paras = (doc) => doc.sections.flatMap((s) => s.blocks)
  .filter((b) => b.type === 'p');
/** The runs of paragraph p as [text, rPr, rStyle?]. */
const runsOf = (p) => p.runs.map((r) => [p.text.slice(r.start, r.end),
  r.rPr, ...(r.rStyle !== undefined ? [r.rStyle] : [])]);
const plain = {extra: []};

async function roundTrips(doc, what) {
  for (const b of doc.sections.flatMap((s) => s.blocks)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('doc-props-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const C = OPS;
const bold = prl(C.CFBold, 1), italic = prl(C.CFItalic, 1);

describe('.doc: property modifiers (DocSprm)', () => {
  it('a sprm with a variable operand length is skipped by its size',
    async () => {
      // an unknown spra-6 sprm (0xCAFF) with 5 bytes, then bold
      const g = grpprl(prl(0xCAFF, [1, 2, 3, 4, 5]), bold);
      const l = readSprms(g, 0, g.length);
      assert.deepEqual(l.map((s) => [s.op, s.size]), [[0xCAFF, 6],
        [C.CFBold, 1]]);
      assert.deepEqual([...l[0].operand], [1, 2, 3, 4, 5]);
      const {doc, notes} = read({paras: [{text: 'Hello'}],
        runs: [{from: 0, to: 5, prls: [prl(0xCAFF, [9, 9, 9]), bold]}]});
      assert.deepEqual(runsOf(paras(doc)[0]), [['Hello',
        {extra: [], b: true}]]);
      assert.deepEqual(notes, []);
      await roundTrips(doc, 'variable sprm');
    });

  it('sprmTDefTable and sprmPChgTabs 255 take their own lengths', () => {
    const td = Uint8Array.from([0x08, 0xD6, ...u16le(4), 7, 7, 7,
      ...bold]);
    assert.deepEqual(readSprms(td, 0, td.length).map((s) => s.size),
      [5, 1]);
    // cb 255: 1 deleted (4 bytes), 2 added (3 bytes each)
    const tabs = Uint8Array.from([0x15, 0xC6, 255, 1, ...i16le(100),
      ...i16le(10), 2, ...i16le(720), ...i16le(1440), 0, 2, ...bold]);
    const l = readSprms(tabs, 0, tabs.length);
    assert.deepEqual(l.map((s) => [s.op, s.size]), [[C.PChgTabs, 1 +
      1 + 4 + 1 + 6], [C.CFBold, 1]]);
  });

  it('a sprm running past the grpprl stops with a note', () => {
    const g = grpprl(bold, Uint8Array.from([0x43, 0x4A, 24]));
    const notes = [];
    const l = readSprms(g, 0, g.length, (m) => notes.push(m));
    assert.deepEqual(l.map((s) => s.op), [C.CFBold]);
    assert.deepEqual(notes, [BAD]);
    // a variable one whose count runs past the end
    const v = Uint8Array.from([0xFF, 0xCA, 200, 1, 2]);
    assert.deepEqual(readSprms(v, 0, v.length, (m) => notes.push(m)),
      []);
    // a padding byte of 0 is not damage
    const pad = grpprl(bold, [0]);
    const n2 = [];
    assert.equal(readSprms(pad, 0, pad.length, (m) => n2.push(m))
      .length, 1);
    assert.deepEqual(n2, []);
  });

  it('sprms of length 0 and a grpprl of zeros always end', () => {
    const zero = new Uint8Array(300000);
    const t = performance.now();
    const l = readSprms(zero, 0, zero.length);
    assert.equal(l.length, 100000);          // (op 0: spra 0, 1 byte)
    const v0 = grpprl(...new Array(1000).fill(prl(0xCAFF, [])));
    assert.equal(readSprms(v0, 0, v0.length).length, 1000);
    assert.ok(performance.now() - t < 2000);
    assert.deepEqual(readSprms(zero, 5, 2), []);
    assert.deepEqual(readSprms(null, 0, 10), []);
  });
});

describe('.doc: character formatting', () => {
  it('bold italic underline size colour of a run', async () => {
    const {doc, notes} = read({paras: [{text: 'plain bold rest'}],
      runs: [{from: 6, to: 10, prls: [bold, italic, prl(C.CKul, 3),
        prl(C.CHps, u16le(28)), prl(C.CIco, 6)]},
      {from: 11, to: 15, prls: [prl(C.CCv, [0x12, 0x34, 0x56, 0]),
        prl(C.CFStrike, 1), prl(C.CIss, 1), prl(C.CHighlight, 7),
        prl(C.CFCaps, 1), prl(C.CHpsPos, i16le(-6))]}]});
    assert.deepEqual(notes, []);
    const p = paras(doc)[0];
    const r = runsOf(p);
    assert.equal(r[0][0], 'plain ');
    assert.deepEqual(r[0][1], plain);
    assert.equal(r[1][0], 'bold');
    assert.deepEqual(r[1][1], {extra: [], b: true, i: true,
      u: 'double', sz: 28, color: 'FF0000'});
    const last = r[r.length - 1][1];
    assert.equal(last.color, '123456');
    assert.equal(last.strike, true);
    assert.equal(last.vertAlign, 'superscript');
    assert.equal(last.highlight, 'yellow');
    assert.deepEqual(last.extra.map((x) => x.name).sort(),
      ['w:caps', 'w:position']);
    await roundTrips(doc, 'run formatting');
  });

  it('formatting identical to the style gives an empty rPr',
    async () => {
      const styles = {stds: [{sti: 0, name: 'Normal',
        chpx: grpprl(bold, prl(C.CHps, u16le(24)))}]};
      const {doc} = read({styles, paras: [{text: 'all bold'}],
        runs: [{from: 0, to: 8, prls: [bold, prl(C.CHps, u16le(24))]}]});
      assert.deepEqual(runsOf(paras(doc)[0]), [['all bold', plain]]);
      const n = doc.styles.styles.get('Normal');
      assert.equal(n.rPr.b, true);
      assert.equal(n.rPr.sz, 24);
      const res = resolver(doc);
      const p = paras(doc)[0];
      assert.equal(charOf(res.run(p, p.runs[0].rPr), p, res).bold,
        true);
      await roundTrips(doc, 'same as style');
    });

  it('toggle operands 0x80 and 0x81 are relative to the style',
    async () => {
      const styles = {stds: [{sti: 0, name: 'Normal', chpx: bold}]};
      const {doc} = read({styles, paras: [{text: 'aaa bbb ccc'}],
        runs: [{from: 0, to: 3, prls: [prl(C.CFBold, 0x81)]},
          {from: 4, to: 7, prls: [prl(C.CFBold, 0x80)]},
          {from: 8, to: 11, prls: [prl(C.CFItalic, 0x81)]}]});
      const r = runsOf(paras(doc)[0]);
      assert.deepEqual(r.map((x) => [x[0], x[1]]), [
        ['aaa', {extra: [], b: false}], [' bbb ', plain],
        ['ccc', {extra: [], i: true}]]);
      // other operand values change nothing
      assert.equal(applyChp(DCHAR, readSprms(prl(C.CFBold, 7), 0, 3),
        DCHAR).b, false);
      await roundTrips(doc, 'toggles');
    });

  it('a character style is the run\'s rStyle, measured over it',
    async () => {
      const styles = {stds: [{sti: 0, name: 'Normal'},
        ...new Array(9).fill(null),
        {sti: 65, stk: 2, name: 'Default Paragraph Font'},
        {sti: 0x0FFE, stk: 2, base: 10, name: 'Loud',
          chpx: grpprl(bold, prl(C.CIco, 2))}]};
      const {doc, notes} = read({styles, paras: [{text: 'x loud y'}],
        runs: [{from: 2, to: 6, prls: [prl(C.CIstd, u16le(11)),
          italic]}, {from: 7, to: 8, prls: [prl(C.CIstd, u16le(11)),
          prl(C.CPlain, 0)]}]});
      assert.deepEqual(notes, []);
      const r = runsOf(paras(doc)[0]);
      const loud = r.find((x) => x[0] === 'loud');
      // (the style's bold, a toggle, is written direct too: runRPr)
      assert.deepEqual(loud[1], {extra: [], i: true, b: true});
      const id = loud[2];
      const s = doc.styles.styles.get(id);
      assert.equal(s.name, 'Loud');
      assert.equal(s.type, 'character');
      assert.equal(s.rPr.b, true);
      assert.equal(s.rPr.color, '0000FF');
      // sprmCPlain: back to the paragraph style (not bold, not blue)
      const y = r.find((x) => x[0] === 'y');
      assert.equal(y[1].b, false);
      assert.equal(y[1].color, 'auto');
      await roundTrips(doc, 'character style');
    });

  it('sprmCFSpec hides specials', async () => {
    const spec = prl(C.CFSpec, 1);
    const {doc, notes} = read({paras: [{text: 'a(b<c>d (e) <f>'}],
      runs: [{from: 1, to: 2, prls: [spec]}, {from: 3, to: 4,
        prls: [spec]}, {from: 5, to: 6, prls: [spec]}]});
    assert.equal(paras(doc)[0].text, 'abcd (e) <f>');
    assert.deepEqual(notes, ['symbol characters are left out']);
    await roundTrips(doc, 'specials');
  });

  it('colour icos out of range and sizes out of range are notes',
    async () => {
      const {doc, notes} = read({paras: [{text: 'one two six'}],
        runs: [{from: 0, to: 3, prls: [prl(C.CIco, 40),
          prl(C.CHighlight, 17)]}, {from: 4, to: 7,
          prls: [prl(C.CHps, u16le(0))]},
        {from: 8, to: 11, prls: [prl(C.CHps, u16le(65535)),
          prl(C.CHpsPos, i16le(-32768))]}]});
      assert.deepEqual(notes.sort(), ['a colour out of range is left out',
        'a font size out of range is left out']);
      const r = runsOf(paras(doc)[0]);
      for (const [, rPr] of r) {
        assert.equal(rPr.color, undefined);
        assert.equal(rPr.sz, undefined);
        assert.ok(!JSON.stringify(rPr).includes('NaN'));
      }
      assert.equal(r[r.length - 1][1].extra[0].attrs[0][1], '-3168');
      await roundTrips(doc, 'out of range');
    });
});

describe('.doc: character styles over paragraph styles (fix round 1)',
  () => {
    const STY = {stds: [{sti: 0, name: 'Normal'},
      {sti: 1, base: 0, name: 'Heading 1', chpx: grpprl(
        prl(C.CHps, u16le(28)), prl(C.CFBold, 0x81))},
      ...new Array(8).fill(null),
      {sti: 65, stk: 2, name: 'Default Paragraph Font'},
      {sti: 0x0FFE, stk: 2, base: 10, name: 'Small',
        chpx: prl(C.CHps, u16le(20))},
      {sti: 87, stk: 2, base: 10, name: 'Strong',
        chpx: prl(C.CFBold, 0x81)},
      {sti: 0x0FFE, stk: 2, base: 10, name: 'Not Bold',
        chpx: prl(C.CFBold, 0)},
      {sti: 0x0FFE, stk: 2, base: 10, name: 'Abs Bold',
        chpx: prl(C.CFBold, 1)}]};
    const cs = (istd) => prl(C.CIstd, u16le(istd));
    /** The resolved size and bold of each run of paragraph p. */
    const looks = (doc, p) => {
      const res = resolver(doc);
      return p.runs.map((r) => {
        const c = charOf(res.run(p, r.rPr, r.rStyle), p, res);
        return [p.text.slice(r.start, r.end).trim(), c.size, c.bold];
      }).filter((x) => x[0]);
    };

    it('a character style of 10 pt (Word\'s default) in a 14 pt heading',
      async () => {
        const {doc} = read({styles: STY, paras: [{text: 'big small',
          istd: 1}, {text: 'body small'}], runs: [{from: 4, to: 9,
          prls: [cs(11)]}, {from: 15, to: 20, prls: [cs(11)]}]});
        const [h, b] = paras(doc);
        assert.deepEqual(looks(doc, h), [['big', 14, true],
          ['small', 10, true]]);
        assert.deepEqual(looks(doc, b), [['body', 10, false],
          ['small', 10, false]]);
        const small = doc.styles.styles.get(h.runs[1].rStyle);
        assert.equal(small.rPr.sz, 20);
        await roundTrips(doc, 'char style default size');
      });

    it('Strong (0x81, Word\'s) in a bold heading is not bold, in the ' +
      'Doc and as direct formatting for Word', async () => {
      const {doc} = read({styles: STY, paras: [
        {text: 'head strong notbold absbold', istd: 1},
        {text: 'body strong notbold absbold'}],
      runs: [{from: 5, to: 11, prls: [cs(12)]},
        {from: 12, to: 19, prls: [cs(13)]},
        {from: 20, to: 27, prls: [cs(14)]},
        {from: 33, to: 39, prls: [cs(12)]},
        {from: 40, to: 47, prls: [cs(13)]},
        {from: 48, to: 55, prls: [cs(14)]}]});
      const [h, b] = paras(doc);
      assert.deepEqual(looks(doc, h).map((x) => x[2]),
        [true, false, false, true]);
      assert.deepEqual(looks(doc, b).map((x) => x[2]),
        [false, true, false, true]);
      // every run in a style that sets bold has a direct b
      for (const p of [h, b]) {
        for (const r of p.runs) {
          if (r.rStyle) assert.equal(typeof r.rPr.b, 'boolean');
        }
      }
      assert.equal(doc.styles.styles.get(h.runs[1].rStyle).rPr.b, true);
      await roundTrips(doc, 'strong in heading');
    });

    it('charRuns ends a run at its paragraph mark', () => {
      const {bytes} = formattedDoc({styles: STY, paras: [
        {text: 'aaa', istd: 1}, {text: 'bbb'}],
      runs: [{from: 0, to: 8, prls: [prl(C.CFBold, 1)]}]});
      const runs = charRuns(openContext(bytes), 0, 8);
      assert.deepEqual(runs.map((r) => [r.cpStart, r.cpEnd, r.rPr.b]),
        [[0, 4, undefined], [4, 8, true]]);
    });
  });

describe('.doc: minor hardening (fix round 1)', () => {
  it('a Chpx pointing into the page head is left out', () => {
    const page = chpxPage([{fcFirst: 10, fcLim: 20, grpprl: bold}]);
    page[8] = 2;                          // (b = 4: inside rgfc)
    const word = new Uint8Array(512);
    word.set(page);
    const notes = [];
    assert.deepEqual(readFkp(word, 0, 'chp', (m) => notes.push(m)), []);
    assert.equal(notes.length, 1);
  });

  it('a Prm0 with a sprm index and value 0 is a note', async () => {
    const f = formattedDoc({paras: [{text: 'x'}]});
    const s = f.streams;
    const pcd = s.layout.tableAt.Clx + 5 + 8;
    new DataView(s.table.buffer).setUint16(pcd + 6, 0x0A << 1, true);
    const {packDoc} = await import('./doc-helpers.mjs');
    const {notes} = readDoc(packDoc(s));
    assert.deepEqual(notes,
      ['some formatting of fast-saved text is not read']);
  });
});

describe('.doc: paragraph formatting', () => {
  it('paragraph alignment indent spacing', async () => {
    const {doc, notes} = read({paras: [{text: 'centred', prls: [
      prl(C.PJc, 1), prl(C.PDxaLeft, i16le(720)),
      prl(C.PDxaLeft1, i16le(-360)), prl(C.PDxaRight, i16le(100)),
      prl(C.PDyaBefore, u16le(240)), prl(C.PDyaAfter, u16le(120)),
      prl(C.PDyaLine, [...i16le(360), ...i16le(1)]),
      prl(C.PFKeepFollow, 1), prl(C.PFPageBreakBefore, 1)]},
    {text: 'right', prls: [prl(C.PJc80, 2),
      prl(C.PDyaLine, [...i16le(-300), ...i16le(0)])]},
    {text: 'plain'}]});
    assert.deepEqual(notes, []);
    const [a, b, c] = paras(doc);
    assert.deepEqual(a.pPr, {extra: [], jc: 'center',
      ind: {left: 720, right: 100, hanging: 360},
      spacing: {before: 240, after: 120, line: 360, lineRule: 'auto'},
      keepNext: true, pageBreakBefore: true});
    assert.equal(b.pPr.jc, 'right');
    assert.deepEqual(b.pPr.spacing, {before: 0, after: 0, line: 300,
      lineRule: 'exact'});
    assert.deepEqual(c.pPr, {extra: []});
    await roundTrips(doc, 'paragraph formatting');
  });

  it('indents negative or huge are clamped, never NaN', async () => {
    const {doc} = read({paras: [{text: 'x', prls: [
      prl(C.PDxaLeft, i16le(-32768)), prl(C.PDxaRight, i16le(32767)),
      prl(C.PDyaBefore, u16le(65535)), prl(C.PNest, i16le(-30000))]}]});
    const p = paras(doc)[0];
    assert.deepEqual(p.pPr.ind, {left: -31680, right: 31680,
      firstLine: 0});
    assert.equal(p.pPr.spacing.before, 31680);
    await roundTrips(doc, 'clamped indents');
  });

  it('tab stops: added, deleted, at most MAX_TABS of 255', async () => {
    const add = (pos) => [...pos.flatMap(i16le),
      ...pos.map((_, i) => i % 2 ? 0x02 | (1 << 3) : 0x00)];
    const t3 = [720, 1440, 2160];
    const {doc} = read({paras: [{text: 'tabs', prls: [
      prl(C.PChgTabsPapx, [0, 3, ...add(t3)]),
      prl(C.PChgTabsPapx, [1, ...i16le(1440), 0])]}]});
    assert.deepEqual(paras(doc)[0].pPr.tabs, [{val: 'left', pos: 720},
      {val: 'left', pos: 2160}]);
    // 255 tab stops (PChgTabs with cb 255: its size from the counts)
    const pos = Array.from({length: 255}, (_, i) => 100 + 10 * i);
    const g = Uint8Array.from([0x15, 0xC6, 255, 0, 255, ...add(pos)]);
    const l = readSprms(g, 0, g.length);
    assert.equal(l.length, 1);
    const st = applyPap(DPARA, l, DPARA);
    assert.equal(st.tabs.length, MAX_TABS);
    assert.equal(st.tabs[1].leader, 'dot');
    assert.equal(st.tabs[1].val, 'right');
    await roundTrips(doc, 'tab stops');
  });

  it('borders, shading and list / table values are read', async () => {
    const brc = [0xFF, 0x00, 0x00, 0x00, 12, 3, 4, 0];   // red double
    const {doc, notes} = read({paras: [{text: 'boxed', prls: [
      prl(C.PBrcTop, brc), prl(C.PBrcBottom80, [8, 1, 2, 2]),
      prl(C.PShd80, u16le(7 << 5)), prl(C.PFWidowControl, 0),
      prl(C.PFNoLineNumb, 1),
      prl(C.PBrcBetween80, [8, 1, 0, 0]), prl(C.POutLvl, 3)]}]});
    const p = paras(doc)[0];
    assert.deepEqual(p.pPr.pBdr.top, {val: 'double', sz: 12,
      color: 'FF0000', space: 4});
    assert.deepEqual(p.pPr.pBdr.bottom, {val: 'single', sz: 8,
      color: '0000FF', space: 2});
    assert.equal(p.pPr.shd.fill, 'FFFF00');
    assert.equal(p.pPr.widowControl, false);
    assert.equal(p.pPr.suppressLineNumbers, true);
    assert.equal(p.pPr.outlineLvl, 3);
    assert.deepEqual(notes, ['borders between paragraphs are left out']);
    // (decoded for the table and list modules: task 13 reads them, so
    // they are only looked at here)
    const ctx = openContext(formattedDoc({paras: [{text: 'boxed',
      prls: [prl(C.PIlfo, i16le(1)), prl(C.PIlvl, 2),
        prl(C.PFInTable, 1), prl(C.PItap, u32le(1))]}]}).bytes);
    const {paraInfo} = await import(
      '../../tools/moreapps/!Letters/DocPapx');
    const info = paraInfo(ctx, 5);
    assert.deepEqual([info.para.ilfo, info.para.ilvl, info.para.inTable,
      info.para.itap], [1, 2, true, 1]);
    await roundTrips(doc, 'borders and shading');
  });
});

/** A Normal and a Heading 1 based on it, and a user style. */
const STYLES = {ftc: 1, stds: [
  {sti: 0, name: 'Normal', next: 0,
    chpx: grpprl(prl(C.CHps, u16le(24)), prl(C.CRgFtc0, i16le(2)))},
  {sti: 1, name: 'Heading 1', base: 0, next: 0,
    papx: grpprl(prl(C.PDyaBefore, u16le(240)), prl(C.PFKeepFollow, 1)),
    chpx: grpprl(bold, prl(C.CHps, u16le(32)))},
  null, null, null, null, null, null, null, null,
  {sti: 65, stk: 2, name: 'Default Paragraph Font'},
  {sti: 0x0FFE, name: 'My Quote,mq', base: 0, next: 11,
    papx: grpprl(prl(C.PJc, 1)), chpx: italic}]};
const FONTS = ['Symbol', 'Arial', 'Georgia'];

describe('.doc: styles', () => {
  it('a style chain Heading 1 based on Normal', async () => {
    const {doc, notes} = read({styles: STYLES, fonts: FONTS,
      paras: [{text: 'Title', istd: 1}, {text: 'Body'},
        {text: 'Quoted', istd: 11}]});
    assert.deepEqual(notes, []);
    const [h, body, q] = paras(doc);
    const st = doc.styles.styles;
    const h1 = st.get(h.pStyle);
    assert.equal(h1.name, 'heading 1');
    assert.equal(h1.basedOn, 'Normal');
    assert.equal(h1.rPr.b, true);
    assert.equal(h1.rPr.sz, 32);
    assert.equal(h1.pPr.spacing.before, 240);
    assert.equal(h1.pPr.keepNext, true);
    assert.equal(h1.pPr.outlineLvl, 0);
    assert.equal(body.pStyle, undefined);
    const n = st.get('Normal');
    assert.equal(n.rPr.sz, 24);
    assert.deepEqual(n.rPr.rFonts, {ascii: 'Georgia', hAnsi: 'Georgia'});
    const dd = doc.styles.docDefaults;
    assert.equal(dd.rPr.sz, 20);
    assert.equal(dd.rPr.rFonts.ascii, 'Arial');
    const my = st.get(q.pStyle);
    assert.equal(my.name, 'My Quote');
    assert.equal(my.next, q.pStyle);
    assert.equal(my.pPr.jc, 'center');
    assert.equal(my.rPr.i, true);
    for (const p of [h, body, q]) {
      assert.deepEqual(runsOf(p).map((r) => r[1]), [plain]);
      assert.deepEqual(p.pPr, {extra: []});
    }
    await roundTrips(doc, 'style chain');
  });

  it('a style sheet that loops is cut, so the Doc has no loop',
    async () => {
      const stds = [{sti: 0, name: 'Normal'},
        {name: 'A', base: 2, chpx: bold}, {name: 'B', base: 1,
          chpx: italic}, {name: 'Self', base: 3}];
      const {doc, notes} = read({styles: {stds}, paras: [{text: 'a',
        istd: 1}, {text: 'b', istd: 2}]});
      assert.ok(notes.includes(
        'a style that is based on itself: the loop is cut'));
      const st = doc.styles.styles;
      for (const s of st.values()) {
        const seen = new Set();
        for (let id = s.id; id; id = st.get(id) && st.get(id).basedOn) {
          assert.ok(!seen.has(id), 'a loop at ' + id);
          seen.add(id);
        }
      }
      await roundTrips(doc, 'style loop');
    });

  it('a basedOn chain 10,000 deep is cut, in bounded time', () => {
    const stds = [{sti: 0, name: 'Normal'}];
    for (let i = 1; i < 10000; i++) {
      stds.push({name: 'S' + i, base: i - 1, chpx: i === 1 ? bold : []});
    }
    stds.reverse();                     // (each based on the next)
    for (let i = 0; i < stds.length; i++) {
      stds[i] = {...stds[i], base: i + 1 < stds.length ? i + 1
        : 0x0FFF};
    }
    stds[stds.length - 1].sti = 0;
    const t = performance.now();
    const {doc, notes} = read({styles: {stds}, paras: [{text: 'deep',
      istd: 0}]});
    assert.ok(performance.now() - t < 5000);
    assert.ok(notes.some((n) => n.includes('more than ' + MAX_CHAIN)));
    assert.ok(notes.some((n) => n.includes('styles: the rest')));
    assert.equal(paras(doc)[0].text, 'deep');
  });

  it('names with control characters and duplicate names', async () => {
    const stds = [{sti: 0, name: 'Normal'},
      {name: 'Bad\u0001Na\u0007me'}, {name: 'Same'}, {name: 'Same'}];
    const {doc} = read({styles: {stds}, paras: [{text: 'a', istd: 1},
      {text: 'b', istd: 2}, {text: 'c', istd: 3}]});
    const names = paras(doc).map((p) => doc.styles.styles
      .get(p.pStyle).name);
    for (const n of names) assert.ok(!/[\x00-\x1f]/.test(n), n);
    assert.equal(names[1], 'Same');
    assert.notEqual(names[2], 'Same');
    assert.ok(names[2].startsWith('Same'));
    await roundTrips(doc, 'style names');
  });

  it('a style sheet with cstd 65535 or cut records reads what it has',
    () => {
      const good = stsh({stds: [{sti: 0, name: 'Normal', chpx: bold}]});
      const many = good.slice();
      many[2] = 0xFF;
      many[3] = 0xFF;                       // cstd 65535
      let r = read({paras: [{text: 'x'}], table: {Stshf: many}});
      assert.equal(r.doc.styles.styles.get('Normal').rPr.b, true);
      assert.ok(r.notes.includes(
        'the style sheet is damaged: some styles are not read'));
      // the record runs past the style sheet: read as far as it goes
      r = read({paras: [{text: 'x'}], table: {Stshf: good.slice(0,
        good.length - 2)}});
      assert.equal(r.doc.styles.styles.get('Normal').name, 'Normal');
      // a cbStshi past the end, a style sheet of 3 bytes
      for (const b of [Uint8Array.from([0xFF, 0xFF, 1, 0]),
        Uint8Array.from([1, 2, 3])]) {
        r = read({paras: [{text: 'x'}], table: {Stshf: b}});
        assert.equal(paras(r.doc)[0].text, 'x');
      }
    });
});

describe('.doc: FKP pages and bin tables (hostile)', () => {
  it('an FKP with crun beyond the page is cut', async () => {
    const run = {fcFirst: 0x400, fcLim: 0x402, grpprl: bold};
    const page = chpxPage([run]);
    page[511] = 255;
    const notes = [];
    const word = new Uint8Array(1024);
    word.set(page, 512);
    const runs = readFkp(word, 1, 'chp', (m) => notes.push(m));
    assert.ok(runs.length <= 101);
    assert.ok(notes.length > 0);
    // the same through a document: the text is read
    const {doc, notes: n2} = read({paras: [{text: 'abc'}],
      runs: [{from: 0, to: 3, prls: [bold]}],
      chpPage: (() => {
        const f = formattedDoc({paras: [{text: 'abc'}]});
        const p = chpxPage([{fcFirst: f.textAt, fcLim: f.textAt + 6,
          grpprl: bold}]);
        p[511] = 200;
        return p;
      })()});
    assert.equal(paras(doc)[0].text, 'abc');
    assert.ok(n2.length > 0);
    await roundTrips(doc, 'fkp cut');
  });

  it('rgfc not going forwards: those runs are left out', () => {
    const page = chpxPage([{fcFirst: 100, fcLim: 90, grpprl: bold},
      {fcFirst: 90, fcLim: 120, grpprl: italic},
      {fcFirst: 120, fcLim: 130, grpprl: bold}]);
    // rgfc 100 90 120 110: backwards, forwards, backwards
    const pv = new DataView(page.buffer);
    [100, 90, 120, 110].forEach((v, i) => pv.setUint32(4 * i, v, true));
    const word = new Uint8Array(512);
    word.set(page);
    const notes = [];
    const runs = readFkp(word, 0, 'chp', (m) => notes.push(m));
    assert.deepEqual(runs.map((r) => [r.fcFirst, r.fcLim]), [[90, 120]]);
    assert.ok(notes.length);
    const pap = papxPage([{fcFirst: 10, fcLim: 20, istd: 3,
      grpprl: prl(C.PJc, 1)}]);
    word.set(pap);
    const p = readFkp(word, 0, 'pap');
    assert.deepEqual([p[0].istd, [...p[0].grpprl]], [3,
      [...prl(C.PJc, 1)]]);
    // a PapxInFkp past the page's end
    word[4 * 2] = 255;
    assert.deepEqual(readFkp(word, 0, 'pap', () => {}), []);
  });

  it('pages outside the stream, bin tables of 1e9 entries or odd lcb',
    async () => {
      const f = formattedDoc({paras: [{text: 'abc'}]});
      const end = f.textAt + 8;
      for (const [table, what] of [
        [{PlcfBteChpx: plcBte([f.textAt, end], [1e6])}, 'pn past'],
        [{PlcfBteChpx: Uint8Array.from([...plcBte([f.textAt, end],
          [f.pn]), 1, 2, 3])}, 'odd lcb'],
        [{PlcfBteChpx: plcBte([end, f.textAt], [f.pn])}, 'backwards'],
        [{PlcfBtePapx: plcBte([f.textAt, end], [0x3FFFFF])}, 'papx']]) {
        const {doc, notes} = read({paras: [{text: 'abc'}],
          runs: [{from: 0, to: 3, prls: [bold]}], table});
        assert.equal(paras(doc)[0].text, 'abc', what);
        assert.ok(notes.length, what);
        await roundTrips(doc, 'bte ' + what);
      }
      // an lcb of 1e9 entries lies outside the table: a note
      const s = formattedDoc({paras: [{text: 'abc'}]}).streams;
      const dv = new DataView(s.word.buffer);
      dv.setUint32(s.layout.fib.pair('PlcfBteChpx') + 4, 8e9 % 2 ** 32,
        true);
      const {packDoc} = await import('./doc-helpers.mjs');
      const r = readDoc(packDoc(s));
      assert.equal(paras(r.doc)[0].text, 'abc');
      assert.ok(r.notes.some((n) => n.includes('outside its table')));
      const bte = readBte(s.table, {fc: {PlcfBteChpx: {fc: 0,
        lcb: 4 + 8 * 1e9}}}, 'PlcfBteChpx', () => {});
      assert.deepEqual(bte, {fcs: [], pns: []});
    });

  it('charRuns and paraAt give the runs and paragraphs by CP', () => {
    const {bytes} = formattedDoc({styles: STYLES, fonts: FONTS,
      paras: [{text: 'Title', istd: 1}, {text: 'one two', prls: [
        prl(C.PJc, 2)]}],
      runs: [{from: 6, to: 9, prls: [bold]}]});
    const ctx = openContext(bytes);
    const runs = charRuns(ctx, 0, 13);
    assert.deepEqual(runs.map((r) => [r.cpStart, r.cpEnd, r.rPr.b]),
      [[0, 6, undefined], [6, 9, true], [9, 13, undefined]]);
    assert.equal(paraAt(ctx, 2).pStyle, 'Heading1');
    assert.deepEqual(paraAt(ctx, 8), {pPr: {extra: [], jc: 'right'},
      pStyle: undefined});
  });

  it('a fast-saved piece\'s Prm adds its formatting', async () => {
    const prc = grpprl(bold, prl(C.PJc, 1));
    const f = formattedDoc({paras: [{text: 'fast'}], prc: [prc]});
    // the piece's Prm: Prm1 (fComplex) igrpprl 0
    const s = f.streams;
    const clxAt = s.layout.tableAt.Clx;
    const pcd = clxAt + 3 + prc.length + 5 + 8;
    new DataView(s.table.buffer).setUint16(pcd + 6, 1, true);
    const {packDoc} = await import('./doc-helpers.mjs');
    const {doc, notes} = readDoc(packDoc(s), {date: DATE});
    assert.deepEqual(notes, []);
    const p = paras(doc)[0];
    assert.equal(p.pPr.jc, 'center');
    assert.equal(runsOf(p)[0][1].b, true);
    await roundTrips(doc, 'prm');
  });
});

// ------------------------------------------------------------------
// The real files (the uncommitted corpus; skipped when absent)
const HERE = path.dirname(new URL(import.meta.url).pathname);
function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}
const FILES = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].flatMap((d) =>
  find(path.join(HERE, d), '.doc')).sort();

/** Per document: characters bold / italic / underlined, words with
 *  their size, heading / centred / right paragraphs. */
function stats(doc) {
  const dd = doc.styles.docDefaults;
  if (dd.rPr.sz === undefined) {        // (OOXML's default: 10 pt)
    doc.styles = {...doc.styles, docDefaults: {...dd,
      rPr: {...dd.rPr, sz: 20}}};
  }
  const res = resolver(doc);
  const st = {b: 0, i: 0, u: 0, words: [], heads: 0, center: 0,
    right: 0};
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'tbl') {
        for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
        continue;
      }
      if (b.type !== 'p') continue;
      const jc = res.para(b).jc;
      if (jc === 'center') st.center++;
      if (jc === 'right' || jc === 'end') st.right++;
      const s = doc.styles.styles.get(b.pStyle ??
        doc.styles.defaults.paragraph);
      if (s && /^heading \d$/i.test(s.name || '')) st.heads++;
      let txt = '';
      const at = [];
      for (const r of b.runs) {
        const c = charOf(res.run(b, r.rPr, r.rStyle), b, res);
        for (let k = r.start; k < r.end; k++) {
          if (b.text[k] === '￼') continue;
          txt += b.text[k];
          at.push(c);
          if (/\s/.test(b.text[k])) continue;
          if (c.bold) st.b++;
          if (c.italic) st.i++;
          if (c.underline) st.u++;
        }
      }
      for (const m of txt.matchAll(/\S+/g)) {
        st.words.push([m[0], at[m.index].size]);
      }
    }
  };
  for (const s of doc.sections) walk(s.blocks);
  return st;
}

/** Of the words both have, the share with the same size. */
function sizeRatio(a, b) {
  const bags = (xs, key) => {
    const m = new Map();
    for (const w of xs) m.set(key(w), (m.get(key(w)) || 0) + 1);
    return m;
  };
  const common = (xs, ys, key) => {
    const bag = bags(ys, key);
    let n = 0;
    for (const w of xs) {
      const k = bag.get(key(w));
      if (k) {
        n++;
        bag.set(key(w), k - 1);
      }
    }
    return n;
  };
  const n0 = common(a, b, (w) => w[0]);
  return n0 ? common(a, b, (w) => w[0] + '\u0001' + w[1]) / n0 : 1;
}

describe('.doc corpus: formatting', {skip: FILES.length ? false :
  'no .doc corpus (optional, git-ignored: tools/moreapps-corpus.mjs)'},
() => {
  it('every .doc reads or is refused with an ImportError in 5 s', () => {
    const counts = {};
    for (const f of FILES) {
      const t = performance.now();
      let got = 'ok';
      try {
        readDoc(new Uint8Array(fs.readFileSync(f)));
      } catch (e) {
        assert.equal(e.name, 'ImportError', f + ': ' + e.stack);
        got = e.code;
      }
      assert.ok(performance.now() - t < 5000, f);
      counts[got] = (counts[got] || 0) + 1;
    }
    console.log('# doc corpus: ' + JSON.stringify(counts));
  });

  it('formatting against the .docx twins', async () => {
    const docx = find(CORPUS, '.docx');
    const conv = path.join(CORPUS, 'converted', 'doc');
    const pairs = [];
    for (const f of find(conv, '.doc')) {
      const x = path.join(CORPUS, path.relative(conv, f)
        .replace(/\.doc$/i, '.docx'));
      if (fs.existsSync(x)) pairs.push([f, x, 'LibreOffice']);
    }
    for (const f of FILES.filter((p) => p.includes('doc-from-word'))) {
      const base = path.basename(f).replace(/\.doc$/i, '.docx');
      const x = docx.find((p) => path.basename(p) === base);
      if (x) pairs.push([f, x, 'Word']);
    }
    const KEYS = ['b', 'i', 'u', 'heads', 'center', 'right'];
    const by = {};
    for (const [f, x, who] of pairs) {
      let a, b;
      try {
        a = stats(readDoc(new Uint8Array(fs.readFileSync(f))).doc);
        b = stats(await readDocx(new Uint8Array(fs.readFileSync(x))));
      } catch (e) {
        continue;
      }
      const t = by[who] ||= {n: 0, size: 0, ...Object.fromEntries(
        KEYS.map((k) => [k, [0, 0]]))};
      t.n++;
      t.size += sizeRatio(a.words, b.words);
      for (const k of KEYS) {
        t[k][0] += a[k];
        t[k][1] += b[k];
      }
    }
    for (const [who, t] of Object.entries(by)) {
      console.log(`# doc formatting (${who}): ${t.n} compared, ` +
        KEYS.map((k) => `${k} ${t[k][0]}/${t[k][1]}`).join(', ') +
        `, same size ${(t.size / t.n).toFixed(3)}`);
      assert.ok(t.size / t.n > 0.98, who);
    }
    assert.ok(Object.keys(by).length > 0);
  });
});
