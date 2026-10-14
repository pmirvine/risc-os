// Test-only: assert that a Doc, written, is a clean package (Batch D
// P6 fix wave; for the story commands of P7).
//
//   await lintAfter(doc, what?, {allow?}) -> {bytes, zip}
//     writes doc (./DocxWrite, a fixed date), then asserts that
//     - lintPackage (./lint-package.mjs) reports no 'error' problem
//       (a broken relationship, an r:id no relationship resolves, a
//       part without its content type...), and
//     - every XML part (.xml and .rels) is namespace-well-formed:
//       each element and attribute prefix is declared in scope
//       (xmllint's "Namespace prefix r ... is not defined", which
//       Word refuses), xml: and xmlns: excepted
//     `allow`: rule names not counted (e.g. 'rid-unresolved' after a
//     setStory null alone, which leaves the section's reference
//     dangling BY DESIGN: the D14 commands pair it with ./SectRefs
//     withRef null in one d.atomic; a test of such a half step says
//     so with allow).
//   unboundPrefixes(bytes) -> ['p:name', ...] the undeclared uses
import assert from 'node:assert/strict';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {lintPackage} from './lint-package.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const dec = new TextDecoder();

const prefixOf = (name) => {
  const i = name.indexOf(':');
  return i > 0 ? name.slice(0, i) : null;
};

/** See the header. */
export function unboundPrefixes(bytes) {
  const out = [];
  const {root} = parseXml(dec.decode(bytes));
  const stack = [[root, new Set(['xml', 'xmlns'])]];
  while (stack.length) {
    const [n, outer] = stack.pop();
    const here = new Set(outer);
    for (const [k] of n.attrs) {
      if (k.startsWith('xmlns:')) here.add(k.slice(6));
    }
    const uses = [n.name, ...n.attrs.map(([k]) => k)
      .filter((k) => !k.startsWith('xmlns'))];
    for (const u of uses) {
      const p = prefixOf(u);
      if (p !== null && !here.has(p)) out.push(u);
    }
    for (const c of n.children || []) {
      if (c && typeof c.name === 'string' && Array.isArray(c.attrs))
        stack.push([c, here]);
    }
  }
  return out;
}

/** See the header. */
export async function lintAfter(doc, what = 'written doc', opts = {}) {
  const allow = new Set(opts.allow || []);
  const bytes = await writeDocx(doc, {date: DATE});
  const zip = await readZip(bytes);
  const errors = lintPackage(zip).problems
    .filter((q) => q.level === 'error' && !allow.has(q.rule))
    .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);
  for (const [name, b] of zip) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    for (const u of unboundPrefixes(b))
      errors.push('ns-unbound ' + name + ' ' + u);
  }
  assert.deepEqual(errors, [], what + ': lint clean');
  return {bytes, zip};
}
