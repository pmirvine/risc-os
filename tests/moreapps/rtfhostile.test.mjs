// RTF against hostile input (Batch G2, task 12): readRtf (and
// writeRtf of what it reads) never throws or hangs, and always gives
// a valid Doc.
//
//   - seeded fuzz: every fixture (tests/moreapps/rtf-fixtures) and
//     our writer's output of each, cut short at many points and
//     mutated (bytes changed, braces and backslashes put in, spans
//     cut or repeated, control words with absurd parameters put in);
//     each read is checked (Model checkBlock on every block, notes
//     strings), written again by writeRtf (ASCII, braces balanced)
//     and, for a sample, written as .docx and read back;
//   - nesting: groups far deeper than the lexer's limit, fields,
//     notes and tables nested to it;
//   - size: a 50 MB-class file is refused by ./Open's openDoc
//     before it is parsed (at once); the largest one it takes (16 MB
//     of text, and of the control-word-heavy shapes) is read in a
//     child process with a 512 MB heap (memory sanity);
//   - binary garbage after the header;
//   - the hostile fields, pictures, lists, tables and comments the
//     reviews of tasks 3 to 9 named.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {readRtf, MAX_NOTES, MORE} from '../../tools/moreapps/!Letters/RtfRead';
import {lex} from '../../tools/moreapps/!WimpLib/RtfLex';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';

// (./Open imports nothing of 'riscos', but its neighbours may one
// day: a stand-in keeps this test off the desktop)
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') {
    return {url: 'data:text/javascript,export default {}',
      shortCircuit: true};
  }
  return next(spec, ctx);
}});
const O = await import('../../tools/moreapps/!Letters/Open');

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATE = new Date(Date.UTC(2024, 4, 6, 7, 8, 10));
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const FIXTURES = fs.readdirSync(DIR).filter((n) => n.endsWith('.rtf'))
  .sort().map((n) => [n, new Uint8Array(fs.readFileSync(DIR + n))]);

/** mulberry32: a reproducible stream of numbers in [0, 1). */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ascii = (b) => b.every((c) => c < 0x80);
function balanced(b) {
  let d = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x5c) i++;
    else if (b[i] === 0x7b) d++;
    else if (b[i] === 0x7d && --d < 0) return false;
  }
  return d === 0;
}

const SLOW_MS = 3000;

/** Read bytes: never throws, a valid Doc, notes strings, quick;
 *  writeRtf of it never throws, ASCII and balanced. -> the Doc. */
function readOk(bytes, what) {
  const t0 = performance.now();
  let got;
  try {
    got = readRtf(bytes, {date: DATE});
  } catch (e) {
    assert.fail(what + ': readRtf threw ' + (e && e.stack || e));
  }
  const ms = performance.now() - t0;
  assert.ok(ms < SLOW_MS, what + ': read in ' + ms.toFixed(0) + ' ms');
  assert.ok(Array.isArray(got.notes) &&
    got.notes.every((n) => typeof n === 'string'), what + ': notes');
  const doc = got.doc;
  assert.ok(doc.sections.length >= 1, what + ': a section');
  for (const s of doc.sections) {
    assert.ok(s.blocks.length >= 1, what + ': blocks');
    for (const b of s.blocks) {
      try {
        checkBlock(b);
      } catch (e) {
        assert.fail(what + ': ' + e.message);
      }
    }
  }
  let out;
  try {
    out = writeRtf(doc);
  } catch (e) {
    assert.fail(what + ': writeRtf threw ' + (e && e.stack || e));
  }
  assert.ok(ascii(out.bytes), what + ': written ASCII');
  assert.ok(balanced(out.bytes), what + ': written balanced');
  return doc;
}

async function docxOk(doc, what) {
  const back = await readDocx(await writeDocx(doc, {date: DATE}));
  assert.equal(back.sections.length, doc.sections.length, what);
}

const WORDS = ['par', 'cell', 'row', 'nestcell', 'nestrow', 'trowd',
  'cellx', 'itap', 'intbl', 'sect', 'sectd', 'field', 'fldinst',
  'fldrslt', 'pict', 'bin', 'u', 'uc', 'ls', 'ilvl', 'listtext',
  'footnote', 'chftn', 'annotation', 'atrfstart', 'atrfend',
  'atnparent', 'revised', 'deleted', 'revauth', 'revdttm', 's', 'cs',
  'f', 'fs', 'cf', 'highlight', 'clmgf', 'clmrg', 'clvmgf', 'clvmrg',
  'header', 'footer', 'bkmkstart', 'bkmkend', 'picw', 'pichgoal',
  'levelnfc', 'leveltext', 'listid', 'brdrw', 'li', 'fi', 'sl'];
const PARAMS = ['', '0', '-1', '1', '9', '255', '32767', '-32768',
  '65535', '99999', '2147483647', '-2147483648', '999999999999999'];

/** One damaged copy of bytes. */
function mutate(bytes, rnd) {
  let b = Array.from(bytes);
  const at = () => Math.floor(rnd() * (b.length + 1));
  const ops = 1 + Math.floor(rnd() * 6);
  for (let k = 0; k < ops; k++) {
    const op = Math.floor(rnd() * 7), i = at();
    if (op === 0 && b.length) b[Math.min(i, b.length - 1)] =
      Math.floor(rnd() * 256);
    else if (op === 1) b.splice(i, 0, rnd() < 0.5 ? 0x7b : 0x7d);
    else if (op === 2) b.splice(i, 0, 0x5c);
    else if (op === 3) b.splice(i, Math.floor(rnd() * 64));
    else if (op === 4) {
      const n = Math.floor(rnd() * 200);
      b.splice(i, 0, ...b.slice(i, i + n));
    } else {
      const w = WORDS[Math.floor(rnd() * WORDS.length)];
      const p = PARAMS[Math.floor(rnd() * PARAMS.length)];
      const s = (op === 6 ? '{\\*' : '') + '\\' + w + p + ' ';
      b.splice(i, 0, ...Buffer.from(s, 'latin1'));
    }
  }
  return Uint8Array.from(b);
}

describe('RtfRead: seeded fuzz', () => {
  const inputs = [];
  for (const [n, bytes] of FIXTURES) {
    inputs.push([n, bytes]);
    const doc = readRtf(bytes, {date: DATE}).doc;
    inputs.push([n + ' (as we write it)', writeRtf(doc).bytes]);
  }

  it('cut short anywhere: never throws, a valid Doc', async () => {
    let n = 0;
    for (const [name, bytes] of inputs) {
      const rnd = rng(0xc0ffee + bytes.length);
      const cuts = new Set();
      for (let k = 1; k < 16; k++) cuts.add(Math.floor(bytes.length * k / 16));
      for (let k = 0; k < 24; k++) cuts.add(Math.floor(rnd() * bytes.length));
      for (const c of cuts) {
        const doc = readOk(bytes.subarray(0, c), name + ' cut at ' + c);
        if (n++ % 40 === 0) await docxOk(doc, name + ' cut at ' + c);
      }
    }
    assert.ok(n > 1000, n + ' reads');
  });

  it('mutated: never throws, a valid Doc', async () => {
    let n = 0;
    for (const [name, bytes] of inputs) {
      const rnd = rng(0x5eed ^ bytes.length);
      for (let k = 0; k < 40; k++) {
        const doc = readOk(mutate(bytes, rnd), name + ' mutation ' + k);
        if (n++ % 40 === 0) await docxOk(doc, name + ' mutation ' + k);
      }
    }
    assert.ok(n > 1000, n + ' reads');
  });

  it('binary garbage after the header', () => {
    const rnd = rng(77);
    for (let k = 0; k < 60; k++) {
      const b = new Uint8Array(1 + Math.floor(rnd() * 20000));
      for (let i = 0; i < b.length; i++) b[i] = Math.floor(rnd() * 256);
      const head = enc(k % 2 ? '{\\rtf1\\ansi ' : '{\\rtf');
      const all = new Uint8Array(head.length + b.length);
      all.set(head);
      all.set(b, head.length);
      readOk(all, 'garbage ' + k);
      readOk(b, 'garbage without a header ' + k);
    }
  });
});

describe('RtfRead: nesting', () => {
  it('groups far deeper than the limit', () => {
    const {notes} = readRtf(enc('{\\rtf1 ' + '{'.repeat(200000) + 'x' +
      '}'.repeat(200000) + '}'), {date: DATE});
    assert.ok(notes.some((s) => s.includes('nested deeper')), notes);
    readOk(enc('{\\rtf1 ' + '{\\b '.repeat(250) + 'x' + '}'.repeat(250) +
      '}'), 'bold 250 deep');
  });
  it('fields in fields, notes in notes, comments in comments', () => {
    const d = 120;
    readOk(enc('{\\rtf1 ' + '{\\field{\\*\\fldinst PAGE}{\\fldrslt '
      .repeat(d) + 'x' + '}}'.repeat(d) + '}'), 'fields in results');
    readOk(enc('{\\rtf1 ' + '{\\field{\\*\\fldinst {\\field{\\*\\fldinst '
      .repeat(60) + 'PAGE' + '}}}}'.repeat(60) + '}'), 'fields in codes');
    readOk(enc('{\\rtf1 ' + 'a\\chftn{\\footnote '.repeat(100) + 'x' +
      '}'.repeat(100) + '}'), 'notes in notes');
    readOk(enc('{\\rtf1 ' + '{\\*\\atnid A}\\chatn{\\*\\annotation '
      .repeat(100) + 'x' + '}'.repeat(100) + '}'), 'comments');
  });
  it('tables nested a hundred deep, and \\itap absurd', () => {
    let s = '{\\rtf1 ';
    for (let k = 1; k <= 100; k++) s += '\\pard\\intbl\\itap' + k + ' a';
    for (let k = 100; k >= 2; k--) {
      s += '\\nestcell{\\*\\nesttableprops\\trowd\\cellx1000\\nestrow}' +
        '\\pard\\intbl\\itap' + (k - 1) + ' ';
    }
    s += '\\cell\\trowd\\cellx1000\\row}';
    readOk(enc(s), 'nested 100');
    readOk(enc('{\\rtf1\\pard\\intbl\\itap99999 x\\nestcell\\nestrow' +
      '\\itap-5 y\\cell\\row}'), 'itap absurd');
  });
});

describe('RTF size and memory', () => {
  const vfs = (bytes) => ({readFile: async () => bytes});
  it('a 50 MB-class file is refused by openDoc before it is parsed',
    async () => {
      const big = new Uint8Array(50 * 1024 * 1024).fill(0x7b);
      big.set(enc('{\\rtf1 '));
      const t0 = performance.now();
      await assert.rejects(O.openDoc(vfs(big), 'F'),
        (e) => e instanceof O.RtfError && e.code === 'too-big');
      // (parsing 50 MB of groups would take seconds)
      assert.ok(performance.now() - t0 < 200);
    });
  it('the largest file openDoc takes reads in a bounded heap', () => {
    // (a child with --max-old-space-size: each shape filling the 16 MB
    // cap, read as openDoc reads them. Plain text: before task 12 a
    // 32 MB one needed over 800 MB of heap. The control-word-heavy
    // shapes stop at RtfLex's 2,000,000-token cap; the lexer makes
    // every token before the reader starts, so they cost the most.
    // Every shape must read within a 512 MB heap; its peak resident
    // size, where the platform reports one, within RSS_MB)
    const RSS_MB = 768;
    const script = `
      const {readRtf} = await import(${JSON.stringify(ROOT +
        'tools/moreapps/!Letters/RtfRead')});
      const N = ${O.MAX_RTF_BYTES} - 16;
      const unit = {text: 'abcdefgh', b0: '\\\\b0 ', open: '{',
        braces: '{x}', pars: '\\\\par ', words: '\\\\b x',
        hex: "\\\\'e9", cells: '\\\\intbl x\\\\cell'}[process.argv[1]];
      const b = Buffer.alloc(N, unit, 'latin1');
      b.write('{\\\\rtf1 ', 0, 'latin1');
      const t0 = Date.now();
      const r = readRtf(new Uint8Array(b.buffer, b.byteOffset, N),
        {maxParagraphs: ${O.MAX_PARAGRAPHS}});
      const ms = Date.now() - t0;
      let rss = -1;
      try {
        rss = Math.round(process.resourceUsage().maxRSS / 1024);
      } catch {}
      console.log(r.doc.sections.length, ms, rss);`;
    for (const shape of ['text', 'b0', 'open', 'braces', 'pars', 'words',
      'hex', 'cells']) {
      const out = execFileSync(process.execPath,
        ['--max-old-space-size=512', '--input-type=module', '-e', script,
          shape], {encoding: 'utf8', timeout: 60000,
        stdio: ['ignore', 'pipe', 'ignore']});
      const [, ms, rss] = out.trim().split(' ').map(Number);
      console.log('rtfhostile: 16 MB of ' + shape + ' read in ' + ms +
        ' ms, peak RSS ' + (rss > 0 ? rss + ' MB' : 'not reported'));
      if (rss > 0) assert.ok(rss < RSS_MB, shape + ': ' + rss + ' MB');
    }
  });
});

describe('RtfRead: hostile structures', () => {
  const R = (s, what) => readOk(enc('{\\rtf1\\ansi ' + s + '}'), what);
  it('fields', () => {
    const doc = R('{\\field{\\*\\fldinst HYPERLINK "javascript:alert(1)"}' +
      '{\\fldrslt click}}{\\field{\\*\\fldinst HYPERLINK "' +
      'x'.repeat(200000) + '"}{\\fldrslt long}}{\\field{\\*\\fldinst ' +
      'PAGE ' + 'y'.repeat(100000) + '}{\\fldrslt 1}}' +
      '{\\field{\\*\\fldinst}}{\\field}{\\fldrslt orphan}' +
      '{\\field{\\*\\fldinst DDEAUTO c:\\\\\\\\x}{\\fldrslt dde}}',
    'fields');
    for (const r of doc.rels) {
      assert.ok(!String(r.target).toLowerCase().includes('javascript'),
        r.target);
    }
    const text = doc.sections[0].blocks.map((b) => b.text).join('');
    for (const w of ['click', 'long', 'orphan', 'dde']) {
      assert.ok(text.includes(w), w);
    }
  });
  it('pictures', () => {
    R('{\\pict\\pngblip\\picw999999999\\pich-5\\picwgoal2147483647' +
      '\\pichgoal-1 ' + 'zz89504e47'.repeat(1000) + '}', 'absurd sizes');
    R('{\\pict\\jpegblip\\bin2000000000 abc}', 'bin past the end');
    R('{\\pict\\pngblip\\bin-1 abc}', 'bin -1');
    R('{\\pict\\pngblip 1}', 'odd hex');
    R('{\\pict\\emfblip\\wmetafile8\\pngblip\\jpegblip ff}', 'every kind');
    R('{\\*\\shppict{\\pict\\pngblip 00}}{\\nonshppict{\\pict 00}}'
      .repeat(1500), '1500 pictures');
  });
  it('lists', () => {
    R('{\\*\\listtable{\\list\\listid1' + ('{\\listlevel\\levelnfc9999' +
      '\\levelstartat-5\\leveljc77{\\leveltext\\\'ff\\\'00\\\'09;}' +
      '{\\levelnumbers\\\'ff;}}').repeat(100) + '}}' +
      '{\\*\\listoverridetable{\\listoverride\\listid1\\ls1}' +
      '{\\listoverride\\listid999\\ls2}{\\listoverride\\ls3}}' +
      '\\pard\\ls1\\ilvl9999 a\\par\\pard\\ls99999 b\\par\\pard\\ls2 c' +
      '\\par\\pard\\ls-1\\ilvl-1 d', 'lists');
    R('{\\*\\listtable' + '{\\list\\listid1{\\listlevel}}'.repeat(3000) +
      '}', '3000 lists of one id');
  });
  it('tables', () => {
    R('\\trowd\\cellx-100\\cellx1000000000000\\cellx5 a\\cell b\\cell\\row',
      'edges');
    R('\\trowd' + '\\cellx10'.repeat(5000) + ' x\\cell\\row', '5000 cells');
    R('a\\cell b\\cell\\row \\row \\nestrow \\nestcell', 'no \\trowd');
    R('\\trowd\\clmrg\\cellx100\\clvmrg\\cellx200\\clmgf\\cellx300 a\\cell' +
      ' b\\cell c\\cell d\\cell e\\cell\\row', 'merges without starts');
    R('\\trowd\\cellx100\\cellx200 ' + 'x\\cell'.repeat(50) + '\\row',
      'more cells than edges');
    const t0 = performance.now();
    R('\\trowd\\cellx1000\\cellx2000 a\\cell b\\cell\\row'.repeat(30000),
      '30,000 rows');
    assert.ok(performance.now() - t0 < SLOW_MS);
  });
  it('comments, notes and tracked changes', () => {
    R('{\\*\\atnid A}{\\*\\atnauthor B}\\chatn{\\*\\annotation' +
      '{\\*\\atnref 1}{\\*\\atnparent 1} self}{\\*\\atrfend 7}' +
      '{\\*\\atrfstart 7}{\\*\\atrfstart 8}x\\chatn' +
      '{\\*\\annotation{\\*\\atnparent 99999} no ref}', 'comments');
    R('{\\*\\revtbl{Unknown;}{A;}}{\\revised\\revauth99999' +
      '\\revdttm-1 in}{\\deleted\\revauthdel-5\\revdttmdel2147483647 out}' +
      '{\\deleted\\par}{\\deleted\\chftn{\\footnote gone}}',
    'revisions');
    R('\\chftn{\\footnote\\ftnalt' + '{\\footnote x}'.repeat(50) + '}' +
      '{\\footnote no mark}', 'notes');
  });
});

describe('RtfRead: many distinct names (no per-name work)', () => {
  /** n distinct lowercase names (the lexer's words are letters). */
  const names = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let s = '', k = i;
      do {
        s += String.fromCharCode(97 + k % 26);
        k = Math.floor(k / 26);
      } while (k);
      out.push(s);
    }
    return out;
  };
  const timed = (s, what) => {
    const t0 = performance.now();
    const got = readRtf(enc(s), {date: DATE});
    return {ms: performance.now() - t0, got, what};
  };

  it('80,000 distinct unknown destinations: read in under 1 s, the ' +
    'notes capped', () => {
    const body = names(80000).map((n) => '{\\*\\x' + n + '}').join('');
    const {ms, got} = timed('{\\rtf1\\ansi ' + body + '}', 'dests');
    assert.ok(ms < 1000, 'read in ' + ms.toFixed(0) + ' ms');
    assert.ok(got.notes.length <= MAX_NOTES, got.notes.length);
    assert.ok(got.notes.some((n) => n.startsWith('other unknown ' +
      'destinations')), got.notes.slice(-3).join(' | '));
  });

  it('many notes of every kind: at most MAX_NOTES, the last says ' +
    'there were more', () => {
    // unknown destinations in footnotes, comments and fields too
    const n = names(3000);
    const s = n.map((x, i) => (i % 3 === 0 ? '{\\*\\q' + x + '}'
      : i % 3 === 1 ? '{\\footnote {\\*\\r' + x + '}n}'
        : '{\\field{\\*\\fldinst {\\*\\s' + x + '}PAGE}{\\fldrslt 1}}'))
      .join('');
    const {ms, got} = timed('{\\rtf1\\ansi ' + s + '}', 'mixed');
    assert.ok(ms < 1000, ms);
    assert.ok(got.notes.length <= MAX_NOTES, got.notes.length);
    assert.equal(new Set(got.notes).size, got.notes.length, 'once each');
    // 100 fonts of 100 unknown code pages: 100 distinct notes
    let ft = '', text = '';
    for (let i = 0; i < 100; i++) {
      ft += '{\\f' + i + '\\cpg' + (40000 + i) + ' F;}';
      text += '\\f' + i + " \\'e9";
    }
    const cp = timed('{\\rtf1\\ansi{\\fonttbl' + ft + '}' + text + '}',
      'code pages').got.notes;
    assert.equal(cp.length, MAX_NOTES);
    assert.equal(cp[0], 'unknown code page 40000: 1 character replaced');
    assert.equal(cp[MAX_NOTES - 1], MORE);
  });

  it("16 MB of damaged \\' escapes and over-long words: one lexer " +
    'note each', () => {
    const bad = "\\'z".repeat(500000) + ('\\' + 'a'.repeat(40) + ' ')
      .repeat(100000);
    const {tokens, notes} = lex(enc('{\\rtf1 ' + bad + '}'));
    assert.ok(tokens.length > 0);
    assert.deepEqual(notes, ["a damaged \\' escape is ignored",
      'a control word is cut at 32']);
  });

  it('a chain of 10,000 comment replies: read in under 1 s', () => {
    let s = '';
    for (let i = 0; i < 10000; i++) {
      s += '{\\*\\atnid a}{\\*\\atnauthor A}\\chatn{\\*\\annotation' +
        '{\\*\\atnref t' + i + '}{\\*\\atnparent t' + (i ? i - 1 : 0) +
        '}x}';
    }
    const {ms, got} = timed('{\\rtf1\\ansi ' + s + '}', 'replies');
    assert.ok(ms < 1000, 'read in ' + ms.toFixed(0) + ' ms');
    assert.ok(got.doc.sections[0].blocks.length >= 1);
  });

  it('100,000 bookmarks, 50,000 styles, 100,000 fonts and colours, ' +
    '20,000 lists, 50,000 authors: each read in seconds', () => {
    const rep = (k, f) => {
      let s = '';
      for (let i = 0; i < k; i++) s += f(i);
      return s;
    };
    const cases = [
      ['bookmarks', rep(100000, (i) => '{\\*\\bkmkstart b' + i +
        '}x{\\*\\bkmkend b' + i + '}')],
      ['styles', '{\\stylesheet' + rep(50000, (i) => '{\\s' + i + ' S' +
        i + ';}') + '}x'],
      ['fonts', '{\\fonttbl' + rep(100000, (i) => '{\\f' + i + ' F' + i +
        ';}') + '}x'],
      ['colours', '{\\colortbl' + rep(100000, (i) => '\\red' + (i % 256) +
        ';') + '}x'],
      ['lists', '{\\*\\listtable' + rep(20000, (i) => '{\\list\\listid' +
        i + '{\\listlevel\\levelnfc0{\\leveltext\\\'02\\\'00.;}}}') + '}x'],
      ['authors', '{\\*\\revtbl' + rep(50000, (i) => '{A' + i + ';}') +
        '}x'],
    ];
    for (const [what, s] of cases) {
      const {ms, got} = timed('{\\rtf1\\ansi ' + s + '}', what);
      // (linear, about 0.5 s alone at the most: SLOW_MS leaves room
      // for a loaded machine; per-name work would take minutes)
      assert.ok(ms < SLOW_MS, what + ' read in ' + ms.toFixed(0) +
        ' ms');
      assert.ok(got.notes.length <= MAX_NOTES, what);
    }
  });
});
