// The core of tools/word-open-check.mjs: does real Microsoft Word (for
// Mac, driven by AppleScript through osascript) open a .docx?
//
// Word is sandboxed: a file outside its container needs a one-time
// "grant file access" per file. So every file checked is copied to ONE
// fixed path, <dir>/check.docx (dir: $WORD_CHECK_DIR, else
// $HOME/word-open-check), overwritten IN PLACE (same inode: the grant
// is tied to that file, which is never deleted, renamed or remade).
//
// A file opens (OK) when Word's document count rises and a document
// named check.docx is there after the open; Word refuses a bad file
// silently (no error, no new document: REFUSED). An osascript error, an
// AppleEvent timeout or the watchdog killing osascript is TIMEOUT: Word
// is not answering (a dialog is up), which says nothing about the file.
// Only documents named check.docx are ever closed; Word is never quit.
//
// RTF (bytes starting {\rtf) goes through its own fixed file,
// <dir>/check.rtf, the same way: Word opens RTF only under an .rtf
// name (RTF in check.docx is refused silently, even a minimal
// known-good one), and check.rtf needs its own one-time grant.
//
// The process runner is injectable ({runner}) so all of this is tested
// without Word (tests/moreapps/word-open-check.test.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';

export const CHECK_NAME = 'check.docx';
export const MARKER = '.opened-once';
export const RTF_NAME = 'check.rtf';
export const RTF_MARKER = '.opened-once-rtf';
export const WORD_APP = '/Applications/Microsoft Word.app';
export const ABORT_AFTER = 3;

export const checkDir = (env = process.env) =>
  env.WORD_CHECK_DIR || path.join(os.homedir(), 'word-open-check');

export const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');

export const grantHint = (file) => 'If Word asks for file access, choose ' +
  file.replace(os.homedir(), '~') + ' and Grant Access';

// ------------------------------------------------------- check.docx

/**
 * Write bytes over `file` in place: an existing file is opened 'r+',
 * truncated and rewritten (same inode); a missing one is created. The
 * file is never deleted or renamed.
 */
export function overwriteInPlace(file, bytes) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  let fd;
  try {
    fd = fs.openSync(file, 'r+');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    fd = fs.openSync(file, 'wx');
  }
  try {
    fs.ftruncateSync(fd, 0);
    let at = 0;
    while (at < bytes.length) {
      at += fs.writeSync(fd, bytes, at, bytes.length - at, at);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// ------------------------------------------------------- AppleScript

// argv: posix path, seconds, mode ("plain" | "repair"), and the name
// of the fixed file (check.docx when not given). Closes any document
// of that name left open first, then opens, then closes every one
// (by index, highest first). Never touches another document.
// "repair" (--diagnose only): also closes every document whose name was
// not open before the call (repair opens a broken package untitled).
export const OPEN_SCRIPT = `on run argv
  set c_path to item 1 of argv
  set c_secs to (item 2 of argv) as integer
  set c_mode to item 3 of argv
  set c_name to "check.docx"
  if (count of argv) > 3 then set c_name to item 4 of argv
  set c_leftover to 0
  set c_openErr to 0
  tell application "Microsoft Word"
    repeat with i from (count of documents) to 1 by -1
      try
        if (name of document i) is c_name then
          close document i saving no
          set c_leftover to c_leftover + 1
        end if
      end try
    end repeat
    set c_n0 to count of documents
    set c_names0 to name of every document
    with timeout of c_secs seconds
      try
        if c_mode is "repair" then
          open file name c_path read only true repair true showing repairs false
        else
          open file name c_path read only true
        end if
      on error e number num
        set c_openErr to num
      end try
    end timeout
    if c_openErr is -1712 then return "TIMEDOUT"
    delay 0.3
    set c_n1 to count of documents
    set c_found to 0
    set c_made to 0
    repeat with i from c_n1 to 1 by -1
      try
        set c_nm to name of document i
        if c_nm is c_name then
          set c_found to c_found + 1
          close document i saving no
        else if c_mode is "repair" and c_names0 does not contain c_nm then
          set c_made to c_made + 1
          close document i saving no
        end if
      end try
    end repeat
    set c_n2 to count of documents
  end tell
  set c_res to "RESULT leftover=" & c_leftover & " n0=" & c_n0 & " n1=" & c_n1
  return c_res & " found=" & c_found & " made=" & c_made & " n2=" & c_n2 & " err=" & c_openErr
end run
`;

// Closes every document named check.docx or check.rtf (a run's first
// and last step). A document that does not answer is passed over
// (counted as stuck when it is one of those that would not close).
export const CLOSE_SCRIPT = `on run argv
  set c_closed to 0
  set c_stuck to 0
  tell application "Microsoft Word"
    with timeout of 20 seconds
      repeat with i from (count of documents) to 1 by -1
        set c_nm to ""
        try
          set c_nm to name of document i
        end try
        if c_nm is "check.docx" or c_nm is "check.rtf" then
          try
            close document i saving no
            set c_closed to c_closed + 1
          on error
            set c_stuck to c_stuck + 1
          end try
        end if
      end repeat
    end timeout
  end tell
  return "CLOSED " & c_closed & " STUCK " & c_stuck
end run
`;

// The names of the documents open in Word, one per line. argv: the
// seconds to wait (a launch of Word takes longer).
export const LIST_SCRIPT = `on run argv
  set c_secs to (item 1 of argv) as integer
  set c_out to ""
  tell application "Microsoft Word"
    with timeout of c_secs seconds
      repeat with i from 1 to (count of documents)
        set c_out to c_out & (name of document i) & linefeed
      end repeat
    end timeout
  end tell
  return "LIST" & linefeed & c_out
end run
`;

// The cheapest question: does Word answer at all? (after an open timed
// out: a dialog waiting still answers; a hung Word does not)
export const PING_SCRIPT = `on run argv
  tell application "Microsoft Word"
    with timeout of 10 seconds
      set c_n to count of documents
    end timeout
  end tell
  return "PING " & c_n
end run
`;

/**
 * The real runner: osascript reading the script from stdin, killed by a
 * watchdog after timeoutMs. -> {code, stdout, stderr, killed}.
 */
export function osascript(script, args, timeoutMs) {
  return new Promise((resolve) => {
    const ch = spawn('osascript', ['-', ...args.map(String)],
      {stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '', killed = false;
    const dog = setTimeout(() => {
      killed = true;
      ch.kill('SIGKILL');
    }, timeoutMs);
    ch.stdout.on('data', (d) => { stdout += d; });
    ch.stderr.on('data', (d) => { stderr += d; });
    ch.on('error', (e) => {
      clearTimeout(dog);
      resolve({code: -1, stdout, stderr: stderr + String(e), killed});
    });
    ch.on('close', (code) => {
      clearTimeout(dog);
      resolve({code, stdout, stderr, killed});
    });
    ch.stdin.end(script);
  });
}

// ------------------------------------------------------- verdicts

/**
 * The verdict from one OPEN_SCRIPT run: {verdict: OK|REFUSED|TIMEOUT,
 * detail, counts}. Errors and timeouts are TIMEOUT, never REFUSED.
 */
export function classify(res) {
  if (res.killed) return {verdict: 'TIMEOUT', detail: 'watchdog killed osascript'};
  const out = String(res.stdout || '').trim();
  if (res.code !== 0) {
    const msg = String(res.stderr || '').trim().split('\n').pop();
    return {verdict: 'TIMEOUT', detail: 'osascript error: ' + msg};
  }
  if (out === 'TIMEDOUT') return {verdict: 'TIMEOUT', detail: 'AppleEvent timed out'};
  const m = /^RESULT (.*)$/m.exec(out);
  if (!m) return {verdict: 'TIMEOUT', detail: 'unexpected output: ' + out.slice(0, 80)};
  const counts = {};
  for (const kv of m[1].split(' ')) {
    const [k, v] = kv.split('=');
    counts[k] = Number(v);
  }
  const opened = counts.n1 > counts.n0 && counts.found > 0;
  return {verdict: opened ? 'OK' : 'REFUSED', detail: '', counts};
}

export const parseList = (res) => {
  if (res.killed || res.code !== 0) return null;
  const lines = String(res.stdout).split('\n');
  if (lines[0].trim() !== 'LIST') return null;
  return lines.slice(1).map((s) => s.replace(/\r$/, '')).filter((s) => s !== '');
};

/**
 * The run must stop: .last the verdict of the file being checked (null:
 * that file was not opened, nothing to record), .first the file the
 * stall began with, .hung Word stopped answering.
 */
export class AbortRun extends Error {}

export const stallMessage = (first) => 'a dialog for ' + first + ' is probably waiting ' +
  'in Word; dismiss it, then rerun with --resume.';

/**
 * Does Word answer a trivial request (count of documents, ~15 s)?
 * 'ok'; 'modal' (an error comes back at once: Word answers but its
 * object model does not, as while a modal dialog is up); 'dead' (no
 * answer at all: the watchdog, or an AppleEvent timeout -1712).
 */
export async function pingWord(runner = osascript) {
  const res = await runner(PING_SCRIPT, [], 15000);
  if (!res.killed && res.code === 0 && /^PING \d+/.test(String(res.stdout).trim())) return 'ok';
  if (res.killed || /-1712|timed out/i.test(String(res.stderr))) return 'dead';
  return 'modal';
}

/**
 * A checker for one run. check(bytes, label) -> {verdict, seconds,
 * detail, repairOpens?}. The first open, while the marker file is
 * missing (the tool never had a file open) or with {slowFirst} (Word was
 * just launched), waits firstTimeout seconds: time for the owner to grant
 * access once.
 *
 * An open that times out is followed by a ping: no answer at all is HUNG
 * (the file hung Word: the caller stops or kills Word); an error back
 * (modal) stops the run at once (AbortRun: a dialog for this file is up);
 * an answer is TIMEOUT, and the start of a stall: before the next file
 * Word is pinged and the probe opened with a short wait (stallTimeout);
 * if that fails a dialog is still up and the run stops (AbortRun, .last
 * null: the next file is not opened). A TIMEOUT with no open in between
 * since the last one is COLLATERAL (blamed on the first: not settled).
 * ABORT_AFTER TIMEOUTs in a row stop the run too (the fallback).
 */
export function makeChecker({runner = osascript, dir = checkDir(), timeout = 40,
  firstTimeout = 120, stallTimeout = 10, stallProbe = true, diagnose = false,
  slowFirst = false, log = () => {}, now = () => Date.now()} = {}) {
  const file = path.join(dir, CHECK_NAME);
  // (RTF: its own fixed file and grant, see the header)
  const kinds = {docx: {file, marker: path.join(dir, MARKER), name: CHECK_NAME,
    warned: false}, rtf: {file: path.join(dir, RTF_NAME),
    marker: path.join(dir, RTF_MARKER), name: RTF_NAME, warned: false}};
  let timeouts = 0, slow = slowFirst, stall = null;
  const run = async (mode, secs, k = kinds.docx) => classify(await runner(
    OPEN_SCRIPT, k === kinds.docx ? [k.file, secs, mode] :
      [k.file, secs, mode, k.name], (secs + 15) * 1000));
  const abort = (msg, last, extra = {}) => Object.assign(new AbortRun(msg), {last,
    first: stall && stall.first}, extra);
  return {
    file,
    /** The next open waits firstTimeout (Word was relaunched). */
    slowNext() { slow = true; },
    async check(bytes, label = 'this file') {
      if (stall) {
        // a file timed out last time: is a dialog still up?
        const ps = await pingWord(runner);
        if (ps === 'dead') {
          throw abort('Word is not responding since ' + stall.first + '. Force quit Word ' +
            '(Apple menu > Force Quit), then run again with --resume.', null, {hung: true});
        }
        if (ps === 'modal') throw abort(stallMessage(stall.first), null);
        if (stallProbe) {
          overwriteInPlace(file, await probeDocx());
          const pr = await run('plain', stallTimeout);
          if (pr.verdict !== 'OK') throw abort(stallMessage(stall.first), null);
          stall = null;
        }
      }
      const k = isRtfBytes(bytes) ? kinds.rtf : kinds.docx;
      const fresh = !fs.existsSync(k.marker);
      if (fresh && !k.warned) {
        k.warned = true;
        log('NOTE: ' + grantHint(k.file) + ' (waiting up to ' + firstTimeout + ' s).');
      }
      const secs = fresh || slow ? firstTimeout : timeout;
      slow = false;
      overwriteInPlace(k.file, bytes);
      const t0 = now();
      const r = await run('plain', secs, k);
      const out = {verdict: r.verdict, seconds: (now() - t0) / 1000, detail: r.detail};
      if (r.counts && r.counts.leftover) out.detail = 'closed a ' + k.name + ' left open';
      if (r.verdict !== 'TIMEOUT') {
        timeouts = 0;
        stall = null;
      } else {
        const ps = await pingWord(runner);
        out.seconds = (now() - t0) / 1000;
        if (ps === 'dead') {
          timeouts = 0;
          stall = null;
          out.verdict = 'HUNG';
          out.detail = (r.detail ? r.detail + '; ' : '') + 'Word stopped answering ' +
            'altogether (not even the number of its documents)';
          return out;
        }
        const why = r.detail ? r.detail + '; ' : '';
        if (stall) {
          out.verdict = 'COLLATERAL';
          out.detail = why + 'timed out after ' + stall.first + ' did, with no open in ' +
            'between: probably that file’s dialog, not this file';
        } else {
          stall = {first: label};
          out.detail = why + 'Word did not open it but still answers: a dialog is ' +
            'probably up (the first of a stall: probably the prompt). ' + grantHint(k.file);
        }
        if (ps === 'modal') throw abort(stallMessage(stall.first), out);
        if (++timeouts >= ABORT_AFTER) {
          throw abort(ABORT_AFTER + ' TIMEOUTs in a row: ' + stallMessage(stall.first), out);
        }
        return out;
      }
      if (r.verdict === 'OK' && fresh) {
        fs.writeFileSync(k.marker, new Date().toISOString() + '\n');
      }
      if (r.verdict === 'REFUSED' && fresh) {
        out.detail = 'no file has opened yet: if Word showed an access dialog ' +
          'that was cancelled, this is not the file’s fault';
      }
      if (r.verdict === 'REFUSED' && diagnose) {
        const d = await run('repair', timeout, k);
        out.repairOpens = d.verdict === 'TIMEOUT' ? null :
          (d.counts.found + d.counts.made) > 0;
      }
      return out;
    },
  };
}

/** The names of Word's open documents, or null if Word did not answer. */
export async function listDocs(runner = osascript, secs = 20) {
  return parseList(await runner(LIST_SCRIPT, [secs], (secs + 10) * 1000));
}

/**
 * Close any check.docx (or check.rtf) left open: -> {closed, stuck} (stuck: would not
 * close), or null if Word did not answer.
 */
export async function closeLeftovers(runner = osascript) {
  const res = await runner(CLOSE_SCRIPT, [], 30000);
  const m = !res.killed && res.code === 0 &&
    /^CLOSED (\d+)(?: STUCK (\d+))?/.exec(String(res.stdout).trim());
  return m ? {closed: Number(m[1]), stuck: Number(m[2] || 0)} : null;
}

/** Two lists of names hold the same documents (order ignored). */
export const sameDocs = (a, b) => !!a && !!b && a.length === b.length &&
  [...a].sort().join('\n') === [...b].sort().join('\n');

// ------------------------------------------------------- Word's process

/** Word's process ids (pgrep -x), [] when it is not running. */
export function wordPids() {
  try {
    return execFileSync('pgrep', ['-x', 'Microsoft Word'], {encoding: 'utf8'})
      .split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

/**
 * --kill-hung may kill Word only when the run's start snapshot shows it
 * had no documents open (nothing of the owner's can be lost).
 */
export const mayKill = (before) => Array.isArray(before) && before.length === 0;

/** After a HUNG: 'stop' (the default), 'kill' (--kill-hung, nothing open), or 'refuse'. */
export const hungAction = (before, killHung) => !killHung ? 'stop' :
  mayKill(before) ? 'kill' : 'refuse';

export const hungMessage = (label) => 'Word is not responding on ' + label + '. Force quit ' +
  'Word (Apple menu > Force Quit), then run again with --resume.';

/**
 * Kill a hung Word (SIGTERM, then SIGKILL after 10 s: neither asks
 * anything) and wait for it to be gone. -> true when it is gone.
 * {pids, kill, sleep} are injectable for tests.
 */
export async function killWord({pids = wordPids, kill = process.kill.bind(process),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))} = {}) {
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    for (const pid of pids()) {
      try { kill(pid, sig); } catch { /* gone already */ }
    }
    for (let i = 0; i < 20 && pids().length; i++) await sleep(500);
    if (!pids().length) return true;
  }
  return false;
}

// ------------------------------------------------------- files

export const NOT_ZIP = 'not a zip: encrypted or legacy container (Word prompts for a ' +
  'password / converts)';
export const WRITE_PROTECTION = 'write protection: Word asks to open read-only';
export const MAIL_MERGE = 'mail merge: prompts by design';
export const HUGE = 'huge: a part over 20 MB unzipped (Word works on it for minutes, not answering)';
const HUGE_PART = 20 * 1024 * 1024;

/** What is skipped by design, for the start-of-run notice. */
export const SKIPPED_BY_DESIGN = [
  'not a zip (an encrypted or legacy container): Word prompts for a password or converts',
  'w:writeProtection in the settings: Word asks whether to open read-only',
  'w:mailMerge in the settings: Word asks about the data source',
  'a part over 20 MB unzipped (a hostile size): Word works on it for minutes',
];

/** RTF (`{\rtf` at the start): opened through check.rtf. */
export const isRtfBytes = (bytes) => bytes.length >= 5 &&
  Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '{\\rtf';

/**
 * Why Word would prompt on opening these bytes, so the file is SKIPPED
 * unopened: NOT_ZIP, HUGE, WRITE_PROTECTION or MAIL_MERGE; null to open it.
 * (w:documentProtection, even with a password hash, prompts only on
 * unprotecting: opened.)
 */
export async function skipReason(bytes) {
  if (isRtfBytes(bytes)) return null;
  if (!(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 &&
    bytes[3] === 4)) return NOT_ZIP;
  const {readZip} = await import('../moreapps/!WimpLib/Zip');
  let z;
  try {
    z = await readZip(bytes);
  } catch {
    return null; // Word's own verdict on a broken zip
  }
  for (const b of z.values()) if (b.length > HUGE_PART) return HUGE;
  for (const [n, b] of z) {
    if (!/(^|\/)settings\.xml$/i.test(n)) continue;
    const x = Buffer.from(b).toString('latin1');
    if (/<(\w+:)?writeProtection[\s>/]/.test(x)) return WRITE_PROTECTION;
    if (/<(\w+:)?mailMerge[\s>/]/.test(x)) return MAIL_MERGE;
  }
  return null;
}

/** Every .docx (and .rtf) under the paths (a file as given), sorted, no repeats. */
export function walk(paths, {exclude = () => false} = {}) {
  const out = new Set();
  const visit = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (exclude(p)) return;
      for (const n of fs.readdirSync(p).sort()) visit(path.join(p, n));
    } else if (st.isFile() && /\.(docx|rtf)$/i.test(p) && !path.basename(p).startsWith('~$')) {
      if (!exclude(p)) out.add(p);
    }
  };
  for (const p of paths) {
    const st = fs.statSync(p);
    if (st.isFile()) out.add(p); else visit(p);
  }
  return [...out].sort();
}

/** A reproducible shuffle (mulberry32 over the seed). */
export function shuffle(list, seed) {
  let a = (Number(seed) >>> 0) || 1;
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------- reports

/**
 * --emitted: Word refusing a document built broken on purpose (its index
 * record says broken) is EXPECTED, a round trip of a corpus file Word
 * refuses itself (inputRefused) INPUT-REFUSED, any other REFUSED is
 * UNEXPECTED; a broken one that opens is a NOTE. Else null.
 */
export const emittedKind = (verdict, rec) => verdict === 'REFUSED' ?
  (rec && rec.broken ? 'EXPECTED' : rec && rec.inputRefused ? 'INPUT-REFUSED' :
    'UNEXPECTED') :
  verdict === 'OK' && rec && rec.broken ? 'NOTE' : null;

/** Append one record to a JSON-lines report (made if missing). */
export function appendReport(file, rec) {
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  // (after a torn last line, start a new one)
  let torn = false;
  try {
    const st = fs.statSync(file);
    if (st.size) {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, st.size - 1);
      fs.closeSync(fd);
      torn = b[0] !== 10;
    }
  } catch { /* a new report */ }
  fs.appendFileSync(file, (torn ? '\n' : '') + JSON.stringify(rec) + '\n');
}

/** The report's records, in order (a torn last line is skipped). */
export function readReport(file) {
  if (!file || !fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* torn line */ }
  }
  return out;
}

/** A verdict that resume keeps (HUNG unless retryHung); TIMEOUT is redone. */
export const isSettled = (v, {retryHung = false} = {}) => v === 'OK' || v === 'REFUSED' ||
  v === 'SKIPPED' || (v === 'HUNG' && !retryHung);

/** sha256 -> the latest settled record (see isSettled). */
export function settled(records, opts) {
  const out = new Map();
  for (const r of records) {
    if (isSettled(r.verdict, opts)) out.set(r.sha256, r);
    else if (r.sha256) out.delete(r.sha256);
  }
  return out;
}

// ------------------------------------------------------- the probe

const PROBE_PARTS = [
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.' +
    'relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.' +
    'openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
  ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/' +
    '2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>word-open-check probe</w:t></w:r></w:p></w:body></w:document>'],
];

/** A minimal known-good .docx: the run's first open proves Word can open check.docx. */
export async function probeDocx() {
  const {writeZip} = await import('../moreapps/!WimpLib/Zip');
  const enc = new TextEncoder();
  return writeZip(PROBE_PARTS.map(([n, s]) => [n, enc.encode(s)]),
    {date: new Date(2020, 0, 1)});
}
