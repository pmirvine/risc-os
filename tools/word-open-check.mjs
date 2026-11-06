#!/usr/bin/env node
// Does real Microsoft Word open these .docx (or .rtf) files? (macOS, Word 16 for
// Mac, driven by AppleScript; the core is tools/word-open-check/lib.mjs.)
// Word is the only authority on whether a file is valid: REFUSED is its
// verdict, ground truth. See docs/apps/Letters.md, "Checking files in
// real Word".
//
//   node tools/word-open-check.mjs [options] <file-or-dir>...
//     a directory means every .docx, .dotx and .rtf under it (sorted); RTF
//     goes through check.rtf beside check.docx (its own one-time grant);
//     a Word template (a file named .dotx; the name decides,
//     not the bytes) goes through check.dotx, likewise
//     --report <file.jsonl>  results appended after every file
//     --resume               skip files already settled in the report
//     --limit N  --shuffle-seed N  --timeout S (40)  --only-fail
//     --diagnose             for a REFUSED file, also try Word's repair
//                            open (any window it makes is closed)
//     --no-probe             skip the known-good probe opened first
//     --retry-hung           resume re-checks HUNG files too
//     --kill-hung            a file that hangs Word: kill Word (only if it
//                            had no documents open at the start), launch
//                            it again and go on; else the run stops
//   node tools/word-open-check.mjs --emitted
//     the documents the tests emitted (WORD_EMIT=1; tests/moreapps/word-emit.mjs),
//     the producing test shown by every non-OK file; REFUSED split into
//     EXPECTED (built broken on purpose) and UNEXPECTED (exit 1)
//   node tools/word-open-check.mjs --corpus [--rerun-resaves] [--limit N]
//     every file under tests/moreapps/corpus (handoff/ and word-check/
//     left out): the original, then our reader + writer's re-save of it;
//     reports in tests/moreapps/corpus/word-check/, always resumed from
//     there (a .dotx by its name through check.dotx, as above, and our
//     re-save of it too: it keeps the template content type). Exit 1 on
//     a REGRESSION (or RESAVE-HUNG).
// Verdicts: OK, REFUSED (Word's verdict), TIMEOUT (Word answers but did
// not open it: a dialog; the run stops if it is still up before the next
// file), COLLATERAL (a TIMEOUT blamed on the one before), HUNG (Word
// stopped answering: the run stops), SKIPPED (never opened: it prompts by
// design: not a zip, w:writeProtection, w:mailMerge).
//
// Each file is copied over $HOME/word-open-check/check.docx in place
// ($WORD_CHECK_DIR to move it): Word's one-time file-access grant is
// tied to that file (check.rtf, check.dotx likewise). Only those three are ever closed.
// Exit: 0 every file OK or SKIPPED (corpus: no REGRESSION), 1
// otherwise, 2 the run stopped (HUNG, three TIMEOUTs) or a usage error.
import fs from 'node:fs';
import path from 'node:path';
import {
  WORD_APP, AbortRun, makeChecker, listDocs, sameDocs, walk, shuffle, sha256,
  isTemplateName, reportKey, corpusKinds,
  appendReport, readReport, settled, isSettled, probeDocx, checkDir, CHECK_NAME, RTF_NAME,
  closeLeftovers, CHECK_NAMES, wordPids, killWord, hungAction, hungMessage, skipReason, SKIPPED_BY_DESIGN,
  emittedKind,
} from './word-open-check/lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CORPUS = path.join(ROOT, 'tests/moreapps/corpus');
const OUTDIR = path.join(CORPUS, 'word-check');
const MAX_BYTES = 20 * 1024 * 1024;
const DATE = new Date(2024, 4, 6, 7, 8, 10); // as tests/moreapps/roundtrip-lib.mjs
const LAUNCH_SECS = 180; // Word starting (after a force quit it may offer recovery)
const CLASSES = ['FINE', 'REGRESSION', 'RESAVE-HUNG', 'INPUT-REFUSED', 'INPUT-HUNG',
  'READER-REFUSED', 'READER-ERROR', 'SKIPPED', 'UNSETTLED', 'COLLATERAL'];

function parseArgs(argv) {
  const o = {paths: [], timeout: 40, limit: Infinity, seed: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(a + ' needs a value');
      return argv[++i];
    };
    if (a === '--report') o.report = val();
    else if (a === '--resume') o.resume = true;
    else if (a === '--limit') o.limit = Number(val());
    else if (a === '--shuffle-seed') o.seed = Number(val());
    else if (a === '--timeout') o.timeout = Number(val());
    else if (a === '--only-fail') o.onlyFail = true;
    else if (a === '--diagnose') o.diagnose = true;
    else if (a === '--no-probe') o.noProbe = true;
    else if (a === '--corpus') o.corpus = true;
    else if (a === '--emitted') o.emitted = true;
    else if (a === '--rerun-resaves') o.rerunResaves = true;
    else if (a === '--retry-hung') o.retryHung = true;
    else if (a === '--kill-hung') o.killHung = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else o.paths.push(a);
  }
  if (!(o.timeout > 0)) throw new Error('--timeout must be a positive number');
  return o;
}

const rel = (p) => path.relative(process.cwd(), p) || p;
const secs = (s) => '(' + s.toFixed(1) + 's)';

function pick(files, o) {
  let list = o.seed === null ? files : shuffle(files, o.seed);
  if (Number.isFinite(o.limit)) list = list.slice(0, o.limit);
  return list;
}

// ------------------------------------------------------- the session

async function launch(ctx, why) {
  console.log(why + ': waiting up to ' + LAUNCH_SECS + ' s for it to answer (if it offers ' +
    'to reopen or recover documents, answer it).');
  return (await listDocs(undefined, LAUNCH_SECS)) !== null;
}

async function probe(ctx) {
  let r;
  try {
    r = await ctx.checker.check(await probeDocx(), 'the probe');
  } catch (e) {
    if (!(e instanceof AbortRun)) throw e;
    if (e.hung) ctx.hung = true;
    r = e.last || {verdict: 'TIMEOUT', seconds: 0, detail: e.message};
  }
  console.log(r.verdict.padEnd(8) + ' (probe: a minimal known-good document) ' +
    secs(r.seconds));
  if (r.verdict === 'HUNG') ctx.hung = true;
  return r;
}

async function start(o) {
  const ctx = {o, hung: false};
  const running = wordPids().length > 0;
  if (!running && !(await launch(ctx, 'Microsoft Word is not running: launching it'))) {
    console.error('Word did not answer after its launch: is a dialog up in Word?');
    process.exit(2);
  }
  console.log('Skipped by design, never opened (verdict SKIPPED; they prompt on open):');
  for (const s of SKIPPED_BY_DESIGN) console.log('  - ' + s);
  if (o.corpus) console.log('  - (--corpus) files over 20 MB');
  // (a check.docx left by an earlier run is ours: closed, not counted;
  // a document that does not answer is passed over)
  const left = await closeLeftovers();
  if (left && left.closed) {
    console.log('Closed ' + left.closed + ' of ' + CHECK_NAMES.join(' / ') +
      ' left open by an earlier run.');
  }
  if (left && left.stuck) {
    // (opening a check file again would only bring that window forward: every
    // file would read as REFUSED)
    console.error('A ' + CHECK_NAMES.join(' / ') + ' is open in Word and will not close: a dialog for ' +
      'it is probably waiting in Word (such as "open read-only?"). Dismiss it, then run ' +
      'again (with --resume). Nothing was checked.');
    process.exit(2);
  }
  if (!left) console.log('WARNING: Word did not answer the clean-up of ' + CHECK_NAMES.join(' / ') + '.');
  const docs = await listDocs();
  if (docs === null) {
    console.error('Word did not answer a list of its documents: is a dialog up in Word?');
    process.exit(2);
  }
  ctx.before = docs.filter((n) => !CHECK_NAMES.includes(n));
  console.log('Word has ' + ctx.before.length + ' document(s) open; only ' + CHECK_NAMES.join(', ') +
    ' will be opened and closed.');
  ctx.checker = makeChecker({timeout: o.timeout, diagnose: o.diagnose, slowFirst: !running,
    firstTimeout: running ? 120 : LAUNCH_SECS, log: (s) => console.log(s)});
  if (!o.noProbe) {
    const r = await probe(ctx);
    if (r.verdict !== 'OK') {
      console.error('Word did not open the known-good probe' + (r.detail ? ': ' +
        r.detail : '') + '. Nothing else was checked.');
      await finish(ctx);
      process.exit(2);
    }
  }
  return ctx;
}

/**
 * Check bytes: -> {r, stop} (stop: why the run must end now). A HUNG
 * Word stops the run; with --kill-hung, when Word had no documents open
 * at the start, Word is killed, launched again and the probe reopened.
 */
async function checkOne(ctx, bytes, label, opts) {
  let r;
  try {
    r = await ctx.checker.check(bytes, label, opts);
  } catch (e) {
    if (!(e instanceof AbortRun)) throw e;
    if (e.hung) ctx.hung = true;
    // (e.last null: this file was not opened, nothing to record)
    return {r: e.last, stop: e.message};
  }
  if (r.verdict !== 'HUNG') return {r};
  ctx.hung = true;
  const msg = hungMessage(label);
  const act = hungAction(ctx.before, ctx.o.killHung);
  if (act === 'stop') return {r, stop: msg};
  if (act === 'refuse') {
    return {r, stop: msg + ' (--kill-hung: Word had documents open at the start, so it ' +
      'was not killed.)'};
  }
  console.log('--kill-hung: Word had no documents open at the start; killing it.');
  if (!(await killWord())) return {r, stop: 'Word could not be killed. ' + msg};
  if (!(await launch(ctx, 'Launching Word again'))) {
    return {r, stop: 'Word did not answer after its relaunch. ' + msg};
  }
  ctx.hung = false;
  await closeLeftovers();
  ctx.checker.slowNext();
  const p = await probe(ctx);
  if (p.verdict !== 'OK') return {r, stop: 'Word did not open the probe after its relaunch.'};
  return {r};
}

async function finish(ctx) {
  if (ctx.hung) {
    console.log('Word: not answering, so its documents were not compared with the start.');
    return false;
  }
  const left = await closeLeftovers();
  if (left && left.closed) console.log('Closed ' + left.closed + ' of ' + CHECK_NAMES.join(' / ') +
    ' left open in Word.');
  const now = await listDocs();
  if (sameDocs(ctx.before, now)) {
    console.log('Word: the same ' + now.length + ' document(s) open as at the start.');
    return true;
  }
  console.log('Word: documents open NOT as at the start: was [' + ctx.before.join(', ') +
    '], now ' + (now ? '[' + now.join(', ') + ']' : '(no answer)') + '.');
  return false;
}

// ------------------------------------------------------- plain mode

async function plain(o, idx = null) {
  if (!o.paths.length) throw new Error('give files or directories (or --corpus / --emitted)');
  const files = pick(walk(o.paths.map((p) => path.resolve(p))), o);
  const done = o.resume ? settled(readReport(o.report), {retryHung: o.retryHung}) : new Map();
  const tally = {OK: 0, REFUSED: 0, TIMEOUT: 0, COLLATERAL: 0, HUNG: 0, SKIPPED: 0};
  const bad = [];
  const kinds = {EXPECTED: [], UNEXPECTED: [], NOTE: [], 'INPUT-REFUSED': []};
  const about = (f) => {
    const rec = idx && idx.get(path.basename(f));
    return rec ? '  [' + rec.test + ': ' + rec.name + (rec.broken ? '; broken on purpose' +
      (rec.reason ? ': ' + rec.reason : '') : '') + ']' : '';
  };
  const ctx = await start(o);
  let stop = null, n = 0;
  for (const f of files) {
    const bytes = fs.readFileSync(f);
    const tpl = isTemplateName(f);
    // (the name decides the kind: the same bytes as .docx and .dotx differ)
    const sha = reportKey(bytes, f);
    let r, resumed = false;
    if (done.has(sha)) {
      r = done.get(sha);
      resumed = true;
    } else {
      const why = await skipReason(bytes);
      if (why) r = {verdict: 'SKIPPED', seconds: 0, detail: why};
      else ({r, stop} = await checkOne(ctx, bytes, rel(f), {template: tpl}));
      if (!r) break; // the run stopped before this file was opened
      if (o.report) {
        appendReport(o.report, {path: rel(f), sha256: sha, verdict: r.verdict,
          seconds: Number(r.seconds.toFixed(2)), when: new Date().toISOString(),
          detail: r.detail || undefined, repairOpens: r.repairOpens});
      }
    }
    n++;
    tally[r.verdict]++;
    const kind = idx ? emittedKind(r.verdict, idx.get(path.basename(f))) : null;
    if (kind) kinds[kind].push(rel(f) + about(f));
    if (r.verdict !== 'OK') bad.push([kind || r.verdict, rel(f) + about(f)]);
    if (!o.onlyFail || r.verdict !== 'OK' || kind) {
      console.log((kind || r.verdict).padEnd(10) + ' ' + rel(f) + '  ' +
        (resumed ? '(from report)' : secs(r.seconds)) +
        (r.repairOpens === undefined ? '' : '  repair opens: ' + r.repairOpens) +
        (r.verdict === 'SKIPPED' ? '  (' + r.detail + ')' : '') +
        (!['OK', 'REFUSED', 'SKIPPED'].includes(r.verdict) && r.detail ? '\n         ' +
          r.detail : '') + (r.verdict !== 'OK' || kind ? about(f) : ''));
    }
    if (stop) break;
  }
  console.log('');
  console.log(`${n} of ${files.length} file(s): ` + Object.entries(tally)
    .map(([k, v]) => v + ' ' + k).join(', ') + (stop ? ' (run STOPPED)' : ''));
  for (const [v, f] of bad) console.log('  ' + v.padEnd(10) + ' ' + f);
  if (tally.COLLATERAL) {
    console.log('(COLLATERAL: timed out only after an earlier file did, with no open in ' +
      'between: blamed on that file, checked again on --resume.)');
  }
  if (idx) {
    const lines = ['word-open-check --emitted, ' + new Date().toISOString(),
      `${n} of ${files.length} file(s): ` + Object.entries(tally).map(([k, v]) => v + ' ' + k)
        .join(', ') + (stop ? ' (run STOPPED)' : ''),
      `REFUSED: ${kinds.UNEXPECTED.length} UNEXPECTED, ${kinds.EXPECTED.length} EXPECTED ` +
        `(built broken on purpose), ${kinds['INPUT-REFUSED'].length} INPUT-REFUSED`, '',
      'UNEXPECTED (Word refuses a document a test wrote: a finding):',
      ...kinds.UNEXPECTED.map((x) => '  ' + x), '',
      'EXPECTED (built broken on purpose, and Word refuses it):',
      ...kinds.EXPECTED.map((x) => '  ' + x), '',
      'INPUT-REFUSED (a round trip of a corpus file Word refuses itself):',
      ...kinds['INPUT-REFUSED'].map((x) => '  ' + x), '',
      'NOTE (built broken on purpose, yet Word opens it):',
      ...kinds.NOTE.map((x) => '  ' + x), ''];
    fs.writeFileSync(path.join(path.dirname(o.report), 'emitted-summary.txt'),
      lines.join('\n'));
    console.log(lines[2]);
    console.log('Summary: ' + rel(path.join(path.dirname(o.report), 'emitted-summary.txt')));
  }
  await finish(ctx);
  if (stop) {
    console.error('STOPPED: ' + stop);
    return 2;
  }
  if (idx) return kinds.UNEXPECTED.length ? 1 : 0;
  return tally.REFUSED + tally.TIMEOUT + tally.COLLATERAL + tally.HUNG ? 1 : 0;
}

// ------------------------------------------------------- emitted mode

// The documents the tests emitted (WORD_EMIT=1: tests/moreapps/word-emit.mjs),
// with their own report beside them, always resumed.
async function emitted(o) {
  const {emitRoot, DEFAULT_DIR, readIndex} = await import('../tests/moreapps/word-emit.mjs');
  const root = emitRoot() || DEFAULT_DIR;
  if (!fs.existsSync(root)) {
    throw new Error('nothing emitted: run WORD_EMIT=1 node --test tests/moreapps/ first');
  }
  const idx = readIndex(root);
  // (a round trip of a corpus file Word itself refuses: INPUT-REFUSED, from
  // the corpus and hand-off reports)
  const refused = new Set();
  for (const r of readReport(path.join(OUTDIR, 'corpus-report.jsonl'))) {
    if (r.path && (r.original === 'REFUSED' || r.original === 'HUNG')) refused.add(r.path);
  }
  for (const r of readReport(path.join(OUTDIR, 'handoff-report.jsonl'))) {
    if (r.path && r.verdict === 'REFUSED') {
      refused.add(path.relative(CORPUS, path.resolve(ROOT, r.path)));
    }
  }
  for (const rec of idx.values()) if (refused.has(rec.name)) rec.inputRefused = true;
  return plain({...o, paths: [root], resume: true,
    report: o.report || path.join(root, '..', 'emitted-report.jsonl')}, idx);
}

// ------------------------------------------------------- corpus mode

async function resave(bytes) {
  const {readDocx, DocxError} = await import('./moreapps/!Letters/DocxRead');
  const {writeDocx} = await import('./moreapps/!Letters/DocxWrite');
  let doc;
  try {
    doc = await readDocx(bytes);
  } catch (e) {
    const code = e && e.code ? e.code + ': ' : '';
    const kind = e instanceof DocxError ? 'READER-REFUSED' : 'READER-ERROR';
    return {kind, error: code + String(e && e.message || e)};
  }
  try {
    return {bytes: await writeDocx(doc, {date: DATE})};
  } catch (e) {
    return {kind: 'WRITER-ERROR', error: String(e && e.stack || e).split('\n')
      .slice(0, 3).join(' | ')};
  }
}

function classOf(r) {
  if (r.original === 'REFUSED') return 'INPUT-REFUSED';
  if (r.original === 'HUNG') return 'INPUT-HUNG';
  if (r.original === 'SKIPPED') return 'SKIPPED';
  if (r.original === 'COLLATERAL') return 'COLLATERAL';
  if (r.original !== 'OK') return 'UNSETTLED';
  if (r.resaved === 'HUNG') return 'RESAVE-HUNG';
  if (r.resaved === 'COLLATERAL') return 'COLLATERAL';
  if (r.resaveError === 'WRITER-ERROR' || r.resaved === 'REFUSED') return 'REGRESSION';
  if (r.resaveError) return r.resaveError;
  if (r.resaved === 'OK') return 'FINE';
  return 'UNSETTLED';
}

async function corpus(o) {
  if (!fs.existsSync(CORPUS)) throw new Error('no corpus: run node tools/moreapps-corpus.mjs');
  const report = o.report || path.join(OUTDIR, 'corpus-report.jsonl');
  const summary = path.join(OUTDIR, 'corpus-summary.txt');
  const skipDir = (p) => ['handoff', 'word-check'].includes(path.relative(CORPUS, p));
  const files = pick(walk([CORPUS], {exclude: skipDir}), o);
  // the latest record per original sha256
  const last = new Map();
  for (const r of readReport(report)) if (r.sha256) last.set(r.sha256, r);
  const rows = [];
  const ctx = await start(o);
  let stop = null;
  // -> the verdict record, or null when the run stopped before opening
  // (template: by the file's name, as in plain mode, for the original and
  // for our re-save, which keeps the template content type: corpusKinds)
  const check = async (bytes, label, template = false) => {
    const res = await checkOne(ctx, bytes, label, {template});
    if (res.stop) stop = res.stop;
    return res.r;
  };
  const opts = {retryHung: o.retryHung};
  for (const f of files) {
    const size = fs.statSync(f).size;
    const name = path.relative(CORPUS, f);
    if (size > MAX_BYTES) {
      rows.push({path: name, cls: 'SKIPPED', original: 'SKIPPED', resaved: 'n/a',
        reason: 'over 20 MB'});
      console.log('SKIPPED  ' + name + '  (' + size + ' bytes, over 20 MB)');
      continue;
    }
    const bytes = fs.readFileSync(f);
    const kinds = corpusKinds(bytes, f);
    const sha = kinds.key;
    const prev = last.get(sha);
    // (resumable: a settled original, and a settled re-save of one that
    // opened, are kept; TIMEOUTs, and HUNG with --retry-hung, are redone)
    const origDone = prev && isSettled(prev.original, opts);
    const resDone = prev && prev.original === 'OK' && (prev.resaveError ||
      isSettled(prev.resaved, opts));
    let rec;
    const t0 = Date.now();
    if (origDone && (prev.original !== 'OK' || (resDone && !o.rerunResaves))) {
      rec = prev;
    } else {
      rec = {path: name, sha256: sha};
      const why = origDone ? null : await skipReason(bytes);
      if (origDone) rec.original = prev.original;
      else if (why) {
        rec.original = 'SKIPPED';
        rec.reason = why;
      } else {
        const r = await check(bytes, name, kinds.original);
        if (!r) break; // stopped before this file was opened: nothing to record
        rec.original = r.verdict;
        if (r.verdict !== 'OK' && r.detail) rec.detail = r.detail;
      }
      rec.resaved = 'n/a';
      if (rec.original === 'OK' && !stop) {
        const out = await resave(bytes);
        if (out.bytes) {
          rec.resavedSha = sha256(out.bytes);
          const r = await check(out.bytes, name + ' (our re-save)', kinds.resave);
          rec.resaved = r ? r.verdict : 'n/a';
          if (r && r.verdict !== 'OK' && r.detail) rec.resaveDetail = r.detail;
        } else {
          rec.resaveError = out.kind;
          rec.error = out.error;
        }
      }
      rec.seconds = Number(((Date.now() - t0) / 1000).toFixed(2));
      rec.when = new Date().toISOString();
      appendReport(report, rec);
    }
    const cls = classOf(rec);
    rows.push({...rec, path: name, cls});
    if (!o.onlyFail || cls !== 'FINE') {
      console.log(cls.padEnd(14) + ' original ' + rec.original.padEnd(8) + ' resaved ' +
        String(rec.resaveError || rec.resaved).padEnd(8) + ' ' + name +
        (rec === prev ? '  (from report)' : '  ' + secs(rec.seconds)));
    }
    if (stop) break;
  }
  const by = (c) => rows.filter((r) => r.cls === c);
  const lines = [
    'word-open-check --corpus, ' + new Date().toISOString(),
    rows.length + ' file(s) of ' + files.length + (stop ? ' (run STOPPED)' : ''),
    ...CLASSES.map((c) => '  ' + c.padEnd(15) + by(c).length),
    '',
    'REGRESSION (Word opens the original but not our re-save, or the writer threw):',
    ...by('REGRESSION').map((r) => '  ' + r.path + (r.error ? '  ' + r.error : '')),
    '',
    'RESAVE-HUNG (a REGRESSION: Word opens the original, our re-save hangs Word):',
    ...by('RESAVE-HUNG').map((r) => '  ' + r.path),
    '',
    'INPUT-REFUSED (Word refuses the original itself):',
    ...by('INPUT-REFUSED').map((r) => '  ' + r.path),
    '',
    'INPUT-HUNG (the original itself hangs Word: a Word-side problem, not ours):',
    ...by('INPUT-HUNG').map((r) => '  ' + r.path),
    '',
    'SKIPPED (not opened):',
    ...by('SKIPPED').map((r) => '  ' + r.path + '  (' + (r.reason || '') + ')'),
    '',
    'READER-REFUSED / READER-ERROR (our reader would not read it; no re-save):',
    ...[...by('READER-REFUSED'), ...by('READER-ERROR')].map((r) => '  ' + r.path + '  ' +
      r.error),
    '',
    'UNSETTLED (TIMEOUT: checked again on the next run; the first of a stall is probably ' +
      'the file whose dialog stopped Word):',
    ...by('UNSETTLED').map((r) => '  ' + r.path + (/first of a stall/.test(r.detail || '') ?
      '  (first of a stall: probably the prompt)' : '')),
    '',
    'COLLATERAL (timed out only after an earlier file did, with no open in between: not ' +
      'this file\u2019s fault; checked again on the next run):',
    ...by('COLLATERAL').map((r) => '  ' + r.path),
  ];
  fs.mkdirSync(OUTDIR, {recursive: true});
  fs.writeFileSync(summary, lines.join('\n') + '\n');
  console.log('');
  console.log(lines.slice(1, 2 + CLASSES.length).join('\n'));
  console.log('Report: ' + rel(report) + '; summary: ' + rel(summary));
  await finish(ctx);
  if (stop) {
    console.error('STOPPED: ' + stop);
    return 2;
  }
  return by('REGRESSION').length + by('RESAVE-HUNG').length ? 1 : 0;
}

// ------------------------------------------------------- main

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (o.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0]);
    return 0;
  }
  if (process.platform !== 'darwin') {
    console.error('word-open-check runs only on macOS (it drives Microsoft Word by AppleScript).');
    return 2;
  }
  if (!fs.existsSync(WORD_APP)) {
    console.error('Microsoft Word is not installed (' + WORD_APP + ' is missing).');
    return 2;
  }
  console.log('Checking through ' + path.join(checkDir(), CHECK_NAME).replace(
    process.env.HOME || '\0', '~'));
  try {
    if (o.emitted) return await emitted(o);
    return o.corpus ? await corpus(o) : await plain(o);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
}

process.exitCode = await main();
