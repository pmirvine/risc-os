// The Place gate (Batch D P3.1, D4): screen positions come from the
// view's placement (L.place, ./Place), never from galley arithmetic
// in a consumer. Every match in a !Letters source of it.y, ln.y or
// "<x>.y +" (comment lines left out) must be in ALLOW with its exact
// count per file: a file not listed with a match fails, and so does
// a count that differs either way (lower it when sites go). Entries
// until '-' are for good: galley modules (stacking, pagination,
// PositionMap, line and table layout), arithmetic on a rectangle a
// Place already answered (a caret rect's c.y + c.h), and window
// geometry; painters of one fragment in its own galley coordinates
// (./DocPaint moves each to where L.place.visible puts it); finders
// at a galley point (the screen point mapped by ./Place toGalley on
// the way in). P3.5: ./DocRects culls on the galley band L.place band
// gives for the screen band (its entry is for good now).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = fileURLToPath(new URL('../../tools/moreapps/!Letters/',
  import.meta.url));

export const PATTERNS = [/\bit\.y\b/g, /\bln\.y\b/g, /\.y \+/g];

const KEEP = '-';
const GALLEY = 'galley geometry (stacking, pagination, lines): ' +
  'not a screen position';
const ANSWERED = 'arithmetic on a rectangle a Place answered, or ' +
  'window geometry';
const FRAG = 'paints one fragment in its galley coordinates: ' +
  './DocPaint moves it by the dx, dy L.place.visible gives';
const POINT = 'finds what is at a galley point: the screen point ' +
  'is mapped by ./Place toGalley on the way in';

/** {file, count, why, until}: until '-' is for good. */
export const ALLOW = [
  {file: 'AnchorPlace', count: 7, until: KEEP, why: GALLEY + ' (a ' +
    'float placed on its page from the page\'s frames, as ' +
    './PageFrames: P12.2; a floating table\'s cells moved with it, ' +
    'P12.6)'},
  {file: 'AnchorTbl', count: 5, until: KEEP, why: GALLEY + ' (a ' +
    'floating table placed on its page from its frag, its box in ' +
    'page coordinates: P12.6; kept in its frame, P12b fix M3)'},
  {file: 'BorderPaint', count: 11, until: KEEP, why: FRAG},
  {file: 'ColAhead', count: 1, until: KEEP, why: GALLEY + ' (a ' +
    'paragraph\'s advance in the galley, guessing column widths: ' +
    'P10 fix I2)'},
  {file: 'DocHit', count: 8, until: KEEP, why: 'galley: the point ' +
    'is mapped by ./Place toGalley first (items, bands, border ' +
    'gaps); a table row moved by shiftOf'},
  {file: 'DocKeys', count: 1, until: KEEP, why: ANSWERED},
  {file: 'DocRects', count: 17, until: KEEP, why: GALLEY + ': the ' +
    'galley band L.place band gives for the screen band (D33), ' +
    'lines boxed by L.place rects; table boxes moved by shiftOf'},
  {file: 'DocStack', count: 1, until: KEEP, why: GALLEY},
  {file: 'EditKeys', count: 1, until: KEEP, why: ANSWERED},
  {file: 'EditPaint', count: 7, until: KEEP, why: ANSWERED + ' (the ' +
    'page, the caret, the drags\' ghosts: places already)'},
  {file: 'EditScroll', count: 5, until: KEEP, why: ANSWERED},
  {file: 'FindView', count: 2, until: KEEP, why: ANSWERED},
  {file: 'LineExcl', count: 2, until: KEEP, why: GALLEY + ' (a ' +
    'float\'s polygon in page coordinates, for the room a line has ' +
    'beside it: P12.3; split from ./LineShape, P12.7)'},
  {file: 'WrapWant', count: 9, until: KEEP, why: GALLEY + ' (the ' +
    'lines of a paragraph on a page, met by its floats\' exclusions, ' +
    'from the page\'s frames: P12.3, P12a fix C1)'},
  {file: 'WrapCmd', count: 2, until: KEEP, why: GALLEY + ' (a ' +
    'picture\'s top in its paragraph, for its anchor\'s offset: ' +
    'P12a fix M3)'},
  {file: 'WrapCells', count: 4, until: KEEP, why: GALLEY + ' (a ' +
    'cell\'s lines on a page, from ./AnchorPlace cellsOn: P12a fix I5)'},
  {file: 'WrapGuess', count: 2, until: KEEP, why: GALLEY + ' (floats ' +
    'moved with the paragraphs above them, guessed: P12a fix C1)'},
  {file: 'ItemBreak', count: 1, until: KEEP, why: FRAG + ' (the ' +
    'first line\'s end inside its paragraph: Show first line only, ' +
    'P13.4)'},
  {file: 'LinkFind', count: 4, until: KEEP, why: POINT},
  {file: 'MarkPaint', count: 4, until: KEEP, why: FRAG},
  {file: 'OutlineLayout', count: 2, until: KEEP, why: FRAG + ' (an ' +
    'Outline marker beside its item: P13.2)'},
  {file: 'PageCells', count: 4, until: KEEP, why: GALLEY},
  {file: 'EndGalley', count: 1, until: KEEP, why: GALLEY + ' (where ' +
    'a run of notes starts in the galley: below the item before it, ' +
    'Batch E2)'},
  {file: 'EndnoteLayout', count: 3, until: KEEP, why: GALLEY + ' (the ' +
    'notes after the text stacked as galley items, Batch E2)'},
  {file: 'NoteLayout', count: 5, until: KEEP, why: GALLEY + ' (the ' +
    'bottoms of a note\'s lines in its own layout, Batch E2)'},
  {file: 'NotePlace', count: 9, until: KEEP, why: GALLEY + ' (the ' +
    'lines of the marks on a page, its foot: Batch E2)'},
  {file: 'NoteView', count: 6, until: KEEP, why: 'the Print layout ' +
    'placement of the notes: where a page draws a footnote\'s piece or ' +
    'a run\'s fragment, page coordinates as ./PagePaint feet and ends ' +
    'draw them (Batch E2)'},
  {file: 'NoteEdit', count: 2, until: KEEP, why: ANSWERED + ' (the ' +
    'notes mode: a note placed on its page\'s rect, ./PageSheet; the ' +
    'page dimmed but its note bands: Batch E2)'},
  {file: 'PageCols', count: 3, until: KEEP, why: GALLEY + ' (startY, ' +
    'moved from ./Paginate: P10.1)'},
  {file: 'PageCellAt', count: 3, until: KEEP, why: GALLEY},
  {file: 'PageCursor', count: 3, until: KEEP, why: GALLEY},
  {file: 'PageFill', count: 24, until: KEEP, why: GALLEY + ' (a ' +
    'placed floating table\'s span: P12.6; a stack of them, P12b ' +
    'fix I4)'},
  {file: 'PageFrames', count: 1, until: KEEP, why: GALLEY},
  {file: 'PageRows', count: 5, until: KEEP, why: GALLEY},
  {file: 'ParaSpace', count: 1, until: KEEP, why: GALLEY},
  {file: 'PagePaint', count: 6, until: KEEP, why: ANSWERED + ' (a ' +
    'page\'s rect from ./PageSheet: its corner marks, its place; a ' +
    'float\'s box, ./AnchorPlace: page coordinates, P12.2; a note ' +
    'after the text drawn at its fragment\'s page place, ./PageFrames, ' +
    'from its own layout: Batch E2)'},
  {file: 'PageSheet', count: 3, until: KEEP, why: 'the Print ' +
    'layout placement: where each page lies on the sheet'},
  {file: 'PicDrag', count: 1, until: KEEP, why: ANSWERED + ' (the ' +
    'picture\'s placed box)'},
  {file: 'PicFind', count: 6, until: KEEP, why: ANSWERED + ' (the ' +
    'picture\'s box from L.place.lineAt, its handles; a placed ' +
    'float\'s box from its page\'s rect, ./PageSheet, P12.2; a ' +
    'line\'s text from L.place.lineAt, P12a fix I2)'},
  {file: 'PlaceDraft', count: 12, until: KEEP, why: 'the identity ' +
    'placement: Draft\'s answers ARE the galley'},
  {file: 'PlacePrint', count: 6, until: KEEP, why: 'the Print ' +
    'layout placement: a galley line to its fragment on its page'},
  {file: 'PrintFrags', count: 2, until: KEEP, why: 'the Print ' +
    'layout placement: a page\'s fragments (./PlacePrint)'},
  {file: 'LineNumbers', count: 3, until: KEEP, why: 'a page\'s ' +
    'line numbers on its lines\' baselines, from the fragments ' +
    './PrintFrags places (Print layout only, P11.1)'},
  {file: 'TblPieces', count: 1, until: KEEP, why: 'the Print ' +
    'layout placement: a table\'s rows on a page (P4.2)'},
  {file: 'TblPagePaint', count: 2, until: KEEP, why: FRAG + ' (the ' +
    'dashed outline of a floating table in the flow: P12.6)'},
  {file: 'PrintHit', count: 10, until: KEEP, why: 'the Print ' +
    'layout placement: the line at a point (./PlacePrint; a placed ' +
    'floating table where it is drawn, P12.6; and near it, for its ' +
    'edges, floatNear, P12b fix I2)'},
  {file: 'PositionMap', count: 3, until: KEEP, why: GALLEY},
  {file: 'SectDeco', count: 2, until: KEEP, why: GALLEY},
  {file: 'SelTable', count: 1, until: KEEP, why: POINT},
  {file: 'HdrView', count: 3, until: KEEP, why: 'the header and ' +
    'footer mode\'s placement (PlaceShift: PlaceDraft\'s answers ' +
    'moved to the story\'s page, P7.3)'},
  {file: 'HdrEdit', count: 1, until: KEEP, why: ANSWERED + ' (a ' +
    'page\'s rect from ./PageSheet and its header box: the shift)'},
  {file: 'HdrPaint', count: 2, until: KEEP, why: ANSWERED + ' (a ' +
    'page\'s rect from ./PageSheet: its body dimmed, its lines)'},
  {file: 'StoryLayout', count: 1, until: KEEP, why: GALLEY + ': a ' +
    'header or footer story\'s own height (P7.1)'},
  {file: 'SelVert', count: 4, until: KEEP, why: 'the line\'s galley ' +
    'middle for PositionMap.hitTest; a caret rect\'s middle'},
  {file: 'TablePaint', count: 3, until: KEEP, why: FRAG},
  {file: 'TblCellPaint', count: 6, until: KEEP, why: FRAG},
  {file: 'TblDrag', count: 1, until: KEEP, why: 'a row\'s bottom ' +
    'moved by ./Place shiftOf (the ghost line)'},
  {file: 'TblEdge', count: 8, until: KEEP, why: POINT},
  {file: 'TblLayout', count: 1, until: KEEP, why: GALLEY},
];

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

/** The matches of every pattern in source text. */
export function countIn(text) {
  const code = text.split('\n').filter((l) => !isComment(l))
    .join('\n');
  let n = 0;
  for (const re of PATTERNS) n += (code.match(re) || []).length;
  return n;
}

/** Every source file of !Letters (not the Fonts directory). */
function sources() {
  return readdirSync(DIR).filter((f) => statSync(join(DIR, f))
    .isFile()).map((f) => ({file: f,
    text: readFileSync(join(DIR, f), 'latin1')}))
    .filter((x) => !x.text.includes('\0'));
}

/** What is wrong with files against ALLOW: lines of text. */
function problems(files) {
  const out = [], allowed = new Map(ALLOW.map((e) => [e.file, e]));
  for (const {file, text} of files) {
    const n = countIn(text), a = allowed.get(file);
    allowed.delete(file);
    if (n === (a ? a.count : 0)) continue;
    out.push(`${file}: found ${n}, allowed ${a ? a.count : 0} ` +
      '(a screen position from it.y / ln.y: ask L.place, ./Place)');
  }
  for (const e of allowed.values()) out.push(`${e.file}: no file`);
  return out;
}

describe('place gate (D4)', () => {
  it('the matcher catches the forms it is for, not comments', () => {
    assert.equal(countIn('const t = it.y + ln.y;'), 3);
    assert.equal(countIn('if (r.y + r.h > y) f(n.y);'), 1);
    assert.equal(countIn('// it.y + ln.y\n * it.y'), 0);
    assert.equal(countIn('const a = split.y; b = item.y;'), 0);
  });
  it('a planted it.y + ln.y fails the gate', () => {
    const files = sources();
    const k = files.findIndex((x) => x.file === 'EditView');
    files[k] = {...files[k], text: files[k].text +
      '\nconst top = it.y + ln.y;\n'};
    assert.match(problems(files).join('\n'), /EditView: found 3/);
  });
  it('every match is allowed, every count exact', () => {
    assert.deepEqual(problems(sources()), []);
  });
  it('the finders map the point, DocPaint asks visible', () => {
    const src = new Map(sources().map((x) => [x.file, x.text]));
    for (const f of ['LinkFind', 'PicFind', 'SelTable', 'TblEdge',
      'DocHit']) {
      assert.match(src.get(f), /toGalley\(L\.place, /, f);
    }
    assert.match(src.get('DocPaint'), /L\.place\.visible\(/);
  });
  it('ALLOW entries are well formed and unique', () => {
    const seen = new Set();
    for (const e of ALLOW) {
      assert.ok(Number.isInteger(e.count) && e.count > 0, e.file);
      // (every entry is for good: none waits for a later task)
      assert.ok(e.why && e.until === KEEP, e.file);
      assert.ok(!seen.has(e.file), 'twice: ' + e.file);
      seen.add(e.file);
    }
  });
});
