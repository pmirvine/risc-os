// A damaged spelling dictionary (cut short, garbage) takes the
// dictionary-failure path: no flags, editing goes on, one notice.
// (Its own file: the notice is told once a session.)
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}};' +
  'export const reportError = () => {};');
registerHooks({resolve(spec, ctx, next) {
  if (spec === 'riscos') return {url: STUB, shortCircuit: true};
  return next(spec, ctx);
}});
const warn = console.warn;             // (the failure is expected)
console.warn = (...a) => {
  if (!String(a[0]).includes('dictionary not read')) warn(...a);
};
const {SpellState} =
  await import('../../tools/moreapps/!Letters/SpellState');
const KEY = Symbol.for('letters.spell.dict');
const DIR = new URL('../../tools/moreapps/!Letters/Dict/',
  import.meta.url);
const real = (n) => new Uint8Array(readFileSync(new URL(n, DIR)));
const wait = () => new Promise((ok) => setTimeout(ok, 30));

describe('a damaged dictionary', () => {
  it('cut short, then garbage: no flags, no throw, one notice; the ' +
    'whole files still work', async () => {
    const d = new Document(await readDocx(await buildDocx(
      {'word/document.xml': documentXml(p(r('the teh dog')))})));
    const q = d.doc.sections[0].blocks[0];
    const notes = [];
    const notify = (m) => notes.push(m);
    const dic = real('en_GB_dic'), aff = real('en_GB_aff');
    const cases = [
      (n) => (n.endsWith('dic') ? dic.subarray(0, dic.length >> 2)
        : aff),
      (n) => (n.endsWith('dic') ? new TextEncoder().encode(
        'garbage\nzz\n') : aff),
      (n) => (n.endsWith('dic') ? dic
        : new TextEncoder().encode('<html>404</html>')),
    ];
    for (const bytes of cases) {
      delete globalThis[KEY];
      const st = new SpellState({d, app: {}}, {notify, now: () => 0,
        readBytes: async (n) => bytes(n), raf: () => 0, caf() {}});
      await wait();
      assert.equal(st.dictReady, false);
      assert.equal(st.ensure([q]), false);
      assert.equal(st.flagsOf(q), null);
      assert.equal(st.flagsAt(q, 5), null);
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'a'});
      st.stop();
    }
    assert.equal(notes.length, 1);
    assert.match(notes[0], /could not be read/);
    delete globalThis[KEY];
    const ok = new SpellState({d, app: {}}, {notify, now: () => 0,
      readBytes: async (n) => real(n.endsWith('dic') ? 'en_GB_dic'
        : 'en_GB_aff'), raf: () => 0, caf() {}});
    await wait();
    assert.equal(ok.dictReady, true);
    const q2 = d.doc.sections[0].blocks[0];
    ok.ensure([q2]);
    assert.deepEqual(ok.flagsOf(q2).map((x) => x.word),
      ['aaathe', 'teh']);
    ok.stop();
    delete globalThis[KEY];
  });
});
