// !Bookworm - file: URLs <-> RISC OS paths (Browser.c browser_pathname_to_url / translate_pathname).
// A URL is "file://" + a RISC OS path with '.' and '/' swapped after the first ':', e.g.
//   ROManual:BOOKB.TOC/HTM  <->  file://ROManual:BOOKB/TOC.HTM
// Relative links resolve in URL space ('..' = parent directory). Pure module (no DOM / VFS).

export const FILEMETHOD = 'file://';

/** browser_translate_pathname: swap '/' and '.' after the first ':' */
export function translate(s) {
  const i = s.indexOf(':');
  if (i < 0) return s;
  return s.slice(0, i) + s.slice(i).replace(/[./]/g, (c) => (c === '/' ? '.' : '/'));
}
export function pathToURL(path) { return /^file:/i.test(path) ? path : FILEMETHOD + translate(path); }
export function splitURL(url) {
  const h = url.indexOf('#');
  return h < 0 ? { base: url, frag: '' } : { base: url.slice(0, h), frag: url.slice(h + 1) };
}

/** Resolve href against the page URL. Returns an absolute file: URL, or null for network schemes. */
export function resolveURL(base, href) {
  href = String(href ?? '').trim();
  if (/^file:/i.test(href)) return href;
  if (/^(https?|ftp|mailto|news|gopher|telnet|wais):/i.test(href)) return null;
  const b = splitURL(base).base;
  if (href === '' ) return b;
  if (href.startsWith('#')) return b + href;
  const rest = b.replace(/^file:\/*/i, '');
  // root = everything up to the last ':' of the first component ("ROManual:", "ADFS::")
  const first = rest.split('/')[0];
  const ci = first.lastIndexOf(':');
  const root = ci >= 0 ? first.slice(0, ci + 1) : '';
  const segs = rest.slice(root.length).split('/');
  segs.pop();                                        // leaf of the base page
  const { base: hb, frag } = splitURL(href);
  let hs = hb;
  if (hs.startsWith('/')) { segs.length = 0; hs = hs.slice(1); }
  for (const s of hs.split('/')) {
    if (s === '..') { if (segs.length) segs.pop(); } else if (s !== '.' && s !== '') segs.push(s);
  }
  return FILEMETHOD + root + segs.join('/') + (frag ? '#' + frag : '');
}

/**
 * URL -> canonical RISC OS path, or null. exists(path) returns the canonical path if the object exists.
 * FileCore (ADFS E format) truncates names longer than 10 characters, which the manual relies on
 * (links to "BOOK3_2.HTM" find the file "BOOK3_2/HT").
 */
export function urlToPath(url, exists) {
  const p = translate(splitURL(url).base.replace(/^file:\/*/i, ''));
  const r = exists(p);
  if (r) return r;
  const i = p.lastIndexOf(':');
  const pre = i >= 0 ? p.slice(0, i + 1) : '';
  const parts = p.slice(pre.length).split('.');
  return exists(pre + parts.map((s) => (s.length > 10 ? s.slice(0, 10) : s)).join('.'));
}
