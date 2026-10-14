// Regular expressions over untrusted input (C6 fix A1/A2): pasted
// HTML (attributes, styles, text), loaded .docx parts and values, and
// the URL, CSS and number parsers. A regular expression with two
// unbounded runs over overlapping characters can backtrack in O(n^2)
// or worse: a pasted `border` of 100,000 spaces took 6.5 s, a 3.9 MB
// one hours, with the desktop frozen.
//
// 1. The audit: every regular expression literal (and every
//    `new RegExp`) in !Letters and !WimpLib is found by a small
//    tokenizer. One with no unbounded run (* + {n,}), or anchored at
//    the start with one run, is linear by its shape. Every other one
//    must be listed in AUDIT below with the reason it is linear (or
//    the cap that bounds its input); a new one fails this test until
//    it is audited, and an entry for one that is gone fails too.
// 2. Each audited expression (not bounded or internal) is pumped
//    with 100,000-character strings and must finish under 200 ms.
// 3. 1 MB values (and values just under the attribute cap) go into
//    every attribute, style and text the HTML reader reads, the CSS,
//    URL and number parsers, and the part scans of a loaded document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readHtml} from '../../tools/moreapps/!Letters/ClipRead';
import {attrOf, MAX_ATTR} from '../../tools/moreapps/!Letters/ClipDom';
import {pick} from '../../tools/moreapps/!Letters/ClipPick';
import * as Css from '../../tools/moreapps/!Letters/ClipCss';
import {spanOf, lengthTw, lookOf, tableBorder}
  from '../../tools/moreapps/!Letters/ClipTblLook';
import {cleanUrl, parseAddress, checkAnchor}
  from '../../tools/moreapps/!Letters/LinkUrl';
import {usedNumIds} from '../../tools/moreapps/!Letters/ListUsed';
import {usedDocPrIds} from '../../tools/moreapps/!Letters/PicIds';
import {suggestName, safeLeaf} from '../../tools/moreapps/!Letters/SaveState';
import {twipsOf} from '../../tools/moreapps/!Letters/TabStops';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {validDecl} from '../../tools/moreapps/!WimpLib/XmlText';
import {parseNumber} from '../../tools/moreapps/!WimpLib/NumberField';
import {parsePoints} from '../../tools/moreapps/!WimpLib/Units';
import {parseHtml} from './html-fake.mjs';
import {buildDocx, documentXml} from './build-docx.mjs';
import {mk} from './edit-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../../tools/moreapps');
const DIRS = ['!Letters', '!WimpLib'];
const MB = 1 << 20;
const LIMIT_MS = 200;

// Audited: file -> [[regex literal, why it is linear]]. `bounded`
// and `internal` ones are not pumped (their input is capped first, or
// is never from outside).
const AUDIT = {
  '!Letters/ClipBuild': [
    ['/[ \\t\\n\\r\\f]+/g', 'one run, no suffix: a match consumes it']],
  '!Letters/ClipCss': [
    ['/url\\s*\\(|expression|javascript|\\\\|\\/\\*|@|[<>{}]/i',
      'the run follows the literal url: scanned once per url'],
    ['/!\\s*important\\s*$/i',
      'each run follows a literal; value <= 4096 (decls)']],
  '!Letters/ClipTblLook': [
    ['/(^|\\s)0(\\.0+)?([a-z]+)?(\\s|$)/',
      'runs follow the literals 0 and .; value <= 200 (decls)'],
    ['/^\\s*\\d{1,2}\\s*$/',
      'anchored; a mandatory digit separates the two runs'],
    ['/\\s+/', 'split: a match consumes its run']],
  '!Letters/Keymap': [
    ['/^((?:(?:Ctrl|Shift)\\+)*)(.+)$/', 'internal: Keymap rows only']],
  '!Letters/LineLabel': [
    ['/, ([a-z-]+)$/', 'the run follows the literal ", "']],
  '!Letters/LineTokens': [
    ['/ +|\\t|\\n|[^ \\t\\n]+/g', 'tokens of disjoint classes'],
    ['/ +|\\t|[^ \\t]+/g', 'tokens of disjoint classes']],
  '!Letters/ListMarker': [
    ['/^(?:([0-9]+)([.)])|\\(([0-9]+)\\))$/',
      'anchored; each alternative one digit run']],
  '!Letters/NsMap': [
    ['/([\'"])([^\'"]*)\\1/g', 'the run stops at a quote']],
  '!Letters/NumScan': [
    ['/^[ \\t\\n\\r]*[+-]?[0-9]+[ \\t\\n\\r]*$/',
      'anchored; runs of disjoint classes']],
  '!Letters/PicIds': [
    ['/<(?:[\\w.-]+:)?docPr\\b([^<>]*)/g', 'the tag ends at < or >'],
    ['/\\s([\\w.:-]+)\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')/g',
      'runs of disjoint classes between literals; one tag'],
    ['/(^|\\/)(header|footer|footnotes|endnotes|comments)\\d*\\.xml$/i',
      'the digit run follows a literal name']],
  '!Letters/PicNames': [
    ['/^(\\d+)\\.[^./]*$/', 'anchored; a literal . between the runs']],
  '!Letters/TabStops': [
    ['/^(-?[0-9]+(?:\\.[0-9]+)?)(mm|cm|in|pt|pc|pi)?$/',
      'anchored; a literal . between the digit runs']],
  '!Letters/TblGeo': [['/[\\s\\uFFFC]+/', 'split: a match consumes it']],
  '!Letters/FieldFormat': [
    ['/^\\s*-?\\d{1,15}\\s*$/',
      'anchored; the runs are split by digits'],
    ['/\\S+/g', 'one run, no suffix'],
    ['/\\S+/', 'one run, no suffix'],
    ['/\\B(?=(\\d{3})+$)/g',
      'bounded: only toFixed() whole digits (< 22 chars)']],
  '!Letters/WriteParts': [
    ['/(encoding[ \\t\\n]*=[ \\t\\n]*)(["\'])([^"\']*)\\2/',
      'runs follow literals; our own written declaration']],
  '!WimpLib/DialogValues': [
    ['/^ *- */', 'anchored; a literal - between the runs']],
  '!WimpLib/FontList': [['/\\s+/g', 'one run, no suffix']],
  '!WimpLib/NumberField': [
    ['/^(\\d+(?:\\.\\d*)?|\\.\\d+)$/',
      'anchored; a literal . between the digit runs'],
    ['/\\.?0+$/', 'bounded: only toFixed() output (<= 120 chars)']],
  '!WimpLib/Units': [
    ['/^ *(-?) *(\\d+(?:\\.\\d*)?|\\.\\d+) *(in|"|pt)? *$/i',
      'bounded: text over 32 characters is refused first']],
};

// `new RegExp` sites: file -> [count, why]; each is also run on
// hostile input below through its module's function.
const DYNAMIC = {
  '!Letters/ClipCss': [1, 'RGB: anchored; runs split by digits and ,'],
  '!Letters/ClipTblLook': [1, 'STYLES: no unbounded run'],
  '!Letters/FieldDates': [1, 'W3C: no unbounded run; <= 64 chars'],
  '!Letters/ListUsed': [1, 'NUM_ID: the tag ends at the first < or >'],
  '!WimpLib/XmlText': [1, 'validDecl: anchored; runs split by literals'],
};

function* files(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'Fonts') yield* files(p);
    } else if (!e.name.startsWith('!') && !e.name.includes('.')) {
      yield p;
    }
  }
}

const REGEX_BEFORE = /[(,=:[!&|?{};+\-*%<>~^]/;

/** The regular expression literals of JavaScript source s. */
export function literals(s) {
  const out = [];
  let i = 0, prev = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      i = e < 0 ? s.length : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < s.length && s[i] !== c) i += s[i] === '\\' ? 2 : 1;
      i++;
      prev = 'x';
      continue;
    }
    if (c === '/' && (prev === '' || REGEX_BEFORE.test(prev) ||
      /\b(return|typeof|in|of)\s*$/.test(s.slice(Math.max(0, i - 9),
        i)))) {
      let j = i + 1, cls = false;
      while (j < s.length && s[j] !== '\n') {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') cls = true;
        else if (s[j] === ']') cls = false;
        else if (s[j] === '/' && !cls) break;
        j++;
      }
      if (s[j] === '/') {
        let k = j + 1;
        while (/[a-z]/.test(s[k] || '')) k++;
        out.push(s.slice(i, k));
        i = k;
        prev = 'x';
        continue;
      }
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Unbounded runs (* + {n,}) of a pattern, outside classes. */
function runs(src) {
  let n = 0, cls = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (cls) { if (c === ']') cls = false; continue; }
    if (c === '[') cls = true;
    else if (c === '*' || c === '+') n++;
    else if (c === '{' && /^\{\d+,\}/.test(src.slice(i))) n++;
  }
  return n;
}

/** True when the pattern's top level is anchored by ^ (no top |). */
function anchored(src) {
  if (!src.startsWith('^')) return false;
  let depth = 0, cls = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (cls) { if (c === ']') cls = false; continue; }
    if (c === '[') cls = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '|' && depth === 0) return false;
  }
  return true;
}

const linearByShape = (lit) => {
  const src = lit.slice(1, lit.lastIndexOf('/'));
  const n = runs(src);
  return n === 0 || (n === 1 && anchored(src));
};

const sources = () => {
  const out = [];
  for (const d of DIRS) {
    for (const f of files(path.join(ROOT, d))) {
      out.push([path.relative(ROOT, f).split(path.sep).join('/'),
        fs.readFileSync(f, 'latin1')]);
    }
  }
  return out;
};

const ms = (fn) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};
const quick = (what, fn, limit = LIMIT_MS) => {
  const t = ms(fn);
  assert.ok(t < limit, `${what}: ${t.toFixed(0)} ms`);
};

describe('regular expressions over untrusted input', () => {
  it('every expression is linear by its shape or audited', () => {
    const missing = [], seen = new Set(), dyn = {};
    for (const [name, text] of sources()) {
      const n = text.split('new RegExp(').length - 1;
      if (n) dyn[name] = n;
      for (const lit of literals(text)) {
        if (linearByShape(lit)) continue;
        const ok = (AUDIT[name] || []).some(([l]) => l === lit);
        if (ok) seen.add(name + ' ' + lit);
        else missing.push(name + ' ' + lit);
      }
    }
    assert.deepEqual(missing, [], 'not audited');
    const stale = Object.entries(AUDIT).flatMap(([f, xs]) =>
      xs.map(([l]) => f + ' ' + l)).filter((k) => !seen.has(k));
    assert.deepEqual(stale, [], 'audited but not found');
    assert.deepEqual(dyn, Object.fromEntries(Object.entries(DYNAMIC)
      .map(([f, [n]]) => [f, n])), 'new RegExp sites');
  });

  it('the tokenizer finds literals and skips strings and comments', () => {
    assert.deepEqual(literals("const a = /x+y/g; // /no/\n" +
      "const s = '/no/'; f(/a\\/b[/]/, 2 / 3 / 4);"),
    ['/x+y/g', '/a\\/b[/]/']);
  });

  it('each audited expression is quick on 100,000 pumped characters',
    () => {
      const N = 100000;
      const pumps = [' ', '\t', '0', '1', 'a', '.', ',', '<', '"', "'",
        '!', '-', ', a', '0 ', ' 0', 'a:', 'url ', '!  ', 'encoding ',
        '<docPr ', ' a="', ' a', 'Ctrl+'];
      for (const [f, xs] of Object.entries(AUDIT)) {
        for (const [lit, why] of xs) {
          if (/^(bounded|internal)/.test(why)) continue;
          const m = /^\/(.*)\/([a-z]*)$/s.exec(lit);
          const re = new RegExp(m[1], m[2]);
          for (const p of pumps) {
            for (const end of ['', '\u0000', '!', '"']) {
              const s = p.repeat(Math.ceil(N / p.length)) + end;
              quick(`${f} ${lit} ${JSON.stringify(p + end)}`, () => {
                re.lastIndex = 0;
                if (re.global) s.replace(re, '');
                else re.test(s);
              });
            }
          }
        }
      }
    });
});

const big = (c = ' ', end = 'x', n = MB) => c.repeat(n) + end;
const under = (c = ' ', end = 'x') => c.repeat(MAX_ATTR - 1) + end;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;');
const VALUES = () => [big(), under(), big('0', 'x'), under('0', ' x'),
  under(' ', '1x'), big('a'), under('#'), under('rgb(', ')')];

describe('the HTML reader with huge values', () => {
  it('attrOf: a value longer than MAX_ATTR is not read', () => {
    assert.equal(MAX_ATTR, 65536);
    const el = (v) => ({getAttribute: () => v});
    assert.equal(attrOf(el('x'.repeat(MAX_ATTR)), 'k'),
      'x'.repeat(MAX_ATTR));
    assert.equal(attrOf(el('x'.repeat(MAX_ATTR + 1)), 'k'), null);
    assert.equal(attrOf(el(7), 'k'), null);
    assert.equal(attrOf({}, 'k'), null);
    assert.equal(attrOf(el(null), 'k'), null);
  });

  it('a table border of 100,000 spaces and one letter is quick', () => {
    const el = {getAttribute: () => ' '.repeat(60000) + 'x'};
    quick('tableBorder', () => assert.equal(tableBorder(el), false));
    for (const [v, want] of [['', true], [' 1 ', true], ['0', false],
      ['  12  ', true], ['1234567', false], ['x', false], ['\t3\n', true],
      [null, false]]) {
      assert.equal(tableBorder({getAttribute: () => v}), want, v);
    }
  });

  const ATTRS = [
    ['table', 'border'], ['table', 'width'], ['table', 'style'],
    ['table', 'bgcolor'], ['td', 'colspan'], ['td', 'rowspan'],
    ['td', 'width'], ['td', 'bgcolor'], ['td', 'style'], ['th', 'style'],
    ['font', 'color'], ['font', 'size'], ['font', 'face'],
    ['b', 'id'], ['span', 'style'], ['p', 'style'], ['a', 'href']];

  for (const [tag, k] of ATTRS) {
    it(`<${tag} ${k}> of 1 MB, and just under the cap, read quickly`,
      () => {
        for (const v of VALUES()) {
          const inner = tag === 'td' || tag === 'th'
            ? `<table><tr><${tag} ${k}="${esc(v)}">c</${tag}>` +
              '<td>d</td></tr></table>'
            : tag === 'table'
              ? `<table ${k}="${esc(v)}"><tr><td>c</td></tr></table>`
              : `<p>a<${tag} ${k}="${esc(v)}">b</${tag}>c</p>`;
          const html = `<p>x</p>${inner}`;
          const tree = parseHtml(html);
          quick(`${tag} ${k} ${v.length}`, () => {
            const r = readHtml(html, () => tree, {textTw: 9000});
            assert.ok(r && r.blocks.length >= 1);
          });
        }
      });
  }

  it('1 MB of text, of white space and of entities read quickly', () => {
    for (const t of [big('a b '), big(' \t\n'), big('&nbsp;', '', 1e5),
      big('\u00a0')]) {
      const html = `<table><tr><td>${t}</td></tr></table><p>${t}</p>`;
      const tree = parseHtml(html);
      quick(`text ${t.length}`, () => readHtml(html, () => tree,
        {textTw: 9000}), 1000);
    }
  });

  it('pick of HTML with a hostile border is quick, end to end', () => {
    const html = `<table border="${' '.repeat(60000)}x"><tr><td>a</td>` +
      '</tr></table>';
    const tree = parseHtml(html);
    quick('pick', () => pick({html, text: 'a'}, {store: null,
      docKey: 'k', parseHtml: () => tree, textTw: 9000}));
  });
});

describe('the parsers with huge values', () => {
  it('CSS: decls, parseStyle, colour, family, fontSize, fontTagSize',
    () => {
      for (const v of VALUES()) {
        const style = `color:${v};font-family:${v};border:${v}`;
        quick('decls', () => Css.decls(style));
        quick('parseStyle', () => Css.parseStyle(`font-size:${v}`, 11));
        quick('colour', () => Css.colour(v));
        quick('family', () => Css.family(v));
        quick('fontSize', () => Css.fontSize(v, 11));
        quick('fontTagSize', () => Css.fontTagSize(v));
        quick('spanOf', () => spanOf(v));
        quick('lengthTw', () => lengthTw(v, 9000));
        quick('lookOf', () => lookOf({getAttribute: (k) =>
          (k === 'style' ? `border:${v};background:${v}` : v)}));
      }
      quick('decls !important', () =>
        Css.decls(`color:red!${' '.repeat(4000)}x`));
    });

  it('URLs and bookmark names', () => {
    for (const v of [...VALUES(), 'http://' + big('a'),
      'http:' + big('/'), 'mailto:' + big(' ')]) {
      quick('cleanUrl', () => cleanUrl(v));
      quick('parseAddress', () => parseAddress(v));
      quick('checkAnchor', () => checkAnchor(v));
    }
  });

  it('numbers, units, tab positions and names', () => {
    for (const v of VALUES()) {
      quick('parseNumber', () => parseNumber(v));
      quick('parsePoints', () => parsePoints(v));
      quick('twipsOf', () => twipsOf(v));
      quick('safeLeaf', () => safeLeaf(v));
      quick('validDecl', () => validDecl('xml version="1.0"' + v));
    }
    const leaf = 'p' + '0'.repeat(200000) + 'q';
    quick('suggestName', () => suggestName({leaf}, 'R.$', () => false));
    quick('suggestName taken', () => suggestName({leaf: 'a1'}, 'R.$',
      (p) => p === 'R.$.a1'));
    assert.equal(suggestName({leaf: 'Report7'}, 'R.$',
      (p) => p === 'R.$.Report7'), 'R.$.Report8');
    assert.equal(suggestName({leaf: 'Report'}, 'R.$',
      (p) => p === 'R.$.Report'), 'R.$.Report2');
    assert.equal(suggestName({leaf: '42'}, 'R.$',
      (p) => p === 'R.$.42'), 'R.$.4243', 'as before: no stem');
  });
});

describe('a loaded document with huge values', () => {
  const hostileParts = () => new Map([
    ['word/header1.xml', '<w:numId '.repeat(MB / 9)],
    ['word/footer1.xml', '<w:numId a:val="1'.repeat(MB / 17)],
    ['word/comments.xml', '<wp:docPr '.repeat(MB / 10)],
    ['word/footnotes.xml', '<w:numId w:val="7"/>' +
      ' a="'.repeat(MB / 4)],
  ]);

  it('the numId and docPr scans of the other parts are quick', () => {
    const d = mk(['a']);
    const doc = {...d.doc, parts: hostileParts()};
    quick('usedNumIds', () => assert.ok(usedNumIds(doc).includes(7)));
    quick('usedDocPrIds', () => usedDocPrIds(doc));
  });

  it('the numId scan still finds every form it found', () => {
    const d = mk(['a']);
    const xml = '<w:hdr><w:numId w:val="3"/><numId val = \' 12 \'/>' +
      '<x:numId x:foo=">" x:val="5"/><w:numId\nw:val="9"></w:numId>' +
      '<w:numId w:other="1"/><w:numIdX w:val="4"/></w:hdr>';
    const doc = {...d.doc, parts: new Map([['word/header1.xml', xml]])};
    assert.deepEqual(usedNumIds(doc).filter((n) => n > 1).sort(
      (a, b) => a - b), [3, 9, 12]);
  });

  it('1 MB attribute values in document.xml read in reasonable time',
    async () => {
      const v = ' '.repeat(MB) + 'x';
      const body = `<w:p><w:pPr><w:pStyle w:val="${v}"/><w:jc w:val="` +
        `${v}"/><w:tabs><w:tab w:val="left" w:pos="${v}"/></w:tabs>` +
        `<w:numPr><w:numId w:val="${v}"/></w:numPr></w:pPr><w:r>` +
        `<w:rPr><w:color w:val="${v}"/><w:sz w:val="${v}"/></w:rPr>` +
        '<w:t>a</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="' + v +
        '" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="' + v +
        '"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="' + v +
        '"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl><w:p/>';
      const bytes = await buildDocx({'word/document.xml':
        documentXml(body)});
      const t = performance.now();
      const doc = await readDocx(bytes);
      const took = performance.now() - t;
      assert.ok(doc.sections[0].blocks.length >= 2);
      // unzip and XML parse of 8 MB dominate; the regexes add nothing
      assert.ok(took < 5000, `${took.toFixed(0)} ms`);
    });
});
