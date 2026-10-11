// The final whole-branch review's interface fixes, their pure parts
// (Batch C final fix wave, group 2): Format > Borders and shading
// reads a selection of a whole 1000 x 63 table (about 63,000 inside
// edges) without overflowing the stack (final-2 I1); the Split cells
// box's reason for a split past MAX_ROWS rows names rows, not
// columns (final-3 minor 3); the resolved grid of a table is not
// kept alive by the table object itself, so the undo history does
// not hold one grid per version of a big table (final-2 I3).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fill} from '../../tools/moreapps/!Word/TblBorderPatch';
import {gridOf} from '../../tools/moreapps/!Word/TblGrid';
import {splitWhy} from '../../tools/moreapps/!Word/TblCmd';
import {MAX_ROWS} from '../../tools/moreapps/!Word/TblCheck';
import {newPara} from '../../tools/moreapps/!Word/Model';
import * as S from '../../tools/moreapps/!Word/Selection';
import {modelTable} from './tbl-fixtures.mjs';
import {execFileSync} from 'node:child_process';

const big = (rows, cols) => modelTable(Array.from({length: rows},
  () => Array.from({length: cols}, () => 'x')),
{grid: Array(cols).fill(100)});

describe('Borders and shading on a 1000 x 63 selection', () => {
  it('fill reads every inside edge', () => {
    const t = big(1000, 63), g = gridOf(t);
    const v = fill({r0: 0, r1: 999, c0: 0, c1: 62}, t, g, 'cell');
    assert.equal(v.apply, 'cell');
    assert.equal(v.insideH, false);
    assert.equal(v.insideV, false);
  });
});

describe('Split cells: the reason given', () => {
  const docOf = (t) => ({sections: [{blocks: [newPara('a'), t]}]});
  const at = (t, r) => S.caret({id: t.rows[r].cells[0].blocks[0].id,
    off: 0});
  it('past MAX_ROWS rows the message is about rows', () => {
    const t = big(MAX_ROWS - 2, 1);
    assert.equal(splitWhy(docOf(t), at(t, 0), 1, 5),
      `Too many: a table has at most ${MAX_ROWS} rows.`);
  });
  it('the other reasons', () => {
    const t = big(3, 2);
    assert.equal(splitWhy(docOf(t), at(t, 0), 1, 1),
      'One by one: nothing to split.');
    assert.equal(splitWhy(docOf(t), null, 2, 1),
      'Put the caret in a table cell first.');
    assert.equal(splitWhy(docOf(t), at(t, 0), 63, 1),
      'Too many: a table has at most 63 columns.');
  });
});

describe('the undo history keeps no grid alive', () => {
  // 40 versions of a table, each with a new grid array (as a
  // structure command makes), all kept (as the history keeps them);
  // their grids resolved and dropped: after a collection they are
  // freed (a child process run with --expose-gc)
  it('old versions\' grids are collected', () => {
    const url = (p) => new URL(p, import.meta.url).href;
    const src = `
      import {gridOf} from '${url('../../tools/moreapps/!Word/TblGrid')}';
      import {modelTable} from '${url('./tbl-fixtures.mjs')}';
      let freed = 0;
      const reg = new FinalizationRegistry(() => { freed++; });
      const rows = Array.from({length: 200}, () =>
        Array.from({length: 10}, () => 'x'));
      let t = modelTable(rows, {grid: Array(10).fill(100)});
      const history = [];
      for (let i = 0; i < 40; i++) {
        t = {...t, grid: [...t.grid]};
        history.push(t);
        reg.register(gridOf(t), i);
      }
      for (let k = 0; k < 20 && freed < 40; k++) {
        globalThis.gc();
        await new Promise((res) => setTimeout(res, 5));
      }
      console.log(JSON.stringify({freed, kept: history.length}));`;
    const out = JSON.parse(execFileSync(process.execPath,
      ['--expose-gc', '--input-type=module', '-e', src],
      {encoding: 'utf8'}).trim());
    assert.equal(out.kept, 40);
    assert.ok(out.freed >= 39, JSON.stringify(out));
  });
});
