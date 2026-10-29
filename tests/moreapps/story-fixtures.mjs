// Test-only: documents with headers and footers (Batch D P6.1, D9).
//
//   hdrXml(body, {ns?, rNs?, prefix?}) -> the XML of a header part:
//     <w:hdr> (w: and r: declared) around `body`
//   ftrXml(body, opts) -> the same for a footer (<w:ftr>)
//   withHeaders(body, {default?, first?, even?}, {titlePg?,
//     evenAndOdd?, strict?, parts?}) -> Promise<Uint8Array>: a .docx
//     whose one section (blocks `body`, the inside of w:body without
//     its sectPr) references a header and/or footer of each type
//     given. A value is a string (the inside of a header) or {hdr?,
//     ftr?} (the inside of each). Parts are word/header1.xml,
//     word/footer1.xml... in the order default, first, even; their
//     relationships rIdH1, rIdF1... in the main rels. titlePg puts
//     w:titlePg in the sectPr, evenAndOdd w:evenAndOddHeaders in
//     settings.xml; strict writes every part in the Strict namespaces
//     (and Strict relationship types); parts: more package parts;
//     docRels: more main relationships [[id, type, target]]
//   freeze(x) -> x deep-frozen (objects, arrays, Map values; byte
//     arrays, which cannot be frozen, are skipped)
import {buildDocx, documentXml, settingsXml, REL, STRICT_REL, W_NS,
  R_NS, STRICT_W_NS, STRICT_R_NS} from './build-docx.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function partXml(root, body, {ns = W_NS, rNs = R_NS, prefix = 'w'}) {
  const p = prefix;
  return DECL + `<${p}:${root} xmlns:${p}="${ns}" xmlns:r="${rNs}">` +
    `${body}</${p}:${root}>`;
}

/** A header part's XML around `body`. */
export const hdrXml = (body, opts = {}) => partXml('hdr', body, opts);

/** A footer part's XML around `body`. */
export const ftrXml = (body, opts = {}) => partXml('ftr', body, opts);

const TYPES = ['default', 'first', 'even'];

/** See the header. */
export function withHeaders(body, hdrs = {}, opts = {}) {
  const strict = !!opts.strict;
  const ns = strict ? {ns: STRICT_W_NS, rNs: STRICT_R_NS} : {};
  const rel = strict ? STRICT_REL : REL;
  const parts = {...(opts.parts || {})};
  const docRels = [...(opts.docRels || [])];
  let refs = '';
  let nh = 0, nf = 0;
  for (const type of TYPES) {
    const v = hdrs[type];
    if (v === undefined) continue;
    const {hdr, ftr} = typeof v === 'string' ? {hdr: v} : v;
    if (hdr !== undefined) {
      const id = 'rIdH' + ++nh;
      parts['word/header' + nh + '.xml'] = hdrXml(hdr, ns);
      docRels.push([id, rel('header'), 'header' + nh + '.xml']);
      refs += `<w:headerReference w:type="${type}" r:id="${id}"/>`;
    }
    if (ftr !== undefined) {
      const id = 'rIdF' + ++nf;
      parts['word/footer' + nf + '.xml'] = ftrXml(ftr, ns);
      docRels.push([id, rel('footer'), 'footer' + nf + '.xml']);
      refs += `<w:footerReference w:type="${type}" r:id="${id}"/>`;
    }
  }
  // headerReference before footerReference, as the schema wants
  const ordered = refs.match(/<w:headerReference[^>]*>/g) || [];
  const sect = '<w:sectPr>' + ordered.join('') +
    (refs.match(/<w:footerReference[^>]*>/g) || []).join('') +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    (opts.titlePg ? '<w:titlePg/>' : '') + '</w:sectPr>';
  parts['word/document.xml'] = documentXml(body + sect, ns);
  if (opts.evenAndOdd) {
    parts['word/settings.xml'] = settingsXml(
      '<w:evenAndOddHeaders/>', ns);
  }
  return buildDocx(parts, {strict, docRels});
}

/** See the header. */
export function freeze(x) {
  const stack = [x], seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v !== 'object' || seen.has(v) ||
      ArrayBuffer.isView(v)) continue;
    seen.add(v);
    if (v instanceof Map) for (const y of v.values()) stack.push(y);
    Object.freeze(v);
    for (const k of Object.keys(v)) stack.push(v[k]);
  }
  return x;
}
