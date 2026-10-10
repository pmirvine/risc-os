// Test-only: pictures for the !Word Batch B tests (PicRead, PicMedia,
// layout, commands).
//
//   drawingXml(opts)          one <w:drawing> holding a picture
//   picDocx(opts)             a .docx with pictures, media and rels
//   pngBytes(w, h, {dpi, rgb})  a real PNG (pHYs when dpi is given)
//   jpegBytes(w, h, {density, units})  a real JPEG header
//   gifBytes(w, h, {frameW, frameH})   a real GIF
//
// Image data is real for small images. Above PIXEL_CAP pixels the
// pixel data is left short (headers stay right), so decode-bomb
// headers cost nothing to make.
import {deflateSync, crc32} from 'node:zlib';
import {buildDocx, documentXml, p, REL, STRICT_REL, R_NS, STRICT_R_NS,
  STRICT_W_NS} from './build-docx.mjs';

const T = 'http://schemas.openxmlformats.org/drawingml/2006/';
const S = 'http://purl.oclc.org/ooxml/drawingml/';
export const URIS = {
  wp: T + 'wordprocessingDrawing', a: T + 'main', pic: T + 'picture',
};
export const STRICT_URIS = {
  wp: S + 'wordprocessingDrawing', a: S + 'main', pic: S + 'picture',
};
export const PIXEL_CAP = 1 << 20;

const xa = (s) => String(s).replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;').replace(/</g, '&lt;');
const at = (n, v) => v === undefined || v === null ? ''
  : ` ${n}="${xa(v)}"`;

const ANCHOR_HEAD = '<wp:simplePos x="0" y="0"/>' +
  '<wp:positionH relativeFrom="column"><wp:posOffset>0' +
  '</wp:posOffset></wp:positionH><wp:positionV ' +
  'relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset>' +
  '</wp:positionV>';
const ANCHOR_ATTRS = ' simplePos="0" relativeHeight="251659264" ' +
  'behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"';

/**
 * One <w:drawing> picture as Word writes it.
 * opts: kind 'inline'|'anchor'; cx, cy (any value; null: no
 * attribute; extent false: no wp:extent); embed (null: none); link;
 * id, name, descr (docPr false: none); srcRect {l, t, r, b};
 * xfrm (false: no a:xfrm); blip (false: no a:blip); extra (XML put
 * in w:drawing after the picture); decl (default true: xmlns of wp,
 * a, pic on the elements; false: left to the root); strict (Strict
 * URIs); wp (the prefix used for wp, default 'wp'); picDefault (pic
 * as the default namespace on pic:pic and below).
 */
export function drawingXml({kind = 'inline', cx = 914400, cy = 457200,
  extent = true, embed = 'rId5', link, id = 1, name, descr,
  docPr = true, srcRect, xfrm = true, blip = true, extra = '',
  decl = true, strict = false, wp = 'wp', picDefault = false} = {}) {
  const u = strict ? STRICT_URIS : URIS;
  const d = (pre, uri) => decl ? ` xmlns:${pre}="${uri}"` : '';
  const nm = name === undefined ? 'Picture ' + id : name;
  const tag = kind === 'anchor' ? 'anchor' : 'inline';
  const rect = srcRect ? '<a:srcRect' + at('l', srcRect.l) +
    at('t', srcRect.t) + at('r', srcRect.r) + at('b', srcRect.b) +
    '/>' : '';
  const P = picDefault ? '' : 'pic:';
  const picDecl = picDefault ? ` xmlns="${u.pic}"` : d('pic', u.pic);
  const ext = `<a:ext cx="${cx}" cy="${cy}"/>`;
  let s = `<w:drawing><wp:${tag} distT="0" distB="0" distL="114300"` +
    ` distR="114300"${tag === 'anchor' ? ANCHOR_ATTRS : ''}` +
    `${d('wp', u.wp)}>` + (tag === 'anchor' ? ANCHOR_HEAD : '');
  if (extent) s += '<wp:extent' + at('cx', cx) + at('cy', cy) + '/>';
  s += '<wp:effectExtent l="0" t="0" r="0" b="0"/>';
  if (tag === 'anchor') s += '<wp:wrapSquare wrapText="bothSides"/>';
  if (docPr) {
    s += '<wp:docPr' + at('id', id) + at('name', nm) +
      at('descr', descr) + '/>';
  }
  s += '<wp:cNvGraphicFramePr><a:graphicFrameLocks' + d('a', u.a) +
    ' noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    `<a:graphic${d('a', u.a)}><a:graphicData uri="${u.pic}">` +
    `<${P}pic${picDecl}><${P}nvPicPr><${P}cNvPr id="0" ` +
    `name="image${id}.png"/><${P}cNvPicPr/></${P}nvPicPr>` +
    `<${P}blipFill>` + (blip ? '<a:blip' + at('r:embed', embed) +
    at('r:link', link) + '/>' : '') + rect +
    `<a:stretch><a:fillRect/></a:stretch></${P}blipFill>` +
    `<${P}spPr>` + (xfrm ? '<a:xfrm><a:off x="0" y="0"/>' + ext +
    '</a:xfrm>' : '') + '<a:prstGeom prst="rect"><a:avLst/>' +
    `</a:prstGeom></${P}spPr></${P}pic></a:graphicData></a:graphic>` +
    `</wp:${tag}>${extra}</w:drawing>`;
  return wp === 'wp' ? s : s.replace(/(<\/?)wp:/g, '$1' + wp + ':')
    .replace('xmlns:wp=', 'xmlns:' + wp + '=');
}

const TYPES = {png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif'};

/**
 * A .docx with one paragraph per picture (Promise<Uint8Array>).
 * opts: strict; pics [{...drawingXml opts, bytes (null: no media
 * part), ext ('png'), target, mode, rel (false: no relationship)}]
 * (default one PNG picture); body (XML after the pictures).
 */
export function picDocx({strict = false, pics = [{}], body = ''} = {}) {
  const u = strict ? STRICT_URIS : URIS;
  const parts = {};
  const rels = [];
  let xml = '';
  pics.forEach((o, k) => {
    const n = k + 1;
    const embed = o.embed === undefined ? 'rId' + (10 + n) : o.embed;
    const ext = o.ext || 'png';
    const target = o.target || `media/image${n}.${ext}`;
    xml += p('<w:r>' + drawingXml({id: n, ...o, embed, strict,
      decl: false}) + '</w:r>');
    if (o.bytes !== null && !o.target) {
      parts['word/' + target] = o.bytes || pngBytes(4, 2);
    }
    if (o.rel !== false && embed) {
      rels.push([embed, (strict ? STRICT_REL : REL)('image'), target,
        o.mode]);
    }
  });
  const root = ` xmlns:wp="${u.wp}" xmlns:a="${u.a}" ` +
    `xmlns:pic="${u.pic}"` + (strict ? ' w:conformance="strict"' : '');
  parts['word/document.xml'] = documentXml(xml + body, strict
    ? {ns: STRICT_W_NS, rNs: STRICT_R_NS, rootAttrs: root}
    : {rNs: R_NS, rootAttrs: root});
  return buildDocx(parts, {strict, docRels: rels,
    extDefaults: [['jpeg', TYPES.jpeg], ['gif', TYPES.gif]]});
}

const be32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255,
  n & 255];
function chunk(type, data) {
  const td = new Uint8Array([...Buffer.from(type, 'latin1'), ...data]);
  return [...be32(data.length), ...td, ...be32(crc32(td))];
}

/**
 * A PNG of w x h RGB pixels, grey or rgb ([r, g, b]); dpi: number or
 * [x, y].
 */
export function pngBytes(w, h, {dpi, rgb} = {}) {
  const ihdr = [...be32(w), ...be32(h), 8, 2, 0, 0, 0];
  const out = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr)];
  if (dpi !== undefined) {
    const [x, y] = Array.isArray(dpi) ? dpi : [dpi, dpi];
    const m = (v) => be32(Math.round(v / 0.0254));
    out.push(...chunk('pHYs', [...m(x), ...m(y), 1]));
  }
  let raw = new Uint8Array(0);
  if (w * h <= PIXEL_CAP) {
    raw = new Uint8Array((w * 3 + 1) * h).fill(128);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      for (let x = 0; rgb && x < w; x++) {
        raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
      }
    }
  }
  out.push(...chunk('IDAT', [...deflateSync(raw)]));
  out.push(...chunk('IEND', []));
  return new Uint8Array(out);
}

// a 1 x 1 grey baseline JPEG (JFIF 72 dpi), made by ImageMagick
const JPEG_1X1 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwME' +
  'BQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIU' +
  'FRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAA' +
  'AAAAAAAAAAAAAAD/2gAIAQEAAD8AP//Z';

/**
 * The 1 x 1 JPEG with its SOF0 saying w x h and its JFIF density
 * (number or [x, y]; default 72) in units (0 none, 1 dpi, 2 dpcm;
 * default 1). Only the 1 x 1 one decodes to its own size.
 */
export function jpegBytes(w, h, {density = 72, units = 1} = {}) {
  const b = new Uint8Array(Buffer.from(JPEG_1X1, 'base64'));
  const [x, y] = Array.isArray(density) ? density : [density, density];
  b[13] = units;
  b[14] = x >> 8 & 255; b[15] = x & 255;
  b[16] = y >> 8 & 255; b[17] = y & 255;
  let sof = -1;
  for (let i = 2; i < b.length - 1; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xc0) { sof = i; break; }
  }
  b[sof + 5] = h >> 8 & 255; b[sof + 6] = h & 255;
  b[sof + 7] = w >> 8 & 255; b[sof + 8] = w & 255;
  return b;
}

/**
 * A whole grey baseline JPEG of w x h (multiples of 8): every 8 x 8
 * block is one DC of 0 and an end of block (the Huffman code 0 each),
 * so it decodes to mid grey. density (number or [x, y]) and units as
 * jpegBytes (defaults 72, 1). For the hand-off files (jpegBytes only
 * decodes at 1 x 1).
 */
export function jpegGray(w, h, {density = 72, units = 1} = {}) {
  if (w % 8 || h % 8 || w < 8 || h < 8 || w > 65535 || h > 65535) {
    throw new RangeError('jpegGray: a multiple of 8');
  }
  const [x, y] = Array.isArray(density) ? density : [density, density];
  const seg = (m, body) => [0xff, m, (body.length + 2) >> 8,
    (body.length + 2) & 255, ...body];
  const one = (cls) => seg(0xc4, [cls, 1, ...new Array(15).fill(0), 0]);
  const bits = (w / 8) * (h / 8) * 2;
  const scan = new Array(Math.ceil(bits / 8)).fill(0);
  if (bits % 8) scan[scan.length - 1] = (1 << (8 - bits % 8)) - 1;
  return new Uint8Array([0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, units, x >> 8, x & 255,
      y >> 8, y & 255, 0, 0]),
    ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]),
    ...one(0x00), ...one(0x10),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]), ...scan, 0xff, 0xd9]);
}

/** LZW codes for n pixels of colour 0, 3 bits each, cleared often. */
function lzw(n) {
  const codes = [4];
  for (let i = 0; i < n; i++) {
    if (i && i % 2 === 0) codes.push(4);
    codes.push(0);
  }
  codes.push(5);
  const out = [];
  let acc = 0, bits = 0;
  for (const c of codes) {
    acc |= c << bits;
    bits += 3;
    while (bits >= 8) { out.push(acc & 255); acc >>= 8; bits -= 8; }
  }
  if (bits) out.push(acc & 255);
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) {
    const s = out.slice(i, i + 255);
    blocks.push(s.length, ...s);
  }
  return [2, ...blocks, 0];
}

/** A GIF89a of screen w x h, one frame frameW x frameH (default w x h). */
export function gifBytes(w, h, {frameW = w, frameH = h} = {}) {
  const le = (n) => [n & 255, n >> 8 & 255];
  const n = frameW * frameH <= PIXEL_CAP ? frameW * frameH : 0;
  return new Uint8Array([...Buffer.from('GIF89a', 'latin1'),
    ...le(w), ...le(h), 0x80, 0, 0, 128, 128, 128, 255, 255, 255,
    0x2c, ...le(0), ...le(0), ...le(frameW), ...le(frameH), 0,
    ...lzw(n), 0x3b]);
}
