// Printers output stage: turn a document into an HTML page sized to the printer's paper and "print" it
// by opening a new browser window (window.print() → the browser's print / Save as PDF dialogue).
// Falls back to a hidden <iframe> when pop-ups are blocked.

import { vfs } from '../../core/vfs.js';
import { spritesFromFile } from '../../core/sprites.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Page CSS for a printer/paper: {w, h} in millipoints, landscape flag. */
export function pageCss(paper, landscape) {
  const mm = (mp) => (mp / 72000 * 25.4).toFixed(1) + 'mm';
  const w = paper ? mm(paper.pw) : '210mm', h = paper ? mm(paper.ph) : '297mm';
  const size = landscape ? `${h} ${w}` : `${w} ${h}`;
  return `@page { size: ${size}; margin: 12mm; }
html, body { margin: 0; background: #fff; color: #000; }
body { font: 11pt Trinity, "Times New Roman", serif; }
pre { font: 10pt Corpus, "Courier New", monospace; white-space: pre-wrap; margin: 0; }
.title { font: bold 11pt Homerton, Helvetica, Arial, sans-serif; border-bottom: 1px solid #000; margin-bottom: 4mm; padding-bottom: 1mm; }
.ln { color: #555; }
img.pic { image-rendering: pixelated; display: block; margin: 0 0 6mm 0; max-width: 100%; }
.placeholder { font: 12pt Homerton, Helvetica, Arial, sans-serif; border: 1px dashed #000; padding: 10mm; text-align: center; }
@media screen { body { padding: 12mm; } }`;
}

/**
 * Open the output window synchronously (so it counts as a user gesture) and return a writer:
 *   out.write({title, html, css}) - fills the page and prints it.
 */
export function openOutput(title) {
  let win = null;
  try { win = window.open('', '_blank', 'width=820,height=1000'); } catch { /* blocked */ }
  let frame = null;
  if (!win) {
    frame = document.createElement('iframe');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0' });
    document.body.appendChild(frame);
    win = frame.contentWindow;
  } else {
    try { win.document.title = title; win.document.body.textContent = 'Printing…'; } catch { /* */ }
  }
  return {
    window: win,
    popup: !frame,
    write({ title: t = title, html, css = '' }) {
      const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      const doc = win.document;
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t)}</title>
<link rel="stylesheet" href="${base}assets/fonts/fonts.css"><style>${css}</style></head><body>${html}</body></html>`);
      doc.close();
      const go = () => {
        try { win.focus(); win.print(); } catch { /* */ }
        if (frame) setTimeout(() => frame.remove(), 60000);
      };
      // give fonts/images a moment to load
      const imgs = [...doc.images].filter((i) => !i.complete);
      Promise.all([doc.fonts?.ready, ...imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))].filter(Boolean))
        .then(() => setTimeout(go, 150), () => setTimeout(go, 150));
    },
    close() { try { if (frame) frame.remove(); else win.close(); } catch { /* */ } },
  };
}

/** Text → HTML with the printer's text options (title, line numbers, columns, scale). */
export function textToHtml(text, title, opts = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const w = String(lines.length).length;
  const body = lines.map((l, i) => (opts.lineNumbers ? `<span class="ln">${String(i + 1).padStart(w)} </span>` : '') + esc(l)).join('\n');
  const scale = opts.textScale && opts.textScale !== 100 ? ` style="font-size:${(10 * opts.textScale / 100).toFixed(1)}pt"` : '';
  const cols = opts.columns > 1 ? ` style="column-count:${opts.columns}"` : '';
  return (opts.title ? `<div class="title">${esc(title)}</div>` : '') + `<div${cols}><pre${scale}>${body}</pre></div>`;
}

const TEXT_TYPES = new Set([0xFFF, 0xFEB, 0xFE1 /* Make */, 0xFD7 /* TaskObey */, 0xF79 /* CSS */, 0xFFE /* Command */, 0xDFE /* CSV */]);

/**
 * Render a file to {title, html} (or null if the type isn't understood: the caller asks "print as text?").
 * renderers: Map filetype → async (bytes, path) => {html}|{canvas}|string.
 */
export async function renderFile(path, filetype, opts = {}, renderers = new Map(), { asText = false } = {}) {
  const leaf = vfs.leaf(path);
  const title = path;
  const data = await vfs.readFile(path);
  const latin1 = () => { let s = ''; for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]); return s; };
  if (asText || TEXT_TYPES.has(filetype)) return { title: leaf, html: textToHtml(latin1(), title, opts) };
  const custom = renderers.get(filetype);
  if (custom) {
    const r = await custom(data, path);
    if (r?.canvas) return { title: leaf, html: `<img class="pic" style="width:100%" src="${r.canvas.toDataURL()}">` };
    if (r?.html) return { title: leaf, html: r.html };
    if (typeof r === 'string') return { title: leaf, html: r };
  }
  switch (filetype) {
    case 0xFFB: {   // BASIC: print the listing
      try {
        const { parseProgram, programToText } = await import('../../basic/tokens.js');
        const p = parseProgram(data);
        if (p) return { title: leaf, html: textToHtml(programToText(p.lines), title, opts) };
      } catch { /* fall through */ }
      return { title: leaf, html: textToHtml(latin1(), title, opts) };
    }
    case 0xFF9: {   // Sprite file: each sprite at its true size (180 OS units per inch)
      const map = spritesFromFile(data);
      const parts = [];
      for (const s of map.values()) {
        try {
          const c = await s.canvas();
          parts.push(`<img class="pic" src="${c.toDataURL()}" style="width:${(s.osW / 180).toFixed(3)}in;height:${(s.osH / 180).toFixed(3)}in" alt="${esc(s.name)}">`);
        } catch { /* */ }
      }
      return { title: leaf, html: parts.join('') || `<div class="placeholder">${esc(leaf)}: empty sprite file</div>` };
    }
    case 0xC85: case 0x695: case 0xB60: {   // JPEG, GIF, PNG
      const mime = { 0xC85: 'image/jpeg', 0x695: 'image/gif', 0xB60: 'image/png' }[filetype];
      let bin = ''; for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      return { title: leaf, html: `<img class="pic" style="max-width:100%" src="data:${mime};base64,${btoa(bin)}">` };
    }
    case 0xFAF: {   // HTML
      const t = latin1();
      const m = /<body[^>]*>([\s\S]*?)(<\/body>|$)/i.exec(t);
      return { title: leaf, html: m ? m[1] : t };
    }
    case 0xAFF:   // Drawfile: Draw's reusable renderer (normally registered by Draw's boot hook)
      try {
        const { printDrawfile } = await import('../Draw/drawfile.js');
        return { title: leaf, html: (await printDrawfile(data)).html };
      } catch (e) {
        return { title: leaf, html: `<div class="placeholder">Drawfile '${esc(leaf)}'<br><br>${esc(e.message ?? e)}</div>` };
      }
    default:
      return null;
  }
}
