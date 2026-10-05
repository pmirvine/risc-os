// Dev script (not a disc source): prints the child element order that the
// ECMA-376 transitional wml.xsd defines for the property containers used
// by !Word/Order. Usage: node tools/moreapps-xsdorder.mjs [path/to/wml.xsd]
// Default path: tools/moreapps/.cache/wml.xsd (git-ignored; fetch it from
// e.g. python-openxml/python-docx ref/xsd/wml.xsd).
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseXml} from './moreapps/!WimpLib/Xml';

export const DEFAULT_XSD = fileURLToPath(
  new URL('./moreapps/.cache/wml.xsd', import.meta.url));

// ORDER key -> complex type whose (flattened) sequence it must equal.
export const TYPES = {
  pPr: 'CT_PPr', rPr: 'CT_RPr', tblPr: 'CT_TblPr', tcPr: 'CT_TcPr',
  trPr: 'CT_TrPr', sectPr: 'CT_SectPr',
};

const local = (n) => n.slice(n.indexOf(':') + 1);
const kids = (n) => n.children.filter((c) => typeof c === 'object' && c.name);

/** Map "kind:name" -> node for every named global definition. */
export function index(xsdText) {
  const root = parseXml(xsdText).root;
  const defs = new Map();
  for (const c of kids(root))
    if (c.name === 'xsd:complexType' || c.name === 'xsd:group')
      defs.set(local(c.name) + ':' + c.attrs.find(([k]) => k === 'name')[1], c);
  return defs;
}

/** Element names in document order, resolving extension and group refs. */
export function flatten(defs, node, out = []) {
  const a = (k) => (node.attrs.find(([n]) => n === k) || [])[1];
  switch (local(node.name)) {
    case 'element': out.push(a('name') ?? local(a('ref'))); break;
    case 'group':
      if (a('ref')) return flatten(defs, defs.get('group:' + local(a('ref'))), out);
      kids(node).forEach((c) => flatten(defs, c, out)); break;
    case 'extension':
      flatten(defs, defs.get('complexType:' + local(a('base'))), out);
      kids(node).forEach((c) => flatten(defs, c, out)); break;
    case 'attribute': case 'attributeGroup': break;
    default: kids(node).forEach((c) => flatten(defs, c, out));
  }
  return out;
}

export function sequences(xsdText) {
  const defs = index(xsdText);
  const r = {};
  for (const [key, type] of Object.entries(TYPES))
    r[key] = flatten(defs, defs.get('complexType:' + type));
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = process.argv[2] || DEFAULT_XSD;
  if (!existsSync(p)) { console.error('no XSD at ' + p); process.exit(1); }
  const s = sequences(readFileSync(p, 'utf8'));
  for (const [k, v] of Object.entries(s)) console.log(k + ': ' + v.join(' '));
}
