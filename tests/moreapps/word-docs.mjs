// Test-only helpers for the !Word layout tests: documents built from
// paragraphs and kept blocks, measured with a fixed-width fake.
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';

export const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>');
/** 8 px per UTF-16 unit, 9 px when bold. */
export const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
export const tm = () => new TextMetrics(fake);
export const O = '\uFFFC';
export const el = (name) => ({name: 'w:' + name, attrs: [], children: []});
export const raw = (n, level = 'p', text) => ({kind: 'raw', level,
  node: el(n), ...(text === undefined ? {} : {text})});

let styles = null;
/** The styles of a small real document (Normal, 11 pt). */
export async function loadStyles() {
  if (!styles) {
    const d = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x'))),
      'word/styles.xml': STYLES}));
    styles = d.styles;
  }
  return styles;
}

/** A kept block (a table). */
export const box = () => ({type: 'opaque', node: el('tbl')});
/** A paragraph: a string, or [text, opts] for newPara. */
export const para = (x) => (typeof x === 'string' ? newPara(x)
  : newPara(x[0], x[1]));

/** A one-section document; blocks are strings, [text, opts] or boxes. */
export function mkDoc(blocks, props = {extra: []}) {
  const bs = blocks.map((b) => (b && b.type ? b : para(b)));
  return {sections: [{props, blocks: bs, raw: null}], styles,
    numbering: null, parts: new Map(), rels: [], meta: {},
    rawSettings: null};
}

/** A small seeded random generator (mulberry32). */
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
