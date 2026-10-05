// Package linter for .docx files: the OPC (ECMA-376 Part 2) and Word
// package rules that schema validation of single parts cannot see.
//
//   import {lintPackage} from './lint-package.mjs';
//   const {problems, facts} = lintPackage(zipParts);  // Map name -> bytes
//   node tests/moreapps/lint-package.mjs file.docx|dir ...   (CLI)
//
// problems: [{rule, level, part, detail}]. level 'error' is a rule
// of the package format or a broken reference (Word refuses or
// repairs such files); level 'word' is something real Word always
// writes but whose absence is not known to break anything.
//
// Rules ('error'): no-content-types; ct-none (a part with no content
// type); ct-dup (a Default or Override given twice); ct-orphan (an
// Override for a part that is not there); rel-id-dup; rel-missing
// (an internal relationship of a known kind whose target is not
// there); ct-generic (a part reached through a relationship of a
// known kind typed application/xml or text/xml instead of its own
// type); ct-wrong (typed something else); rid-unresolved (an r:id,
// r:embed... in a story part with no such relationship);
// note-ref-missing (a footnote/endnote reference to a note that is
// not there); note-separators (a notes part without the separator
// and continuation separator notes).
// Rules ('word'): docpr-dup (wp:docPr ids not unique in the
// document: the schema's rule, but 10 Word-made corpus files have it
// and Word opened such a file without a message), drawing-shape
// (wp:inline/anchor without
// wp:effectExtent or wp:cNvGraphicFramePr), notepr-missing (notes
// with separators that settings.xml does not name in
// w:footnotePr/w:endnotePr), no-settings, no-app.
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';

const OX = 'application/vnd.openxmlformats-';
const WML = OX + 'officedocument.wordprocessingml.';
const R06 = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
  'relationships/';
const RST = 'http://purl.oclc.org/ooxml/officeDocument/relationships/';
const PKG = 'http://schemas.openxmlformats.org/package/2006/' +
  'relationships/metadata/';
const MS = 'http://schemas.microsoft.com/office/';

const MAIN = [WML + 'document.main+xml', WML + 'template.main+xml',
  'application/vnd.ms-word.document.macroEnabled.main+xml',
  'application/vnd.ms-word.template.macroEnabledTemplate.main+xml'];

/** Relationship kind -> the content types its target may have. */
const BY_KIND = {
  officeDocument: MAIN,
  styles: [WML + 'styles+xml'], numbering: [WML + 'numbering+xml'],
  settings: [WML + 'settings+xml'], fontTable: [WML + 'fontTable+xml'],
  webSettings: [WML + 'webSettings+xml'],
  footnotes: [WML + 'footnotes+xml'], endnotes: [WML + 'endnotes+xml'],
  comments: [WML + 'comments+xml'], header: [WML + 'header+xml'],
  footer: [WML + 'footer+xml'],
  glossaryDocument: [WML + 'document.glossary+xml'],
  theme: [OX + 'officedocument.theme+xml'],
  'extended-properties': [OX + 'officedocument.extended-properties+xml'],
  extendedProperties: [OX + 'officedocument.extended-properties+xml'],
  'custom-properties': [OX + 'officedocument.custom-properties+xml'],
  customProperties: [OX + 'officedocument.custom-properties+xml'],
  customXmlProps: [OX + 'officedocument.customXmlProperties+xml'],
};
const FULL = new Map();
for (const [k, v] of Object.entries(BY_KIND)) {
  FULL.set(R06 + k, [k, v]);
  FULL.set(RST + k, [k, v]);
}
FULL.set(PKG + 'core-properties', ['core', [OX +
  'package.core-properties+xml']]);
FULL.set('http://schemas.openxmlformats.org/officedocument/2006/' +
  'relationships/metadata/core-properties', ['core', [OX +
  'package.core-properties+xml']]);
FULL.set(PKG + 'thumbnail', ['thumbnail', 'image']);
FULL.set(R06 + 'image', ['image', 'image']);
FULL.set(RST + 'image', ['image', 'image']);
FULL.set(MS + '2011/relationships/commentsExtended',
  ['commentsExtended', [WML + 'commentsExtended+xml']]);
FULL.set(MS + '2016/09/relationships/commentsIds',
  ['commentsIds', [WML + 'commentsIds+xml']]);
FULL.set(MS + '2018/08/relationships/commentsExtensible',
  ['commentsExtensible', [WML + 'commentsExtensible+xml']]);
FULL.set(MS + '2011/relationships/people',
  ['people', [WML + 'people+xml']]);
FULL.set(MS + '2007/relationships/stylesWithEffects',
  ['stylesWithEffects', ['application/vnd.ms-word.stylesWithEffects+xml']]);

/** [kind, allowed types] of a relationship type, or null. */
export function knownKind(type) {
  return FULL.get(type) || null;
}

export const GENERIC = new Set(['application/xml', 'text/xml']);
const STORY = new Set(['header', 'footer', 'footnotes', 'endnotes',
  'comments', 'glossaryDocument']);
const R_URIS = new Set([R06.slice(0, -1), RST.slice(0, -1)]);
const dec = new TextDecoder();
const local = (n) => n.slice(n.indexOf(':') + 1);
const isEl = (c) => c && typeof c === 'object' && c.name !== undefined;
const attr = (n, a) => (n.attrs.find(([k]) => local(k) === a) || [])[1];

function* walk(node, scope = new Map()) {
  let s = scope;
  for (const [k, v] of node.attrs) {
    if (k === 'xmlns' || k.startsWith('xmlns:')) {
      if (s === scope) s = new Map(scope);
      s.set(k === 'xmlns' ? '' : k.slice(6), v);
    }
  }
  yield [node, s];
  for (const c of node.children) if (isEl(c)) yield* walk(c, s);
}

export function relsNameFor(part) {
  const i = part.lastIndexOf('/');
  return part.slice(0, i + 1) + '_rels/' + part.slice(i + 1) + '.rels';
}

export function resolvePart(from, target) {
  const base = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  const out = [];
  for (const s of base.concat(target.split('/'))) {
    if (s === '' || s === '.') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  let r = out.join('/');
  try { r = decodeURIComponent(r); } catch (e) { /* keep */ }
  return r;
}

const extOf = (n) => {
  const leaf = n.slice(n.lastIndexOf('/') + 1);
  const i = leaf.lastIndexOf('.');
  return i >= 0 ? leaf.slice(i + 1).toLowerCase() : null;
};

/** The parsed root of a part, or null. */
function xml(parts, name) {
  const b = parts.get(name);
  if (!b) return null;
  try { return parseXml(dec.decode(b)).root; } catch (e) { return null; }
}

/** {defaults: Map ext -> type, overrides: Map /name lc -> type} */
function readTypes(root, add) {
  const defaults = new Map(), overrides = new Map();
  for (const c of root.children) {
    if (!isEl(c)) continue;
    if (local(c.name) === 'Default') {
      const e = (attr(c, 'Extension') || '').toLowerCase();
      if (defaults.has(e)) add('ct-dup', '[Content_Types].xml', 'Default ' + e);
      defaults.set(e, attr(c, 'ContentType'));
    } else if (local(c.name) === 'Override') {
      const p = (attr(c, 'PartName') || '').toLowerCase();
      if (overrides.has(p)) add('ct-dup', '[Content_Types].xml', 'Override ' + p);
      overrides.set(p, attr(c, 'ContentType'));
    }
  }
  return {defaults, overrides};
}

/** The relationships of a part: [{id, type, target, mode}]. */
function relsOf(parts, part, add) {
  const name = part === '' ? '_rels/.rels' : relsNameFor(part);
  const root = xml(parts, name);
  if (!root) return [];
  const out = [];
  const ids = new Set();
  for (const c of root.children) {
    if (!isEl(c) || local(c.name) !== 'Relationship') continue;
    const r = {id: attr(c, 'Id') || '', type: attr(c, 'Type') || '',
      target: attr(c, 'Target') || '', mode: attr(c, 'TargetMode')};
    if (ids.has(r.id)) add('rel-id-dup', name, r.id);
    ids.add(r.id);
    out.push(r);
  }
  return out;
}

/**
 * @param {Map<string, Uint8Array>} parts the zip entries
 * @returns {{problems: Array, facts: object}}
 */
export function lintPackage(parts) {
  const problems = [];
  const WORD = new Set(['docpr-dup', 'drawing-shape', 'notepr-missing',
    'no-settings', 'no-app']);
  const add = (rule, part, detail = '') => problems.push({rule,
    level: WORD.has(rule) ? 'word' : 'error', part, detail});
  const facts = {notes: {}, app: null};
  const lc = new Map([...parts.keys()].map((n) => [n.toLowerCase(), n]));
  const has = (n) => lc.has(n.toLowerCase());
  const ctRoot = xml(parts, '[Content_Types].xml');
  if (!ctRoot) {
    add('no-content-types', '[Content_Types].xml');
    return {problems, facts};
  }
  const types = readTypes(ctRoot, add);
  const typeOf = (n) => types.overrides.get('/' + n.toLowerCase()) ??
    types.defaults.get(extOf(n));
  for (const n of parts.keys()) {
    if (n !== '[Content_Types].xml' && !typeOf(n)) add('ct-none', n);
  }
  for (const p of types.overrides.keys()) {
    if (!has(p.slice(1))) add('ct-orphan', p);
  }
  // relationships of the package and every part that has some
  const kinds = new Map(); // part name -> kind
  const check = (from, r) => {
    if (r.mode === 'External') return;
    const k = knownKind(r.type);
    const to = resolvePart(from, r.target);
    if (!k) return;
    if (!has(to)) {
      add('rel-missing', from || '_rels/.rels', k[0] + ' -> ' + to);
      return;
    }
    const name = lc.get(to.toLowerCase());
    kinds.set(name, k[0]);
    const t = typeOf(name);
    const ok = k[1] === 'image' ? /^image\//.test(t || '') : k[1].includes(t);
    if (!ok && t) {
      add(GENERIC.has(t) ? 'ct-generic' : 'ct-wrong', name,
        k[0] + ' typed ' + t);
    }
  };
  const pkgRels = relsOf(parts, '', add);
  for (const r of pkgRels) check('', r);
  const relsByPart = new Map();
  for (const n of parts.keys()) {
    const m = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(n);
    if (!m || n === '_rels/.rels') continue;
    const owner = (m[1] || '').replace(/\/$/, '') ;
    const part = (owner ? owner + '/' : '') + m[2];
    const rels = relsOf(parts, part, add);
    relsByPart.set(part, rels);
    if (has(part)) for (const r of rels) check(part, r);
  }
  const main = [...kinds].find(([, k]) => k === 'officeDocument');
  if (!main) return {problems, facts};
  const mainName = main[0];
  const mainRels = relsByPart.get(mainName) || [];
  const partOf = (kind) => {
    const r = mainRels.find((x) => x.mode !== 'External' &&
      (knownKind(x.type) || [])[0] === kind);
    const to = r && resolvePart(mainName, r.target);
    return to && has(to) ? lc.get(to.toLowerCase()) : null;
  };
  // story parts: references resolve, notes, drawings
  const stories = [mainName, ...mainRels.filter((r) => r.mode !==
    'External' && STORY.has((knownKind(r.type) || [])[0]))
    .map((r) => lc.get(resolvePart(mainName, r.target).toLowerCase()))
    .filter(Boolean)];
  const refs = {footnote: new Set(), endnote: new Set()};
  const docPr = new Map();
  for (const s of new Set(stories)) {
    const root = xml(parts, s);
    if (!root) continue;
    const ids = new Set((relsByPart.get(s) || []).map((r) => r.id));
    for (const [n, scope] of walk(root)) {
      for (const [k, v] of n.attrs) {
        const i = k.indexOf(':');
        if (i > 0 && k.slice(0, i) !== 'xmlns' &&
          R_URIS.has(scope.get(k.slice(0, i))) && !ids.has(v)) {
          add('rid-unresolved', s, n.name + ' ' + k + '="' + v + '"');
        }
      }
      const l = local(n.name);
      if (l === 'footnoteReference' || l === 'endnoteReference') {
        refs[l.slice(0, -9)].add(attr(n, 'id'));
      } else if (l === 'docPr') {
        const id = attr(n, 'id');
        docPr.set(id, (docPr.get(id) || 0) + 1);
      } else if (l === 'inline' || l === 'anchor') {
        const names = n.children.filter(isEl).map((c) => local(c.name));
        if (names.includes('docPr') && (!names.includes('effectExtent') ||
          !names.includes('cNvGraphicFramePr'))) {
          add('drawing-shape', s, 'wp:' + l + ' has ' + names.join(','));
        }
      }
    }
  }
  for (const [id, k] of docPr) if (k > 1) add('docpr-dup', mainName, id);
  const settingsName = partOf('settings');
  const settings = settingsName && xml(parts, settingsName);
  if (!settings) add('no-settings', mainName);
  for (const kind of ['footnote', 'endnote']) {
    const name = partOf(kind + 's');
    const root = name && xml(parts, name);
    const notes = new Map();
    if (root) {
      for (const c of root.children) {
        if (isEl(c) && local(c.name) === kind) {
          notes.set(attr(c, 'id'), attr(c, 'type') || 'normal');
        }
      }
    }
    for (const id of refs[kind]) {
      if (!notes.has(id)) add('note-ref-missing', mainName, kind + ' ' + id);
    }
    if (!root) continue;
    const seps = [...notes].filter(([, t]) => t !== 'normal');
    facts.notes[kind] = {part: name, refs: refs[kind].size,
      separators: seps.map(([i, t]) => t + '=' + i).join(' ')};
    const types = new Set(seps.map(([, t]) => t));
    if (!types.has('separator') || !types.has('continuationSeparator')) {
      add('note-separators', name, seps.map((x) => x.join('=')).join(' '));
    }
    let named = null;
    if (settings) {
      for (const [n] of walk(settings)) {
        if (local(n.name) === kind + 'Pr') {
          named = n.children.filter((c) => isEl(c) &&
            local(c.name) === kind).map((c) => attr(c, 'id'));
        }
      }
    }
    facts.notes[kind].settings = named ? named.join(' ') : null;
    if (seps.length && !named) add('notepr-missing', settingsName ||
      mainName, kind);
  }
  const app = pkgRels.find((r) => /extended-properties$|extendedProperties$/
    .test(r.type));
  const appName = app && lc.get(resolvePart('', app.target).toLowerCase());
  if (!appName) add('no-app', '_rels/.rels');
  else {
    const root = xml(parts, appName);
    const a = root && root.children.find((c) => isEl(c) &&
      local(c.name) === 'Application');
    facts.app = a ? a.children.filter((c) => typeof c === 'string')
      .join('') : '';
  }
  return {problems, facts};
}

/** CLI: lint .docx files (or every .docx under a folder). */
async function main(args) {
  const {readFileSync, statSync, readdirSync} = await import('node:fs');
  const {join} = await import('node:path');
  const files = [];
  const scan = (p) => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) scan(join(p, e));
    } else if (/\.docx$/i.test(p)) files.push(p);
  };
  args.forEach(scan);
  let bad = 0;
  for (const f of files.sort()) {
    let zip;
    try { zip = await readZip(readFileSync(f)); } catch (e) {
      console.log('SKIP ' + f + ': ' + e.message);
      continue;
    }
    const {problems} = lintPackage(zip);
    const errs = problems.filter((p) => p.level === 'error');
    if (errs.length) bad++;
    console.log((errs.length ? 'FAIL ' : 'PASS ') + f);
    for (const p of problems) {
      console.log(`  ${p.level} ${p.rule} ${p.part} ${p.detail}`);
    }
  }
  console.log(`# ${files.length} files, ${bad} with errors`);
  process.exitCode = bad ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
