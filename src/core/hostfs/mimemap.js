// Host filename extension -> RISC OS filetype, for HostFS files without a ",xxx" suffix.
// From ROOL's MimeMap (SystemRes/InetRes/Resources/files/MimeMap); extensions that are usually source text
// (.c, .h, .s, .py, .md, .bas ...) are deliberately left out and fall back to Text (&FFF), as in RPCEmu.

const MAP = {
  txt: 0xfff, text: 0xfff,
  html: 0xfaf, htm: 0xfaf, xhtml: 0xfaf,
  css: 0xf79, js: 0xf81, mjs: 0xf81, json: 0xf75, xml: 0xf80, yaml: 0xf74, yml: 0xf74,
  csv: 0xdfe, tsv: 0xf0d, rtf: 0xc32,
  pdf: 0xadf, ps: 0xff5, eps: 0xff5,
  jpg: 0xc85, jpeg: 0xc85, jpe: 0xc85, png: 0xb60, gif: 0x695, bmp: 0x69c, tif: 0xff0, tiff: 0xff0,
  svg: 0xaad, webp: 0xa66, ico: 0x132, psd: 0xf98,
  zip: 0xa91, gz: 0xf89, tgz: 0xf89, tar: 0xc46, bz2: 0x16e, arc: 0xddc, spk: 0xddc, lha: 0xddc, arj: 0xddc,
  iso: 0xdf6,
  mp3: 0x1ad, wav: 0xfb1, ogg: 0x1a8, flac: 0x1cf, aif: 0xfc2, aiff: 0xfc2, mid: 0xfd4, midi: 0xfd4, mod: 0xcb6,
  mp4: 0xa64, avi: 0xfb2, mpg: 0xbf8, mpeg: 0xbf8, mkv: 0xa63,
  doc: 0xae6, docx: 0xa7e, xls: 0xba6, xlsx: 0xa7f, pptx: 0xa80, odt: 0xa81, ods: 0xa82,
  pl: 0x102, tex: 0xce5,
  dat: 0xffd, bin: 0xffd,
};

/** Filetype for a host leaf name (by extension after the last '.', not a leading one), or null. */
export function typeFromExtension(hostName) {
  const i = hostName.lastIndexOf('.');
  if (i <= 0 || i === hostName.length - 1) return null;
  return MAP[hostName.slice(i + 1).toLowerCase()] ?? null;
}
