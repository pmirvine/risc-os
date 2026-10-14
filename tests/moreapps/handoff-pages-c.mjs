// Hand-off files of columns, line numbers, text wrap, floating tables
// and the views (Batch D P14.1, prefix CL: R3; see handoff-pages.mjs,
// which writes them after the pg and hf files). CL1..CL10 are the
// spec's PG25..PG34, CL11 and CL12 the owner's ruling R5 (floating
// tables), CLX1.. recorded while Batch D was built. The names are
// cl-<n>-..., cl-columns, cl-wrap: the Batch A clipboard files
// cl-1-source, cl-2-pasted, cl-2b.., cl-2c.., cl-3-strict and
// cl-README.txt in the same folder are other files (never the same
// name). Each is read by !Letters (a fixture built from XML, or a new
// document) and changed with its own commands where the question is
// about them (Format > Columns..., Insert > Column break, the Line
// numbers box, Format > Wrap text, a picture dragged, Outline's
// Promote / Demote / Move up, typing in a floating table's cell,
// Table > Insert row, Split table), then written; save() lints, reads
// back and checks every block. Captions are one short line and most
// lines are exactly 12 pt high, so a line's place on its page is the
// same in Word and in !Letters; where a case depends on where a long
// paragraph's lines break (text beside a float), it has a page of
// its own. The README lines say, for every page !Letters lays out
// (Print layout, the test measurer), where each column starts, where
// each float is (inches from the page's top left corner) and from
// where to where the lines beside it run, and the line numbers shown.
import {settle} from './wrap-fixtures.mjs';
import {columnsCmd, lineNumCmd} from '../../tools/moreapps/!Letters/SectSetup';
import {presetOf, textWOf} from '../../tools/moreapps/!Letters/ColsVals';
import {columnBreak} from '../../tools/moreapps/!Letters/InsertApply';
import {wrapCmd} from '../../tools/moreapps/!Letters/WrapCmd';
import {moveAnchor} from '../../tools/moreapps/!Letters/AnchorMove';
import {promoteCmd, demoteCmd, moveCmd}
  from '../../tools/moreapps/!Letters/OutlineCmd';
import {outlineOf} from '../../tools/moreapps/!Letters/OutlineLayout';
import {insertRowsCmd, splitTableCmd}
  from '../../tools/moreapps/!Letters/TblCmdRows';
import {numbersOf} from '../../tools/moreapps/!Letters/LineNumbers';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {drawingXml} from './pic-fixtures.mjs';
import {loadStyles} from './word-docs.mjs';
import {car, cellCar, typer, allTables, must}
  from './handoff-tables-lib.mjs';
import {p, r, open, save, wrote, pgDocx, sect, sectEnd, EXACT, line,
  lines, say, PAGE_BREAK, PIC_RID, compat}
  from './handoff-pages-lib.mjs';

await loadStyles();
const EMU = 9525;
const inch = (px) => (px / 96).toFixed(2);
const cut = (t, n = 24) => {
  const s = t.replace(/\uFFFC/g, '').replace(/\n/g, ' / ').trim();
  return JSON.stringify(s.length > n ? s.slice(0, n - 3) + '...' : s);
};
const BREAK = p(PAGE_BREAK, EXACT());

// ------------------------------------------------------ what it shows
const textOf = (L, id) => {
  const it = L.byId.get(id);
  return it && it.block && it.block.type === 'p' ? it.block.text : '';
};
const tblText = (L, f) => {
  const it = L.byId.get(f.tbl), t = it && it.block;
  const b = t && t.rows && t.rows[0].cells[0].blocks[0];
  return b && b.type === 'p' ? b.text : '(table)';
};
/** The lines on page i beside float f: [left, right] in px. */
function beside(L, P, i, f) {
  const out = [];
  for (const fr of P.framesOf(P.at(i))) {
    for (const g of fr.frags) {
      const it = L.byId.get(g.id);
      if (!it || !it.lines) continue;
      for (let j = g.l0; j < g.l1; j++) {
        const ln = it.lines[j], xs = ln.items.filter((x) => x.w > 0);
        const y = g.y + ln.y;
        if (!xs.length || y + ln.h <= f.y + 0.5 || y >= f.y + f.h - 0.5) {
          continue;
        }
        out.push([fr.x + ln.x, fr.x + Math.max(...xs.map((x) => x.x +
          x.w))]);
      }
    }
  }
  return out;
}
/** Page i's columns: where each starts (and its top when not the
 *  page's: a band below another section's columns). */
function columns(L, P, i) {
  const pg = P.at(i), fr = P.framesOf(pg);
  const one = (f, k) => {
    const g = f.frags[0], it = g && L.byId.get(g.id);
    const top = g ? g.y + (it && it.lines ? it.lines[g.l0].y : 0) :
      pg.bodyTop;
    return `column ${k + 1}` + (top - pg.bodyTop > 1 ? ` (its top ` +
      `${inch(top)} in down the page)` : '') + ' from ' + (g ?
      cut(textOf(L, g.id)) + (g.l0 ? ` (its line ${g.l0 + 1})` : '') :
      '(empty)');
  };
  const shown = fr.length > 8 ? [...fr.slice(0, 3).map(one), '..',
    one(fr[fr.length - 1], fr.length - 1)] : fr.map(one);
  return `${fr.length} columns filled: ${shown.join('; ')}`;
}
/** Page i's first and last paragraph (and line of it). */
function ends(L, P, i) {
  const all = P.framesOf(P.at(i)).flatMap((f) => f.frags)
    .filter((g) => L.byId.get(g.id) && L.byId.get(g.id).lines &&
      textOf(L, g.id).replace(/\uFFFC/g, '').trim());
  if (!all.length) return 'no text';
  const a = all[0], z = all[all.length - 1];
  const at = (g, j) => cut(textOf(L, g.id)) + (L.byId.get(g.id).lines
    .length > 1 ? ` (its line ${j + 1})` : '');
  return `text from ${at(a, a.l0)} to ${at(z, z.l1 - 1)}`;
}
/**
 * What !Letters shows of doc in Print layout, page by page: the
 * columns (cols), each float's box and the lines beside it (floats),
 * the line numbers (nums).
 */
function shows(doc, {cols = true, floats = true, nums = false,
  upTo = 99, text = false} = {}) {
  const {L, P} = settle(doc);
  const out = [`Laid out by !Letters: ${P.count} page` +
    (P.count === 1 ? '' : 's')];
  for (let i = 0; i < Math.min(P.count, upTo); i++) {
    const pg = P.at(i), bits = [];
    if (pg.blank) {
      out.push(`Page ${i + 1}: blank`);
      continue;
    }
    if (text) bits.push(ends(L, P, i));
    if (cols && P.framesOf(pg).length > 1) bits.push(columns(L, P, i));
    if (floats) {
      for (const f of P.floatsOf(pg)) {
        const what = f.pic ? 'the picture in ' + cut(textOf(L, f.id))
          : 'the table ' + cut(tblText(L, f), 30);
        let s = `${what} at ${inch(f.x)}, ${inch(f.y)} in, ` +
          `${inch(f.w)} x ${inch(f.h)} in` + (f.behind ? ', behind the ' +
          'text' : '');
        const b = beside(L, P, i, f);
        s += b.length ? `, ${b.length} line${b.length === 1 ? '' : 's'} ` +
          `beside it from ${inch(Math.min(...b.map((x) => x[0])))} to ` +
          `${inch(Math.max(...b.map((x) => x[1])))} in` : ', no line ' +
          'beside it';
        bits.push(s);
      }
    }
    if (nums) {
      const n = numbersOf(P, i).map((x) => x.text);
      bits.push(n.length ? 'line numbers ' + (n.length > 8 ? [...n.slice(0,
        4), '..', ...n.slice(-3)] : n).join(' ') : 'no line numbers');
    }
    out.push(`Page ${i + 1}: ` + (bits.length ? bits.join('; ') :
      'one column filled, no float'));
  }
  if (P.count > upTo) out.push(`(pages ${upTo + 1}..${P.count} alike)`);
  return out;
}
/** save, then the README lines of what !Letters shows. */
async function saveShown(name, d, note, how) {
  const back = await save(name, d, {note});
  wrote.get(name).push(...shows(back.doc, how).map((l) => '    ' + l));
  return back;
}

// ------------------------------------------------------ pictures
/** A run holding a picture: inline, or floating with positionH / V
 *  ([relativeFrom, inner XML]), the wrap element and size (px). */
function pic({id, w = 96, h = 48, descr, at, wrap =
  '<wp:wrapSquare wrapText="bothSides"/>'} = {}) {
  let s = drawingXml({kind: at ? 'anchor' : 'inline', id, descr,
    cx: Math.round(w * EMU), cy: Math.round(h * EMU), embed: PIC_RID,
    decl: false});
  if (at) {
    s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/,
      `<wp:positionH relativeFrom="${at.h[0]}">${at.h[1]}` +
      `</wp:positionH><wp:positionV relativeFrom="${at.v[0]}">` +
      `${at.v[1]}</wp:positionV>`).replace(
      '<wp:wrapSquare wrapText="bothSides"/>', wrap);
  }
  return `<w:r>${s}</w:r>`;
}
const off = (inches) => `<wp:posOffset>${Math.round(inches * 914400)}` +
  '</wp:posOffset>';
const al = (s) => `<wp:align>${s}</wp:align>`;
const WORDS = 'The quick brown fox jumps over the lazy dog and runs ' +
  'on past the river bank';
/** A paragraph of exact 12 pt lines: n sentences after a label. */
const para = (label, n, runs = '', pPr = '') => p(runs + r(label + ' ' +
  Array.from({length: n}, (_, i) => `${WORDS} (${i + 1}).`).join(' ')),
pPr + EXACT());
const fixture = async (body, o) => open(await pgDocx(body, o));
/** The picture of the paragraph whose text (after it) starts label. */
const picSel = (d, label) => {
  const b = d.doc.sections.flatMap((s) => s.blocks).find((x) =>
    x.type === 'p' && x.text.includes('\uFFFC') &&
    x.text.replace(/\uFFFC/g, '').startsWith(label));
  if (!b) throw new Error('no picture paragraph ' + label);
  const k = b.text.indexOf('\uFFFC');
  return S.select({id: b.id, off: k}, {id: b.id, off: k + 1});
};

// ------------------------------------------------------ cl-1
async function colSep() {
  const S1 = 'Section 1: Two, Line between';
  const S2 = 'Section 2: Three, Line between';
  const body = [say(S1), lines('Two-col line', 70),
    sectEnd('End of section 1', {}), say(S2), lines('Col 1 line', 10),
    lines('Col 2 line', 30), lines('Col 3 line', 4),
    line('End of section 2')].join('');
  const d = await fixture(body);
  must('cols 1', columnsCmd(d, car(d, S1), {num: 2, sep: true},
    'section'));
  must('cols 2', columnsCmd(d, car(d, S2), {num: 3, sep: true},
    'section'));
  must('break 1', columnBreak(d, car(d, 'Col 2 line 1')));
  must('break 2', columnBreak(d, car(d, 'Col 3 line 1')));
  await saveShown('cl-1-colsep.docx', d, 'columns made by Format > ' +
    'Columns..., the breaks by Insert > Column break; !Letters draws ' +
    'the line between 0.75 pt black, as long as the tallest column ' +
    'on its page');
}

// ------------------------------------------------------ cl-2
async function balance() {
  const t = ['Section 1: two columns, 30 lines', 'Section 2: one column',
    'Section 3: two columns, 20 lines', 'Section 4: two columns, 40 lines'];
  const body = [say(t[0]), lines('S1 line', 28), sectEnd('End of S1', {}),
    say(t[1]), lines('S2 line', 3), sectEnd('End of S2', {type:
      'continuous'}), say(t[2]), lines('S3 line', 18),
    p(r('S3 last line (24 pt after)'), EXACT(0, 24) + sect({type:
      'continuous'})), say(t[3]), lines('S4 line', 38),
    line('End of S4')].join('');
  const d = await fixture(body, {lastSect: sect({type: 'continuous'})});
  for (const k of [0, 2, 3]) {
    must('cols ' + k, columnsCmd(d, car(d, t[k]), {num: 2}, 'section'));
  }
  await saveShown('cl-2-balance.docx', d, 'two columns made by Format ' +
    '> Columns...; sections 2, 3 and 4 start with a continuous break',
  {text: true});
}

// ------------------------------------------------------ cl-3
async function maxCols() {
  const T1 = 'Section 1: 45 columns';
  const T2 = 'Section 2: 12 columns';
  const wide = {w: 31680, h: 12240, mar: {top: 720, bottom: 720,
    left: 360, right: 360}};
  const body = [say(T1), lines('C', 1900), p(r('End of S1'), EXACT() +
    sect(wide).replace('<w:cols w:space="708"/>',
      '<w:cols w:num="45" w:space="0"/>')), say(T2), lines('C', 690,
    3000)].join('');
  const d = await fixture(body);
  must('cols 12', columnsCmd(d, car(d, T2), {num: 12, space: 0},
    'section'));
  if (columnsCmd(d, car(d, T2), {num: 13, space: 0}, 'section')) {
    throw new Error('13 columns on A4 taken');
  }
  await saveShown('cl-3-maxcols.docx', d, 'section 1 (22 x 8.5 in, ' +
    '0.25 in side margins, 45 columns of 0.48 in, no space) read from ' +
    'XML and written unchanged: !Letters\' Columns box refuses it (a ' +
    'column under 0.5 in); section 2 (A4) by Format > Columns..., 12 ' +
    'columns of 0.52 in with no space (13 refused)');
}

// ------------------------------------------------------ cl-4
async function lineNums() {
  const t = ['Section 1: Restart each page', 'Section 2: Start at 5, ' +
    'Count by 5', 'Section 3: Continuous, 0.5 in', 'Section 4: no ' +
    'countBy', 'Section 5: start 0'];
  const E = p('', EXACT());
  const body = [say(t[0]), lines('S1 line', 3), E, E, E, line('S1 line ' +
    '7'), line('S1 line 8 (suppressed)', '<w:suppressLineNumbers/>'),
  lines('S1 line', 60, 9), sectEnd('End of S1', {}), say(t[1]),
  lines('S2 line', 68), sectEnd('End of S2', {}), say(t[2]),
  lines('S3 line', 18), sectEnd('End of S3', {type: 'continuous'}),
  say(t[3]), lines('S4 line', 8), sectEnd('End of S4', {more:
      '<w:lnNumType/>'}), say(t[4]), lines('S5 line', 8)].join('');
  const d = await fixture(body, {lastSect: sect({more:
    '<w:lnNumType w:countBy="1" w:start="0"/>'})});
  must('ln 1', lineNumCmd(d, car(d, t[0]), {on: true}));
  must('ln 2', lineNumCmd(d, car(d, t[1]), {on: true, start: 5,
    countBy: 5, restart: 'newSection'}));
  must('ln 3', lineNumCmd(d, car(d, t[2]), {on: true, restart:
    'continuous', distance: 720}));
  await saveShown('cl-4-lnnum.docx', d, 'sections 1 to 3 by the Line ' +
    'numbers box (Format > Layout... > Line numbers...): 1 Add line ' +
    'numbering only (start 1, count by 1, restart each page; three ' +
    'empty paragraphs after S1 line 3, S1 line 8 with Suppress line ' +
    'numbers), 2 Start at 5, Count ' +
    'by 5, Restart each section, 3 Continuous, From text 0.5 in; 4 (a ' +
    'w:lnNumType with no attributes) and 5 (w:start="0") read from XML',
  {nums: true, floats: false});
}

// ------------------------------------------------------ cl-6
async function floatBottom() {
  const tb = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblpPr ' +
    'w:leftFromText="180" w:rightFromText="180" w:vertAnchor="text" ' +
    'w:horzAnchor="margin" w:tblpY="2880"/><w:tblW w:w="3000" ' +
    'w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' +
    '<w:gridCol w:w="3000"/></w:tblGrid>' + [1, 2, 3].map((k) =>
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${p(
      r('Case 3 table, row ' + k), EXACT())}</w:tc></w:tr>`).join('') +
    '</w:tbl>';
  const body = [say('Case 1: 2 in below line 50'), lines('Filler line',
    48), p(pic({id: 1, w: 192, h: 96, descr: 'Case 1', at: {h: ['column',
    off(3)], v: ['paragraph', off(2)]}}) + r('Case 1 anchor line'),
  EXACT()), lines('After line', 6), BREAK, say('Case 2: 11.2 in from ' +
    'the top of the page'), p(pic({id: 2, w: 192, h: 96, descr: 'Case 2',
    at: {h: ['margin', off(0)], v: ['page', off(11.2)]}}) + r('Case 2 ' +
    'anchor line'), EXACT()), lines('Page 2 line', 10), BREAK,
  say('Case 3: a table 2 in below line 52'), lines('Filler line', 50,
    100), tb, line('Case 3 line after the table'), lines('After line',
    4, 100), BREAK, say('Case 4: vertical align inside the margin'),
  p(pic({id: 3, w: 192, h: 96, descr: 'Case 4', at: {h: ['margin',
    al('right')], v: ['margin', al('inside')]}}) + r('Case 4 anchor ' +
    'line'), EXACT()), lines('Page 4 line', 10)].join('');
  const d = await fixture(body, {pics: true});
  await saveShown('cl-6-floatbottom.docx', d, 'floats read from XML ' +
    'and written unchanged; each picture 2 x 1 in, Square wrap',
  {cols: false, text: true});
}

// ------------------------------------------------------ cl-7
async function centred() {
  const sq = (w) => `<wp:wrapSquare wrapText="${w}"/>`;
  const C = [['Case 1: centred, both sides', al('center'), 'bothSides'],
    ['Case 2: 1.5 in from the margin, both sides', off(1.5),
      'bothSides'],
    ['Case 3: centred, largest side', al('center'), 'largest'],
    ['Case 4: centred, left side only', al('center'), 'left'],
    ['Case 5: centred, right side only', al('center'), 'right']];
  const body = C.map(([s, h, w], k) => (k ? BREAK : '') + say(s) +
    para(`Case ${k + 1}:`, 7, pic({id: k + 1, w: 192, h: 96, descr:
      'Case ' + (k + 1), at: {h: ['margin', h], v: ['paragraph',
      off(0.25)]}, wrap: sq(w)}))).join('');
  const d = await fixture(body, {pics: true});
  await saveShown('cl-7-centred.docx', d, 'read from XML and written ' +
    'unchanged: on each page a picture 2 x 1 in, 0.25 in below its ' +
    'paragraph\'s top, Square wrap, 0.13 in each side (distL / distR)',
  {cols: false});
}

// ------------------------------------------------------ cl-8
async function oscillate() {
  // the frame holds 58 lines: caption 1, anchor 1, filler 52, then a
  // 4-line paragraph (keep lines together) that ends on line 58, and
  // a picture over the last 2.5 lines whose sides leave no 0.5 in
  const body = [say('Case 1: a picture at the foot of page 1'),
    p(pic({id: 1, w: 570, h: 40, descr: 'Case 1', at: {h: ['margin',
      al('left')], v: ['page', off(10.69 - 0.42)]}}) + r('Case 1 anchor ' +
      'line'), EXACT()), lines('Filler line', 52), p(r('Kept line 1') +
      '<w:r><w:br/></w:r>' + r('Kept line 2') + '<w:r><w:br/></w:r>' +
      r('Kept line 3') + '<w:r><w:br/></w:r>' + r('Kept line 4'),
    '<w:keepLines/>' + EXACT()), lines('Page 2 line', 10), BREAK,
    say('Case 2: a picture taller than the page'), p(pic({id: 2, w: 600,
      h: 940, descr: 'Case 2', at: {h: ['margin', al('left')], v:
        ['paragraph', off(0)]}, wrap: '<wp:wrapTopAndBottom/>'}) +
      r('Case 2 anchor line'), EXACT()), lines('Page 3 line', 10)]
    .join('');
  const d = await fixture(body, {pics: true});
  await saveShown('cl-8-oscillate.docx', d, 'read from XML and written ' +
    'unchanged: case 1 a picture 5.94 x 0.42 in, Square wrap, at the ' +
    'foot of page 1\'s text; case 2 a picture 6.25 x 9.79 in, Top and ' +
    'bottom wrap, anchored in the first paragraph of its page',
  {cols: false, text: true});
}

// ------------------------------------------------------ cl-9
async function outline() {
  const t = ['A: promoted once', 'B: promoted, demoted 8 times',
    'C: promoted, demoted 9 times', 'D: Heading 2 under A',
    'E: body text under D', 'Section 2 heading', 'F: body text'];
  const outl = '<w:view w:val="outline"/>' + compat(15);
  const body = [...t.slice(0, 4).map((x) => line(x, x[0] === 'D' ?
    '<w:pStyle w:val="Heading2"/>' : '')), line(t[4]),
  sectEnd('End of section 1', {}), line(t[5],
    '<w:pStyle w:val="Heading1"/>'), line(t[6])].join('');
  const d = await fixture(body, {settings: outl});
  must('A', promoteCmd(d, car(d, t[0])));
  must('B', promoteCmd(d, car(d, t[1])));
  for (let i = 0; i < 8; i++) must('B' + i, demoteCmd(d, car(d, t[1])));
  must('C', promoteCmd(d, car(d, t[2])));
  for (let i = 0; i < 9; i++) must('C' + i, demoteCmd(d, car(d, t[2])));
  if (moveCmd(d, car(d, t[5]), -1, null)) {
    throw new Error('Move up across a section break taken');
  }
  const back = await save('cl-9-outline.docx', d, {note: 'a document ' +
    'whose paragraphs A, B and C were all body text: promoted and ' +
    'demoted by Outline > Promote / Demote; Move up on "Section 2 ' +
    'heading" refused (a section break above it); the settings say ' +
    'w:view outline; heading styles 3 to 9 added from !Letters\' own ' +
    'table when first used'});
  const rows = outlineOf(back.doc, null).rows;
  const blocks = back.doc.sections.flatMap((s) => s.blocks);
  wrote.get('cl-9-outline.docx').push('    Outline in !Letters (level, ' +
    'marker): ' + rows.map((x, k) => `${cut(blocks[k].text, 18)} ` +
    `${x.level === 9 ? 'body text' : 'level ' + (x.level + 1)} ` +
    x.marker).join('; '));
}

// ------------------------------------------------------ cl-columns
async function columnsBox() {
  const t = ['Section 1: Two, Line between', 'Section 2: Three',
    'Section 3: Left', 'Section 4: Right', 'Section 5: 1.5 and 4.42 in',
    'Section 6: Four from the middle of this paragraph'];
  const body = [say(t[0]), lines('S1 line', 80), sectEnd('End of S1', {}),
    say(t[1]), lines('S2 line', 10), line('Col 2 starts here'),
    lines('S2 line', 10, 11), sectEnd('End of S2', {}), say(t[2]),
    lines('S3 line', 70), sectEnd('End of S3', {}), say(t[3]),
    lines('S4 line', 70), sectEnd('End of S4', {}), say(t[4]),
    lines('S5 line', 50), para('The long paragraph:', 8),
    lines('S5 line', 20, 51), sectEnd('End of S5', {}), say(t[5]),
    lines('S6 line', 80)].join('');
  const d = await fixture(body);
  const tw = textWOf(d.doc, 0);
  const preset = (k, name) => must('cols ' + k, columnsCmd(d, car(d,
    t[k]), {...presetOf(name, tw, 720), sep: k === 0}, 'section'));
  preset(0, 'two');
  preset(1, 'three');
  preset(2, 'left');
  preset(3, 'right');
  must('cols 4', columnsCmd(d, car(d, t[4]), {num: 2, equal: false,
    col: [{w: 2160, space: 504}, {w: 6362, space: 0}]}, 'section'));
  must('break', columnBreak(d, car(d, 'Col 2 starts here')));
  must('forward', columnsCmd(d, car(d, t[5], t[5].indexOf('middle')),
    {num: 4}, 'forward'));
  await saveShown('cl-columns.docx', d, 'a document whose columns ' +
    'were all made by Format > Columns... (presets Two with Line ' +
    'between, Three, Left, Right; Equal column width off with 1.5 in ' +
    'and 4.42 in, 0.35 in apart; Four, This point forward at the ' +
    'caret, which puts in a continuous break) and Insert > Column ' +
    'break (before "Col 2 starts here")');
}

// ------------------------------------------------------ cl-wrap
async function wrapKinds() {
  const K = [['square', 'Square'], ['tight', 'Tight'], ['topBottom',
    'Top and bottom'], ['behind', 'Behind text'], ['inFront',
    'In front of text'], ['inline', 'Square, then In line'],
  ['square', 'Square, then dragged']];
  const body = K.map(([, what], k) => (k ? BREAK : '') + say(`Case ${k +
    1}: ${what}`) + para(`Case ${k + 1}:`, 6, pic({id: k + 1, w: 144,
    h: 72, descr: 'Case ' + (k + 1)}))).join('');
  const d = await fixture(body, {pics: true});
  K.forEach(([kind], k) => {
    const s = picSel(d, `Case ${k + 1}:`);
    if (kind === 'inline') {
      must('square ' + k, wrapCmd(d, s, 'square', {x: 0, y: 0}));
      must('inline ' + k, wrapCmd(d, picSel(d, `Case ${k + 1}:`),
        'inline'));
    } else must(kind, wrapCmd(d, s, kind, {x: 0, y: 0}));
  });
  must('move', moveAnchor(d, picSel(d, 'Case 7:'), {dx: 96, dy: 48}));
  await saveShown('cl-wrap.docx', d, 'a picture 1.5 x 0.75 in in line ' +
    'at the start of each long paragraph, given its wrap by Format > ' +
    'Wrap text (one page a case), the last one then moved 1 in right ' +
    'and 0.5 in down by dragging it', {cols: false});
}

// ------------------------------------------------------ floating tables
const fRow = (label, w, k) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${w}" ` +
  `w:type="dxa"/></w:tcPr>${p(r(`${label} row ${k}`), EXACT())}</w:tc>` +
  '</w:tr>';
/** A floating table: tblpPr attributes, the label of its rows, rows,
 *  width (twips), more after tblpPr (tblOverlap), after after tblW. */
const ftbl = (a, label, {n = 2, w = 2880, more = '', after = ''} = {}) =>
  '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblpPr' +
  Object.entries(a).map(([k, v]) => ` w:${k}="${v}"`).join('') +
  `/>${more}<w:tblW w:w="${w}" w:type="dxa"/>` + after +
  '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid><w:gridCol ' +
  `w:w="${w}"/></w:tblGrid>` + Array.from({length: n}, (_, k) =>
    fRow(label, w, k + 1)).join('') + '</w:tbl>';
const NEVER = '<w:tblOverlap w:val="never"/>';
const D = {leftFromText: 180, rightFromText: 180};

async function floatTables() {
  const C = [
    ['Table 1: text / text, X 0.5 in, Y 0.25 in', {...D, vertAnchor:
      'text', horzAnchor: 'text', tblpX: 720, tblpY: 360}],
    ['Table 2: margin, centre / top', {...D, vertAnchor: 'margin',
      horzAnchor: 'margin', tblpXSpec: 'center', tblpYSpec: 'top'}],
    ['Table 3: page, right / bottom', {...D, vertAnchor: 'page',
      horzAnchor: 'page', tblpXSpec: 'right', tblpYSpec: 'bottom'}],
    ['Table 4: margin inside / page centre', {...D, vertAnchor: 'page',
      horzAnchor: 'margin', tblpXSpec: 'inside', tblpYSpec: 'center'}],
    ['Table 5: no anchors, X 1 in, Y 1 in', {...D, tblpX: 1440, tblpY:
      1440}],
    ['Table 6: margin outside / text inline', {...D, vertAnchor: 'text',
      horzAnchor: 'margin', tblpXSpec: 'outside', tblpYSpec: 'inline'}],
    ['Table 7: margin X 2 in, Y 3 in, tblInd, jc', {...D, vertAnchor:
      'margin', horzAnchor: 'margin', tblpX: 2880, tblpY: 4320},
    '<w:jc w:val="center"/><w:tblInd w:w="1440" w:type="dxa"/>'],
    ['Table 8: text, Y 0.25 in, split', {...D, vertAnchor: 'text',
      horzAnchor: 'margin', tblpY: 360}],
  ];
  const parts = [];
  C.forEach(([s, a, after], k) => {
    parts.push(k ? BREAK : '', say(s), lines(`Page ${k + 1} line`, 4),
      ftbl(a, `Table ${k + 1}`, {n: k === 7 ? 4 : 2, after}),
      para(`Text after table ${k + 1}:`, 7), lines(`Page ${k + 1} line`,
        6, 10));
  });
  const d = await fixture(parts.join(''));
  const type = typer(d);
  if (allTables(d).length !== C.length) throw new Error('tables');
  for (let k = 0; k < C.length; k++) {
    type(cellCar(d, k, 0, 0, `Table ${k + 1} row 1`.length),
      ' (typed)');
    if (k % 2 === 0) must('row ' + k, insertRowsCmd(d, cellCar(d, k, 0,
      0), true));
  }
  must('split', splitTableCmd(d, cellCar(d, 7, 3, 0)));
  await saveShown('cl-11-floattable.docx', d, 'eight floating tables ' +
    'read from XML (one a page, 2 in wide, 0.13 in from the text each ' +
    'side); then in every table " (typed)" typed at the end of row 1, ' +
    'in tables 1, 3, 5 and 7 a row inserted below row 1 (Table > ' +
    'Insert row below), table 8 split before its fourth row (Table > ' +
    'Split table; the new table gets tblOverlap never)', {cols: false});
}

async function floatWrap() {
  const C = [
    ['Table 1: left margin, right 0.4 in', {vertAnchor: 'text',
      horzAnchor: 'margin', tblpXSpec: 'left', tblpY: 240, leftFromText:
      0, rightFromText: 576, topFromText: 144, bottomFromText: 288}],
    ['Table 2: right margin, left 0.2 in', {vertAnchor: 'text',
      horzAnchor: 'margin', tblpXSpec: 'right', tblpY: 240,
      leftFromText: 288, rightFromText: 0, bottomFromText: 144}],
  ];
  const parts = [];
  C.forEach(([s, a], k) => {
    parts.push(k ? BREAK : '', say(s), ftbl(a, `Table ${k + 1}`, {n: 4}),
      para(`Text beside table ${k + 1}:`, 10));
  });
  parts.push(BREAK, say('Tables 3 and 4: one place, overlap never'));
  for (const k of [3, 4]) {
    parts.push(ftbl({vertAnchor: 'margin', horzAnchor: 'margin', tblpX:
      1440, tblpY: 1440, leftFromText: 180, rightFromText: 180,
    bottomFromText: 144}, `Table ${k}`, {n: 3, more: NEVER}));
  }
  parts.push(para('Text beside tables 3 and 4:', 14));
  const d = await fixture(parts.join(''));
  await saveShown('cl-12-floatwrap.docx', d, 'read from XML and ' +
    'written unchanged: table 1 at the left margin 0.17 in below its ' +
    'paragraph (from the text: left 0, right 0.4 in, top 0.1 in, ' +
    'bottom 0.2 in), table 2 the same at the right margin (left 0.2 ' +
    'in, right 0, top 0, bottom 0.1 in); tables 3 and 4 both 1 in from ' +
    'the margin\'s top left, both tblOverlap never (bottom 0.1 in); ' +
    'every table 2 in wide; !Letters wraps the text on one side, the ' +
    'larger (OD9)', {cols: false});
}

export async function makeC() {
  await colSep();
  await balance();
  await maxCols();
  await lineNums();
  await floatBottom();
  await centred();
  await oscillate();
  await outline();
  await columnsBox();
  await wrapKinds();
  await floatTables();
  await floatWrap();
}
