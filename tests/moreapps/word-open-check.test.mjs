// tools/word-open-check (lib.mjs): the real-Word .docx checker, tested
// with a fake osascript runner (no Word): verdicts, check.docx written
// in place, the abort after three TIMEOUTs, reports and resume, the
// directory walk, and tests/moreapps/word-emit.mjs. The one real-Word
// test runs only with WORD_REAL=1 on a Mac with Word installed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classify, makeChecker, overwriteInPlace, AbortRun, walk, shuffle, readReport,
  appendReport, settled, listDocs, sameDocs, parseList, OPEN_SCRIPT, LIST_SCRIPT,
  CLOSE_SCRIPT, closeLeftovers, PING_SCRIPT, pingWord, isSettled, skipReason, hungAction,
  hungMessage, mayKill, killWord, stallMessage, emittedKind, isRtfBytes, HUGE, NOT_ZIP,
  WRITE_PROTECTION, MAIL_MERGE,
  CHECK_NAME, MARKER, RTF_NAME, RTF_MARKER, WORD_APP, sha256,
} from '../../tools/word-open-check/lib.mjs';
import {emit, resetEmit, safeName, stemOf, readIndex, DEFAULT_DIR, markBroken}
  from './word-emit.mjs';
import {buildDocx, documentXml, p, r, settingsXml} from './build-docx.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'woc-'));
const ok = (counts) => ({code: 0, killed: false, stderr: '', stdout: 'RESULT ' +
  Object.entries(counts).map(([k, v]) => k + '=' + v).join(' ') + '\n'});

/**
 * A fake Word: docs is its list of names; opens(bytes) says if it opens;
 * hang(bytes) makes the open fail (true: an osascript error, 'kill': the
 * watchdog); dead() makes Word stop answering anything (hung);
 * prompts(bytes) puts up a dialog that blocks every open (each times out,
 * Word still answers pings) until w.dismiss(); pingAs() 'modal' makes the
 * ping come back with an error.
 */
function fakeWord({docs = [], opens = () => true, hang = () => false,
  dead = () => false, prompts = () => false, pingAs = () => 'ok'} = {}) {
  const calls = [];
  const state = {dialog: false};
  const runner = async (script, args, ms) => {
    calls.push({script, args, ms});
    if (dead()) return {code: null, killed: true, stdout: '', stderr: ''};
    if (script === PING_SCRIPT) {
      if (pingAs() === 'modal') {
        return {code: 1, killed: false, stdout: '', stderr: 'execution error: -1708'};
      }
      return {code: 0, killed: false, stdout: 'PING ' + docs.length + '\n', stderr: ''};
    }
    if (script === LIST_SCRIPT) {
      return {code: 0, killed: false, stdout: 'LIST\n' + docs.map((d) => d + '\n').join(''),
        stderr: ''};
    }
    if (script === CLOSE_SCRIPT) {
      const ours = (d) => d === CHECK_NAME || d === RTF_NAME;
      const n = docs.filter(ours).length;
      docs.splice(0, docs.length, ...docs.filter((d) => !ours(d)));
      return {code: 0, killed: false, stdout: 'CLOSED ' + n + ' STUCK 0\n', stderr: ''};
    }
    const bytes = fs.readFileSync(args[0]);
    const name = args[3] || CHECK_NAME;
    if (state.dialog) return {code: 0, killed: false, stdout: 'TIMEDOUT\n', stderr: ''};
    if (prompts(bytes)) {
      state.dialog = true;
      return {code: 0, killed: false, stdout: 'TIMEDOUT\n', stderr: ''};
    }
    const h = hang(bytes);
    if (h === 'kill') return {code: null, killed: true, stdout: '', stderr: ''};
    if (h) return {code: 1, killed: false, stdout: '', stderr: '-1708: every document ' +
      'doesn’t understand the “count” message.'};
    let leftover = 0;
    for (let i = docs.length - 1; i >= 0; i--) {
      if (docs[i] === name) { docs.splice(i, 1); leftover++; }
    }
    const n0 = docs.length;
    if (opens(bytes)) docs.push(name);
    const n1 = docs.length;
    let found = 0;
    for (let i = docs.length - 1; i >= 0; i--) {
      if (docs[i] === name) { docs.splice(i, 1); found++; }
    }
    return ok({leftover, n0, n1, found, made: 0, n2: docs.length, err: 0});
  };
  return {runner, calls, docs, dismiss: () => { state.dialog = false; }};
}

const GOOD = Buffer.from('good');
const BAD = Buffer.from('bad');

describe('word-open-check: verdicts from osascript', () => {
  it('opened: the count rose and check.docx was there', () => {
    assert.equal(classify(ok({n0: 0, n1: 1, found: 1})).verdict, 'OK');
    assert.equal(classify(ok({n0: 2, n1: 3, found: 1})).verdict, 'OK');
  });
  it('refused: no new document', () => {
    assert.equal(classify(ok({n0: 0, n1: 0, found: 0})).verdict, 'REFUSED');
    assert.equal(classify(ok({n0: 2, n1: 3, found: 0})).verdict, 'REFUSED');
  });
  it('an osascript error, an AppleEvent timeout, the watchdog: TIMEOUT', () => {
    assert.equal(classify({code: 1, stdout: '', stderr: 'execution error: -1708'})
      .verdict, 'TIMEOUT');
    assert.equal(classify({code: 0, stdout: 'TIMEDOUT\n'}).verdict, 'TIMEOUT');
    assert.equal(classify({code: null, killed: true, stdout: ''}).verdict, 'TIMEOUT');
    assert.equal(classify({code: 0, stdout: 'what?'}).verdict, 'TIMEOUT');
  });
  it('the scripts close only check.docx / check.rtf and never quit Word', () => {
    const all = OPEN_SCRIPT + LIST_SCRIPT + CLOSE_SCRIPT;
    assert.doesNotMatch(all, /\bquit\b|System Events/);
    assert.match(OPEN_SCRIPT, /set c_name to "check.docx"\n/);
    assert.match(OPEN_SCRIPT, /if c_nm is c_name then/);
    assert.match(CLOSE_SCRIPT, /if c_nm is "check.docx" or c_nm is "check.rtf" then/);
    assert.doesNotMatch(all, /close active document|close res/);
    // every close is of "document i" (an index just checked by name)
    assert.deepEqual([...new Set(all.match(/close \S+ \S+/g))], ['close document i']);
    assert.equal((CLOSE_SCRIPT.match(/close /g) || []).length, 1);
  });
  it('script variables are c_-prefixed (Word\u2019s terms, e.g. found, shadow them)', () => {
    const all = OPEN_SCRIPT + LIST_SCRIPT + CLOSE_SCRIPT;
    for (const [, v] of all.matchAll(/\bset (\w+) to\b/g)) {
      assert.ok(v.startsWith('c_'), v);
    }
  });
  it('leftovers closed at the start and end, with counts; stuck ones counted', async () => {
    assert.deepEqual(await closeLeftovers(async () => ({code: 0, stdout: 'CLOSED 2 STUCK 1\n'})),
      {closed: 2, stuck: 1});
    assert.deepEqual(await closeLeftovers(async () => ({code: 0, stdout: 'CLOSED 0\n'})),
      {closed: 0, stuck: 0});
    assert.equal(await closeLeftovers(async () => ({code: 1, stdout: ''})), null);
    // each document's name and close are tried on their own (one that does
    // not answer is passed over)
    assert.match(CLOSE_SCRIPT, /try\n\s+set c_nm to name of document i\n\s+end try/);
    assert.match(OPEN_SCRIPT, /repeat with i from \(count of documents\) to 1 by -1\n\s+try/);
  });
  it('the document list', () => {
    assert.deepEqual(parseList({code: 0, stdout: 'LIST\nA.docx\nB\n'}), ['A.docx', 'B']);
    assert.deepEqual(parseList({code: 0, stdout: 'LIST\n'}), []);
    assert.equal(parseList({code: 1, stdout: ''}), null);
    assert.ok(sameDocs(['a', 'b'], ['b', 'a']));
    assert.ok(!sameDocs(['a'], ['a', 'check.docx']));
    assert.ok(!sameDocs(['a'], null));
  });
});

describe('word-open-check: the checker over a fake Word', () => {
  it('OK and REFUSED; the owner’s documents left open', async () => {
    const dir = tmp();
    const w = fakeWord({docs: ['Mine.docx'], opens: (b) => b.equals(GOOD)});
    const c = makeChecker({runner: w.runner, dir, timeout: 40});
    assert.equal((await c.check(GOOD)).verdict, 'OK');
    assert.equal((await c.check(BAD)).verdict, 'REFUSED');
    assert.deepEqual(w.docs, ['Mine.docx']);
    assert.deepEqual(await listDocs(w.runner), ['Mine.docx']);
  });
  it('RTF goes through check.rtf, with its own grant wait and marker', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const notes = [];
    const w = fakeWord({docs: ['Mine.docx']});
    const c = makeChecker({runner: w.runner, dir, timeout: 40, firstTimeout: 120,
      log: (s) => notes.push(s)});
    const RTF = Buffer.from('{\\rtf1 x}');
    assert.equal((await c.check(GOOD)).verdict, 'OK');
    assert.equal((await c.check(RTF)).verdict, 'OK');
    assert.equal((await c.check(RTF)).verdict, 'OK');
    assert.deepEqual(w.calls.map((k) => [path.basename(k.args[0]), k.args[1], k.args[3]]),
      [[CHECK_NAME, 40, undefined], [RTF_NAME, 120, RTF_NAME], [RTF_NAME, 40, RTF_NAME]]);
    assert.ok(fs.existsSync(path.join(dir, RTF_MARKER)));
    assert.deepEqual(fs.readFileSync(path.join(dir, RTF_NAME)), RTF);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /check\.rtf and Grant Access/);
    assert.deepEqual(w.docs, ['Mine.docx']);
  });
  it('a check.docx left open is closed first, and said so', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const w = fakeWord({docs: ['Mine.docx', CHECK_NAME]});
    const r = await makeChecker({runner: w.runner, dir}).check(GOOD);
    assert.equal(r.verdict, 'OK');
    assert.match(r.detail, /left open/);
    assert.deepEqual(w.docs, ['Mine.docx']);
  });
  it('the first open waits longer, then the marker is written', async () => {
    const dir = tmp();
    const notes = [];
    const w = fakeWord();
    const c = makeChecker({runner: w.runner, dir, timeout: 40, firstTimeout: 120,
      log: (s) => notes.push(s)});
    await c.check(GOOD);
    await c.check(GOOD);
    assert.equal(w.calls[0].args[1], 120);
    assert.equal(w.calls[1].args[1], 40);
    assert.ok(w.calls[0].ms > 120000, 'the watchdog outlasts the AppleScript timeout');
    assert.ok(fs.existsSync(path.join(dir, MARKER)));
    assert.equal(notes.length, 1);
    assert.match(notes[0], /Grant Access/);
  });
  it('a stall: the prompting file is blamed, the next is not opened', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const PROMPT = Buffer.from('prompt');
    const w = fakeWord({prompts: (b) => b.equals(PROMPT)});
    const c = makeChecker({runner: w.runner, dir});
    const r1 = await c.check(PROMPT, 'pw.docx');
    assert.equal(r1.verdict, 'TIMEOUT');
    assert.match(r1.detail, /first of a stall: probably the prompt/);
    assert.match(r1.detail, /Grant Access/);
    const n = w.calls.length;
    await assert.rejects(c.check(GOOD, 'next.docx'), (e) => e instanceof AbortRun &&
      e.last === null && e.first === 'pw.docx' && e.message === stallMessage('pw.docx'));
    // a ping, then the probe with the short wait; next.docx never written
    const more = w.calls.slice(n);
    assert.deepEqual(more.map((k) => k.script === PING_SCRIPT ? 'ping' : k.args[1]),
      ['ping', 10]);
    assert.notEqual(fs.readFileSync(c.file).toString(), 'good');
    assert.equal(stallMessage('a.docx'), 'a dialog for a.docx is probably waiting in Word; ' +
      'dismiss it, then rerun with --resume.');
  });
  it('a stall that clears by itself: the probe opens and the run goes on', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    let w = null;
    w = fakeWord({prompts: (b) => b.equals(BAD)});
    const c = makeChecker({runner: w.runner, dir});
    assert.equal((await c.check(BAD, 'slow.docx')).verdict, 'TIMEOUT');
    w.dismiss();
    assert.equal((await c.check(GOOD, 'next.docx')).verdict, 'OK');
  });
  it('without the stall probe: later TIMEOUTs are COLLATERAL; three stop, naming the first',
    async () => {
      const dir = tmp();
      fs.writeFileSync(path.join(dir, MARKER), 'x');
      const w = fakeWord({prompts: () => true});
      const c = makeChecker({runner: w.runner, dir, stallProbe: false});
      assert.equal((await c.check(GOOD, 'a.docx')).verdict, 'TIMEOUT');
      const r2 = await c.check(GOOD, 'b.docx');
      assert.equal(r2.verdict, 'COLLATERAL');
      assert.match(r2.detail, /after a.docx did/);
      await assert.rejects(c.check(GOOD, 'c.docx'), (e) => e instanceof AbortRun &&
        /^3 TIMEOUTs in a row: a dialog for a.docx is probably waiting/.test(e.message) &&
        e.last.verdict === 'COLLATERAL' && e.first === 'a.docx');
      assert.ok(!isSettled('COLLATERAL'));
    });
  it('an open TIMEOUT whose ping comes back with an error (modal): stop at once', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const w = fakeWord({hang: () => 'kill', pingAs: () => 'modal'});
    await assert.rejects(makeChecker({runner: w.runner, dir}).check(GOOD, 'm.docx'),
      (e) => e instanceof AbortRun && e.last.verdict === 'TIMEOUT' && e.first === 'm.docx' &&
        e.message === stallMessage('m.docx'));
  });
  it('Word dead before the next file of a stall: stop as hung, nothing opened', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    let dead = false;
    const w = fakeWord({prompts: () => true, dead: () => dead});
    const c = makeChecker({runner: w.runner, dir});
    assert.equal((await c.check(GOOD, 'a.docx')).verdict, 'TIMEOUT');
    dead = true;
    await assert.rejects(c.check(GOOD, 'b.docx'), (e) => e instanceof AbortRun && e.hung &&
      e.last === null && /not responding since a.docx/.test(e.message));
  });
  it('ping states', async () => {
    assert.equal(await pingWord(async () => ({code: 0, stdout: 'PING 3\n'})), 'ok');
    assert.equal(await pingWord(async () => ({code: 1, stdout: '', stderr: '-1708'})),
      'modal');
    assert.equal(await pingWord(async () => ({code: 1, stdout: '',
      stderr: 'AppleEvent timed out. (-1712)'})), 'dead');
    assert.equal(await pingWord(async () => ({code: null, killed: true, stdout: ''})), 'dead');
  });
  it('check.docx is overwritten in place: the same inode, never deleted', async () => {
    const dir = tmp();
    const file = path.join(dir, CHECK_NAME);
    overwriteInPlace(file, Buffer.from('a much longer first content'));
    const ino = fs.statSync(file).ino;
    const w = fakeWord();
    const c = makeChecker({runner: async (...a) => {
      assert.equal(fs.statSync(file).ino, ino);
      return w.runner(...a);
    }, dir});
    await c.check(Buffer.from('two'));
    assert.equal(fs.readFileSync(file, 'utf8'), 'two');
    await c.check(Buffer.from('three!'));
    assert.equal(fs.statSync(file).ino, ino);
    assert.equal(fs.readFileSync(file, 'utf8'), 'three!');
  });
});

describe('word-open-check: a hung Word', () => {
  it('an open that times out while Word still answers a ping: TIMEOUT', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const w = fakeWord({hang: () => 'kill'});
    const r = await makeChecker({runner: w.runner, dir}).check(GOOD);
    assert.equal(r.verdict, 'TIMEOUT');
    assert.match(r.detail, /Grant Access/);
    assert.equal(w.calls.at(-1).script, PING_SCRIPT);
    assert.ok(w.calls.at(-1).ms <= 15000, 'the ping has a short watchdog');
  });
  it('an open that times out and a ping that does not answer: HUNG', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    let hung = false;
    const w = fakeWord({hang: () => { hung = true; return 'kill'; }, dead: () => hung});
    const c = makeChecker({runner: w.runner, dir});
    const r = await c.check(GOOD);
    assert.equal(r.verdict, 'HUNG');
    assert.match(r.detail, /stopped answering/);
    assert.equal(await pingWord(w.runner), 'dead');
  });
  it('an osascript error with no ping answer is HUNG too', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    let n = 0;
    const w = fakeWord({hang: () => true, dead: () => ++n > 1});
    assert.equal((await makeChecker({runner: w.runner, dir}).check(GOOD)).verdict, 'HUNG');
  });
  it('after a launch, the first open waits the long timeout', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, MARKER), 'x');
    const w = fakeWord();
    const c = makeChecker({runner: w.runner, dir, slowFirst: true, firstTimeout: 180});
    await c.check(GOOD);
    await c.check(GOOD);
    c.slowNext();
    await c.check(GOOD);
    assert.deepEqual(w.calls.map((k) => k.args[1]), [180, 40, 180]);
  });
  it('--kill-hung kills only a Word that had no documents open at the start', () => {
    assert.equal(hungAction([], false), 'stop');
    assert.equal(hungAction([], true), 'kill');
    assert.equal(hungAction(['Mine.docx'], true), 'refuse');
    assert.equal(hungAction(null, true), 'refuse');
    assert.ok(!mayKill(undefined));
    assert.equal(hungMessage('a.docx'), 'Word is not responding on a.docx. Force quit ' +
      'Word (Apple menu > Force Quit), then run again with --resume.');
  });
  it('killWord: SIGTERM, then SIGKILL, until it is gone', async () => {
    let alive = [7], sent = [];
    const ok = await killWord({pids: () => alive, sleep: async () => {},
      kill: (pid, sig) => { sent.push(sig); if (sig === 'SIGKILL') alive = []; }});
    assert.ok(ok);
    assert.deepEqual(sent, ['SIGTERM', 'SIGKILL']);
    alive = [7]; sent = [];
    assert.ok(await killWord({pids: () => alive, sleep: async () => {},
      kill: () => { alive = []; sent.push(1); }}));
    assert.deepEqual(sent, [1]);
    alive = [7];
    assert.equal(await killWord({pids: () => alive, sleep: async () => {}, kill: () => {}}),
      false);
  });
});

describe('word-open-check: files that prompt are skipped unopened', () => {
  const doc = (settings) => buildDocx({'word/document.xml': documentXml(p(r('mailMerge ' +
    'writeProtection'))), 'word/settings.xml': settingsXml(settings)});
  it('w:mailMerge in the settings part', async () => {
    assert.equal(await skipReason(await doc('<w:mailMerge><w:mainDocumentType w:val=' +
      '"formLetters"/><w:dataType w:val="textFile"/></w:mailMerge>')), MAIL_MERGE);
  });
  it('w:writeProtection in the settings part', async () => {
    assert.equal(await skipReason(await doc('<w:writeProtection w:recommended="1"/>')),
      WRITE_PROTECTION);
    assert.match(WRITE_PROTECTION, /read-only/);
  });
  it('a part over 20 MB unzipped (a hostile size)', async () => {
    assert.equal(await skipReason(await buildDocx({'word/document.xml':
      documentXml('<w:p/>'.repeat(3600000))})), HUGE);
  });
  it('not a zip (an OLE / encrypted container, or anything else)', async () => {
    const ole = Buffer.from('d0cf11e0a1b11ae1000000', 'hex');
    assert.equal(await skipReason(ole), NOT_ZIP);
    assert.equal(await skipReason(Buffer.from('PK')), NOT_ZIP);
    assert.match(NOT_ZIP, /^not a zip: encrypted or legacy container/);
  });
  it('opened: plain settings, document protection (even with a password hash), a broken zip',
    async () => {
      assert.equal(await skipReason(await doc('<w:zoom w:percent="100"/>')), null);
      assert.equal(await skipReason(await doc('<w:documentProtection w:formatting="1" ' +
        'w:enforcement="1"/>')), null);
      assert.equal(await skipReason(await doc('<w:documentProtection w:edit="readOnly" ' +
        'w:enforcement="1" w:cryptProviderType="rsaAES" w:cryptAlgorithmClass="hash" ' +
        'w:hash="AAAA" w:salt="BBBB"/>')), null);
      assert.equal(await skipReason(Buffer.from('PK\x03\x04 broken', 'latin1')), null);
    });
  it('opened: RTF (checked through check.rtf)', async () => {
    assert.equal(await skipReason(Buffer.from('{\\rtf1\\ansi x}', 'latin1')), null);
    assert.equal(isRtfBytes(Buffer.from('{\\rtf1')), true);
    assert.equal(isRtfBytes(Buffer.from('{\\rt')), false);
    assert.equal(await skipReason(Buffer.from('{\\rt')), NOT_ZIP);
  });
});

describe('word-open-check: files and reports', () => {
  it('walks directories recursively, sorted, .docx and .rtf only, no Word lock files',
    () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'b/c'), {recursive: true});
    for (const f of ['z.docx', 'a.docx', 'b/c/m.docx', 'b/x.txt', 'b/~$lock.docx',
      'b/B.DOCX', 'b/r.rtf']) fs.writeFileSync(path.join(dir, f), 'x');
    const got = walk([dir]).map((f) => path.relative(dir, f));
    assert.deepEqual(got, ['a.docx', 'b/B.DOCX', 'b/c/m.docx', 'b/r.rtf', 'z.docx']);
    assert.deepEqual(walk([dir, path.join(dir, 'a.docx')]).length, 5);
    assert.deepEqual(walk([dir], {exclude: (q) => q.endsWith('/b')})
      .map((f) => path.basename(f)), ['a.docx', 'z.docx']);
  });
  it('shuffles reproducibly', () => {
    const l = [...Array(20).keys()];
    assert.deepEqual(shuffle(l, 7), shuffle(l, 7));
    assert.notDeepEqual(shuffle(l, 7), shuffle(l, 8));
    assert.deepEqual([...shuffle(l, 7)].sort((a, b) => a - b), l);
  });
  it('report lines append; resume skips settled files and redoes TIMEOUTs', () => {
    const f = path.join(tmp(), 'sub/r.jsonl');
    appendReport(f, {sha256: 'a', verdict: 'OK'});
    appendReport(f, {sha256: 'b', verdict: 'TIMEOUT'});
    appendReport(f, {sha256: 'c', verdict: 'REFUSED'});
    appendReport(f, {sha256: 'c', verdict: 'TIMEOUT'});
    fs.appendFileSync(f, '{"sha256": "d", "verd');
    const recs = readReport(f);
    assert.equal(recs.length, 4);
    const s = settled(recs);
    assert.deepEqual([...s.keys()], ['a']);
    appendReport(f, {sha256: 'e', verdict: 'HUNG'});
    appendReport(f, {sha256: 'g', verdict: 'SKIPPED'});
    assert.deepEqual([...settled(readReport(f)).keys()], ['a', 'e', 'g']);
    assert.deepEqual([...settled(readReport(f), {retryHung: true}).keys()], ['a', 'g']);
    assert.ok(isSettled('HUNG') && !isSettled('HUNG', {retryHung: true}));
    assert.ok(!isSettled('TIMEOUT') && !isSettled(undefined));
    assert.deepEqual(readReport(path.join(tmp(), 'none.jsonl')), []);
  });
  it('--emitted: REFUSED split by broken-on-purpose', () => {
    assert.equal(emittedKind('REFUSED', {broken: true}), 'EXPECTED');
    assert.equal(emittedKind('REFUSED', {broken: false}), 'UNEXPECTED');
    assert.equal(emittedKind('REFUSED', undefined), 'UNEXPECTED');
    assert.equal(emittedKind('REFUSED', {inputRefused: true}), 'INPUT-REFUSED');
    assert.equal(emittedKind('OK', {broken: true}), 'NOTE');
    assert.equal(emittedKind('OK', {broken: false}), null);
    assert.equal(emittedKind('TIMEOUT', {broken: true}), null);
  });
  it('sha256 of the bytes', () => {
    assert.equal(sha256(Buffer.from('')).slice(0, 8), 'e3b0c442');
  });
});

describe('word-emit', () => {
  const B = (n, c = 'x') => Buffer.alloc(n, c);
  it('a no-op without WORD_EMIT', () => {
    resetEmit();
    assert.equal(emit('x', Buffer.from('abc'), {env: {}}), null);
    assert.equal(emit('x', Buffer.from('abc'), {env: {WORD_EMIT: '0'}}), null);
  });
  it('the default root is outside the corpus, and the corpus is never written', () => {
    resetEmit();
    assert.match(DEFAULT_DIR, /tests\/moreapps\/word-check-out\/emitted\/$/);
    assert.doesNotMatch(DEFAULT_DIR, /corpus/);
    const inCorpus = path.join(path.dirname(DEFAULT_DIR), '..', 'corpus', 'x-emit-test');
    assert.equal(emit('x', B(10), {env: {WORD_EMIT: inCorpus}}), null);
    assert.ok(!fs.existsSync(inCorpus));
  });
  it('writes once per content, named, indexed, capped, never throws', () => {
    resetEmit();
    const dir = tmp();
    const env = {WORD_EMIT: dir, WORD_EMIT_MAX: '2'};
    const f = emit('round trip: a/b.docx', Buffer.from('one'), {env});
    assert.match(path.basename(f), /^round-trip-a-b.docx-[0-9a-f]{10}\.docx$/);
    assert.equal(emit('other', Buffer.from('one'), {env}), null, 'same bytes');
    assert.ok(emit(() => 'lazy', Buffer.from('two'), {env}).includes('lazy-'));
    assert.equal(emit('x', Buffer.from('three'), {env}), null, 'over the cap');
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.docx')).length, 2);
    const idx = readIndex(dir);
    assert.equal(idx.size, 2);
    const rec = idx.get(path.basename(f));
    assert.equal(rec.name, 'round trip: a/b.docx');
    assert.match(rec.test, /^word-open-check:\d+$/);
    assert.equal(rec.broken, false);
    resetEmit();
    // files already indexed count as emitted
    assert.equal(emit('again', Buffer.from('one'), {env: {WORD_EMIT: dir}}), null);
    resetEmit();
    const file = path.join(dir, 'not-a-dir');
    fs.writeFileSync(file, '');
    assert.equal(emit('x', Buffer.from('z'), {env: {WORD_EMIT: path.join(file, 'sub')}}), null);
    assert.equal(safeName(''), 'doc');
    resetEmit();
  });
  it('no feedback: a name from the emit root is not emitted', () => {
    resetEmit();
    const env = {WORD_EMIT: tmp()};
    assert.equal(emit('word-check-out/emitted/a-0123456789.docx', B(5), {env}), null);
    assert.equal(emit('emitted/a.docx', B(6), {env}), null);
    assert.ok(emit('tables/a.docx', B(7), {env}));
    resetEmit();
  });
  it('stems: trailing digits and hex stripped', () => {
    assert.equal(stemOf('tblfloat-wrap-12'), 'tblfloat-wrap');
    assert.equal(stemOf('cm-5-fifty-3fa9c0d1e2'), 'cm-5-fifty');
    assert.equal(stemOf('poi/bug66312.docx'), 'poi-bug');
    assert.equal(stemOf('123'), 'doc');
  });
  it('sampling per stem: the first, new sizes only, a larger one replaces the latest', () => {
    resetEmit();
    const dir = tmp();
    const env = {WORD_EMIT: dir, WORD_EMIT_STEM_MAX: '3'};
    const first = emit('s-1', B(1000, 'a'), {env});
    assert.ok(first);
    assert.equal(emit('s-2', B(1001, 'b'), {env}), null, 'the same size bucket');
    const second = emit('s-3', B(2000, 'c'), {env});
    const third = emit('s-4', B(4000, 'd'), {env});
    assert.ok(second && third);
    assert.equal(emit('s-5', B(3000, 'e'), {env}), null, 'full, not larger');
    const big = emit('s-6', B(9000, 'f'), {env});
    assert.ok(big, 'full, but much larger');
    assert.ok(!fs.existsSync(third), 'the latest kept is replaced');
    assert.ok(fs.existsSync(first) && fs.existsSync(second));
    assert.deepEqual([...readIndex(dir).keys()].sort(), [first, second, big]
      .map((f) => path.basename(f)).sort());
    // another stem is not limited by this one; an explicit stem groups
    assert.ok(emit('other-1', B(1000, 'g'), {env}));
    assert.ok(emit('x', B(1000, 'h'), {env, stem: 'site'}));
    assert.equal(emit('y', B(1000, 'i'), {env, stem: 'site'}), null);
    resetEmit();
  });
  it('the caps hold across processes through the shared index', () => {
    resetEmit();
    const dir = tmp();
    const env = {WORD_EMIT: dir, WORD_EMIT_STEM_MAX: '2', WORD_EMIT_MAX: '3'};
    assert.ok(emit('a-1', B(100, 'a'), {env}));
    assert.ok(emit('a-2', B(300, 'b'), {env}));
    resetEmit(); // another test process
    assert.equal(emit('a-3', B(320, 'c'), {env}), null, 'the stem is full (not much larger)');
    assert.equal(emit('a-9', B(100, 'a'), {env}), null, 'the same bytes');
    assert.ok(emit('b-1', B(100, 'd'), {env}));
    resetEmit();
    assert.equal(emit('c-1', B(100, 'e'), {env}), null, 'the run\u2019s cap');
    resetEmit();
  });
  it('broken on purpose: recorded with its reason', () => {
    resetEmit();
    const dir = tmp();
    const f = emit('bad', B(10), {env: {WORD_EMIT: dir}, broken: 'no main part'});
    const rec = readIndex(dir).get(path.basename(f));
    assert.equal(rec.broken, true);
    assert.equal(rec.reason, 'no main part');
    // a round trip of it inherits the mark, even when the input was not emitted
    const out = emit('rt', B(20), {env: {WORD_EMIT: dir}, from: B(10)});
    assert.match(readIndex(dir).get(path.basename(out)).reason,
      /^made from a document broken on purpose: no main part$/);
    resetEmit();
    const out2 = emit('rt2', B(21), {env: {WORD_EMIT: dir}, from: B(10)});
    assert.equal(readIndex(dir).get(path.basename(out2)).broken, false);
    resetEmit();
    // marked after it was emitted (a helper built it): the index is updated
    const env = {WORD_EMIT: dir};
    const f3 = emit('helper-made', B(30), {env});
    assert.equal(markBroken(B(30), 'odd ids', env).length, 30);
    assert.equal(readIndex(dir).get(path.basename(f3)).reason, 'odd ids');
    const rt = emit('its round trip', B(31), {env, from: B(30)});
    assert.equal(readIndex(dir).get(path.basename(rt)).broken, true);
    assert.equal(markBroken(B(5), 'x', {}).length, 5, 'a no-op without WORD_EMIT');
    resetEmit();
  });
});

// ------------------------------------------------------- real Word

const REAL = process.platform === 'darwin' && process.env.WORD_REAL === '1' &&
  fs.existsSync(WORD_APP);

describe('word-open-check: real Microsoft Word (WORD_REAL=1)', {skip: REAL ? false :
  'set WORD_REAL=1 on a Mac with Microsoft Word to run'}, () => {
  it('opens a minimal document and refuses a w:moveFrom holding w:delText', async () => {
    const before = await listDocs();
    const c = makeChecker({log: (s) => console.log(s)});
    const settings = {'word/settings.xml': settingsXml('<w:trackRevisions/>')};
    const good = await buildDocx({'word/document.xml': documentXml(p(r('Hello'))),
      ...settings});
    const at = 'w:author="T" w:date="2026-10-01T09:00:00Z"';
    const moved = (tag) => p(`<w:moveFromRangeStart w:id="1" ${at} w:name="m"/>` +
      `<w:moveFrom w:id="2" ${at}><w:r><${tag}>Moved</${tag}></w:r></w:moveFrom>` +
      '<w:moveFromRangeEnd w:id="1"/>') +
      p(`<w:moveToRangeStart w:id="3" ${at} w:name="m"/>` +
      `<w:moveTo w:id="4" ${at}><w:r><w:t>Moved</w:t></w:r></w:moveTo>` +
      '<w:moveToRangeEnd w:id="3"/>');
    const bad = await buildDocx({'word/document.xml': documentXml(moved('w:delText')),
      ...settings});
    assert.equal((await c.check(good)).verdict, 'OK');
    assert.equal((await c.check(bad)).verdict, 'REFUSED');
    assert.ok(sameDocs(before, await listDocs()), 'Word has the documents it had');
  });
});
