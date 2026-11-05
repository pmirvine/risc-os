// Whole-set checks over every starter (Task 7): opened the way
// openStarter opens them, one placeholder typed over and undone, the
// .docx read back equal; the Design menu's theme (setColors/setFonts)
// reaches each design; text hygiene over every text part; Word.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {blocks} from '../../tools/moreapps/!Letters/Walk';
import {STARTERS, openChecked}
  from '../../tools/moreapps/!Letters/StarterList';
import {resolveRun, resolvePara} from '../../tools/moreapps/!Letters/Styles';
import {fontName} from '../../tools/moreapps/!Letters/Fmt';
import {colorOf} from '../../tools/moreapps/!Letters/ThemeRead';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {asTemplate} from '../../tools/moreapps/!Letters/Template';
import {assertSameDoc} from './docx-compare.mjs';
import {emit} from './word-emit.mjs';

const DATE = new Date(Date.UTC(2026, 10, 5, 12));
const opened = (id) => openChecked(id, (m) => assert.fail(m));
const allParas = (doc) => {
  const out = [...blocks(doc)].map((e) => e.b);
  for (const s of doc.stories.values())
    out.push(...[...blocks({sections: [{blocks: s.blocks}]})]
      .map((e) => e.b));
  return out.filter((b) => b.type === 'p');
};
// (a field's marker is U+FFFC in the text: not text)
const texts = (doc) => allParas(doc).map((p) =>
  p.text.replace(/\uFFFC/g, ''));

describe('every starter, opened as openStarter opens it', () => {
  it('there are 16', () => assert.equal(STARTERS.length, 16));

  it('typing over a placeholder, undo, write, read back equal',
    async () => {
      for (const s of STARTERS) {
        const r = opened(s.id);
        assert.equal(r.format, 'docx');
        assert.equal(r.imported, 'template');
        assert.equal(r.title, s.title);
        const d = new Document(r.doc);
        d.clearHistory();
        const body = [...blocks(d.doc)].map((e) => e.b)
          .filter((b) => b.type === 'p');
        const p = body.find((b) => /\[[^\]]+\]/.test(b.text));
        assert.ok(p, s.id);
        const before = texts(d.doc);
        const off = p.text.indexOf('[') + 1;
        let t = 0;
        const ty = new Typing(d, {now: () => (t += 50)});
        let sel = S.caret({id: blockId(p), off});
        for (const ch of 'xyz') sel = ty.type(sel, ch);
        assert.notDeepEqual(texts(d.doc), before, s.id);
        assert.equal(d.undoDepth, 1, s.id);
        d.undo();
        assert.deepEqual(texts(d.doc), before, s.id);
        const bytes = await writeDocx(d.doc, {date: DATE});
        const back = await readDocx(bytes);
        assertSameDoc(back, d.doc, s.id);
      }
    });

  const first = (doc) => {
    const ps = allParas(doc).filter((p) => p.runs.length);
    return ps.find((p) => /^(Title|Heading\d|Subtitle)$/.test(
      p.pStyle || '')) || ps[0];
  };
  const look = (d, p) => {
    const rp = resolveRun(d.doc.styles, p, p.runs[0]);
    const c = (rp.extra || []).find((x) => x.name === 'w:color');
    const at = c ? Object.fromEntries(c.attrs) : {};
    return {font: fontName(rp, d.doc.styles.theme),
      themed: /^accent/.test(at['w:themeColor'] || ''),
      color: colorOf(d.doc.styles.theme, {color: at['w:val'],
        themeColor: at['w:themeColor'], themeTint: at['w:themeTint'],
        themeShade: at['w:themeShade']})};
  };
  const scheme = COLOR_SCHEMES.find((c) => c.name === 'Paper');
  const pair = FONT_PAIRS.find((f) => f.name === 'Garamond');

  it('Design menu fonts and colours reach every starter; undo',
    () => {
      let colourSeen = 0;
      for (const s of STARTERS) {
        const d = new Document(opened(s.id).doc);
        d.clearHistory();
        const lit = texts(d.doc);
        const p = allParas(d.doc).filter((q) => q.runs.length)
          .find((q) => look(d, q).themed) || first(d.doc);
        const was = look(d, p);
        assert.deepEqual(TD.setFonts(d, pair), {ok: true}, s.id);
        assert.ok([pair.major, pair.minor].includes(look(d, p).font),
          s.id + ' font ' + look(d, p).font);
        assert.deepEqual(texts(d.doc), lit, s.id);
        d.undo();
        assert.deepEqual(look(d, p), was, s.id);
        assert.deepEqual(TD.setColors(d, scheme), {ok: true}, s.id);
        if (was.themed) {
          colourSeen++;
          assert.notEqual(look(d, p).color, was.color, s.id);
        }
        assert.deepEqual(texts(d.doc), lit, s.id);
        d.undo();
        assert.deepEqual(look(d, p), was, s.id);
      }
      assert.ok(colourSeen >= 6, 'themed colours in ' + colourSeen);
    });
});

describe('a starter ending in a table', () => {
  const tailOf = (doc) => {
    const bl = doc.sections.at(-1).blocks;
    assert.equal(bl.at(-2).type, 'tbl');
    assert.equal(bl.at(-1).type, 'p');
    return bl.at(-1);
  };
  it('the agenda ends in an ordinary paragraph: typing is normal',
    () => {
      const d = new Document(opened('agenda').doc);
      d.clearHistory();
      const p = tailOf(d.doc);
      assert.equal(p.text, '');
      const sp = resolvePara(d.doc.styles, p).spacing || {};
      assert.notEqual(sp.lineRule, 'exact');
      let t = 0;
      const ty = new Typing(d, {now: () => (t += 50)});
      let sel = S.caret({id: blockId(p), off: 0});
      for (const ch of 'Notes') sel = ty.type(sel, ch);
      assert.equal(tailOf(d.doc).text, 'Notes');
      const q = tailOf(d.doc);
      const rp = resolveRun(d.doc.styles, q, q.runs[0]);
      assert.ok(rp.sz === undefined || rp.sz >= 20, 'sz ' + rp.sz);
    });
  it('only the two-column CV keeps a one-point tail, on one page',
    async () => {
      const d = opened('cv-two-column').doc;
      const sp = resolvePara(d.styles, tailOf(d)).spacing;
      assert.equal(sp.lineRule, 'exact');
      assert.ok(sp.line <= 20);
      for (const s of STARTERS) {
        const doc = s.build(), last = doc.sections.at(-1).blocks.at(-1);
        assert.equal(last.type, 'p', s.id);
        if (s.id === 'cv-two-column') continue;
        const x = resolvePara(doc.styles, last).spacing || {};
        assert.notEqual(x.lineRule, 'exact', s.id);
      }
    });
});

describe('hygiene over every text part', () => {
  const US = /\b(color|colors|organization|organizations|center|centered|favorite|zip code)\b/i;
  it('no US spellings or Microsoft names, Latin-1, balanced, '
    + 'no empty placeholders', () => {
    for (const s of STARTERS) {
      for (const t of texts(s.build())) {
        assert.doesNotMatch(t, US, s.id + ': ' + t);
        assert.doesNotMatch(t, /microsoft/i, s.id);
        assert.doesNotMatch(t, /[^\u0000-ÿ]/, s.id + ': ' + t);
        assert.doesNotMatch(t, /[\u0000-\u0008\u000b-\u001f\u007f]/,
          s.id);
        assert.doesNotMatch(t, /\[\s*\]/, s.id + ': ' + t);
        let depth = 0;
        for (const c of t) {
          if (c === '[') depth++;
          if (c === ']') depth--;
          assert.ok(depth >= 0 && depth <= 1, s.id + ': ' + t);
        }
        assert.equal(depth, 0, s.id + ': ' + t);
      }
    }
  });
});

describe('every starter in real Word (WORD_EMIT)', () => {
  it('as .docx and as .dotx', async () => {
    for (const s of STARTERS) {
      const d = s.build();
      emit('st7-' + s.id, await writeDocx(d, {date: DATE}));
      emit('st7-tpl-' + s.id, await writeDocx(asTemplate(s.build()),
        {date: DATE}), {ext: '.dotx'});
    }
  });
});
