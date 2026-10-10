// Test-only helper: assembles a .docx from XML strings with our own
// writeZip, so no binary fixtures need to be committed.
//
//   await buildDocx({'word/document.xml': documentXml(body), ...}, opts)
//
// [Content_Types].xml, _rels/.rels and word/_rels/document.xml.rels
// are generated unless given in `parts` (or turned off with opts).
import {writeZip} from '../../tools/moreapps/!WimpLib/Zip';

export const W_NS =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PKG_REL_NS =
  'http://schemas.openxmlformats.org/package/2006/relationships';
export const CT_NS =
  'http://schemas.openxmlformats.org/package/2006/content-types';
export const STRICT_W_NS = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
export const STRICT_R_NS =
  'http://purl.oclc.org/ooxml/officeDocument/relationships';
export const REL = (kind) => R_NS + '/' + kind;
export const STRICT_REL = (kind) => STRICT_R_NS + '/' + kind;

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_CT = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.document.main+xml';

const xa = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;');

/** <w:document> around a body (body is the inside of <w:body>). */
export function documentXml(body, {ns = W_NS, rNs = R_NS, prefix = 'w',
  rootAttrs = '', before = '', after = ''} = {}) {
  const p = prefix;
  return DECL + `<${p}:document xmlns:${p}="${ns}" xmlns:r="${rNs}"` +
    `${rootAttrs}>${before}<${p}:body>${body}</${p}:body>${after}` +
    `</${p}:document>`;
}

/** <w:styles> around the given inside. */
export function stylesXml(inner, {ns = W_NS} = {}) {
  return DECL + `<w:styles xmlns:w="${ns}">${inner}</w:styles>`;
}

/** <w:numbering> around the given inside. */
export function numberingXml(inner, {ns = W_NS} = {}) {
  return DECL + `<w:numbering xmlns:w="${ns}">${inner}</w:numbering>`;
}

/** <w:settings> around the given inside. */
export function settingsXml(inner = '', {ns = W_NS} = {}) {
  return DECL + `<w:settings xmlns:w="${ns}">${inner}</w:settings>`;
}

/** A paragraph: p('<w:r>...</w:r>', '<w:jc w:val="center"/>'). */
export const p = (runs = '', pPr = '') =>
  `<w:p>${pPr ? '<w:pPr>' + pPr + '</w:pPr>' : ''}${runs}</w:p>`;
/** A run with text (xml:space="preserve") and optional rPr inside. */
export const r = (text, rPr = '') =>
  `<w:r>${rPr ? '<w:rPr>' + rPr + '</w:rPr>' : ''}` +
  `<w:t xml:space="preserve">${text}</w:t></w:r>`;

/** Relationships part from [id, type, target, mode?] entries. */
export function relsXml(list) {
  const body = list.map(([id, type, target, mode]) =>
    `<Relationship Id="${xa(id)}" Type="${xa(type)}" ` +
    `Target="${xa(target)}"${mode ? ` TargetMode="${mode}"` : ''}/>`)
    .join('');
  return DECL + `<Relationships xmlns="${PKG_REL_NS}">${body}` +
    '</Relationships>';
}

const SUB_TYPES = {
  'styles.xml': ['styles', 'styles+xml'],
  'numbering.xml': ['numbering', 'numbering+xml'],
  'settings.xml': ['settings', 'settings+xml'],
};

// other parts get the Override Word gives them (no relationship is
// made for them: pass it in opts.docRels / opts.pkgRels)
const OX = 'application/vnd.openxmlformats-';
const typeByName = (n, dir) => {
  if (n === 'docProps/core.xml') return OX + 'package.core-properties+xml';
  if (n === 'docProps/app.xml') {
    return OX + 'officedocument.extended-properties+xml';
  }
  const m = n.startsWith(dir) && /^(footnotes|endnotes|comments|header|footer|fontTable|webSettings)\d*\.xml$/
    .exec(n.slice(dir.length));
  return m ? OX + 'officedocument.wordprocessingml.' + m[1] + '+xml' : null;
};

/**
 * Build a .docx.
 * @param {Object<string, string|Uint8Array>} parts
 * extDefaults: [[extension, type]...] more Default content types.
 * @param {{main?: string, strict?: boolean, docRels?: Array,
 *   extDefaults?: Array,
 *   pkgRels?: Array|false, contentTypes?: string|false,
 *   docRelsXml?: false}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function buildDocx(parts, opts = {}) {
  const main = opts.main || 'word/document.xml';
  const rel = opts.strict ? STRICT_REL : REL;
  const enc = new TextEncoder();
  const out = [];
  const bytes = (v) => typeof v === 'string' ? enc.encode(v) : v;
  const names = Object.keys(parts);
  const dir = main.slice(0, main.lastIndexOf('/') + 1);
  if (opts.contentTypes !== false && !parts['[Content_Types].xml']) {
    const ov = [`<Override PartName="/${main}" ContentType="${MAIN_CT}"/>`];
    for (const n of names) {
      const sub = SUB_TYPES[n.slice(dir.length)];
      if (n.startsWith(dir) && sub) {
        ov.push(`<Override PartName="/${n}" ContentType="application/` +
          `vnd.openxmlformats-officedocument.wordprocessingml.${sub[1]}"/>`);
      } else if (typeByName(n, dir)) {
        ov.push(`<Override PartName="/${n}" ContentType="` +
          `${typeByName(n, dir)}"/>`);
      }
    }
    out.push(['[Content_Types].xml', enc.encode(DECL +
      `<Types xmlns="${CT_NS}"><Default Extension="rels" ContentType=` +
      '"application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      (opts.extDefaults || []).map(([e, t]) =>
        `<Default Extension="${e}" ContentType="${t}"/>`).join('') +
      ov.join('') + '</Types>')]);
  }
  if (opts.pkgRels !== false && !parts['_rels/.rels']) {
    out.push(['_rels/.rels', enc.encode(relsXml(opts.pkgRels ||
      [['rId1', rel('officeDocument'), main]]))]);
  }
  for (const n of names) out.push([n, bytes(parts[n])]);
  const relsName = dir + '_rels/' + main.slice(dir.length) + '.rels';
  if (opts.docRelsXml !== false && !parts[relsName]) {
    const list = [];
    let k = 1;
    for (const n of names) {
      const sub = SUB_TYPES[n.slice(dir.length)];
      if (n.startsWith(dir) && sub) {
        list.push(['rIdS' + k++, rel(sub[0]), n.slice(dir.length)]);
      }
    }
    for (const x of opts.docRels || []) list.push(x);
    out.push([relsName, enc.encode(relsXml(list))]);
  }
  return writeZip(out, {date: new Date(2020, 0, 1)});
}
