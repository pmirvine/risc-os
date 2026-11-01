// Hand documents the tests write to the real-Word checker
// (tools/word-open-check.mjs --emitted; docs/apps/Letters.md, "Checking
// files in real Word"). A no-op unless WORD_EMIT is set:
//   WORD_EMIT=1      -> tests/moreapps/word-check-out/emitted/ (git-ignored)
//   WORD_EMIT=<dir>  -> that directory
// Never inside tests/moreapps/corpus/ (the corpus walkers would read the
// emitted files back and the round trips emit their outputs again: a
// feedback loop), and never a document whose name says it came from the
// emit root. Never throws: emitting must not fail a test.
//
// A sample, not everything: each document is written once (by content),
// as <name>-<10 hex of sha256>.docx; per stem (the name without trailing
// digits / hex: one corpus file's variants; for buildDocx the test file
// and line that builds it: one call site's variants) at most
// WORD_EMIT_STEM_MAX (6): the first, then only variants of a
// size not kept yet (sizes in ~10 % buckets); once the stem is full, a
// variant over 10 % larger than its largest replaces the latest kept one
// but the first. At most WORD_EMIT_MAX (1500) in all. The caps hold for
// the whole run: every test process reads the one index (index.jsonl)
// before it emits (processes running at once may overshoot slightly).
// index.jsonl beside them records each file: {file, name, test, broken,
// reason, size, sha256, stem}; a replaced file gets {file, gone: true}.
//
// Rule: a test helper that produces the final bytes of a document it
// saves calls emit(name, bytes) (roundtrip-lib.mjs roundTrip,
// build-docx.mjs buildDocx); a document built broken ON PURPOSE says so:
// emit(name, bytes, {broken: 'why'}) (buildDocx(parts, {broken: 'why'}),
// or markBroken(bytes, 'why') on what a helper returned), and the checker
// counts Word refusing it, or a round trip of it, as EXPECTED. Then
//   WORD_EMIT=1 node --test tests/moreapps/ &&
//   node tools/word-open-check.mjs --emitted
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const DEFAULT_DIR = fileURLToPath(new URL('./word-check-out/emitted/',
  import.meta.url));
const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));
export const INDEX = 'index.jsonl';

let st = null;
// sha256 (10 hex) of every document emit() was told is broken on purpose,
// sampled out or not -> its reason: a round trip {from} one inherits it
const brokenInputs = new Map();
const hash10 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 10);

const fresh = (dir) => ({dir, seen: new Set(), count: 0, stems: new Map(),
  stemOfFile: new Map(), fileOfSha: new Map(), offset: 0});

// Fold the index's new lines (any process's) into the state: the caps
// hold for the whole run, every test process sharing the one index.
function sync() {
  const f = path.join(st.dir, INDEX);
  let size;
  try { size = fs.statSync(f).size; } catch { return; }
  if (size <= st.offset) return;
  const fd = fs.openSync(f, 'r');
  const buf = Buffer.alloc(size - st.offset);
  fs.readSync(fd, buf, 0, buf.length, st.offset);
  fs.closeSync(fd);
  const end = buf.lastIndexOf(10);
  if (end < 0) return;
  st.offset += end + 1;
  for (const line of buf.subarray(0, end).toString('utf8').split('\n')) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.gone) {
      const stem = st.stemOfFile.get(r.file);
      const kept = stem && st.stems.get(stem);
      if (kept) {
        const i = kept.findIndex((k) => k.file === r.file);
        if (i >= 0) { kept.splice(i, 1); st.count--; }
      }
      continue;
    }
    if (!r.file || !r.sha256 || r.update) continue;
    st.seen.add(r.sha256);
    st.fileOfSha.set(r.sha256, r.file);
    const stem = r.stem || stemOf(r.name);
    const kept = st.stems.get(stem) || [];
    kept.push({file: r.file, size: r.size, bucket: bucket(r.size)});
    st.stems.set(stem, kept);
    st.stemOfFile.set(r.file, stem);
    st.count++;
  }
}

/** The emit root from the environment, or null when emitting is off. */
export const emitRoot = (env = process.env) => {
  const v = env.WORD_EMIT;
  if (!v || v === '0') return null;
  return v === '1' ? DEFAULT_DIR : path.resolve(v);
};

export const safeName = (name) => (String(name || 'doc')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 60)) || 'doc';

/** A name's stem: trailing digits, hex and separators stripped. */
export const stemOf = (name) => {
  let s = safeName(name).replace(/\.docx$/i, '');
  for (let k = 0; k < 4; k++) {
    s = s.replace(/[-_.]*(?:[0-9a-f]{6,}|\d+)$/i, '').replace(/[-_.]+$/, '');
  }
  return s || 'doc';
};

const bucket = (n) => Math.round(Math.log(Math.max(n, 1)) / Math.log(1.1));

/**
 * The calling test file and line, {test, line, outer} ({test: 'doc'} if
 * none); outer: the outermost line of that test file on the stack (the
 * test itself, when line is a helper's).
 */
export function callerSite() {
  const stack = String(new Error().stack).split('\n');
  let first = null;
  for (const line of stack) {
    const m = /([^/\\(]+)\.test\.mjs:(\d+)/.exec(line);
    if (!m) continue;
    if (!first) first = {test: m[1], line: Number(m[2]), outer: Number(m[2])};
    else if (m[1] === first.test) first.outer = Number(m[2]);
  }
  if (first) return first;
  // (an async stack can lose the test's frame: the test file the runner
  // started this process for)
  const m = /([^/\\]+)\.test\.mjs$/.exec(process.argv[1] || '');
  return {test: m ? m[1] : 'doc', line: 0};
}

/** The calling test file's name ('doc' if none is found), for emit's name. */
export const callerName = () => callerSite().test;

/** A name for a fixture: the test file and the line building it. */
export const fixtureName = () => {
  const {test, line} = callerSite();
  return test + '-L' + line;
};

const inside = (dir, root) => {
  const r = path.relative(root, dir);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/**
 * Write bytes for the Word checker (see the header). name may be a
 * function giving it (called only when emitting). opts: {broken} (true or
 * the reason: built broken on purpose), {stem} (the group it is sampled
 * in; default the name's stem), {from} (the bytes it was made from: a
 * round trip of a document built broken on purpose is marked broken too),
 * {env}. -> the file written, or null (off, a repeat, sampled out, over a
 * cap, or an error).
 */
export function emit(name, bytes, {broken = false, stem: stem0, from = null,
  env = process.env} = {}) {
  try {
    const dir = emitRoot(env);
    if (!dir || !bytes || !bytes.length) return null;
    if (broken) brokenInputs.set(hash10(bytes), broken === true ? 'broken' : broken);
    if (!broken && from && from.length) {
      const why = brokenInputs.get(hash10(from));
      if (why) broken = 'made from a document broken on purpose: ' + why;
    }
    if (inside(path.resolve(dir), CORPUS)) return null;
    if (!st || st.dir !== dir) st = fresh(dir);
    sync();
    const max = Number(env.WORD_EMIT_MAX || 1500);
    const stemMax = Number(env.WORD_EMIT_STEM_MAX || 6);
    const label = String(typeof name === 'function' ? name() : name);
    // (no feedback: a document read from the emit root is not emitted again)
    if (/word-check-out|(^|[/-])emitted[/-]/.test(label)) return null;
    const hex = hash10(bytes);
    if (st.seen.has(hex)) return null;
    const stem = stem0 || stemOf(label);
    const kept = st.stems.get(stem) || [];
    const b = bucket(bytes.length);
    let drop = null;
    if (kept.length >= stemMax) {
      const largest = Math.max(...kept.map((k) => k.size));
      if (kept.length < 2 || bytes.length <= largest * 1.1) return null;
      drop = kept.pop(); // the latest kept, never the first
    } else if (kept.length && kept.some((k) => k.bucket === b)) {
      return null;
    }
    if (!drop && st.count >= max) return null;
    st.seen.add(hex);
    fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, safeName(label) + '-' + hex + '.docx');
    fs.writeFileSync(file, bytes);
    const site = callerSite();
    const rec = {file: path.basename(file), name: label, test: site.test + ':' + site.line +
      (site.outer && site.outer !== site.line ? '<' + site.outer : ''),
      broken: !!broken, reason: typeof broken === 'string' ? broken : undefined,
      size: bytes.length, sha256: hex, stem};
    const lines = [JSON.stringify(rec)];
    if (drop) {
      try { fs.unlinkSync(path.join(dir, drop.file)); } catch { /* gone */ }
      lines.unshift(JSON.stringify({file: drop.file, gone: true}));
      kept.push(drop); // (sync() takes it out, with the rest of the index)
    }
    // (the state follows from the index alone: sync() reads these lines)
    fs.appendFileSync(path.join(dir, INDEX), lines.join('\n') + '\n');
    sync();
    return file;
  } catch {
    return null;
  }
}

/**
 * Mark bytes a test built broken on purpose, when the helper that built
 * them cannot be told (a one-line reason): the file already emitted for
 * them is marked in the index, and round trips {from} them inherit it.
 * -> the bytes (for chaining). A no-op without WORD_EMIT; never throws.
 */
export function markBroken(bytes, reason = 'broken', env = process.env) {
  try {
    const dir = emitRoot(env);
    if (!dir || !bytes || !bytes.length) return bytes;
    const hex = hash10(bytes);
    brokenInputs.set(hex, reason);
    if (!st || st.dir !== dir) st = fresh(dir);
    sync();
    const file = st.fileOfSha.get(hex);
    if (file) {
      fs.appendFileSync(path.join(dir, INDEX), JSON.stringify({file, update: true,
        broken: true, reason}) + '\n');
    }
  } catch { /* never fails a test */ }
  return bytes;
}

/** The index of an emit root: file name -> its latest record (gone ones left out). */
export function readIndex(dir) {
  const out = new Map();
  const f = path.join(dir, INDEX);
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.gone) out.delete(r.file);
      else if (r.update) {
        if (out.has(r.file)) out.set(r.file, {...out.get(r.file), ...r, update: undefined});
      } else out.set(r.file, r);
    } catch { /* torn line */ }
  }
  return out;
}

/** For tests of emit itself: forget what this process emitted. */
export function resetEmit() {
  st = null;
  brokenInputs.clear();
}
