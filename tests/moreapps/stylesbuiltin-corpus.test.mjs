// The quick styles and the Word 2013+ Heading / Title look
// (./StylesBuiltin, ./StylesBuiltinMore) compared with the same
// styles in Word-made files of the corpus (tests/moreapps/corpus,
// optional and git-ignored: skipped without it). Report only: a
// table of the differences is printed, nothing is forced equal.
// A file counts as Word 2013+ when docProps/app.xml names Microsoft
// Office Word with AppVersion 15 or later; the theme's major font
// tells the look it was made for (Calibri Light: the Office
// 2013-2022 theme that new documents carry, Aptos Display: the 2023
// theme with its own, larger definitions). The handoff, word-check
// and converted folders hold files this program wrote or Word
// re-saved from them, so they are left out. Matching is by stored
// name, case-insensitive, whatever the id; Based on / Next / Link
// are compared by the names they point at.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {builtinStyle} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {moreIds} from '../../tools/moreapps/!Letters/StylesBuiltinMore';

const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));
const LEFT_OUT = /^(handoff|word-check|converted)\//;
const IDS = [...moreIds, 'Heading1', 'Heading2', 'Heading3',
  'Heading4', 'Heading5', 'Heading6', 'Title'];

function find(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$'))
      out.push(q);
  }
  return out.sort();
}

const text = (b) => (b ? new TextDecoder().decode(b) : '');
const local = (n) => String(n).split(':').pop();

/** A style's key fields -> Map field -> string. `nameOf` id -> name. */
function fieldsOf(s, nameOf) {
  const out = new Map();
  const put = (k, v) => {
    if (v !== undefined && v !== null) out.set(k, String(v));
  };
  for (const k of ['basedOn', 'next', 'link']) {
    put(k, s[k] === undefined ? undefined
      : String(nameOf(s[k])).toLowerCase());
  }
  put('uiPriority', s.uiPriority);
  put('qFormat', s.qFormat ? 1 : undefined);
  for (const part of ['pPr', 'rPr']) {
    const o = s[part] || {};
    for (const [k, v] of Object.entries(o)) {
      if (k !== 'extra') put(part + '.' + k, JSON.stringify(v));
    }
    for (const n of o.extra || []) {
      const at = new Map((n.attrs || []).map(([k, v]) =>
        [local(k), v]));
      if (local(n.name) === 'color') {
        // the theme reference, and apart from it the cached value
        put(part + '.color(theme)', [at.get('themeColor'),
          at.get('themeTint') && 'tint ' + at.get('themeTint'),
          at.get('themeShade') && 'shade ' + at.get('themeShade')]
          .filter(Boolean).join(' '));
        put(part + '.color(val)', at.get('val'));
        continue;
      }
      put(part + '.' + local(n.name), serialize(n)
        .replace(/<\/?w:[A-Za-z]+/, '').replace(/\/?>$/, '').trim() ||
        'on');
    }
  }
  return out;
}

async function wordFiles() {
  const out = [];
  for (const f of find(CORPUS)) {
    const name = path.relative(CORPUS, f).split(path.sep).join('/');
    if (LEFT_OUT.test(name)) continue;
    let zip;
    try { zip = await readZip(new Uint8Array(fs.readFileSync(f))); }
    catch { continue; }
    const app = text(zip.get('docProps/app.xml'));
    const v = /<AppVersion>(\d+)/.exec(app);
    if (!/Microsoft Office Word/.test(app) || !v || +v[1] < 15)
      continue;
    out.push({f, name});
  }
  return out;
}

const era = (major) => (major === 'Calibri Light' ? '2013-22'
  : major === 'Aptos Display' ? '2023+' : String(major));

describe('quick styles against Word-made corpus files', async () => {
  const have = fs.existsSync(CORPUS) && find(CORPUS).length > 0;
  it('compares the definitions (report only)', {skip: !have &&
    'tests/moreapps/corpus is missing (optional, git-ignored)'},
  async () => {
    const ours = new Map(IDS.map((id) => [id, builtinStyle(id)]));
    const ourName = (id) => (builtinStyle(id) || {name: id}).name;
    const byName = new Map([...ours].map(([id, s]) =>
      [s.name.toLowerCase(), id]));
    const rows = [], seen = [];
    for (const {f, name} of await wordFiles()) {
      let doc;
      try { doc = await readDocx(new Uint8Array(fs.readFileSync(f))); }
      catch { continue; }
      const t = doc.styles;
      if (!t) continue;
      const nameOf = (id) => (t.styles.get(id) || {name: id}).name;
      const e = era(t.theme && t.theme.major);
      for (const s of t.styles.values()) {
        const id = typeof s.name === 'string'
          ? byName.get(s.name.toLowerCase()) : undefined;
        if (!id) continue;
        seen.push([name, id]);
        const a = fieldsOf(ours.get(id), ourName);
        const b = fieldsOf(s, nameOf);
        for (const k of new Set([...a.keys(), ...b.keys()])) {
          if (a.get(k) === b.get(k)) continue;
          rows.push({style: id, field: k, ours: a.get(k) ?? '-',
            file: b.get(k) ?? '-', era: e, name});
        }
      }
    }
    // the table, then per style, field and file value: how many
    // files of each look agree on it
    const w = [16, 24, 30, 30, 8];
    const line = (c) => c.slice(0, 5).map((x, i) => String(x)
      .slice(0, w[i])
      .padEnd(w[i])).join(' ') + ' ' + c[5];
    console.log('Quick styles vs Word-made corpus files: ' +
      seen.length + ' definitions in ' +
      new Set(seen.map(([n]) => n)).size + ' files');
    console.log(line(['style', 'field', 'ours', 'file', 'look',
      'file name']));
    for (const r of rows) {
      console.log(line([r.style, r.field, r.ours, r.file, r.era,
        r.name]));
    }
    const agree = new Map();
    for (const r of rows) {
      const k = [r.style, r.field, r.ours, r.file, r.era].join('\t');
      agree.set(k, (agree.get(k) || 0) + 1);
    }
    console.log('Agreement (files with the same differing value):');
    for (const [k, n] of [...agree].sort()) {
      const [s, fld, o, fv, e] = k.split('\t');
      console.log(line([s, fld, o, fv, e, n + ' file(s)']));
    }
    assert.ok(Array.isArray(rows));
  });
});
