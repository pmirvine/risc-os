// odt-helpers (ODT import, tasks 5-9): spec-derived OpenDocument
// text fixtures, written by hand from OpenDocument 1.3 (part 2,
// packages: 3.3 the `mimetype` file first and stored, 3.2 the
// manifest; part 3, schema: office:document-content, -styles,
// -meta). Not the output of any office program: real files are in
// the uncommitted corpus only.
//
//   makeOdt({content, styles?, meta?, pictures?, mimetype?, auto?,
//       fonts?, mimetypeAt?, extra?}) -> Uint8Array
//     a zip (every entry stored) of, in order: `mimetype` (default
//     the text type; null: none; mimetypeAt: 'last' puts it last),
//     META-INF/manifest.xml, content.xml, styles.xml, meta.xml,
//     Pictures/<name> for each [name, bytes] of pictures, then the
//     [name, bytes | string] pairs of extra.
//     content: the body (what office:text holds) or, starting with
//       '<?xml' or '<office:', the whole content.xml
//     auto: content.xml's office:automatic-styles children
//     fonts: style:font-face elements (both parts' decls)
//     styles: office:styles children or, starting with '<?xml' or
//       '<office:', the whole styles.xml (undefined: a minimal one)
//     meta: office:meta children or the whole meta.xml
//   NS     the namespace declarations the documents carry
//   TEXT, TEMPLATE  the two mimetypes
//   storedZip([[name, bytes | string, {deflate?}]]) -> Uint8Array
//     deflate: that entry deflated (method 8), the rest stored
import {deflateRawSync} from 'node:zlib';
import {crc32} from '../../tools/moreapps/!WimpLib/Crc32';

export const TEXT = 'application/vnd.oasis.opendocument.text';
export const TEMPLATE =
  'application/vnd.oasis.opendocument.text-template';

const O = 'urn:oasis:names:tc:opendocument:xmlns:';
export const NS = [
  `xmlns:office="${O}office:1.0"`, `xmlns:style="${O}style:1.0"`,
  `xmlns:text="${O}text:1.0"`, `xmlns:table="${O}table:1.0"`,
  `xmlns:draw="${O}drawing:1.0"`,
  `xmlns:fo="${O}xsl-fo-compatible:1.0"`,
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  `xmlns:meta="${O}meta:1.0"`, `xmlns:svg="${O}svg-compatible:1.0"`,
].join(' ');

const DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';
const whole = (s) => typeof s === 'string' &&
  (s.startsWith('<?xml') || s.startsWith('<office:'));

const enc = (v) => typeof v === 'string' ? new TextEncoder().encode(v)
  : v;

/** A zip of the entries in order, stored (method 0) unless one asks
 *  to be deflated. */
export function storedZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, value, how = {}] of entries) {
    const raw = enc(value), nb = enc(name), crc = crc32(raw);
    const data = how.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = how.deflate ? 8 : 0;
    const head = new Uint8Array(30 + nb.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, method, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, raw.length, true);
    h.setUint16(26, nb.length, true);
    head.set(nb, 30);
    const cen = new Uint8Array(46 + nb.length);
    const c = new DataView(cen.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, method, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nb.length, true);
    c.setUint32(42, offset, true);
    cen.set(nb, 46);
    locals.push(head, data);
    centrals.push(cen);
    offset += head.length + data.length;
  }
  const cd = centrals.reduce((n, a) => n + a.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, cd, true);
  e.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

function contentXml(o) {
  if (whole(o.content)) return o.content;
  return DECL + `<office:document-content ${NS} ` +
    'office:version="1.3">' +
    `<office:font-face-decls>${o.fonts || ''}` +
    '</office:font-face-decls>' +
    `<office:automatic-styles>${o.auto || ''}` +
    '</office:automatic-styles><office:body><office:text>' +
    (o.content || '') +
    '</office:text></office:body></office:document-content>';
}

function stylesXml(o) {
  if (whole(o.styles)) return o.styles;
  return DECL + `<office:document-styles ${NS} office:version="1.3">` +
    `<office:font-face-decls>${o.fonts || ''}` +
    '</office:font-face-decls>' +
    `<office:styles>${o.styles || ''}</office:styles>` +
    '</office:document-styles>';
}

function metaXml(o) {
  if (whole(o.meta)) return o.meta;
  return DECL + `<office:document-meta ${NS} office:version="1.3">` +
    `<office:meta>${o.meta || ''}</office:meta></office:document-meta>`;
}

function manifestXml(type, pictures) {
  const M = `${O}manifest:1.0`;
  const entry = (p, t) => `<manifest:file-entry manifest:full-path="${
    p}" manifest:media-type="${t}"/>`;
  return DECL + `<manifest:manifest xmlns:manifest="${M}" ` +
    'manifest:version="1.3">' + entry('/', type) +
    entry('content.xml', 'text/xml') + entry('styles.xml', 'text/xml') +
    entry('meta.xml', 'text/xml') +
    pictures.map(([n]) => entry('Pictures/' + n, 'image/png'))
      .join('') +
    '</manifest:manifest>';
}

/** See the header. */
export function makeOdt(o = {}) {
  const type = o.mimetype === undefined ? TEXT : o.mimetype;
  const pictures = o.pictures ? [...(o.pictures instanceof Map
    ? o.pictures : Object.entries(o.pictures))] : [];
  const entries = [
    ['META-INF/manifest.xml', manifestXml(type || TEXT, pictures)],
    ['content.xml', contentXml(o)], ['styles.xml', stylesXml(o)],
    ['meta.xml', metaXml(o)],
    ...pictures.map(([n, b]) => ['Pictures/' + n, b]),
    ...(o.extra || [])];
  if (type !== null) {
    if (o.mimetypeAt === 'last') entries.push(['mimetype', type]);
    else entries.unshift(['mimetype', type]);
  }
  return storedZip(entries);
}
