// !Bookworm - HTML parser: a small re-implementation of what Acorn's HTMLLib (1995/96) hands to the
// browser: a flat list of "HStream" tokens, each a run of text (or an image / rule / list bullet)
// carrying its style flags (vendor/.../BookWorm/HTMLLib/h/tags). Only the tags HTMLLib knows are
// interpreted; everything else (scripts do not exist here) is ignored, so nothing from the page ever
// reaches the DOM. Semantics follow tags.h:
//   B/STRONG -> bold, I/EM/CITE -> italic, TT/CODE/SAMP/KBD/VAR -> fixed, H1-H6, PRE, P, BR, HR,
//   UL/OL/MENU/DIR (+LI bullets), DL/DT/DD, BLOCKQUOTE, ADDRESS, CENTER, A HREF/NAME, IMG,
//   TITLE, BODY BGCOLOR/TEXT/LINK/VLINK. FONT is parsed by HTMLLib but ignored by the renderer.
// P / BR / LI are flags on the *next* token (they force a line break before it, Reformat.c).

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', shy: '­',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§', uml: '¨', ordf: 'ª',
  laquo: '«', not: '¬', macr: '¯', deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ',
  para: '¶', middot: '·', cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½',
  frac34: '¾', iquest: '¿', times: '×', divide: '÷', szlig: 'ß', thorn: 'þ', THORN: 'Þ', eth: 'ð', ETH: 'Ð',
  bull: '•', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', trade: '™',
};
// accented letters: &Aacute; etc.
const ACC = { grave: '̀', acute: '́', circ: '̂', tilde: '̃', uml: '̈', ring: '̊', cedil: '̧' };
function entity(name) {
  if (name[0] === '#') {
    const n = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(n) && n > 0 ? String.fromCharCode(n) : null;
  }
  if (ENTITIES[name] != null) return ENTITIES[name];
  if (ENTITIES[name.toLowerCase()] != null && !/^(thorn|eth)$/i.test(name)) return ENTITIES[name.toLowerCase()];
  const m = /^([A-Za-z])(grave|acute|circ|tilde|uml|ring|cedil)$/.exec(name);
  if (m) { const c = (m[1] + ACC[m[2]]).normalize('NFC'); return c.length === 1 ? c : null; }
  if (name === 'AElig') return 'Æ';
  if (name === 'aelig') return 'æ';
  if (name === 'Oslash') return 'Ø';
  if (name === 'oslash') return 'ø';
  return null;
}
export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);?/g, (m, n) => entity(n) ?? m);
}

function parseAttrs(s) {
  const a = {};
  const re = /([A-Za-z][-A-Za-z0-9_:]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g;
  let m;
  while ((m = re.exec(s))) {
    let v = m[2];
    if (v == null) v = '';
    else if (/^["']/.test(v)) v = v.slice(1, -1);
    a[m[1].toUpperCase()] = decodeEntities(v);
  }
  return a;
}

/** Parse a colour attribute (#rrggbb, rrggbb or one of HTMLLib's 16 names) to CSS, or null. */
const COLNAMES = { black: '#000000', silver: '#c0c0c0', gray: '#808080', white: '#ffffff', maroon: '#800000', red: '#ff0000',
  purple: '#800080', fuchsia: '#ff00ff', green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00',
  navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff' };
export function parseColour(v) {
  if (!v) return null;
  v = v.trim();
  if (COLNAMES[v.toLowerCase()]) return COLNAMES[v.toLowerCase()];
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v);
  return m ? '#' + m[1].toLowerCase() : null;
}

const HEADS = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };
const BOLD = ['B', 'STRONG'], ITAL = ['I', 'EM', 'CITE'], FIXED = ['TT', 'CODE', 'SAMP', 'KBD', 'VAR'];
const LISTS = ['UL', 'OL', 'MENU', 'DIR'];

/**
 * Parse an HTML document into {title, tokens, names, body}. tokens: [{kind:'text'|'img'|'hr'|'bullet',
 * text, bold, italic, tt, pre, h, p, br, li, dt, center, address, blockquote, indent, href, img:{src,w,h,align,border}}]
 * names: Map(lower-case anchor name -> token index). body: {bgcolor, text, link, vlink}.
 */
export function parseHTML(src) {
  const tokens = [];
  const names = new Map();
  const body = {};
  let title = null;
  const st = { b: 0, i: 0, tt: 0, pre: 0, h: 0, center: 0, address: 0, blockquote: 0, list: 0, dd: 0, dt: 0, href: null };
  let pend = { p: false, br: false };
  let pendNames = [];
  let atBreak = true;          // at a block boundary: leading white space is dropped
  let inTitle = false, titleBuf = '';

  const flags = () => ({
    bold: st.b > 0, italic: st.i > 0 || st.blockquote > 0, tt: st.tt > 0, pre: st.pre > 0, h: st.h,
    center: st.center > 0, address: st.address > 0, blockquote: st.blockquote > 0,
    dt: st.dt > 0, indent: st.list + (st.dd ? 1 : 0), href: st.href,
  });
  const emit = (t) => {
    Object.assign(t, { ...flags(), ...t });
    if (pend.p) t.p = true;
    if (pend.br) t.br = true;
    pend = { p: false, br: false };
    for (const n of pendNames) if (!names.has(n)) names.set(n, tokens.length);
    pendNames = [];
    tokens.push(t);
  };
  const block = () => { atBreak = true; };

  const text = (raw) => {
    if (inTitle) { titleBuf += raw; return; }
    let s = decodeEntities(raw);
    if (st.pre) {
      s = s.replace(/\r\n?/g, '\n');
      if (atBreak && s.startsWith('\n')) s = s.slice(1);
      // expand tabs to 8 columns
      if (s.includes('\t')) {
        let out = '', col = 0;
        for (const c of s) {
          if (c === '\t') { const n = 8 - (col % 8); out += ' '.repeat(n); col += n; } else { out += c; col = c === '\n' ? 0 : col + 1; }
        }
        s = out;
      }
      if (!s) return;
      emit({ kind: 'text', text: s });
      atBreak = s.endsWith('\n');
      return;
    }
    s = s.replace(/[ \t\r\n\f]+/g, ' ');
    if (atBreak) s = s.replace(/^ +/, '');
    if (!s) return;
    emit({ kind: 'text', text: s });
    atBreak = s.endsWith(' ');
  };

  const tag = (name, attrs, end) => {
    if (inTitle && !(name === 'TITLE' && end)) return;
    if (HEADS[name]) {
      st.h = end ? 0 : HEADS[name];
      if (!end && /^cent/i.test(attrs.ALIGN ?? '')) { st.center++; st._hc = true; }
      if (end && st._hc) { st.center = Math.max(0, st.center - 1); st._hc = false; }
      block(); return;
    }
    if (BOLD.includes(name)) { st.b = Math.max(0, st.b + (end ? -1 : 1)); return; }
    if (ITAL.includes(name)) { st.i = Math.max(0, st.i + (end ? -1 : 1)); return; }
    if (FIXED.includes(name)) { st.tt = Math.max(0, st.tt + (end ? -1 : 1)); return; }
    if (LISTS.includes(name)) { st.list = Math.max(0, st.list + (end ? -1 : 1)); if (!st.list) st.dd = 0; block(); return; }
    switch (name) {
      case 'TITLE': if (!end) { inTitle = true; titleBuf = ''; } else if (inTitle) { inTitle = false; title = decodeEntities(titleBuf).replace(/\s+/g, ' ').trim(); } return;
      case 'BODY':
        if (!end) {
          for (const k of ['BGCOLOR', 'TEXT', 'LINK', 'VLINK']) { const c = parseColour(attrs[k]); if (c && !body[k.toLowerCase()]) body[k.toLowerCase()] = c; }
        }
        return;
      case 'P':
        if (!end) { pend.p = true; block(); }
        return;
      case 'BR': if (!end) { pend.br = true; block(); } return;
      case 'HR': if (!end) { emit({ kind: 'hr' }); block(); } return;
      case 'PRE': case 'LISTING': case 'XMP': st.pre = Math.max(0, st.pre + (end ? -1 : 1)); block(); return;
      case 'CENTER': case 'CENTRE': st.center = Math.max(0, st.center + (end ? -1 : 1)); block(); return;
      case 'ADDRESS': st.address = Math.max(0, st.address + (end ? -1 : 1)); block(); return;
      case 'BLOCKQUOTE': st.blockquote = Math.max(0, st.blockquote + (end ? -1 : 1)); block(); return;
      case 'LI': if (!end) { emit({ kind: 'bullet', li: true }); atBreak = true; } return;
      case 'DL': if (end) { st.dd = 0; st.dt = 0; } block(); return;
      case 'DT': st.dd = 0; st.dt = end ? 0 : 1; block(); return;
      case 'DD': st.dt = 0; st.dd = end ? 0 : 1; block(); return;
      case 'A':
        if (end) { st.href = null; return; }
        if (attrs.NAME) pendNames.push(attrs.NAME.toLowerCase());
        if ('HREF' in attrs) st.href = attrs.HREF.trim();
        return;
      case 'IMG': {
        if (end) return;
        const w = parseInt(attrs.WIDTH, 10), h = parseInt(attrs.HEIGHT, 10);
        const al = (attrs.ALIGN ?? '').toUpperCase();
        const border = attrs.BORDER != null ? Math.max(0, parseInt(attrs.BORDER, 10) || 0) : 2;
        emit({ kind: 'img', img: { src: (attrs.SRC ?? '').trim(), w: w > 0 ? w : 0, h: h > 0 ? h : 0, align: al === 'TOP' || al === 'TEXTTOP' ? 'top' : al === 'MIDDLE' || al === 'ABSMIDDLE' ? 'middle' : 'bottom', border, alt: attrs.ALT ?? '' } });
        atBreak = false;
        return;
      }
      default: return;       // unknown / unsupported tags (FONT, TABLE, forms, LISPWORKS…) are ignored
    }
  };

  // --- tokenizer
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { text(src.slice(i)); break; }
    if (lt > i) text(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    const m = /^<(\/?)([A-Za-z][A-Za-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(src.slice(lt, lt + 4096));
    if (!m) {
      if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
      text('<'); i = lt + 1; continue;           // a stray '<'
    }
    i = lt + m[0].length;
    const name = m[2].toUpperCase();
    tag(name, m[1] ? {} : parseAttrs(m[3]), !!m[1]);
    // no text inside these
    if (!m[1] && (name === 'SCRIPT' || name === 'STYLE')) {
      const e = src.toLowerCase().indexOf('</' + name.toLowerCase(), i);
      i = e < 0 ? n : e;
    }
  }
  if (inTitle) title = decodeEntities(titleBuf).replace(/\s+/g, ' ').trim();
  for (const nm of pendNames) if (!names.has(nm)) names.set(nm, tokens.length);
  return { title, tokens, names, body };
}

/** Plain text file -> preformatted document (the browser shows text files in the fixed font). */
export function parseText(src) {
  const s = src.replace(/\r\n?/g, '\n');
  return { title: null, tokens: s ? [{ kind: 'text', text: s, pre: true, tt: false, h: 0, indent: 0, href: null }] : [], names: new Map(), body: {} };
}
