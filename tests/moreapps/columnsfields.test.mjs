// The Columns box's fields (Batch D P10 fix M3, ./ColumnsFields): a
// value the sections in scope do not share is shown blank and, left
// blank, is kept (each section keeps its own), as the box's header
// and the guide say; a value shown and then cleared is still refused.
// The dialog is a stand-in with the calls the fields make (get, set,
// shade, win.iconByName); the commands are the real ones.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {fillState, blankWhy, changes, W, S}
  from '../../tools/moreapps/!Letters/ColumnsFields';
import {colsOf, columnsWhy, columnsCmd}
  from '../../tools/moreapps/!Letters/SectSetup';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import * as Sel from '../../tools/moreapps/!Letters/Selection';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {loadStyles} from './word-docs.mjs';

before(loadStyles);
const OPTIONS = ['equal', 'sep'];

/** A stand-in dialog: fields by name, options on or off. */
function fakeApi() {
  const v = new Map(), shaded = new Set();
  return {
    get: (k) => (v.has(k) ? v.get(k) : null),
    set(k, x) {
      v.set(k, OPTIONS.includes(k) ? !!x : x === undefined ? null : x);
    },
    shade(k, on) {
      if (on) shaded.add(k);
      else shaded.delete(k);
    },
    win: {iconByName: (k) => ({shaded: shaded.has(k)})},
    values: () => Object.fromEntries(['num', 'equal', 'sep', ...W, ...S]
      .map((k) => [k, v.has(k) ? v.get(k) : null])),
  };
}

const LETTER = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar ' +
  'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
  'w:header="720" w:footer="720" w:gutter="0"/>';

/** Two sections of columns c0 and c1. */
async function two(c0, c1) {
  const body = p(r('a')) + p(r('b'), '<w:sectPr>' + LETTER + c0 +
    '</w:sectPr>') + p(r('c')) + '<w:sectPr>' + LETTER + c1 +
    '</w:sectPr>';
  const d = new Document(await readDocx(await buildDocx(
    {'word/document.xml': documentXml(body)})));
  d.clearHistory();
  return d;
}

const caret = (d) => Sel.caret({id: blockId(d.doc.sections[0].blocks[0]),
  off: 0});
const run = (d, sel, cmd) => new Typing(d).command(() =>
  columnsCmd(d, sel, cmd, 'all'));
const nums = (d) => d.doc.sections.map((s) => s.props.cols.num ?? 1);

describe('ColumnsFields: blank values (P10 fix M3)', () => {
  it('Number of columns not shared: shown blank, OK keeps each ' +
    'section\'s; Line between alone given to both', async () => {
    const d = await two('<w:cols w:num="3" w:space="720"/>',
      '<w:cols w:num="2" w:space="720"/>');
    const sel = caret(d), api = fakeApi();
    fillState(api, colsOf(d.doc, sel, 'all'), 0);
    assert.equal(api.get('num'), null);
    let values = api.values();
    assert.equal(blankWhy(api, values), null);
    let cmd = changes(api, values);
    assert.equal(columnsWhy(d.doc, sel, cmd, 'all'), null);
    assert.equal(run(d, sel, cmd), sel);
    assert.equal(d.undoDepth, 0);
    api.set('sep', true);
    values = api.values();
    assert.equal(blankWhy(api, values), null);
    cmd = changes(api, values);
    assert.equal(columnsWhy(d.doc, sel, cmd, 'all'), null);
    run(d, sel, cmd);
    assert.deepEqual(nums(d), [3, 2]);
    assert.deepEqual(d.doc.sections.map((s) => s.props.cols.sep),
      [true, true]);
    assert.equal(d.undoDepth, 1);
  });

  it('a Spacing not shared: shown blank and not shaded, kept',
    async () => {
      const d = await two('<w:cols w:num="2" w:space="720"/>',
        '<w:cols w:num="2" w:space="360"/>');
      const sel = caret(d), api = fakeApi();
      fillState(api, colsOf(d.doc, sel, 'all'), 0);
      assert.equal(api.get('num'), 2);
      assert.equal(api.get('s1'), null);
      assert.equal(api.win.iconByName('s1').shaded, false);
      const values = api.values();
      assert.equal(blankWhy(api, values), null);
      const cmd = changes(api, values);
      assert.equal(columnsWhy(d.doc, sel, cmd, 'all'), null);
      assert.equal(run(d, sel, cmd), sel);
      assert.deepEqual(d.doc.sections.map((s) => s.props.cols.space),
        [720, 360]);
    });

  it('a value shown, then cleared: still refused', async () => {
    const d = await two('<w:cols w:num="2" w:space="720"/>',
      '<w:cols w:num="2" w:space="720"/>');
    const sel = caret(d), api = fakeApi();
    fillState(api, colsOf(d.doc, sel, 'all'), 0);
    assert.equal(blankWhy(api, api.values()), null);
    api.set('num', null);
    assert.equal(blankWhy(api, api.values()), 'num');
    api.set('num', 2.5);
    assert.equal(blankWhy(api, api.values()), 'num');
    api.set('num', 2);
    api.set('s1', null);
    assert.equal(blankWhy(api, api.values()), 's1');
  });
});
