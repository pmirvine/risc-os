// The [s, i] migration gate (Batch C1.5, ruling R15): no block
// position may be built from a location's section and index
// ([loc.s, loc.i], block: [s, i], [s, i + 1], [s, k]...) or a block
// read by one (.blocks[m.i]); positions are paths (./Path), taken
// from loc.at (./EditPos). Every match in a !Letters source (comment
// lines left out) must be in ALLOW with its exact count: a match not
// listed fails, and so does an entry whose count is larger than what
// is found (the list only shrinks: remove an entry, or lower its
// count, when its sites go). topPath() calls (records of top-level
// scans made paths) and outerEdge() calls (R11: a place in a typed
// table reported at its outermost table's edge) are counted the same
// way. The readers of a path's or a location's TOP-LEVEL indexes
// are counted too (the C1 review, I1): at[0] / at[1], a path
// destructured ([s, i] = ...at), the range loops over f.i / t.i and
// over k (loc.k <= t.k). Every entry left is for good: C3.4 removed
// EditRange's (deleteRange works by paths at every depth), C3.5 the
// rest (formatting through SelShape.paraRanges, Find and the list,
// word count and bookmark scans in flow order through cells, R11's
// outerEdge gone), and the test asserts that no entry waits for
// either. A file and pattern may have several entries: their counts
// add up.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = fileURLToPath(new URL('../../tools/moreapps/!Letters/',
  import.meta.url));

export const PATTERNS = {
  locSI: /\[\s*\w+\.s\s*,\s*\w+\.i\b/g,
  blockSI: /(block|at):\s*\[\s*s\s*,\s*i\b/g,
  sIplus: /\[\s*s\s*,\s*i\s*[+-]/g,
  sLetter: /\[\s*s\s*,\s*[a-z]\s*\]/g,
  blocksDotI: /\.blocks\[\s*\w+\.i\s*\]/g,
  topPath: /\btopPath\(/g,
  outerEdge: /\bouterEdge\(/g,
  atIndex: /\bat\[\s*[01]\s*\]/g,
  atDestructure: /\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*[\w.]*\bat\b/g,
  rangeFI: /\b[ft]\.i\b/g,
  kLoop: /\.k\s*[<>]=?\s*\w+\.k\b/g,
};

const C35 = 'C3.5', C34 = 'C3.4', KEEP = '-';

/** {file, pattern, count, why, until}: until '-' is for good. */
export const ALLOW = [
  {file: 'EditFlow', pattern: 'sLetter', count: 2, until: KEEP,
    why: 'the one place a top-level location is made (scan, ' +
      'neighbour across sections)'},
  {file: 'FormatOps', pattern: 'sLetter', count: 2, until: KEEP,
    why: 'pieces\' [start, end] offset pairs [s, k] / [s, y]: not ' +
      'positions'},
  {file: 'NsMap', pattern: 'sLetter', count: 1, until: KEEP,
    why: 'a [source, target] namespace pair: not a position'},
  {file: 'OpsPath', pattern: 'blocksDotI', count: 1, until: KEEP,
    why: 'paraAt reads locate()\'s own container and index'},
  {file: 'OpsSect', pattern: 'sLetter', count: 1, until: KEEP,
    why: 'section ops are top level by definition'},
  {file: 'PosLine', pattern: 'sLetter', count: 1, until: KEEP,
    why: 'a line\'s [start, end] extent: not a position'},
  {file: 'SectBreak', pattern: 'blockSI', count: 1, until: KEEP,
    why: 'splitSection {at: [s, i]}: section ops are top level; ' +
      'insertSection refuses a cell first (null, a beep)'},
  {file: 'SectBreak', pattern: 'sLetter', count: 1, until: KEEP,
    why: 'the same site'},
  {file: 'EditFlow', pattern: 'atIndex', count: 2, until: KEEP,
    why: 'findBlock fills a location\'s s (and i at top level) from ' +
      'its path'},
  {file: 'Path', pattern: 'atIndex', count: 2, until: KEEP,
    why: 'topOf: the one rule for a path\'s top-level block'},
  {file: 'PicCarry', pattern: 'atIndex', count: 2, until: KEEP,
    why: 'indexes of a picture fill\'s children: not a position'},
  {file: 'OpsSect', pattern: 'atDestructure', count: 1, until: KEEP,
    why: 'section ops are top level by definition'},
  {file: 'ClipBuild', pattern: 'rangeFI', count: 1, until: KEEP,
    why: 'f.i is a format\'s italic flag: not a position'},
  {file: 'PageFind', pattern: 'kLoop', count: 1, until: KEEP,
    why: 'galley page cursors {k, line}: k a root layout item ' +
      'index, not a model position'},
];

/** The entries C3.4 / C3.5 must remove: [{file, pattern, count}]. */
export const exitList = (until) => ALLOW.filter((e) =>
  e.until === until).map(({file, pattern, count}) =>
  ({file, pattern, count}));

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Matches of every pattern in source text: Map name -> count. */
export function matchesIn(text) {
  const out = new Map();
  const code = text.split('\n').filter((l) => !isComment(l))
    .join('\n');
  for (const [name, re] of Object.entries(PATTERNS)) {
    const n = (code.match(new RegExp(re.source, 'g')) || []).length;
    if (n) out.set(name, n);
  }
  return out;
}

/** Every source file of !Letters (not the Fonts directory). */
function sources() {
  return readdirSync(DIR).filter((f) => statSync(join(DIR, f))
    .isFile()).map((f) => ({file: f,
    text: readFileSync(join(DIR, f), 'latin1')}))
    .filter((x) => !x.text.includes('\0'));
}

describe('paths gate (R15)', () => {
  it('the matcher catches the forms it is for, not comments', () => {
    const got = (t) => Object.fromEntries(matchesIn(t));
    assert.deepEqual(got("d.apply({op: 'x', block: [loc.s, loc.i]});"),
      {locSI: 1});
    assert.deepEqual(got('const at = [s, i + 1];'), {sIplus: 1});
    assert.deepEqual(got("x({op: 'y', at: [s, i], z});"),
      {blockSI: 1, sLetter: 1});
    assert.deepEqual(got('const b = doc.sections[s].blocks[m.i];'),
      {blocksDotI: 1});
    assert.deepEqual(got('f(topPath(m));'), {topPath: 1});
    assert.deepEqual(got('// block: [loc.s, loc.i]\n * [s, i]'), {});
    assert.deepEqual(got('const bs = doc.sections[at[0]].blocks;' +
      ' f(m.at[1]);'), {atIndex: 2});
    assert.deepEqual(got('const [s0, i0] = at.en.at;'),
      {atDestructure: 1});
    assert.deepEqual(got('for (let i = s === o.f.s ? o.f.i : 0; ' +
      'i <= t.i; i++)'), {rangeFI: 2});
    assert.deepEqual(got('for (let x = f; x.k <= t.k;)'), {kLoop: 1});
    assert.deepEqual(got('const a = at[2]; [a, b] = data; fi.i;'), {});
    assert.deepEqual(got("d.apply({op: 'x', block: loc.at});"), {});
  });
  it('a planted block: [loc.s, loc.i] fails the gate', () => {
    const files = sources();
    const k = files.findIndex((x) => x.file === 'Edit');
    files[k] = {...files[k], text: files[k].text +
      "\nd.apply({op: 'replaceText', block: [loc.s, loc.i]});\n"};
    assert.match(problems(files).join('\n'), /Edit: locSI found 1/);
  });
  it('every match in the sources is allowed, every count exact', () => {
    assert.deepEqual(problems(sources()), []);
  });
  it('C3.4 and C3.5 are done: no entry until them, no R11 edge', () => {
    // (C3.5: positions in cells are real; the scans walk paths in flow
    // order; nothing reports a place in a table at its outer edge)
    assert.deepEqual(exitList(C34), []);
    assert.deepEqual(exitList(C35), []);
    for (const {file, text} of sources()) {
      assert.equal(matchesIn(text).get('outerEdge') ?? 0, 0, file);
    }
  });
  it('ALLOW entries are well formed and unique', () => {
    const seen = new Set();
    for (const e of ALLOW) {
      assert.ok(Object.hasOwn(PATTERNS, e.pattern), e.pattern);
      assert.ok(Number.isInteger(e.count) && e.count > 0);
      assert.ok(e.why && e.until);
      const key = e.file + ' ' + e.pattern + ' ' + e.until;
      assert.ok(!seen.has(key), 'twice: ' + key);
      seen.add(key);
    }
  });
});

/** What is wrong with files against ALLOW: lines of text. */
function problems(files) {
  const out = [];
  const allowed = new Map();
  for (const e of ALLOW) {
    const key = e.file + ' ' + e.pattern;
    const a = allowed.get(key);
    allowed.set(key, {count: (a ? a.count : 0) + e.count});
  }
  const found = new Map();
  for (const {file, text} of files) {
    for (const [name, n] of matchesIn(text)) {
      found.set(file + ' ' + name, n);
      const a = allowed.get(file + ' ' + name);
      if (!a || n > a.count) {
        out.push(`${file}: ${name} found ${n}, allowed ` +
          `${a ? a.count : 0} (a position built from s and i, or a ` +
          'top-level index read: use loc.at / EditPos sibOf / Path, ' +
          'or list it in ALLOW with why)');
      }
    }
  }
  for (const [key, a] of allowed) {
    const n = found.get(key) || 0;
    if (n < a.count) {
      out.push(`${key}: allowed ${a.count}, found ${n}: lower the ` +
        'count (the list only shrinks)');
    }
  }
  return out;
}
