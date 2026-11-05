// The starter templates (File > New from template): a harness
// table-driven over STARTERS (a later task only registers a
// builder), the StarterKit builders, and per-design checks.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {checkBlock, checkStory}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {blocks} from '../../tools/moreapps/!Letters/Walk';
import {STARTERS, GROUPS, starterOf, openResult}
  from '../../tools/moreapps/!Letters/StarterList';
import {starterDoc, para, run, tab, br, field, table, list,
  footerPageXofY, header, sectionBreak}
  from '../../tools/moreapps/!Letters/StarterKit';
import {businessLetter}
  from '../../tools/moreapps/!Letters/StartersLetters';
import {resolvePara} from '../../tools/moreapps/!Letters/Styles';
import {assertSameDoc} from './docx-compare.mjs';
import {tm} from './word-docs.mjs';
import {emit} from './word-emit.mjs';
import {PAGES} from './starter-pages.mjs';

// whole words (case-insensitive) that must not appear: US spellings
// and product names; extend as needed
const BANNED = ['color', 'colors', 'organization', 'organizations',
  'center', 'centered', 'zip code', 'favorite', 'microsoft'];
const BAD = new RegExp('\\b(' + BANNED.join('|') + ')\\b', 'i');

/** Every block of the body and the stories, tables descended. */
function everyBlock(doc) {
  const out = [...blocks(doc)].map((e) => e.b);
  for (const s of doc.stories.values())
    for (const e of blocks({sections: [{blocks: s.blocks}]}))
      out.push(e.b);
  return out;
}
const paras = (doc) => everyBlock(doc).filter((b) => b.type === 'p');
const textOf = (doc) => paras(doc).map((p) => p.text);
const pagesOf = (doc) => {
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  return new Pages(printGalley(L)).finish().count;
};

/** Style ids named by paragraphs and runs. */
function styleIds(doc) {
  const ids = new Set();
  for (const p of paras(doc)) {
    if (p.pStyle) ids.add(p.pStyle);
    for (const r of p.runs) if (r.rStyle) ids.add(r.rStyle);
  }
  return ids;
}

describe('starters (every registered design)', () => {
  it('has the groups and unique ids', () => {
    assert.deepEqual(GROUPS, ['Letters', 'Careers', 'Reports',
      'Business']);
    assert.equal(new Set(STARTERS.map((s) => s.id)).size,
      STARTERS.length);
    for (const s of STARTERS) {
      assert.ok(GROUPS.includes(s.group), s.id);
      assert.ok(s.title && s.help, s.id);
      assert.equal(starterOf(s.id), s);
    }
  });
  for (const s of STARTERS) {
    describe(s.id, () => {
      const doc = s.build();
      it('is a valid model', () => {
        for (const b of everyBlock(doc)) checkBlock(b);
        for (const st of doc.stories.values()) checkStory(st);
      });
      it('writes and reads back equal', async () => {
        const back = await readDocx(await writeDocx(doc));
        assertSameDoc(back, doc, s.id);
      });
      it('is A4 with the Office theme', () => {
        const pg = doc.sections[0].props.pgSz;
        assert.deepEqual([pg.w, pg.h], [11906, 16838]);
        assert.ok(doc.styles.theme);
      });
      it('has balanced placeholders, at least three', () => {
        let n = 0;
        for (const t of textOf(doc)) {
          let open = false;
          for (const c of t) {
            if (c === '[') { assert.ok(!open, t); open = true; n++; }
            if (c === ']') { assert.ok(open, t); open = false; }
          }
          assert.ok(!open, 'unclosed [ in ' + t);
        }
        assert.ok(n >= 3, s.id + ' has ' + n);
      });
      it('keeps to clean text', () => {
        for (const p of paras(doc)) {
          const t = p.text;
          assert.doesNotMatch(t, BAD, t);
          assert.doesNotMatch(t, /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/, t);
          const n = t.split('\t').length - 1;
          assert.equal(n, n && p.pPr.tabs ? p.pPr.tabs.length : 0, t);
        }
      });
      it('uses only styles that exist', () => {
        for (const id of styleIds(doc))
          assert.ok(doc.styles.styles.has(id), id);
      });
      it('has tables that fit the text width', () => {
        for (const t of everyBlock(doc).filter((b) =>
          b.type === 'tbl')) {
          const sum = t.grid.reduce((a, b) => a + b, 0);
          const m = doc.sections[0].props.pgMar;
          assert.ok(sum <= 11906 - m.left - m.right, 'grid ' + sum);
          for (const r of t.rows) {
            const n = r.cells.reduce((a, c) =>
              a + (c.tcPr.gridSpan || 1), 0);
            assert.equal(n, t.grid.length, 'row covers the grid');
            let at = 0;
            for (const c of r.cells) {
              const k = c.tcPr.gridSpan || 1;
              const w = t.grid.slice(at, at + k)
                .reduce((a, b) => a + b, 0);
              assert.equal(c.tcPr.tcW.w, w, 'cell width');
              at += k;
            }
          }
        }
      });
      it('opens as an untitled template copy', () => {
        const o = openResult(s.id);
        assert.equal(o.format, 'docx');
        assert.equal(o.imported, 'template');
        assert.deepEqual(o.notes, []);
        assert.ok(o.doc.sections.length >= 1);
      });
    });
  }
});

describe('StarterKit', () => {
  const doc = starterDoc({title: 'Kit', body: [
    para(['A ', run('bold', {b: true, themeColor: 'accent1'}), tab(),
      'x', br()], {style: 'Subtitle'}),
    table({cols: [3000, 3000, 3026], borders: 'grid', header: true,
      rows: [[{content: ['wide'], span: 2}, 'c'],
        ['a', 'b', {content: [para('shaded')],
          shade: {themeFill: 'accent1', themeFillTint: '33'}}]]}),
    ...list(['one', 'two'], 'bullet'),
    ...list(['first', 'second'], 'number'),
    para(['Page ', field('PAGE', '1')], {border: {bottom:
      {sz: 8, space: 1, themeColor: 'accent1'}}}),
    sectionBreak({type: 'continuous'}),
    para('end'),
  ], header: [header('Head')], footer: [footerPageXofY()]});

  it('makes a normal Doc that round-trips', async () => {
    const back = await readDocx(await writeDocx(doc));
    assertSameDoc(back, doc, 'kit');
    assert.equal(doc.sections.length, 2);
  });
  it('spans, shades and repeats the header row', () => {
    const t = doc.sections[0].blocks.find((b) => b.type === 'tbl');
    assert.deepEqual(t.grid, [3000, 3000, 3026]);
    assert.equal(t.rows[0].cells[0].tcPr.gridSpan, 2);
    assert.ok(t.rows[0].trPr.tblHeader);
    const shd = t.rows[1].cells[2].tcPr.extra.find((x) =>
      x.name === 'w:shd');
    assert.ok(shd.attrs.some(([k, v]) => k === 'w:themeFill' &&
      v === 'accent1'));
  });
  it('has a field, lists, a header and a footer', () => {
    const ps = doc.sections[0].blocks.filter((b) => b.type === 'p');
    assert.ok(ps.some((p) => Object.keys(p.inlines).length === 4));
    assert.equal(ps.filter((p) => p.pStyle === 'ListParagraph').length,
      4);
    assert.ok(doc.numbering.nums.has(1) && doc.numbering.nums.has(2));
    const parts = [...doc.stories.values()];
    assert.deepEqual(parts.map((s) => s.kind), ['hdr', 'ftr']);
    assert.match(parts[1].blocks[0].text, /^Page .+ of /);
    assert.ok(doc.styles.styles.has('Footer'));
  });
  it('is a real .docx Word accepts (WORD_EMIT)', async () => {
    emit('starter-kit-sample', await writeDocx(doc));
  });
  it('gives a row a minimum height that round-trips', async () => {
    const d = starterDoc({body: [table({cols: [9026], header: true,
      rows: [{height: 1000, cells: ['h']},
        {height: 4000, cells: ['x']}, ['y']]})]});
    const t = d.sections[0].blocks[0];
    assert.deepEqual(t.rows.map((r) => r.trPr.trHeight &&
      [r.trPr.trHeight.val, r.trPr.trHeight.hRule]),
    [[1000, 'atLeast'], [4000, 'atLeast'], undefined]);
    assert.ok(t.rows[0].trPr.tblHeader);
    assertSameDoc(await readDocx(await writeDocx(d)), d, 'heights');
    emit('starter-kit-row-height', await writeDocx(d));
  });
  it('puts the title in docProps/core.xml', () => {
    assert.match(new TextDecoder().decode(
      doc.parts.get('docProps/core.xml')),
    /<dc:title>Kit<\/dc:title>/);
  });
  it('gives an empty cell one empty paragraph', () => {
    const d = starterDoc({body: [table({cols: [9026],
      rows: [[{content: []}]]})]});
    const c = d.sections[0].blocks[0].rows[0].cells[0];
    assert.equal(c.blocks.length, 1);
    assert.equal(c.blocks[0].text, '');
  });
  it('refuses a style that is not built in', () => {
    assert.throws(() => starterDoc({body: [para('x',
      {style: 'NoSuchStyle'})]}), RangeError);
  });
});

describe('StarterKit numbered lists and sections', () => {
  const lists = starterDoc({body: [
    ...list(['a', 'b'], 'number'),
    ...list(['c', 'd'], 'number', {restart: 1}),
    ...list(['e'], 'number', {restart: 2}),
  ]});
  it('restarts a second numbered list', async () => {
    const ps = lists.sections[0].blocks;
    const ids = ps.map((p) => p.pPr.numPr.numId);
    assert.deepEqual(ids, [2, 2, 3, 3, 4]);
    for (const id of [3, 4]) {
      const n = lists.numbering.nums.get(id);
      assert.equal(n.abstractNumId, lists.numbering.nums.get(2)
        .abstractNumId);
      assert.ok(n.overrides, 'override ' + id);
    }
    const xml = JSON.stringify(lists.numbering.raw);
    assert.equal(xml.split('w:startOverride').length - 1, 2);
    assertSameDoc(await readDocx(await writeDocx(lists)), lists,
      'lists');
    emit('starter-kit-two-lists', await writeDocx(lists));
  });
  const secs = starterDoc({finalType: 'continuous', body: [
    para('Heading'),
    sectionBreak({type: 'continuous'}),
    para('Left column text.'),
    sectionBreak({type: 'continuous', cols: {num: 2, space: 708}}),
    para('Footer line.'),
  ]});
  it('writes the section types as intended', async () => {
    assert.equal(secs.sections.length, 3);
    const back = await readDocx(await writeDocx(secs));
    assertSameDoc(back, secs, 'sections');
    const raw = (i) => JSON.stringify(secs.sections[i].raw);
    for (const i of [0, 1, 2]) {
      assert.match(raw(i), /w:type[^}]*continuous/, 'type ' + i);
      assert.deepEqual(secs.sections[i].props.pgSz,
        {w: 11906, h: 16838});
    }
    assert.equal(secs.sections[1].props.cols.num, 2);
    assert.equal(secs.sections[0].props.pgMar.left, 1440);
    emit('starter-kit-sections', await writeDocx(secs));
  });
  it('lays three continuous sections on one page', () => {
    assert.equal(pagesOf(secs), 1);
  });
  it('starts a section after a plain break on a new page', () => {
    const d = starterDoc({body: [para('a'), sectionBreak(),
      para('b')]});
    assert.equal(pagesOf(d), 2);
  });
});

describe('Business letter', () => {
  const doc = businessLetter();
  const text = textOf(doc);
  it('has its parts in order', () => {
    const want = ['[Your name]', '[Address line 1]', '[Address line 2]',
      '[Town]', '[Postcode]', '[Telephone]', '[Email]',
      '[5 November 2026]', '[Recipient name]', 'Our ref: [reference]',
      'Dear [Name],', '[Subject of your letter]',
      'Yours sincerely,', '', '', '', '[Your name]',
      '[Your position]', 'Enc: [enclosures]'];
    let at = 0;
    for (const w of want) {
      const k = text.indexOf(w, at);
      assert.ok(k >= at, w);
      at = k + 1;
    }
    const sign = text.indexOf('Yours sincerely,');
    assert.deepEqual(text.slice(sign + 1, sign + 4), ['', '', '']);
  });
  it('sets the sender right and the subject bold', () => {
    const ps = paras(doc);
    assert.equal(ps[0].pPr.jc, 'right');
    const subj = ps.find((p) => p.text.startsWith('[Subject'));
    assert.equal(subj.runs[0].rPr.b, true);
    assert.ok(text.indexOf('[Give the details the reader needs: ' +
      'dates, amounts, what you ask them to do.]') >
      text.indexOf('[Subject of your letter]'));
    assert.ok(text.indexOf('Yours sincerely,') > text.indexOf(
      '[Close with the next step and how to reach you.]'));
  });
  it('uses at most Normal and Subtitle', () => {
    for (const id of styleIds(doc))
      assert.ok(['Normal', 'Subtitle'].includes(id), id);
  });
  it('fits on one page', () => {
    assert.equal(pagesOf(doc), 1);
  });
  it('is a real .docx Word accepts (WORD_EMIT)', async () => {
    emit('starter-business-letter', await writeDocx(doc));
  });
});

describe('Letters group: personal, cover, memo, fax', () => {
  const inOrder = (text, want) => {
    let at = 0;
    for (const w of want) {
      const k = text.findIndex((t, i) => i >= at && t.startsWith(w));
      assert.ok(k >= at, w);
      at = k + 1;
    }
  };
  const tbls = (d) => d.sections[0].blocks.filter((b) =>
    b.type === 'tbl');
  const ids = ['personal-letter', 'cover-letter', 'memo', 'fax-cover'];
  it('are registered in the Letters group with titles', () => {
    assert.deepEqual(ids.map((i) => starterOf(i).title),
      ['Personal letter', 'Cover letter', 'Memo', 'Fax cover sheet']);
    for (const i of ids) assert.equal(starterOf(i).group, 'Letters');
  });
  it('personal letter: address right, Best wishes', () => {
    const d = starterOf('personal-letter').build();
    const t = textOf(d);
    inOrder(t, ['[Your address line 1]', '[5 November 2026]',
      'Dear [Name],', 'Best wishes,', '[Your name]']);
    assert.equal(paras(d)[0].pPr.jc, 'right');
  });
  it('cover letter: parts in order', () => {
    const t = textOf(starterOf('cover-letter').build());
    inOrder(t, ['[Your name]', '[5 November 2026]', '[Hiring manager]',
      'Dear [Hiring manager],', 'Re: [Job title] (ref [reference])',
      '[Say which post', '[Describe your most relevant',
      '[Add the skills or training', '[Say when you are available',
      'Yours sincerely,', '[Your name]']);
  });
  it('memo: Title, 4 x 2 table, rule, action line', () => {
    const d = starterOf('memo').build();
    const [t] = tbls(d);
    assert.equal(t.rows.length, 4);
    assert.deepEqual(t.grid, [1500, 7526]);
    assert.equal(paras(d)[0].pStyle, 'Title');
    assert.deepEqual(t.rows.map((r) => r.cells[0].blocks[0].text),
      ['To', 'From', 'Date', 'Subject']);
    assert.equal(t.rows[0].cells[0].blocks[0].runs[0].rPr.b, true);
    const bd = (c) => JSON.stringify(c.tcPr.extra);
    assert.match(bd(t.rows[3].cells[0]), /w:bottom/);
    for (const r of t.rows.slice(0, 3)) for (const c of r.cells)
      assert.doesNotMatch(bd(c), /w:(top|left|bottom|right)/);
    for (const c of t.rows[3].cells)
      assert.doesNotMatch(bd(c), /w:(top|left|right)/);
    assert.doesNotMatch(JSON.stringify(t.tblPr || t.props || {}),
      /"(single|dotted)"/);
    assert.equal(t.grid.reduce((a, b) => a + b, 0), 9026);
    assert.doesNotMatch(bd(t.rows[0].cells[0]), /w:bottom/);
    assert.ok(textOf(d).some((x) => x.startsWith('Action required: [')));
  });
  it('fax: Title, 7-row table, boxed message, small note', () => {
    const d = starterOf('fax-cover').build();
    const [t, box] = tbls(d);
    assert.equal(paras(d)[0].pStyle, 'Title');
    assert.equal(t.rows.length, 7);
    assert.deepEqual(t.rows.map((r) => r.cells[0].blocks[0].text),
      ['To', 'Company', 'Fax number', 'From', 'Date', 'Pages',
        'Subject']);
    assert.deepEqual(t.grid, [2000, 7026]);
    assert.equal(t.grid.reduce((a, b) => a + b, 0), 9026);
    assert.deepEqual(box.grid, [9026]);
    assert.deepEqual(box.rows[0].trPr.trHeight,
      {val: 4000, hRule: 'atLeast'});
    assert.equal(box.rows[0].cells[0].blocks.length, 1);
    assert.match(JSON.stringify(t.tblPr || t.props || {}), /insideH/);
    assert.equal(box.rows.length, 1);
    assert.equal(box.rows[0].cells.length, 1);
    const b = JSON.stringify(box.rows[0].cells[0].tcPr.extra);
    for (const s of ['top', 'left', 'bottom', 'right'])
      assert.match(b, new RegExp('w:' + s));
    const note = paras(d).at(-1);
    assert.equal(note.runs[0].rPr.sz, 16);
    inOrder(textOf(d), ['Message', '[Write your message here.]']);
  });
  it('each fits one page', () => {
    for (const i of ids) assert.equal(pagesOf(starterOf(i).build()), 1, i);
  });
  it('each is a real .docx Word accepts (WORD_EMIT)', async () => {
    for (const i of ids)
      emit('starter-' + i, await writeDocx(starterOf(i).build()));
  });
});

describe('Careers group: CV (simple), CV (two column)', () => {
  const ids = ['cv-simple', 'cv-two-column'];
  const tabsOf = (d) => paras(d).filter((p) => p.pPr.tabs);
  const heads = (d) => paras(d).filter((p) => p.pStyle === 'Heading1')
    .map((p) => p.text);
  it('are registered in the Careers group, British titles', () => {
    assert.deepEqual(ids.map((i) => starterOf(i).title),
      ['CV (simple)', 'CV (two column)']);
    for (const i of ids) assert.equal(starterOf(i).group, 'Careers');
  });
  it('simple: name, contact, ruled headings in order', () => {
    const d = starterOf('cv-simple').build();
    const ps = paras(d);
    assert.equal(ps[0].pStyle, 'Title');
    assert.equal(ps[0].text, '[Your name]');
    assert.equal(ps[1].text, '[Address] | [Telephone] | [Email]');
    assert.equal(ps[1].pPr.jc, 'center');
    assert.deepEqual(heads(d), ['Profile', 'Experience', 'Education',
      'Skills', 'Interests']);
    for (const p of ps.filter((x) => x.pStyle === 'Heading1'))
      assert.match(JSON.stringify(p.pPr.extra), /w:bottom.*accent1/);
    assert.equal(d.sections[0].blocks.some((b) => b.type === 'tbl'),
      false);
  });
  it('simple: roles have dates on a right tab at 9026', () => {
    const d = starterOf('cv-simple').build();
    const t = tabsOf(d);
    assert.equal(t.length, 3);
    for (const p of t) {
      assert.deepEqual(p.pPr.tabs, [{val: 'right', pos: 9026}]);
      assert.equal(p.text.split('\t').length, 2);
      assert.equal(p.runs[0].rPr.b, true);
    }
    const i = paras(d).indexOf(t[0]);
    assert.equal(paras(d)[i + 1].runs[0].rPr.i, true);
    assert.equal(paras(d)[i + 2].pStyle, 'ListParagraph');
    assert.match(textOf(d).join('\n'), /Professional: .*\nPractical: /);
  });
  it('two column: one table, 2800 + 6838 within 9638', () => {
    const d = starterOf('cv-two-column').build();
    const bl = d.sections[0].blocks.filter((b) => b.type === 'tbl');
    assert.equal(bl.length, 1);
    const [t] = bl;
    assert.deepEqual(t.grid, [2800, 6838]);
    const w = t.grid.reduce((a, b) => a + b, 0);
    const pm = d.sections[0].props.pgMar;
    assert.equal(w, 11906 - pm.left - pm.right);
    assert.equal(w, 9638);
    assert.equal(t.rows.length, 1);
    assert.equal(t.rows[0].cells.length, 2);
    const shd = t.rows[0].cells[0].tcPr.extra.find((x) =>
      x.name === 'w:shd');
    const a = Object.fromEntries(shd.attrs);
    assert.equal(a['w:themeFill'], 'accent1');
    assert.equal(a['w:themeFillTint'], '33');
    assert.doesNotMatch(JSON.stringify(t.rows[0].cells[0].tcPr),
      /"w:fill","[0-9A-Fa-f]{6}"/);
    assert.equal(t.rows[0].cells[1].tcPr.extra
      ?.some((x) => x.name === 'w:shd') || false, false);
    for (const n of ['top', 'left', 'bottom', 'right', 'insideH',
      'insideV'])
      assert.equal(t.tblPr.tblBorders[n].val, 'nil', n);
  });
  it('two column: sections in the right columns', () => {
    const d = starterOf('cv-two-column').build();
    const [t] = d.sections[0].blocks.filter((b) => b.type === 'tbl');
    const tx = (c) => c.blocks.filter((b) => b.type === 'p')
      .map((p) => p.text);
    const l = tx(t.rows[0].cells[0]), r = tx(t.rows[0].cells[1]);
    const at = (a, w) => a.findIndex((x) => x === w);
    assert.equal(l[0], '[Your name]');
    assert.ok(at(l, 'Skills') > 0 && at(l, 'Languages') > at(l, 'Skills'));
    assert.deepEqual(['Profile', 'Experience', 'Education']
      .map((w) => at(r, w)).every((k, j, z) => k >= 0 && (!j ||
        k > z[j - 1])), true);
    assert.equal(r.includes('Skills'), false);
    const dates = t.rows[0].cells[1].blocks.filter((b) =>
      b.type === 'p' && b.pPr.tabs);
    assert.equal(dates.length, 3);
    for (const p of dates)
      assert.deepEqual(p.pPr.tabs, [{val: 'right', pos: 6600}]);
    assert.ok(6600 <= 6838 - 2 * 108);
    const rp = t.rows[0].cells[1].blocks.filter((b) => b.type === 'p');
    for (const p of rp.filter((x) => x.pStyle === 'Heading1'))
      assert.match(JSON.stringify(p.pPr.extra), /w:bottom.*accent1/);
    assert.equal(rp.filter((x) => x.pStyle === 'Heading1').length, 3);
    const i = rp.indexOf(dates[0]);
    assert.equal(rp[i + 1].runs[0].rPr.i, true);
    assert.equal(rp[i + 2].pStyle, 'ListParagraph');
  });
  it('each CV is exactly one page', () => {
    for (const i of ids) assert.equal(pagesOf(starterOf(i).build()), 1);
  });
  it('the kit refuses a literal tab in text', () => {
    assert.throws(() => starterDoc({body: [para(run('a\tb'))]}),
      /literal tab/);
    starterDoc({body: [para(['a', tab(), 'b'])]});
  });
  it('each is a real .docx Word accepts (WORD_EMIT)', async () => {
    for (const i of ids)
      emit('starter-' + i, await writeDocx(starterOf(i).build()));
  });
});

describe('Reports group: report, essay, proposal', () => {
  const ids = ['report', 'essay', 'proposal'];
  const instrs = (ps) => ps.flatMap((p) => Object.values(p.inlines)
    .filter((i) => i.node && i.node.name === 'w:instrText')
    .map((i) => i.node.children[0].trim()));
  const story = (d, kind) => [...d.stories.values()]
    .find((s) => s.kind === kind);
  const storyParas = (s) => s.blocks.filter((b) => b.type === 'p');
  const body = (d) => d.sections[0].blocks.filter((b) =>
    b.type === 'p');
  const tbls = (d) => d.sections[0].blocks.filter((b) =>
    b.type === 'tbl');
  const cellText = (c) => c.blocks.map((b) => b.text).join('');
  const rowText = (t, k) => t.rows[k].cells.map(cellText);
  const inOrder = (text, want) => {
    let at = 0;
    for (const w of want) {
      const k = text.findIndex((t, i) => i >= at && t.startsWith(w));
      assert.ok(k >= at, w);
      at = k + 1;
    }
  };
  it('are registered in the Reports group with titles', () => {
    assert.deepEqual(ids.map((i) => starterOf(i).title),
      ['Report', 'Essay', 'Project proposal']);
    for (const i of ids) assert.equal(starterOf(i).group, 'Reports');
  });
  it('report: title block, Contents, TOC field, sections', () => {
    const d = starterOf('report').build();
    const ps = body(d);
    assert.equal(ps[0].pStyle, 'Title');
    assert.equal(ps[0].text, '[Report title]');
    assert.equal(ps[1].pStyle, 'Subtitle');
    assert.equal(ps[1].text, '[Subtitle or purpose]');
    const t = textOf(d);
    inOrder(t, ['[Report title]', '[Subtitle or purpose]',
      'Prepared by: [Author]', 'Date: [5 November 2026]', 'Contents']);
    const c = ps.find((p) => p.text === 'Contents');
    assert.ok(c.pPr.pageBreakBefore, 'page break before Contents');
    assert.equal(c.pStyle, 'TOCHeading');
    const toc = ps.filter((p) => instrs([p])
      .some((x) => /^TOC /.test(x)));
    assert.equal(toc.length, 1);
    assert.deepEqual(instrs(toc), ['TOC \\o "1-3" \\h \\z \\u']);
    assert.match(toc[0].text, /Update the field to build the contents \(Edit > Update all fields\)\./);
    const h1 = ps.filter((p) => p.pStyle === 'Heading1')
      .map((p) => p.text);
    assert.deepEqual(h1, ['Summary', 'Introduction', 'Findings',
      'Conclusions', 'Recommendations', 'Appendix']);
    const f = ps.findIndex((p) => p.text === 'Findings');
    assert.equal(ps[f + 1].pStyle, 'Heading2');
    assert.equal(ps[f + 3].pStyle, 'Heading2');
    assert.equal(ps.filter((p) => p.pStyle === 'Heading2').length, 2);
    for (const k of [f + 2, f + 4])
      assert.ok(ps[k].text.startsWith('['), 'placeholder ' + k);
  });
  it('report: real fields in the footer and a header', () => {
    const d = starterOf('report').build();
    const f = storyParas(story(d, 'ftr'));
    assert.deepEqual(instrs(f), ['PAGE', 'NUMPAGES']);
    assert.match(f[0].text, /^Page .+ of .+$/);
    assert.equal(f[0].pPr.jc, 'right');
    const h = storyParas(story(d, 'hdr'));
    assert.equal(h[0].text, '[Report title]');
  });
  it('report: the Contents field is the editor\'s own TOC', async () => {
    const {Document} = await import(
      '../../tools/moreapps/!Letters/Document');
    const {Typing} = await import('../../tools/moreapps/!Letters/Typing');
    const {tocFields, entriesOf, tocWhy} = await import(
      '../../tools/moreapps/!Letters/TocUpdate');
    const {updateToc} = await import(
      '../../tools/moreapps/!Letters/TocCmd');
    const doc = starterOf('report').build();
    const f = tocFields(doc);
    assert.equal(f.length, 1);
    assert.equal(tocWhy(doc, f[0]), null);
    const dd = new Document(doc);
    const r = updateToc(dd, new Typing(dd), f[0], 'entire');
    assert.ok(r && r.changed, 'Update all fields rebuilds it');
    const e = entriesOf(dd.doc, tocFields(dd.doc)[0])
      .map((x) => [x.level, x.text]);
    assert.deepEqual(e.slice(0, 3), [[1, 'Summary'],
      [1, 'Introduction'], [1, 'Findings']]);
    assert.ok(e.some((x) => x[0] === 2));
    assert.equal(e.some((x) => x[1] === 'Contents'), false);
  });
  it('essay: double spaced, indented, running header', () => {
    const d = starterOf('essay').build();
    const ps = body(d);
    assert.equal(ps[0].pStyle, 'Title');
    assert.equal(ps[0].pPr.jc, 'center');
    const h = storyParas(story(d, 'hdr'));
    assert.deepEqual(instrs(h), ['PAGE']);
    assert.match(h[0].text, /^\[Surname\] /);
    assert.equal(h[0].pPr.jc, 'right');
    const refAt = ps.findIndex((p) => p.text === 'References');
    assert.ok(refAt > 0);
    const main = ps.slice(1, refAt);
    const bodyP = main.filter((p) => p.text.length > 60);
    assert.equal(bodyP.length, 4);
    const eff = (p) => resolvePara(d.styles, p).spacing;
    for (const p of bodyP) {
      assert.deepEqual([eff(p).line, eff(p).lineRule, eff(p).after],
        [480, 'auto', 0]);
      assert.equal(p.pPr.ind.firstLine, 720);
      assert.equal(p.pPr.spacing, undefined, 'style, not direct');
    }
    for (const p of main.slice(1))
      assert.equal(eff(p).line, 480, p.text);
    assert.notEqual(eff(ps[0]).line, 480, 'Title keeps its own');
    assert.notEqual(eff(ps[refAt]).before, 0, 'heading keeps its own');
    inOrder(textOf(d), ['[Your name]', '[Course and tutor]',
      '[5 November 2026]']);
    const refs = ps.slice(refAt + 1);
    assert.equal(refs.length, 3);
    for (const p of refs) {
      assert.equal(p.pPr.ind.hanging, 720);
      assert.equal(p.pPr.ind.left, 720);
      assert.equal(eff(p).line, 480);
    }
    assert.equal(ps[refAt].pStyle, 'Heading1');
    assert.equal(ps[refAt].pPr.jc, 'center');
  });
  it('proposal: tables, numbered objectives, risks', () => {
    const d = starterOf('proposal').build();
    const ps = body(d);
    assert.equal(ps[0].pStyle, 'Title');
    assert.match(ps[1].text, /^\[Organisation/);
    assert.equal(ps[1].pStyle, 'Subtitle');
    assert.deepEqual(ps.filter((p) => p.pStyle === 'Heading1')
      .map((p) => p.text), ['Summary', 'Background', 'Objectives',
      'Approach', 'Timeline', 'Budget', 'Risks', 'Next steps']);
    const [tl, bu] = tbls(d);
    assert.equal(tbls(d).length, 2);
    assert.deepEqual(rowText(tl, 0), ['Phase', 'Activities', 'Start',
      'End']);
    assert.equal(tl.rows.length, 6);
    assert.ok(tl.rows[0].trPr.tblHeader);
    assert.equal(tl.grid.reduce((a, b) => a + b, 0), 9026);
    assert.deepEqual(rowText(bu, 0), ['Item', 'Cost (GBP)']);
    assert.equal(bu.grid.reduce((a, b) => a + b, 0), 9026);
    const last = bu.rows.at(-1);
    assert.equal(cellText(last.cells[0]), 'Total');
    for (const c of last.cells) {
      assert.equal(c.blocks[0].runs[0].rPr.b, true);
      assert.ok(c.blocks[0].text.length > 0);
    }
    assert.equal(rowText(bu, 1)[1], '[0.00]');
    const num = ps.filter((p) => p.pPr.numPr &&
      p.pPr.numPr.numId >= 2);
    assert.ok(num.length >= 3);
    assert.equal(ps.filter((p) => p.pPr.numPr &&
      p.pPr.numPr.numId === 1).length >= 3, true);
    const ft = storyParas(story(d, 'ftr'));
    assert.deepEqual(instrs(ft), ['PAGE', 'NUMPAGES']);
  });
  // (the lower bounds are structural for the report: page breaks
  // before Contents, Summary and Appendix)
  const within = (n, i) => assert.ok(n >= PAGES[i][0] &&
    n <= PAGES[i][1], i + ' has ' + n + ' pages');
  it('page counts: report 4-5, essay 2-3, proposal 2-3', () => {
    for (const i of ids) within(pagesOf(starterOf(i).build()), i);
  });
  it('report: the cover has no header or footer (titlePg)', async () => {
    const d = starterOf('report').build();
    assert.equal(d.sections.length, 1);
    assert.ok(d.sections[0].props.titlePg);
    assert.equal([...d.stories.values()].length, 2);
    assert.match(JSON.stringify(d.sections[0].raw), /titlePg/);
    assertSameDoc(await readDocx(await writeDocx(d)), d, 'report');
    const {exportPdf} = await import(
      '../../tools/moreapps/!Letters/PdfExport');
    const {bundled, metrics, windowOf, raster} = await import(
      './pdf-docs.mjs');
    const {readPdf} = await import('./pdf-read.mjs');
    const res = await exportPdf(windowOf(d, metrics()),
      {loader: bundled(), raf: (cb) => setImmediate(cb),
        rasterise: raster});
    const pdf = readPdf(res.bytes);
    assert.doesNotMatch(pdf.pages[0].text, /Page\s*1\s*of/);
    const n = (x) => x.split('[Report title]').length - 1;
    assert.equal(n(pdf.pages[0].text), 1, 'only the Title');
    assert.match(pdf.pages[1].text, /Page\s*2\s*of/);
    assert.equal(n(pdf.pages[1].text), 1, 'the header');
  });
  it('the kit merges stylePPr into a style and round-trips', async () => {
    const d = starterDoc({stylePPr: {Normal: {spacing: {line: 480,
      lineRule: 'auto', after: 0}}}, body: [para('x')]});
    const sp = resolvePara(d.styles, d.sections[0].blocks[0]).spacing;
    assert.deepEqual([sp.line, sp.after], [480, 0]);
    const back = await readDocx(await writeDocx(d));
    assertSameDoc(back, d, 'stylePPr');
    assert.equal(resolvePara(back.styles, back.sections[0].blocks[0])
      .spacing.line, 480);
    assert.throws(() => starterDoc({stylePPr: {Nope: {}}, body: []}),
      RangeError);
  });
  it('each exports to PDF within its page range', async () => {
    const {exportPdf} = await import(
      '../../tools/moreapps/!Letters/PdfExport');
    const {bundled, metrics, windowOf, raster} = await import(
      './pdf-docs.mjs');
    for (const i of ids) {
      const dw = windowOf(starterOf(i).build(), metrics());
      const res = await exportPdf(dw, {loader: bundled(),
        raf: (cb) => setImmediate(cb), rasterise: raster});
      within(res.pages, i);
    }
  });
  it('each is a real .docx Word accepts (WORD_EMIT)', async () => {
    for (const i of ids)
      emit('starter-' + i, await writeDocx(starterOf(i).build()));
  });
});

describe('Business group: invoice, agenda, minutes, press release, ' +
  'newsletter, flyer', () => {
  const ids = ['invoice', 'agenda', 'minutes', 'press-release',
    'newsletter', 'flyer'];
  const secs = (d) => d.sections.flatMap((s) => s.blocks);
  const body = (d) => secs(d).filter((b) => b.type === 'p');
  const tbls = (d) => secs(d).filter((b) => b.type === 'tbl');
  const cellText = (c) => c.blocks.map((b) => b.text).join('');
  const rowText = (t, k) => t.rows[k].cells.map(cellText);
  const sum = (t) => t.grid.reduce((a, b) => a + b, 0);
  const build = (i) => starterOf(i).build();
  const footerText = (d) => [...d.stories.values()]
    .filter((s) => s.kind === 'ftr')
    .flatMap((s) => s.blocks.map((b) => b.text));
  const inOrder = (text, want) => {
    let at = 0;
    for (const w of want) {
      const k = text.findIndex((t, i) => i >= at && t.startsWith(w));
      assert.ok(k >= at, w);
      at = k + 1;
    }
  };
  it('are registered in the Business group with titles', () => {
    assert.deepEqual(ids.map((i) => starterOf(i).title), ['Invoice',
      'Meeting agenda', 'Meeting minutes', 'Press release',
      'Newsletter', 'Flyer']);
    for (const i of ids) assert.equal(starterOf(i).group, 'Business');
  });
  it('invoice: block, Bill to, items table, totals, footer', () => {
    const d = build('invoice');
    const [info, items] = tbls(d);
    assert.equal(tbls(d).length, 2);
    assert.equal(body(d)[0].pStyle, 'Title');
    assert.equal(body(d)[0].text, 'Invoice');
    assert.deepEqual(info.grid, [4426, 1900, 2700]);
    assert.deepEqual(info.rows.map((r) => cellText(r.cells[1])),
      ['Invoice no.', 'Date', 'Due date', 'Purchase order']);
    assert.match(cellText(info.rows[0].cells[0]), /^\[Company name\]/);
    assert.deepEqual(items.grid, [4026, 1200, 1900, 1900]);
    assert.equal(sum(items), 9026);
    assert.deepEqual(rowText(items, 0), ['Description', 'Quantity',
      'Unit price', 'Total']);
    assert.ok(items.rows[0].trPr.tblHeader);
    for (const c of items.rows[0].cells) {
      const a = Object.fromEntries(c.tcPr.extra.find((x) =>
        x.name === 'w:shd').attrs);
      assert.equal(a['w:themeFill'], 'accent1');
      assert.ok(a['w:themeFillTint'], 'a tint');
      assert.equal(a['w:fill'], undefined, 'a theme tint, no RGB');
    }
    assert.equal(items.rows.length, 6);
    for (const r of items.rows.slice(1)) {
      assert.deepEqual(r.cells.map(cellText), ['', '', '', '']);
      assert.ok(r.trPr.trHeight.val >= 400, 'row height');
    }
    const ps = body(d), t = ps.map((p) => p.text);
    inOrder(t, ['Bill to', '[Client name]', 'Subtotal', 'VAT ([20%])',
      'Total due', 'Payment terms', 'Bank details']);
    for (const w of ['Subtotal', 'VAT', 'Total due']) {
      const p = ps.find((x) => x.text.startsWith(w));
      assert.match(p.text, /^[^\t]+\t\[\u00a30\.00\]$/, w);
      assert.deepEqual(p.pPr.tabs.map((x) => [x.pos, x.val]),
        [[9026, 'right']], w + ' right tab at the text width');
    }
    const due = ps.find((p) => p.text.startsWith('Total due'));
    assert.ok(due.runs.every((r) => r.rPr.b === true));
    assert.equal(ps.find((p) => p.text.startsWith('Subtotal'))
      .runs[0].rPr.b, undefined);
    assert.deepEqual(footerText(d), ['[Company name] | Registered in ' +
      '[England and Wales] no. [number] | VAT no. [number]']);
    assert.equal(ps.filter((p) => p.text === '').length, 0);
  });
  it('agenda: details, Apologies, numbered table', () => {
    const d = build('agenda');
    const [det, ag] = tbls(d);
    assert.equal(body(d)[0].pStyle, 'Title');
    assert.deepEqual(det.rows.map((r) => cellText(r.cells[0])),
      ['Date', 'Time', 'Place', 'Chair', 'Minutes']);
    assert.ok(body(d).some((p) => p.text.startsWith('Apologies:')));
    assert.equal(ag.grid.length, 4);
    assert.equal(sum(ag), 9026);
    assert.deepEqual(rowText(ag, 0), ['No.', 'Item', 'Led by', 'Time']);
    assert.ok(ag.rows[0].trPr.tblHeader);
    assert.equal(ag.rows.length, 9);
    assert.deepEqual(ag.rows.slice(1).map((r) => cellText(r.cells[0])),
      ['1', '2', '3', '4', '5', '6', '7', '8']);
    assert.equal(rowText(ag, 7)[1], 'Any other business');
    assert.match(rowText(ag, 8)[1], /^Date of next meeting/);
  });
  it('minutes: details, Heading 2 items, Actions table', () => {
    const d = build('minutes');
    const [det, act] = tbls(d);
    const ps = body(d);
    assert.equal(tbls(d).length, 2);
    assert.equal(ps[0].text, 'Meeting minutes');
    assert.equal(det.grid.length, 2);
    assert.equal(act.grid.length, 3);
    assert.equal(sum(act), 9026);
    assert.deepEqual(rowText(act, 0), ['Action', 'Owner', 'Due']);
    assert.ok(act.rows[0].trPr.tblHeader);
    inOrder(ps.map((p) => p.text), ['Attendees:', 'Apologies:',
      'Discussion', '1.', '2.', '3.', 'Actions', 'Minutes taken by:']);
    const h2 = ps.filter((p) => p.pStyle === 'Heading2');
    assert.equal(h2.length, 3);
    for (const h of h2) {
      const k = ps.indexOf(h);
      assert.ok(ps[k + 1].text.startsWith('['), 'discussion follows');
      assert.ok(!ps[k + 1].pStyle, 'plain paragraph');
    }
    assert.equal(ps.at(-1).text, 'Minutes taken by: [name]');
  });
  it('press release: dateline, Quote, notes, contact, ENDS', () => {
    const d = build('press-release');
    const ps = body(d), t = ps.map((p) => p.text);
    assert.equal(tbls(d).length, 0);
    assert.equal(t[0], 'FOR IMMEDIATE RELEASE');
    assert.equal(ps[0].runs[0].rPr.b, true);
    assert.equal(ps[1].pStyle, 'Title');
    assert.equal(ps[2].pStyle, 'Subtitle');
    assert.match(ps[3].text, /^\[Town, 5 November 2026\] - /);
    assert.equal(ps[3].pStyle, undefined, 'first body paragraph');
    const q = ps.filter((p) => p.pStyle === 'Quote');
    assert.equal(q.length, 1);
    assert.ok(ps.indexOf(q[0]) > 3);
    const body3 = ps.slice(3, 7).filter((p) => !p.pStyle);
    assert.equal(body3.length, 3, 'three body paragraphs');
    inOrder(t, ['Notes to editors', '[Background', '[Further',
      'Media contact', '[Name]']);
    assert.equal(ps.find((p) => p.text === 'Notes to editors').pStyle,
      'Heading1');
    const notes = ps.filter((p) => p.pPr.numPr &&
      p.pPr.numPr.numId >= 2);
    assert.equal(notes.length, 2);
    const e = ps.findIndex((p) => p.text === 'ENDS');
    assert.ok(e > ps.indexOf(q[0]), 'ENDS after the quotation');
    assert.equal(ps[e].pPr.jc, 'center');
    assert.equal(ps[e].runs[0].rPr.b, true);
    inOrder(t, ['ENDS', 'Notes to editors']);
    assert.equal(ps[e + 1].text, 'Notes to editors');
    assert.equal(ps.slice(0, e).filter((p) => !p.pStyle).length, 4,
      'ENDS follows the last body paragraph');
    assert.ok(ps.slice(0, e).every((p) => !p.pPr.numPr), 'no notes');
  });
  it('newsletter: three continuous sections, 1 / 2 / 1 columns', () => {
    const d = build('newsletter');
    assert.equal(d.sections.length, 3);
    assert.deepEqual(d.sections.map((s) => s.props.cols.num || 1),
      [1, 2, 1]);
    assert.equal(d.sections[1].props.cols.space, 708);
    for (const s of d.sections) {
      assert.equal(s.props.type, 'continuous');
      assert.deepEqual([s.props.pgSz.w, s.props.pgSz.h],
        [11906, 16838]);
    }
    const [mast, arts, close] = d.sections.map((s) => s.blocks);
    assert.equal(mast[0].pStyle, 'Title');
    assert.equal(mast[0].text, '[Newsletter name]');
    assert.equal(mast[1].pStyle, 'Subtitle');
    assert.match(JSON.stringify(mast[1].pPr.extra),
      /w:bottom.*accent1/, 'rule under the masthead');
    assert.equal(arts.filter((p) => p.pStyle === 'Heading2').length, 4);
    assert.equal(arts.filter((p) => p.pStyle === 'Quote').length, 1);
    // (the last block of a section is the empty break paragraph)
    assert.equal(arts.filter((p) => !p.pStyle && p.text).length, 8);
    assert.equal(close.length, 1);
    assert.equal(close[0].text, '[Contact details]');
  });
  it('newsletter: the layout sets the articles in two columns', () => {
    const d = build('newsletter');
    const L = new DocLayout(d, tm());
    L.layout(1000);
    const P = new Pages(printGalley(L)).finish();
    assert.ok(P.count >= 1 && P.count <= 2, 'pages ' + P.count);
    const g = L.geom(1).cols;
    assert.equal(g.length, 2);
    const one = L.geom(0).cols[0].w;
    assert.ok(g[0].w < one / 2, 'columns are narrower than the page');
    for (const i of L.items) assert.equal(i.w, i.s === 1 ? g[0].w : one);
    const cols = P.at(0).cols;
    assert.equal(cols.length, 4, 'masthead, two columns, closing');
    assert.equal(cols[1].x, g[0].x);
    assert.equal(cols[2].x, g[1].x);
    assert.equal(cols[1].top, cols[2].top, 'side by side');
    assert.ok(cols[2].used > 0 && cols[1].used > 0, 'both filled');
    assert.ok(cols[3].top >= cols[1].top + cols[1].used - 1,
      'the closing line follows both');
    assert.equal(cols[3].w, one);
  });
  it('flyer: one page, 48 pt title, centred, no tables', () => {
    const d = build('flyer');
    const ps = body(d);
    assert.equal(tbls(d).length, 0);
    assert.equal(ps[0].pStyle, 'Title');
    assert.equal(ps[0].text, '[Event or offer]');
    assert.equal(ps[0].runs[0].rPr.sz, 96);
    assert.equal(ps[0].pPr.jc, 'center');
    assert.equal(ps[1].pStyle, 'Subtitle');
    const when = ps.find((p) => p.text === '[Date] | [Time] | [Place]');
    assert.equal(when.pPr.jc, 'center');
    assert.equal(ps.filter((p) => p.pStyle === 'ListParagraph').length,
      4);
    const cta = ps.find((p) => p.text === '[Call to action]');
    assert.equal(cta.pPr.jc, 'center');
    assert.equal(cta.runs[0].rPr.b, true);
    assert.equal(ps.filter((p) => p.text === '').length, 0);
    assert.equal(pagesOf(d), 1);
  });
  const within = (n, i) => assert.ok(n >= PAGES[i][0] &&
    n <= PAGES[i][1], i + ' has ' + n + ' pages');
  it('page counts: one page except minutes and newsletter 1-2', () => {
    for (const i of ids) within(pagesOf(build(i)), i);
  });
  it('each exports to PDF within its page range', async () => {
    const {exportPdf} = await import(
      '../../tools/moreapps/!Letters/PdfExport');
    const {bundled, metrics, windowOf, raster} = await import(
      './pdf-docs.mjs');
    for (const i of ids) {
      const dw = windowOf(build(i), metrics());
      const res = await exportPdf(dw, {loader: bundled(),
        raf: (cb) => setImmediate(cb), rasterise: raster});
      within(res.pages, i);
    }
  });
  it('each is a real .docx Word accepts (WORD_EMIT)', async () => {
    for (const i of ids)
      emit('starter-' + i, await writeDocx(build(i)));
  });
});
