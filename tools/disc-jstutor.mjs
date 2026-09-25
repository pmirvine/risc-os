// Adds the JavaScript tutorial to the seed hard disc:
//   $.Manuals.JSTutor   the book "Programming in JavaScript", read with !Bookworm (double-click Start)
//   $.Examples.JS       its example programs (JSScript files, &F81, run with *JSRun: src/core/jsrun.js)
// and a line for the book in !Bookworm's hot list.
//
// Sources are in tools/jstutor/ (see its README): book.json lists the pages, book/<Page>.htm holds each page's
// body, examples/ the programs (tools/jstutor/examplefiles.mjs) and pics/ the screenshots (made by tools/jstutor/shots.mjs). Each page is wrapped
// in the User Guide's layout (navigation buttons, running header, rules, footer), and these comments in a
// page body are replaced:
//   <!--#listing Hello-->          the example program examples/Hello, as a <PRE> listing
//   <!--#listing Hello 3-10-->     lines 3 to 10 of it
//   <!--#pic Hello-->              the picture pics/Hello.png, centred, with its size (<!--#pic Cover 50%--> scaled)
// <H2> headings get anchors (S1, S2 ...) and go into the generated Contents page.
//
// Idempotent: replaces only Manuals.JSTutor and Examples.JS. Re-run after `node tools/disc.mjs` and
// tools/basicwimp-demo.mjs (which rebuilds $.Examples).   Usage: node tools/disc-jstutor.mjs [--check]
//   --check  only check the sources (listings, pictures, links), write nothing

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exampleFiles } from './jstutor/examplefiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/jstutor');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const CHECK = process.argv.includes('--check');
const problems = [], warnings = [];

const book = JSON.parse(fs.readFileSync(path.join(SRC, 'book.json'), 'utf8'));
const TITLE = book.title;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const latin1 = (s, where) => { if (/[^\n\x20-\x7e\xa0-\xff]/.test(s)) problems.push(`${where}: only Latin-1 text (and no tabs) please`); return s; };

// ---------------------------------------------------------------- pages
const pngSize = (file) => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const exampleText = (name) => {
  const f = path.join(SRC, 'examples', ...name.split('/'));
  if (!fs.existsSync(f)) { problems.push(`listing: no example '${name}'`); return ''; }
  return fs.readFileSync(f, 'utf8');
};

function expand(body, where) {
  body = body.replace(/<!--#listing\s+(\S+)(?:\s+(\d+)-(\d+))?\s*-->/g, (_, name, a, b) => {
    let lines = exampleText(name).replace(/\n$/, '').split('\n');
    if (a) lines = lines.slice(+a - 1, +b);
    for (const l of lines) if (l.length > 70) problems.push(`${where}: listing ${name} has a line over 70 characters: ${l}`);
    return `<PRE>\n${esc(lines.join('\n'))}\n</PRE>`;
  });
  body = body.replace(/<!--#pic\s+(\S+)(?:\s+(\d+)%)?\s*-->/g, (_, name, pct) => {
    const f = path.join(SRC, 'pics', name + '.png');
    if (!fs.existsSync(f)) {   // (building still works without it, so shots.mjs can make it from the disc's programs)
      (CHECK ? problems : warnings).push(`${where}: no picture pics/${name}.png`);
      return `<P><CENTER>[picture ${name}]</CENTER>`;
    }
    let { w, h } = pngSize(f);
    if (pct) { w = Math.round(w * pct / 100); h = Math.round(h * pct / 100); }
    return `<P><CENTER><IMG SRC="PICS/${name}" WIDTH=${w} HEIGHT=${h}></CENTER>`;
  });
  let n = 0;
  const sections = [];
  body = body.replace(/<H2>([\s\S]*?)<\/H2>/gi, (_, t) => { n++; sections.push({ id: `S${n}`, title: t.replace(/<[^>]+>/g, '').trim() }); return `<A NAME=S${n}></A>\n<H2>${t}</H2>`; });
  return { body, sections };
}

const nav = (i) => {
  const btn = (href, img) => `<A HREF="${href}"><IMG ALIGN=BOTTOM SRC="${img}" WIDTH=69 HEIGHT=24 BORDER=0></A>`;
  const next = book.pages[i + 1], prev = book.pages[i - 1];
  return [next && btn(`${next.file}.htm`, 'next'), prev && btn(`${prev.file}.htm`, 'prev'), btn('Start.htm', 'top'), btn('Contents.htm', 'content')].filter(Boolean).join(' ');
};
const heading = (p) => (p.num ? (/^[A-Z]$/.test(p.num) ? `Appendix ${p.num} - ${p.title}` : `${p.num}  ${p.title}`) : p.title);

const pages = book.pages.map((p) => {
  if (p.kind === 'contents') return { ...p, sections: [] };
  const f = path.join(SRC, 'book', p.file + '.htm');
  if (!fs.existsSync(f)) { problems.push(`no page book/${p.file}.htm`); return { ...p, body: '', sections: [] }; }
  const src = latin1(fs.readFileSync(f, 'utf8'), `book/${p.file}.htm`);
  // < > & in text must be written &lt; &gt; &amp; (e.g. an arrow function's =>)
  src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[A-Za-z][^<>]*>/g, '').split('\n').forEach((l, i) => {
    if (/[<>]|&(?![a-z]+;|#\d+;)/i.test(l)) problems.push(`book/${p.file}.htm:${i + 1}: write < > & as &lt; &gt; &amp;: ${l.trim().slice(0, 60)}`);
  });
  const { body, sections } = expand(src, `book/${p.file}.htm`);
  return { ...p, body, sections };
});

function wrap(p, i, body) {
  if (p.kind === 'cover') {
    return `<HTML><HEAD><TITLE>${TITLE}</TITLE></HEAD>\n<BODY BGCOLOR="#ffffff">\n${body}\n<P><CENTER>${nav(i)}</CENTER>\n</BODY></HTML>\n`;
  }
  return `<HTML><HEAD><TITLE>${heading(p)}</TITLE></HEAD>\n<BODY BGCOLOR="#ffffff">\n${nav(i)}<P>\n${TITLE}<P>\n<HR>\n<H1>${heading(p)}</H1>\n<HR>\n${body}\n<HR>\n<ADDRESS>${TITLE} - RISC OS 3.71 in the browser</ADDRESS>\n${nav(i)}\n</BODY></HTML>\n`;
}

function contents() {
  const out = [];
  for (const p of pages) {
    if (p.kind) continue;
    out.push(`<H4><A HREF="${p.file}.htm">${heading(p).replace(/^(\d+) {2}/, '$1 - ')}</A></H4>`);
    if (p.sections.length) out.push('<UL>', ...p.sections.map((s) => `<BR><A HREF="${p.file}.htm#${s.id}">${s.title}</A>`), '</UL>');
  }
  return out.join('\n');
}

const html = pages.map((p, i) => ({ name: p.file, text: wrap(p, i, p.kind === 'contents' ? contents() : p.body) }));

// links between pages must resolve
const names = new Set(html.map((h) => h.name.toLowerCase()));
for (const h of html) {
  for (const m of h.text.matchAll(/HREF="([^"#]*)(#[^"]*)?"/gi)) {
    const target = m[1];
    if (!target || /^file:/i.test(target)) continue;
    const page = target.replace(/\.htm$/i, '').toLowerCase();
    if (!names.has(page)) { problems.push(`${h.name}: link to missing page '${target}'`); continue; }
    if (m[2]) {
      const t = html.find((x) => x.name.toLowerCase() === page);
      const anchor = m[2].slice(1).toLowerCase();
      if (!new RegExp(`NAME=["]?${anchor}\\b`, 'i').test(t.text)) problems.push(`${h.name}: link to missing anchor '${target}${m[2]}'`);
    }
  }
}

// ---------------------------------------------------------------- examples
const ex = exampleFiles(problems);

if (problems.length) {
  console.error(problems.map((p) => '  ' + p).join('\n'));
  console.error(`disc-jstutor: ${problems.length} problem(s)`);
  process.exit(1);
}
if (warnings.length) console.warn(warnings.map((p) => '  warning: ' + p).join('\n'));
if (CHECK) { console.log(`JSTutor sources OK: ${html.length} pages, ${ex.filter((e) => !e.dir).length} example files`); process.exit(0); }

// ---------------------------------------------------------------- write
const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const dirNode = (parent, name) => {
  let c = parent.children.find((x) => x.name === name);
  if (!c) { c = { name, type: name.startsWith('!') ? 'app' : 'dir', children: [] }; parent.children.push(c); }
  return c;
};
const put = (hostDir, node, name, type, data) => {
  const host = path.join(hostDir, encodeName(name));
  fs.writeFileSync(host, data);
  node.children.push({ name, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
};
const sortTree = (n) => { if (!n.children) return; n.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })); n.children.forEach(sortTree); };

// the book
const manuals = dirNode(mf.root, 'Manuals');
manuals.children = manuals.children.filter((c) => c.name !== 'JSTutor');
const bookNode = { name: 'JSTutor', type: 'dir', children: [] };
manuals.children.push(bookNode);
const BOOK = path.join(DISC, 'HardDisc4', 'Manuals', 'JSTutor');
fs.rmSync(BOOK, { recursive: true, force: true });
fs.mkdirSync(path.join(BOOK, 'PICS'), { recursive: true });
for (const h of html) put(BOOK, bookNode, `${h.name}/htm`, 'faf', Buffer.from(h.text, 'latin1'));
const BOOKB = path.join(DISC, 'HardDisc4', 'Manuals', 'Manual', 'BOOKB');
for (const b of ['next', 'prev', 'top', 'content']) put(BOOK, bookNode, b, '695', fs.readFileSync(path.join(BOOKB, b.toUpperCase())));
const pics = { name: 'PICS', type: 'dir', children: [] };
bookNode.children.push(pics);
for (const f of fs.readdirSync(path.join(SRC, 'pics')).filter((f) => f.endsWith('.png')).sort()) {
  put(path.join(BOOK, 'PICS'), pics, f.slice(0, -4), 'b60', fs.readFileSync(path.join(SRC, 'pics', f)));
}

// the examples
const examplesNode = dirNode(mf.root, 'Examples');
examplesNode.children = examplesNode.children.filter((c) => c.name !== 'JS');
const exNode = { name: 'JS', type: 'dir', children: [] };
examplesNode.children.push(exNode);
const EX = path.join(DISC, 'HardDisc4', 'Examples', 'JS');
fs.rmSync(EX, { recursive: true, force: true });
fs.mkdirSync(EX, { recursive: true });
for (const e of ex) {
  let node = exNode, host = EX;
  for (const p of e.parts.slice(0, -1)) { node = node.children.find((c) => c.name === p); host = path.join(host, encodeName(p)); }
  const leaf = e.parts[e.parts.length - 1];
  if (e.dir) { node.children.push({ name: leaf, type: leaf.startsWith('!') ? 'app' : 'dir', children: [] }); fs.mkdirSync(path.join(host, encodeName(leaf)), { recursive: true }); }
  else put(host, node, leaf, e.type, e.data);
}
sortTree(bookNode); sortTree(exNode);
manuals.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

// !Bookworm's hot list
const hot = path.join(DISC, 'HardDisc4', 'Manuals', encodeName('!Bookworm'), 'User', 'HotList');
if (fs.existsSync(hot)) {
  let t = fs.readFileSync(hot, 'latin1').replace(/\s*<li><a href="file:\/\/ADFS::HardDisc4\/\$\/Manuals\/JSTutor\/[^\n]*/g, '');
  t = t.replace(/<\/ul>/i, `    <li><a href="file://ADFS::HardDisc4/$/Manuals/JSTutor/Start.htm">${TITLE}</a>\n</ul>`);
  fs.writeFileSync(hot, t, 'latin1');
  const walk = (n) => { for (const c of n.children ?? []) { if (c.path === path.relative(DISC, hot).split(path.sep).join('/')) c.size = Buffer.byteLength(t, 'latin1'); walk(c); } };
  walk(mf.root);
}

let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`$.Manuals.JSTutor (${html.length} pages) and $.Examples.JS (${ex.filter((e) => !e.dir).length} files) written; manifest now ${files} files`);
