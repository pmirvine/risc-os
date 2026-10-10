// TabStops (Batch A, A4.1): the stops in force for a paragraph (the
// style layers merged as Word merges them, clear, Strict start/end,
// the 64 used), the default stop from settings.xml and where a tab
// goes (nextStop: custom stops, the hanging indent's stop, default
// stops from the margin, the right edge).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {newStyleTable, addStyle, setDefault}
  from '../../tools/moreapps/!Word/Styles';
import {resolveTabs, defaultStop, nextStop, barsOf, twipsOf,
  DEFAULT_TW, MAX_USED} from '../../tools/moreapps/!Word/TabStops';
import {buildDocx, documentXml, stylesXml, settingsXml, p, r,
  STRICT_W_NS} from './build-docx.mjs';

const T = (val, pos, leader) => ({val, pos,
  ...(leader ? {leader} : {})});
const strip = (tabs) => tabs.map((t) => [t.val, t.pos,
  t.leader || null]);

/** A style table: Normal (default) with stops, Child based on it. */
function table(normal = [], child) {
  const st = newStyleTable();
  addStyle(st, {id: 'Normal', type: 'paragraph',
    pPr: {tabs: normal, extra: []}});
  setDefault(st, 'paragraph', 'Normal');
  if (child) {
    addStyle(st, {id: 'Child', type: 'paragraph', basedOn: 'Normal',
      pPr: {tabs: child, extra: []}});
  }
  return st;
}
const para = (tabs, pStyle) => newPara('x', {pStyle,
  pPr: tabs ? {tabs, extra: []} : {extra: []}});

describe('TabStops.resolveTabs', () => {
  it('no stops anywhere: an empty frozen list', () => {
    const t = resolveTabs(table(), para());
    assert.deepEqual(t, []);
    assert.ok(Object.isFrozen(t));
  });
  it('style and direct stops merged, sorted, px = twips / 15', () => {
    const st = table([T('left', 4320)]);
    const t = resolveTabs(st, para([T('right', 8640, 'dot'),
      T('center', 1440)]));
    assert.deepEqual(strip(t), [['center', 1440, null],
      ['left', 4320, null], ['right', 8640, 'dot']]);
    assert.deepEqual(t.map((s) => s.px), [96, 288, 576]);
  });
  it('the style chain merges: each layer adds stops', () => {
    const st = table([T('left', 720)], [T('decimal', 2880)]);
    const t = resolveTabs(st, para([T('bar', 5000)], 'Child'));
    assert.deepEqual(strip(t), [['left', 720, null],
      ['decimal', 2880, null], ['bar', 5000, null]]);
  });
  it('docDefaults count as the lowest layer', () => {
    const st = table();
    st.docDefaults.pPr = {tabs: [T('right', 9000)], extra: []};
    assert.deepEqual(strip(resolveTabs(st, para())),
      [['right', 9000, null]]);
  });
  it('clear removes an inherited stop at its position', () => {
    const st = table([T('left', 1440), T('left', 2880)],
      [T('clear', 2880)]);
    assert.deepEqual(strip(resolveTabs(st, para(null, 'Child'))),
      [['left', 1440, null]]);
    assert.deepEqual(strip(resolveTabs(st, para([T('clear', 1440)],
      'Child'))), []);
  });
  it('a clear with no stop to remove does nothing', () => {
    const st = table([T('left', 1440)]);
    assert.deepEqual(strip(resolveTabs(st, para([T('clear', 999)]))),
      [['left', 1440, null]]);
  });
  it('a later layer replaces a stop at the same position', () => {
    const st = table([T('left', 1440, 'dot')]);
    assert.deepEqual(strip(resolveTabs(st, para([T('right', 1440)]))),
      [['right', 1440, null]]);
  });
  it('Strict start / end, and num, as left / right / left', () => {
    const t = resolveTabs(table(), para([T('start', 1440),
      T('end', 4320, 'hyphen'), T('num', 720)]));
    assert.deepEqual(strip(t), [['left', 720, null], ['left', 1440, null],
      ['right', 4320, 'hyphen']]);
  });
  it('leaders kept except none; each kind', () => {
    const ls = ['dot', 'hyphen', 'underscore', 'heavy', 'middleDot'];
    const t = resolveTabs(table(), para([T('left', 100, 'none'),
      ...ls.map((l, k) => T('left', 200 + k, l))]));
    assert.deepEqual(t.map((s) => s.leader), [undefined, ...ls]);
  });
  it('malformed entries are passed over', () => {
    const t = resolveTabs(table(), para([null, 7, {val: 'left'},
      {val: 'left', pos: 1.5}, {val: 'weird', pos: 10},
      {val: '__proto__', pos: 11}, {val: 'left', pos: 12}]));
    assert.deepEqual(strip(t), [['left', 12, null]]);
  });
  it('negative positions and positions past the page are kept', () => {
    const t = resolveTabs(table(), para([T('left', 31680),
      T('left', -31680)]));
    assert.deepEqual(t.map((s) => s.pos), [-31680, 31680]);
  });
  it('cached per paragraph object and styles table', () => {
    const st = table([T('left', 1440)]);
    const pa = para([T('right', 2880)]);
    const a = resolveTabs(st, pa);
    assert.equal(resolveTabs(st, pa), a);
    // a new table (an edit replaces it): worked out again
    const st2 = table([T('left', 720)]);
    const b = resolveTabs(st2, pa);
    assert.notEqual(b, a);
    assert.deepEqual(b.map((s) => s.pos), [720, 2880]);
  });
  it('at most MAX_USED (64) stops are used: the leftmost', () => {
    const many = Array.from({length: 100}, (_, k) =>
      T('left', 10000 - k * 10));
    const t = resolveTabs(table(), para(many));
    assert.equal(MAX_USED, 64);
    assert.equal(t.length, 64);
    assert.equal(t[0].pos, 9010);
    assert.equal(t.at(-1).pos, 9640);
  });
  it('10,000 stops: 64 used, under 1 ms per paragraph', () => {
    const big = Array.from({length: 10000}, (_, k) =>
      T(k % 2 ? 'right' : 'left', k * 3, 'dot'));
    const st = table(big, big);
    // (500 paragraph objects sharing one pPr: each resolved anew)
    const p0 = para(big, 'Child');
    const paras = Array.from({length: 500}, () => ({...p0}));
    resolveTabs(st, para(big));               // (warm up)
    const t0 = performance.now();
    for (const pa of paras) {
      assert.equal(resolveTabs(st, pa).length, 64);
    }
    const per = (performance.now() - t0) / paras.length;
    assert.ok(per < 1, `${per.toFixed(3)} ms per paragraph`);
  });
});

describe('TabStops.resolveTabs: stops kept raw', () => {
  const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const fileWith = async (tabsXml, n = 1) => readDocx(await buildDocx({
    'word/document.xml': documentXml(Array.from({length: n}, () =>
      p(r('a\tb'), tabsXml)).join('')),
    'word/styles.xml': stylesXml('')}));
  it('10,000 stops in a file: kept raw, 64 used, < 1 ms per ' +
    'paragraph', async () => {
    const stops = Array.from({length: 10000}, (_, k) =>
      `<w:tab w:val="${k % 3 ? 'left' : 'right'}" w:pos="${k * 7}"` +
      `${k % 5 ? '' : ' w:leader="dot"'}/>`).join('');
    const doc = await fileWith(`<w:tabs>${stops}</w:tabs>`);
    const p0 = doc.sections[0].blocks[0];
    assert.equal(p0.pPr.tabs, undefined, 'raw: over MAX_STOPS');
    assert.equal(p0.pPr.extra.length, 1);
    const t = resolveTabs(doc.styles, p0);
    assert.equal(t.length, 64);
    assert.deepEqual(strip(t.slice(0, 2)), [['right', 0, 'dot'],
      ['left', 7, null]]);
    const paras = Array.from({length: 500}, () => ({...p0}));
    const t0 = performance.now();
    for (const pa of paras) resolveTabs(doc.styles, pa);
    const per = (performance.now() - t0) / paras.length;
    assert.ok(per < 1, `${per.toFixed(3)} ms per paragraph`);
  });
  it('a w:tabs raw for a w14 attribute still shows its stops', async () => {
    const doc = await fileWith(`<w:tabs xmlns:w14="${W14}">` +
      '<w:tab w:val="right" w:pos="4320" w:leader="hyphen" ' +
      'w14:x="1"/><w:tab w:val="clear" w:pos="100"/></w:tabs>');
    const p0 = doc.sections[0].blocks[0];
    assert.equal(p0.pPr.tabs, undefined);
    assert.deepEqual(strip(resolveTabs(doc.styles, p0)),
      [['right', 4320, 'hyphen']]);
  });
  it('another namespace\'s tabs are not stops', () => {
    const node = {name: 'x:tabs', attrs: [['xmlns:x', 'urn:x']],
      children: [{name: 'x:tab', attrs: [['x:val', 'left'],
        ['x:pos', '1440']], children: []}]};
    const pa = newPara('x', {pPr: {extra: [node]}});
    assert.deepEqual(resolveTabs(table(), pa), []);
  });
});

describe('TabStops.defaultStop', () => {
  const doc = (inner, o) => ({rawSettings: inner === null ? null
    : xmlSettings(inner, o)});
  let read;
  before(async () => {
    read = async (inner, o = {}) => (await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x')), o),
      'word/styles.xml': stylesXml('', o),
      'word/settings.xml': settingsXml(inner, o)},
    {strict: o.ns === STRICT_W_NS})));
  });
  it('720 with no settings part, none in it, or a bad value', () => {
    assert.equal(DEFAULT_TW, 720);
    assert.equal(defaultStop({rawSettings: null}), 720);
    assert.equal(defaultStop(null), 720);
    assert.equal(defaultStop(doc('')), 720);
    for (const v of ['', 'abc', '1.5', '-720', '10', '35', '31681',
      '99999999999999999999', '0x2d0']) {
      assert.equal(defaultStop(doc(dts(v))), 720, v);
    }
  });
  it('the file value, 36..31680 twips', () => {
    assert.equal(defaultStop(doc(dts('360'))), 360);
    assert.equal(defaultStop(doc(dts('36'))), 36);
    assert.equal(defaultStop(doc(dts('31680'))), 31680);
  });
  it('a measure with a unit (Strict ST_TwipsMeasure)', () => {
    assert.equal(defaultStop(doc(dts('1in'))), 1440);
    assert.equal(defaultStop(doc(dts('1.27cm'))), 720);
    assert.equal(defaultStop(doc(dts('36pt'))), 720);
    assert.equal(twipsOf('2pc'), 480);
    assert.ok(Number.isNaN(twipsOf('1 in')));
  });
  it('the first one when repeated; another namespace is not it', () => {
    assert.equal(defaultStop(doc(dts('360') + dts('1440'))), 360);
    const foreign = el('x:defaultTabStop', [['xmlns:x', 'urn:x'],
      ['x:val', '360']]);
    const root = xmlSettings('');
    root.children.push(foreign);
    assert.equal(defaultStop({rawSettings: root}), 720);
  });
  it('cached by the settings root object', () => {
    const root = xmlSettings(dts('360'));
    assert.equal(defaultStop({rawSettings: root}), 360);
    // (never changed in place by the program; a new root is read)
    const root2 = xmlSettings(dts('1440'));
    assert.equal(defaultStop({rawSettings: root2}), 1440);
    assert.equal(defaultStop({rawSettings: root}), 360);
  });
  it('read from a real settings.xml, Transitional and Strict', async () => {
    assert.equal(defaultStop(await read(dts('360'))), 360);
    assert.equal(defaultStop(await read('<w:zoom w:percent="100"/>')),
      720);
    const strict = await read(dts('0.25in'), {ns: STRICT_W_NS});
    assert.equal(defaultStop(strict), 360);
  });
});

const dts = (v) => `<w:defaultTabStop w:val="${v}"/>`;
const el = (name, attrs = [], children = []) => ({name, attrs,
  children});
/** A settings root as the reader keeps it (attrs as pairs). */
function xmlSettings(inner) {
  const kids = [];
  for (const m of inner.matchAll(/<w:(\w+) w:val="([^"]*)"\/>/g)) {
    kids.push(el('w:' + m[1], [['w:val', m[2]]]));
  }
  return el('w:settings', [['xmlns:w',
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main']],
  kids);
}

describe('TabStops.nextStop', () => {
  const S = (val, px, leader) => ({pos: px * 15, px, val,
    ...(leader ? {leader} : {})});
  const stops = [S('left', 96), S('center', 288, 'dot'),
    S('bar', 300), S('right', 576)];
  it('the first custom stop right of x', () => {
    assert.deepEqual(nextStop(stops, 0, 0, 48, 800),
      {pos: 96, val: 'left'});
    assert.deepEqual(nextStop(stops, 96, 0, 48, 800),
      {pos: 288, val: 'center', leader: 'dot'});
    assert.deepEqual(nextStop(stops, 290, 0, 48, 800),
      {pos: 576, val: 'right'}, 'a bar never stops the text');
  });
  it('past the last custom stop: the next default stop', () => {
    assert.deepEqual(nextStop(stops, 576, 0, 48, 800),
      {pos: 624, val: 'left'});
    assert.deepEqual(nextStop([], 50, 0, 24, 800), {pos: 72, val: 'left'});
    assert.deepEqual(nextStop([], 0, 0, 48, 800), {pos: 48, val: 'left'});
    assert.deepEqual(nextStop([], 47.995, 0, 48, 800).pos, 96,
      'at a stop (within 1/100 px): the next one');
  });
  it('default stops are counted from the margin, not the indent',
    () => {
      assert.equal(nextStop([], 30, 30, 48, 800).pos, 48);
      assert.equal(nextStop([], 100, 100, 48, 800).pos, 144);
    });
  it('custom stops clear the default ones left of them', () => {
    assert.equal(nextStop([S('left', 200)], 10, 0, 48, 800).pos, 200);
  });
  it('the left indent is a stop when x is left of it (hanging)', () => {
    assert.deepEqual(nextStop([], 10, 30, 48, 800),
      {pos: 30, val: 'left'});
    assert.deepEqual(nextStop([S('right', 20)], 10, 30, 48, 800),
      {pos: 20, val: 'right'}, 'a custom stop before it comes first');
    assert.deepEqual(nextStop([S('right', 40, 'dot')], 10, 30, 48, 800),
      {pos: 30, val: 'left'});
    assert.deepEqual(nextStop([], 10, 144, 48, 800),
      {pos: 144, val: 'left'}, 'default stops before it are ignored');
  });
  it('negative stops are never reached', () => {
    assert.equal(nextStop([S('left', -48)], 0, 0, 48, 800).pos, 48);
  });
  it('past the right edge: pulled back to it', () => {
    assert.deepEqual(nextStop([S('right', 900, 'dot')], 10, 0, 48, 400),
      {pos: 400, val: 'right', leader: 'dot'});
    assert.deepEqual(nextStop([], 390, 0, 48, 400),
      {pos: 400, val: 'left'});
    assert.deepEqual(nextStop([], 400, 0, 48, 400),
      {pos: 400, val: 'left'}, 'at the edge: no width');
    assert.deepEqual(nextStop([], 450, 0, 48, 400),
      {pos: 450, val: 'left'}, 'beyond it: no width');
  });
  it('a bad default stop falls back to 48 px', () => {
    assert.equal(nextStop([], 0, 0, 0, 800).pos, 48);
    assert.equal(nextStop([], 0, 0, NaN, 800).pos, 48);
  });
  it('barsOf: the bar stops in px', () => {
    assert.deepEqual(barsOf(stops), [300]);
    assert.deepEqual(barsOf([]), []);
    assert.deepEqual(barsOf(undefined), []);
  });
});
