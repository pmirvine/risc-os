// RTF census (Batch G2): every control word in the committed fixtures
// (tests/moreapps/rtf-fixtures/: see its README) is one the RTF reader
// or writer handles, or one ignored on purpose (IGNORED, each with
// its reason). Strict since task 12: an unhandled word fails.
//
// Handled is worked out from the modules, not written down here:
//   - the reader's word and destination tables (every module's PART
//     words and dests, as ./RtfRead merges them), the driver's own
//     \u \uc \bin, and RtfRead's QUIET destinations (skipped on
//     purpose without a note);
//   - every word our writer writes for the fixtures (each fixture
//     read and written again);
//   - NESTED: words read only inside a destination of a module (its
//     own word table, not a PART one), listed with that module; the
//     module's source is checked to name each.
// Circular in part: a word counts as handled because our writer
// writes it, or a reader table names it, not because what the reader
// does with it is right; that is the other RTF tests' job. What this
// pins is that no word in the fixtures is silently unknown.
// The words come from RtfLex.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lex} from '../../tools/moreapps/!WimpLib/RtfLex';
import {readRtf, QUIET} from '../../tools/moreapps/!Letters/RtfRead';
import {writeRtf} from '../../tools/moreapps/!Letters/RtfWrite';

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const APP = fileURLToPath(new URL('../../tools/moreapps/!Letters/',
  import.meta.url));
const MODULES = ['RtfState', 'RtfTables', 'RtfStyles', 'RtfBody',
  'RtfPara', 'RtfLists', 'RtfSect', 'RtfFields', 'RtfTable', 'RtfPict',
  'RtfRevs', 'RtfNotes', 'RtfComments'];

/** Words read only inside a module's own destination. */
export const NESTED = new Map([
  ['wmetafile', 'RtfPict'], ['picprop', 'RtfPict'],
  ['pndec', 'RtfLists'], ['pnf', 'RtfLists'], ['pnstart', 'RtfLists'],
  ['pntxtb', 'RtfLists'], ['pntxta', 'RtfLists'],
  ['pnlvlblt', 'RtfLists'], ['pnlvlbody', 'RtfLists'],
]);

const COCOA = 'Cocoa (textutil) bookkeeping or a rendering hint';
const BIDI = 'a bidirectional / complex-script hint: the Model keeps ' +
  'left-to-right text and one font';
const WIDTHS = 'a preferred width or padding: tables are written and ' +
  'read by their \\cellx edges and \\trgaph';

/** Words ignored on purpose: nothing in the Model for them. */
export const IGNORED = new Map([
  ['cocoartf', COCOA], ['cocoasubrtf', COCOA],
  ['cocoascreenfonts', COCOA], ['cocoatextscaling', COCOA],
  ['cocoaplatform', COCOA], ['cssrgb', COCOA], ['csgenericrgb', COCOA],
  ['csgray', COCOA], ['c', COCOA + ' (a \\cssrgb component)'],
  ['partightenfactor', COCOA], ['pardirnatural', COCOA],
  ['expnd', 'character spacing in quarter points: not in the Model'],
  ['expndtw', 'character spacing: not in the Model'],
  ['kerning', 'kerning: not in the Model'],
  ['outl', 'outline text: not in the Model'],
  ['strokewidth', COCOA], ['strokec', COCOA],
  ['ulc', 'underline colour: the Model has none'],
  ['strikec', COCOA],
  ['fsmilli', 'thousandths of a point: \\fs (half points) is read'],
  ['cb', 'background colour: Word ignores it (ledger ruling, task 3)'],
  ['deftab', 'the default tab stop: newDoc\u2019s is kept'],
  ['pardeftab', COCOA + ' (a paragraph default tab)'],
  ['lang', 'a language tag: the Model takes none from RTF'],
  ['levelspace', 'an old list level spacing: \\li / \\fi are read'],
  ['levelindent', 'an old list level indent: \\li / \\fi are read'],
  ['leveltemplateid', 'a list level template id: no use in the Model'],
  ['lastrow', 'marks a table\u2019s last row: \\row ends it anyway'],
  ['taflags', COCOA], ['gaph', COCOA],
  ['trwWidth', WIDTHS], ['trftsWidth', WIDTHS], ['clwWidth', WIDTHS],
  ['clftsWidth', WIDTHS], ['clpadt', WIDTHS], ['clpadl', WIDTHS],
  ['clpadb', WIDTHS], ['clpadr', WIDTHS], ['trpaddl', WIDTHS],
  ['trpaddr', WIDTHS], ['trpaddfl', WIDTHS], ['trpaddfr', WIDTHS],
  ['tblind', WIDTHS], ['tblindtype', WIDTHS], ['trautofit', WIDTHS],
  ['clshdrawnil', 'raw-nil cell shading: no shading is the default'],
  ['cltxlrtb', 'left-to-right cell text: the default'],
  ['irow', 'a row number hint'], ['irowband', 'a row band hint'],
  ['fbias', 'a font bias hint'], ['pnindent', 'an old list indent ' +
    'hint: \\li / \\fi are read'],
  ['af', BIDI], ['fcs', BIDI], ['ltrch', BIDI], ['rtlch', BIDI],
  ['ltrpar', BIDI], ['ltrrow', BIDI], ['faauto', 'font alignment: ' +
    'the default'], ['wrapdefault', 'line wrapping: the default'],
  ['crauth', 'a formatting revision: the text keeps its new format'],
  ['crdate', 'a formatting revision: the text keeps its new format'],
  ['piccropl', 'picture cropping: not read (written uncropped)'],
  ['piccropr', 'picture cropping: not read'],
  ['piccropt', 'picture cropping: not read'],
  ['piccropb', 'picture cropping: not read'],
  ['shplid', 'a shape id inside \\picprop (skipped)'],
  ['sp', 'a shape property inside \\picprop (skipped)'],
  ['sn', 'a shape property name inside \\picprop (skipped)'],
  ['sv', 'a shape property value inside \\picprop (skipped)'],
  ['width', COCOA + ' (an attachment, no picture data)'],
  ['height', COCOA + ' (an attachment, no picture data)'],
  ['appleattachmentpadding', COCOA], ['appleembedtype', COCOA],
  ['appleaqc', COCOA],
]);

/**
 * The control words in RTF bytes, with how often each occurs, by
 * RtfLex. \binN counts as 'bin'; of the control symbols only
 * ~ - _ count (under their own character).
 */
export function controlWords(bytes) {
  const out = new Map();
  const add = (w) => out.set(w, (out.get(w) || 0) + 1);
  for (const t of lex(bytes).tokens) {
    if (t.t === 'bin') add('bin');
    else if (t.t === 'word' && (t.name.length > 1 ||
        '~-_'.includes(t.name) || /[A-Za-z]/.test(t.name))) add(t.name);
  }
  return out;
}

const fixtures = fs.readdirSync(DIR).filter((n) => n.endsWith('.rtf'))
  .sort();

describe('the fixtures', () => {
  it('are there, small, RTF, and hold no home path or name', () => {
    assert.ok(fixtures.length >= 12, 'at least 12 fixtures');
    for (const n of fixtures) {
      const b = fs.readFileSync(path.join(DIR, n));
      assert.ok(b.length < 20 * 1024, n + ' is under 20 KB');
      assert.equal(String.fromCharCode(...b.subarray(0, 5)), '{\\rtf',
        n + ' starts {\\rtf');
      const text = b.toString('latin1');
      assert.ok(!/\/Users\/|\/home\/|C:\\\\Users/.test(text),
        n + ' names no home path');
    }
  });
  it('every fixture is listed in the README', () => {
    const readme = fs.readFileSync(path.join(DIR, 'README'), 'latin1');
    for (const n of fixtures) assert.ok(readme.includes(n), n);
  });
});

describe('controlWords', () => {
  const words = (s) => [...controlWords(Buffer.from(s, 'latin1'))
    .entries()];
  it('reads words, parameters and delimiters', () => {
    assert.deepEqual(words('{\\rtf1\\ansi\\fs24 \\b bold\\b0 }'),
      [['rtf', 1], ['ansi', 1], ['fs', 1], ['b', 2]]);
  });
  it('skips \\\'hh, escaped symbols and \\bin data', () => {
    assert.deepEqual(words("a\\'e9\\\\b \\{ \\} \\bin3 \\ab \\par"),
      [['bin', 1], ['par', 1]]);
  });
  it('counts the control symbols that are words', () => {
    assert.deepEqual(words('a\\~b\\-c\\_d'),
      [['~', 1], ['-', 1], ['_', 1]]);
  });
  it('never throws on a truncated word or a bin past the end', () => {
    controlWords(Buffer.from('\\'));
    controlWords(Buffer.from('\\bin99999 xx'));
    controlWords(Buffer.from('\\foo-'));
  });
});

/** The words the reader's tables, driver and QUIET list take. */
async function readerWords() {
  const out = new Set(['u', 'uc', 'bin', ...QUIET]);
  for (const m of MODULES) {
    const {PART} = await import('../../tools/moreapps/!Letters/' + m);
    for (const k of (PART.words || new Map()).keys()) out.add(k);
    for (const k of (PART.dests || new Map()).keys()) out.add(k);
  }
  return out;
}

describe('census', () => {
  const seen = new Map();   // word -> [fixtures it occurs in]
  const written = new Set();
  for (const n of fixtures) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, n)));
    for (const k of controlWords(bytes).keys()) {
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(n);
    }
    const out = writeRtf(readRtf(bytes).doc).bytes;
    for (const k of controlWords(out).keys()) written.add(k);
  }

  it('NESTED words are named by their modules; IGNORED has reasons',
    () => {
      for (const [w, m] of NESTED) {
        const src = fs.readFileSync(path.join(APP, m), 'latin1');
        assert.ok(src.includes("'" + w + "'"), m + ' names ' + w);
      }
      for (const [w, why] of IGNORED) {
        assert.ok(why.length > 10, w);
        assert.ok(!NESTED.has(w), w + ' is in NESTED and IGNORED');
      }
    });
  it('every control word in the fixtures is handled or ignored',
    async () => {
      const reader = await readerWords();
      const handled = (w) => reader.has(w) || written.has(w) ||
        NESTED.has(w);
      const unhandled = [...seen.keys()]
        .filter((w) => !handled(w) && !IGNORED.has(w)).sort();
      if (unhandled.length) {
        console.log('rtfcensus: ' + unhandled.length + ' unhandled of ' +
          seen.size + ': ' + unhandled.map((w) => w + ' (' +
          seen.get(w).join(', ') + ')').join(' '));
      }
      assert.deepEqual(unhandled, []);
      // (an IGNORED word the modules now handle is stale)
      const stale = [...IGNORED.keys()].filter(handled).sort();
      assert.deepEqual(stale, [], 'handled now: take them out of IGNORED');
    });
});
