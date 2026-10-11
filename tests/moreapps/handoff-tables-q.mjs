// The real-Word questions about tables (Batch C) and the hand-off files
// they are asked of: one list for tb-README.txt, INDEX.txt and the
// index in docs/apps/Word.md ("To check in real Word (tables,
// consolidated)"). Not a test.
//
//   FILES  [name, what to try, [question ids]] in session order
//   Q      [id, [files] | null, steps in Word]  one row per question;
//          null: "(No file)": made in Word, or tried on any table
//   SPEC   TB1..TB26: [id, question, what !Word does] (the spec's)
// What !Word does for every other id is read from docs/apps/Word.md's
// detailed rows (beliefOf), so there is one text for each.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const FILES = [
  ['tb-13-roundtrip-merged.docx', 'a Word-made table with merged cells, read and written untouched (corpus)', ['TB1']],
  ['tb-13-roundtrip-nested.docx', 'a Word-made table with a nested table, untouched (corpus)', ['TB1']],
  ['tb-13-roundtrip-styled.docx', 'a Word-made styled table (Grid Table 4), untouched (corpus)', ['TB1']],
  ['tb-1-insert.docx', 'Insert > Table 3 x 4 in a new document; fixed width, 6 columns, split paragraph, nested', ['TB2', 'TBC4j']],
  ['tb-1b-existing.docx', 'Insert > Table 3 x 4 in a Word-made document (corpus)', ['TB2']],
  ['tb-2-rows-cols.docx', 'a row by Tab, a column in a full-width table, rows inserted beside header rows and merges, split table', ['TB9', 'TB12', 'TBC4a', 'TBC4b', 'TBC4d', 'TBC4i', 'TBC4l', 'TBC4m']],
  ['tb-3-merge-split.docx', 'merge, split, delete a column or row across spans, authored vMerge / span / gridBefore oddities', ['TB8', 'TB8a', 'TB13', 'TB14', 'TB25', 'TBC4f', 'TBC4g', 'TBC4n', 'TBC5f', 'TBX1', 'TBX2']],
  ['tb-4-widths.docx', 'tcW mixes, no usable grid, drags, distribute, Table properties, heights, indent and alignment', ['TB6a', 'TB7', 'TB7a', 'TB7b', 'TB7c', 'TB18', 'TB19', 'TB24b', 'TB24c', 'TB24d', 'TBC4h', 'TBC5a', 'TBC5b', 'TBC5c', 'TBC5d', 'TBC5e', 'TBC5l', 'TBC5m', 'TBC5o', 'TBX3']],
  ['tb-5-borders-shading.docx', 'edge conflicts, cell spacing, nil sides, themed colours, Borders and shading for cells and tables', ['TB3', 'TB3c', 'TB3d', 'TB3e', 'TB3f', 'TB3g', 'TB24a', 'TBC5h', 'TBC5i', 'TBC5j', 'TBC5k', 'TBC5q', 'TBC5r']],
  ['tb-6-styles.docx', 'Grid Table 4 and List Table 3 with every tblLook combination, repeated headers, direct borders over a style', ['TB3a', 'TB3b', 'TB4', 'TB4a', 'TB4b', 'TB4c', 'TB4d', 'TB24e']],
  ['tb-6b-compat14.docx', 'compatibility mode 14: table style over Normal, tblLook hex against booleans, tblInd and cell margins', ['TB5', 'TB6']],
  ['tb-6c-compat15.docx', 'the same in compatibility mode 15', ['TB5', 'TB6']],
  ['tb-7-nested.docx', 'a table nested by hand, by Insert > Table in a cell and over selected cells, three levels', ['TBC4o']],
  ['tb-7b-nested-edits.docx', 'Tab in the nested table adds a nested row; deleting an outer row holding a nested table', []],
  ['tb-8-source.docx', 'the tables copied from: a list, a bold cell, a picture, a bookmark, merges, a content control', ['TB17', 'TBC6g']],
  ['tb-8-pasted.docx', 'a table pasted into a paragraph, into a cell, over a 2 x 2 rectangle, below a table, at depth 8', ['TB15', 'TBC6a', 'TBC6b', 'TBC6c', 'TBC6e']],
  ['tb-8b-style-clash.docx', 'a table style pasted into a document that uses its id for another style', ['TBC6d']],
  ['tb-8c-content-control.docx', 'a table holding a content control pasted into a new document', ['TBC6o']],
  ['tb-9-convert.docx', 'text to table by commas, tabs, paragraphs, a short row, a field; table to text in five cases', ['TB16', 'TBC6h', 'TBC6i', 'TBC6j', 'TBC6k', 'TBC6l', 'TBC6m']],
  ['tb-10-strict.docx', 'a Strict document: an authored table, Insert > Table, a merge, a resize, a Transitional table pasted', ['TB24', 'TBC6n']],
  ['tb-11-bookmarks.docx', 'bookmarks between rows, across cells and rows, in merges, over a deleted row, column or whole table', ['TB26', 'TBC4c']],
  ['tb-12-hostile-but-valid.docx', '63 columns, 100 rows and nesting 8: opens and scrolls', []],
  ['tb-14-floating-bidi.docx', 'a floating table, bidiVisual and a btLr cell, a row with tblPrEx, each edited in !Word', ['TB20', 'TB21', 'TB23']],
];

const t = (n) => `Table ${n}`;
export const Q = [
  ['TB1', ['tb-13-roundtrip-merged.docx', 'tb-13-roundtrip-nested.docx', 'tb-13-roundtrip-styled.docx'], 'Open each in Word and in !Word (README: the corpus file each came from); compare the looks'],
  ['TB2', ['tb-1-insert.docx', 'tb-1b-existing.docx'], 'Open; Table Design and Table Properties show Table Grid, automatic width, equal columns. Make Insert > Table 3 x 4 in Word and compare'],
  ['TB3', ['tb-5-borders-shading.docx'], t(0) + ': which line does Word draw on each edge of the six rows?'],
  ['TB3a', ['tb-6-styles.docx'], 'Tables 7-13 (List Table 3): which conditional part gives each cell side (header, banding, corners)?'],
  ['TB3b', ['tb-6-styles.docx'], t(15) + ' (red direct borders and wide left margins over Grid Table 4): do the style or the table win?'],
  ['TB3c', ['tb-5-borders-shading.docx'], t(1) + ': look at the cell spacing and the lines round each cell'],
  ['TB3d', ['tb-5-borders-shading.docx'], t(2) + ': the right side of the merged cell and its bottom line'],
  ['TB3e', ['tb-5-borders-shading.docx'], t(0) + ' row 6: thinThickThinSmallGap 6 against double 6'],
  ['TB3f', ['tb-5-borders-shading.docx'], t(3) + ': the centre cell has clear shading and no fill over Grid Table 4'],
  ['TB3g', ['tb-5-borders-shading.docx'], t(0) + ' rows 2 and 4: thick against double; red against blue of equal weight'],
  ['TB4', ['tb-6-styles.docx'], 'Tables 0-13: each tblLook combination of Grid Table 4 (0-6) and List Table 3 (7-13): colours and bold cells'],
  ['TB4a', ['tb-6-styles.docx'], t(0) + ', ' + t(3) + ', ' + t(4) + ', ' + t(5) + ': corner cells with both flags on'],
  ['TB4b', ['tb-6-styles.docx'], t(0) + ': compare the header and band colours with Word\'s Accent colours (tint 99 / 33)'],
  ['TB4c', ['tb-6-styles.docx'], t(3) + ' and ' + t(10) + ' (last row on): bands next to the last row'],
  ['TB4d', ['tb-6-styles.docx'], t(14) + ': two repeated header rows with firstRow on: which rows get the header look?'],
  ['TB5', ['tb-6b-compat14.docx', 'tb-6c-compat15.docx'], 'The Small Centre tables, and the tblLook tables (hex 0000 with booleans on; hex 04A0 with booleans off): text size, alignment and look'],
  ['TB6', ['tb-6b-compat14.docx', 'tb-6c-compat15.docx'], 'The four tblInd / cell margin tables: where is the left border against the paragraph above?'],
  ['TB6a', ['tb-4-widths.docx'], t(18) + ' to ' + t(20) + ': centred and right-aligned with tblInd 720; a wide table with tblInd 720'],
  ['TB7', ['tb-4-widths.docx'], t(0) + ' to ' + t(4) + ': the column widths Word shows (measure with Table Properties)'],
  ['TB7a', ['tb-4-widths.docx'], t(4) + ': the cell spanning two columns with tcW 6000 over 2000 columns'],
  ['TB7b', ['tb-4-widths.docx'], t(3) + ': tcW 0 and -5'],
  ['TB7c', ['tb-4-widths.docx'], t(2) + ': the long word in an auto column'],
  ['TB8', ['tb-3-merge-split.docx'], 'Tables 5 to 7: the continue cell in the first row, the span past the grid, gridBefore / gridAfter rows'],
  ['TB8a', ['tb-3-merge-split.docx'], t(12) + ': the continue cell under a cell that spans other columns'],
  ['TB9', ['tb-2-rows-cols.docx'], t(0) + ': in Word put the caret in the last cell and press Tab; compare the new row (yellow, height, red top border)'],
  ['TB10', null, 'On any table: Backspace at the start of the paragraph after it; Delete at the end of the one before (empty and not empty)'],
  ['TB11', null, 'On any table: select 2 x 2 cells and type, Delete, Backspace; select whole rows and press Backspace'],
  ['TB12', ['tb-2-rows-cols.docx'], t(1) + ': in Word insert a column right of column 2 in a table of the same size and compare the widths'],
  ['TB13', ['tb-3-merge-split.docx'], t(0) + ': in Word select rows 1-2, columns 1-3 and Merge Cells; compare the paragraphs'],
  ['TB14', ['tb-3-merge-split.docx'], t(1) + ' and ' + t(2) + ': in Word split the centre cell into 2 x 2; the merged cell into 2 x 3'],
  ['TB15', ['tb-8-pasted.docx', 'tb-8-source.docx'], 'Copy source table B in Word; paste into a cell, and over 2 x 2 cells (Overwrite cells); compare with Target 2 and 3'],
  ['TB16', ['tb-9-convert.docx'], 'Select each group of lines and Convert Text to Table (commas, tabs, paragraphs); convert the tables back with Convert to Text'],
  ['TB17', null, 'Copy a table from a browser page (colspan, rowspan) and from Word into !Word; and from !Word into Word (tb-8-source.docx opened in !Word)'],
  ['TB18', ['tb-4-widths.docx'], t(5) + ' and ' + t(7) + ': drag a column border and a row border in Word; look at the widths'],
  ['TB19', ['tb-4-widths.docx'], t(14) + ': an exact row 0.17 in high over three lines of text'],
  ['TB20', ['tb-14-floating-bidi.docx'], t(0) + ': the floating table: same place in Word?'],
  ['TB21', ['tb-14-floating-bidi.docx'], t(1) + ': right-to-left table, a cell with bottom-to-top text'],
  ['TB22', null, 'In a table cell press Ctrl-Enter and Insert > Break > Section break: what does Word do?'],
  ['TB23', ['tb-14-floating-bidi.docx'], t(2) + ': the row with its own thick red box and cell spacing'],
  ['TB24', ['tb-10-strict.docx'], 'Open in Word: no repair; Table 0 centred with red / blue sides; Tables 1 and 2'],
  ['TB24a', ['tb-5-borders-shading.docx'], t(1) + ': cell spacing 40 twips: where each cell box is'],
  ['TB24b', ['tb-4-widths.docx'], t(15) + ': a row at least 27.8 in high'],
  ['TB24c', ['tb-4-widths.docx'], t(16) + ': a trHeight of 0 (at least) in row 1; row 2 has 1 in with the rule auto: is its height ignored?'],
  ['TB24d', ['tb-4-widths.docx'], t(17) + ': a merged cell over rows whose last row is exact'],
  ['TB24e', ['tb-6-styles.docx'], t(16) + ': cells spanning columns with first and last column flags on'],
  ['TB25', ['tb-3-merge-split.docx'], t(3) + ' and ' + t(4) + ': in Word delete column 2 (across the span) and row 2 (holding the merge)'],
  ['TB26', ['tb-11-bookmarks.docx'], t(0) + ': in Word delete row 2 of a table with a bookmark between rows: Ctrl-G the bookmark'],
  ['TBC4a', ['tb-2-rows-cols.docx'], t(2) + ' and ' + t(3) + ': insert a row above / below the header rows (tblHeader)'],
  ['TBC4b', ['tb-2-rows-cols.docx'], t(4) + ' to ' + t(6) + ': a row inside, below and above a vertical merge'],
  ['TBC4c', ['tb-11-bookmarks.docx'], t(0) + ', ' + t(1) + ', ' + t(4) + ': delete the row or column; where do the bookmarks go?'],
  ['TBC4d', ['tb-2-rows-cols.docx'], t(7) + ' and ' + t(8) + ': a column beside a merge; a caret in a two-column cell'],
  ['TBC4e', ['tb-2-rows-cols.docx'], 'the same as TB12'],
  ['TBC4f', ['tb-3-merge-split.docx', 'tb-11-bookmarks.docx'], 'the same as TB13 (and ' + t(2) + ' of tb-11: a bookmark across merged cells)'],
  ['TBC4g', ['tb-3-merge-split.docx'], 'the same as TB14'],
  ['TBC4h', ['tb-4-widths.docx'], t(8) + ' (distribute columns, whole table selected) and ' + t(9) + ' (distribute rows)'],
  ['TBC4i', ['tb-2-rows-cols.docx'], t(11) + ' (split at row 3) and ' + t(12) + ' (split at the first row): Ctrl-Shift-Enter in Word'],
  ['TBC4j', ['tb-1-insert.docx'], 'the same as TB2, and the fixed-width table (1 inch columns)'],
  ['TBC4k', null, 'Press Ctrl-Tab in a cell in a browser: it changes the browser tab; use the Tab item of the Table or Insert menu'],
  ['TBC4l', ['tb-2-rows-cols.docx'], t(10) + ': a column inserted into a 100% (pct) table'],
  ['TBC4m', ['tb-2-rows-cols.docx'], t(9) + ': a row inserted below a row with tblPrEx'],
  ['TBC4n', ['tb-3-merge-split.docx'], t(8) + ': the stray continue cell in row 2 before and after the inserted row'],
  ['TBC4o', ['tb-7-nested.docx'], t(2) + ': Insert > Table with two cells selected'],
  ['TBC5a', ['tb-4-widths.docx'], t(10) + ': Table Properties > Row: exactly 0.42 in'],
  ['TBC5b', ['tb-4-widths.docx', 'tb-10-strict.docx'], t(18) + ' to ' + t(20) + ': alignment with an indent; tb-10 Table 0 (Strict: start / end)'],
  ['TBC5c', ['tb-4-widths.docx'], t(11) + ': Table Properties > Column width on a dxa-width autofit table'],
  ['TBC5d', ['tb-4-widths.docx'], t(12) + ': Table Properties > Cell: preferred width 0.69 in'],
  ['TBC5e', ['tb-4-widths.docx'], t(13) + ': Table Properties > Indent from left -0.08 in'],
  ['TBC5f', ['tb-3-merge-split.docx'], t(9) + ': vertical alignment of a merged cell (set to centre by !Word)'],
  ['TBC5g', null, 'In !Word give a column a width under 0.02 in: refused; Word\'s own minimum?'],
  ['TBC5h', ['tb-5-borders-shading.docx'], t(8) + ': Apply to Cell with None on the centre cell: the neighbours\' lines'],
  ['TBC5i', ['tb-5-borders-shading.docx'], t(8) + ' and ' + t(9) + ': a side turned off over the table\'s line'],
  ['TBC5j', ['tb-5-borders-shading.docx'], t(10) + ': Fill: No Color over a style\'s shading'],
  ['TBC5k', ['tb-5-borders-shading.docx'], t(6) + ': the box round the centre cell: the line\'s spacing'],
  ['TBC5l', ['tb-4-widths.docx'], t(5) + ': drag a column border in Word; compare the file'],
  ['TBC5m', ['tb-4-widths.docx'], t(6) + ': drag the table\'s right edge in Word'],
  ['TBC5n', null, 'In !Word drag a column border to the left past 0.1 in; in Word try the same'],
  ['TBC5o', ['tb-4-widths.docx'], t(21) + ': a table whose grid is wider than its tblW, then a border dragged'],
  ['TBC5p', null, 'In !Word type a length in Table Properties that differs by under 0.01 in: no change; in Word?'],
  ['TBC5q', ['tb-5-borders-shading.docx'], t(11) + ': the line drawn only by cell 2\'s left side; Borders and Shading on cell 1'],
  ['TBC5r', ['tb-5-borders-shading.docx'], t(12) + ': Apply to Table with None over cells that carry their own boxes'],
  ['TBC6a', ['tb-8-pasted.docx'], 'Target 3: table B pasted over 2 x 2 cells; the yellow centre cell'],
  ['TBC6b', ['tb-8-pasted.docx'], 'Target 3: where is the selection after the overwrite?'],
  ['TBC6c', ['tb-8-pasted.docx'], 'Target 5: table B pasted into the innermost of 8 nested tables'],
  ['TBC6d', ['tb-8b-style-clash.docx'], 'Table A pasted into a document with another style of the same id'],
  ['TBC6e', ['tb-8-pasted.docx'], 'Target 4: table C pasted below a table with no paragraph between'],
  ['TBC6f', null, 'Copy a table from a browser, Google Docs and Excel and paste it into !Word; then Word to !Word'],
  ['TBC6g', ['tb-8-source.docx'], 'Open in !Word, copy table A or C, paste into Word (as HTML)'],
  ['TBC6h', ['tb-9-convert.docx'], 'The Y table: table to text with rows 2-3 selected'],
  ['TBC6i', ['tb-9-convert.docx'], 'The R1 lines: five pieces in a line, three columns asked'],
  ['TBC6j', ['tb-9-convert.docx'], 'The F0 paragraph and the field after it: text to table across the field'],
  ['TBC6k', ['tb-9-convert.docx'], 'The Z table (a nested table) to text, and the separator\'s look'],
  ['TBC6l', ['tb-9-convert.docx'], 'The V table: a hidden cell\'s text in table to text'],
  ['TBC6m', ['tb-9-convert.docx'], 'The N lines: a numbered list converted to a table'],
  ['TBC6n', ['tb-10-strict.docx'], 'Table 2 (a Transitional table pasted into a Strict document): no repair?'],
  ['TBC6o', ['tb-8c-content-control.docx', 'tb-8-source.docx'], 'Source table D: copy in Word with its content control, paste elsewhere'],
  ['TBX1', ['tb-3-merge-split.docx'], t(9) + ': Find text that is only in a cell merged down (Y.2.1)'],
  ['TBX2', ['tb-3-merge-split.docx'], t(9) + ': click in the row zone of a row a vertical merge crosses'],
  ['TBX3', ['tb-4-widths.docx'], t(18) + ' (centred) and ' + t(19) + ' (right-aligned): drag the right edge; where is the dashed line?'],
];

const SPEC = {
  TB1: ['three Word-made corpus tables (merged cells, nested, styled) read and written by !Word, untouched', 'opens with no repair, looks the same (canonical property order, run rsids dropped)'],
  TB2: ['Insert > Table 3x4 in a new and in an existing document', 'Table Grid and TableNormal added once, tblW auto, tcW dxa, tblLook 04A0 + booleans; no repair; Word shows a gridded table of equal columns'],
  TB3: ['neighbours with single 4 / double 6 / thick 12 / dotted 24, colours, nil', 'the ECMA weight rule (D22); does Word draw the same winner per edge?'],
  TB4: ['Word\'s Grid Table 4 / List Table 3 with tblLook combinations (header row, first column, banded rows/columns, last row/column off and on)', 'D16\'s order; same colours and bold cells?'],
  TB5: ['a table style with sz 9 and jc center over Normal 11 left, compat mode 14 and 15; tblLook hex vs booleans disagreeing', 'the table style layer, the compat switch; booleans win'],
  TB6: ['tblInd 0 and 720 with cell margins 108 / 0, compat 14 vs 15', 'the left border at the margin plus tblInd (no margin shift)'],
  TB7: ['generated tables with no usable grid, tcW pct/auto/dxa mixes', 'D18 step 2\'s widths: how far from Word\'s?'],
  TB8: ['vMerge continue in the first row, a span past the grid, gridBefore/After ragged rows', 'restart assumed; the view widened; empty grid space'],
  TB9: ['a row added by Tab in the last cell', 'trPr and tcPr copied (no vMerge restart), first paragraph\'s pPr; is that what Word copies (shading, borders, height)?'],
  TB10: ['Backspace at the start of the paragraph after a table, Delete at the end of the one before (empty and not)', 'D10\'s rules'],
  TB11: ['typing, Delete, Backspace with 2x2 cells selected; Backspace with whole rows', 'cleared contents, text in the top-left cell; whole rows removed'],
  TB12: ['a column inserted in a full-width table', 'columns scaled to the old total'],
  TB13: ['2x3 merged with text in 4 cells', 'paragraphs joined in flow order, empty cells skipped'],
  TB14: ['split a plain cell 2x2 and a merged cell 3x1', 'grid/tcW/vMerge as D25'],
  TB15: ['a table pasted into a cell (nested) and over a 2x2 rectangle (overwrite)', 'as D28'],
  TB16: ['text to table by tabs/commas, a table with a two-paragraph cell to text', 'as D29'],
  TB17: ['an HTML table with colspan/rowspan pasted from a browser, and a Word table copied in Word and pasted into !Word (and back)', 'D28 HTML in; widths, merges, shading'],
  TB18: ['column boundary dragged; row height dragged', 'grid + tcW dxa, trHeight atLeast; same widths in Word?'],
  TB19: ['an exact row height shorter than its text', 'clipped to the cell'],
  TB20: ['a floating table after !Word edited inside it', 'tblpPr kept: same position in Word'],
  TB21: ['bidiVisual and textDirection btLr cells after editing', 'kept; shown LTR/horizontal by !Word'],
  TB22: ['Ctrl-Enter and a section break asked for in a cell', 'refused (beep); what does Word do?'],
  TB23: ['rows with tblPrEx (row-level borders)', 'kept, ignored in display: how much differs?'],
  TB24: ['Strict document, table inserted and borders set', 'start/end names, Strict namespaces, no repair'],
  TB25: ['delete a column crossing a gridSpan and a row holding a vMerge restart', 'spans shrink; restart passed down'],
  TB26: ['a bookmark spanning rows (marks between rows) after a row delete', 'marks moved to the next row, pair kept'],
};

/** [question, what !Word does] of every id: TB1..TB26 as the spec has
 *  them, the others from docs/apps/Word.md's detailed rows. */
export function beliefs() {
  const md = fs.readFileSync(fileURLToPath(new URL(
    '../../docs/apps/Word.md', import.meta.url)), 'utf8');
  const from = md.indexOf('### To check in real Word (table styles');
  let to = md.indexOf('### To check in real Word (tables, consolidated)');
  if (to < 0) to = md.indexOf('## Known limitations and deferred items');
  const out = new Map(Object.entries(SPEC));
  for (const line of md.slice(from, to).split('\n')) {
    const m = /^\| (TB[A-Z]*\d+[a-z]?) \| (.*?) \| (.*) \|$/.exec(line);
    if (m && !out.has(m[1])) out.set(m[1], [m[2], m[3]]);
  }
  out.set('TBX1', ['Find, Replace and Go to (a bookmark) reaching text in the hidden part of a cell merged down',
    'the match is selected in a cell nobody sees (Word does not show it either)']);
  out.set('TBX2', ['a click in the row zone of a row that a vertical merge crosses',
    'selects every row of the merge (the cells rectangle grows over merges); Word highlights just the row']);
  out.set('TBX3', ['the right edge of a centred or right-aligned table dragged',
    'the dashed line assumes the table\'s left edge stays, so for jc center / right it is drawn elsewhere (a centred one moves half as far)']);
  return out;
}

/**
 * The checks that matter most when there is time for only some of the
 * questions (the order to take them in): anything that could make
 * Word show a repair prompt or an "unreadable content" message comes
 * first, then what would show as a plain visible difference.
 * [what to do, files, question ids (their text is under Questions)].
 */
export const PRIORITY = [
  ['Smoke test: open EVERY tb-*.docx once; note any repair prompt or ' +
    '"unreadable content" message and which file. Include ' +
    'tb-12-hostile-but-valid.docx (63 columns, nesting 8: it must ' +
    'open and look right, no question asked).',
  [], []],
  ['Strict output spellings: the Strict document with an authored ' +
    'table, a table Insert > Table made, a Transitional table pasted ' +
    'in (start / end names, tblLook without w:val; a Transitional ' +
    'table may bring its own spellings).', ['tb-10-strict.docx'], ['TB24', 'TBC5b', 'TBC6n']],
  ['The table Insert > Table writes (tblLook, Table Grid style, ' +
    'tblW, tblGrid): no repair, and Word shows Table Grid with equal ' +
    'columns.', ['tb-1-insert.docx', 'tb-1b-existing.docx'],
  ['TB2', 'TBC4j']],
  ['Duplicate or odd properties: Table properties writes a ' +
    'trHeight / tcW / tblW / tblInd / jc next to ones the file had ' +
    '(one element each, no repair), including trHeight with the rule ' +
    'auto and 0.', ['tb-4-widths.docx'], ['TBC5a', 'TBC5c', 'TBC5d',
    'TBC5e', 'TB24b', 'TB24c', 'TB24d']],
  ['tblLook and cnfStyle spellings: every tblLook combination (hex ' +
    'and booleans) of Grid Table 4 and List Table 3, repeated header ' +
    'rows, and compatibility modes 14 and 15: opens without repair, ' +
    'banding and header looks as Word draws them.', ['tb-6-styles.docx',
    'tb-6b-compat14.docx', 'tb-6c-compat15.docx'], ['TB4', 'TB4d',
    'TB5']],
  ['nil against none in borders and shading: a side turned off, ' +
    'Fill None over a style, Apply to Cell neighbours, cell spacing: ' +
    'opens without repair and the lines are as !Word shows them.',
  ['tb-5-borders-shading.docx'], ['TBC5h', 'TBC5i', 'TBC5j', 'TBC5r',
    'TB3c']],
  ['Merged-cell structures: authored vMerge / gridSpan / gridBefore ' +
    'oddities, a stray continue cell, merge and split results; then ' +
    'delete a column across a span and a row holding a merge in Word.',
  ['tb-3-merge-split.docx'], ['TB8', 'TB13', 'TB14', 'TB25', 'TBC4n']],
  ['Nested tables: made by hand, by Insert > Table in a cell, three ' +
    'levels, a row with a nested table deleted: every cell ends with ' +
    'a paragraph, no repair.', ['tb-7-nested.docx',
    'tb-7b-nested-edits.docx'], ['TBC4o']],
  ['Convert output: Text to table (tabs, commas, paragraphs, a short ' +
    'row, a field refused) and Table to text: opens without repair, ' +
    'the same text and look.', ['tb-9-convert.docx'], ['TB16', 'TBC6h',
    'TBC6i', 'TBC6k', 'TBC6m']],
  ['Pasted tables: into a paragraph, a cell, over 2 x 2 cells, below ' +
    'a table (the empty paragraph between), at depth 8 (text).',
  ['tb-8-pasted.docx'], ['TB15', 'TBC6a', 'TBC6c', 'TBC6e']],
  ['Table styles copied into another document, one clashing with ' +
    'another style of the same id, and a content control in a cell ' +
    'left out: no repair, the look kept.', ['tb-8b-style-clash.docx',
    'tb-8c-content-control.docx'], ['TBC6d', 'TBC6o']],
  ['Bookmark placement in cells and between rows (bookmarkStart / ' +
    'bookmarkEnd inside w:tr and w:tbl) after deleting rows, columns ' +
    'and a whole table: no repair, Ctrl-G finds each.',
  ['tb-11-bookmarks.docx'], ['TB26', 'TBC4c']],
  ['Rows and columns inserted beside header rows, a merge, a tblPrEx ' +
    'row and a 100% wide table; the Tab row and split table: no ' +
    'repair, header and widths as !Word wrote them.',
  ['tb-2-rows-cols.docx'], ['TB9', 'TB12', 'TBC4a', 'TBC4b', 'TBC4l',
    'TBC4m', 'TBC4i']],
  ['Word-made tables read and written untouched (merged, nested, ' +
    'styled): they must look the same in Word as before !Word saved ' +
    'them.', ['tb-13-roundtrip-merged.docx',
    'tb-13-roundtrip-nested.docx', 'tb-13-roundtrip-styled.docx'],
  ['TB1']],
  ['Kept and edited: the floating table, right-to-left table, btLr ' +
    'cell and the row with its own borders after !Word edited inside ' +
    'them: same place and look in Word.',
  ['tb-14-floating-bidi.docx'], ['TB20', 'TB21', 'TB23']],
];

/** One short label for each PRIORITY entry, for INDEX.txt. */
export const PRIORITY_LABELS = [
  'smoke test of every file (repair prompts)',
  'Strict output spellings',
  'Insert > Table output (tblLook, Table Grid)',
  'duplicate or odd properties (trHeight, tcW, tblInd)',
  'tblLook and cnfStyle spellings, compatibility 14 / 15',
  'nil against none borders, Fill None',
  'merged-cell structures',
  'nested tables',
  'convert output',
  'pasted tables',
  'table styles copied between documents',
  'bookmark placement in cells and between rows',
  'rows and columns inserted beside headers and merges',
  'Word-made tables read and written untouched',
  'floating, right-to-left, btLr and tblPrEx tables',
];
if (PRIORITY_LABELS.length !== PRIORITY.length) {
  throw new Error('PRIORITY and PRIORITY_LABELS differ');
}
