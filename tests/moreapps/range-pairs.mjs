// The range marks of a saved part, paired: for the tests and the
// hand-off generators (not a test). Word reports a range start with
// no end (or an end with no start) as unreadable content; every
// command keeps them paired (./BookmarkKeep in !Letters).
//
//   unpaired(xml) -> [string]  the range marks of a part's XML text
//       whose partner is missing: 'kind start id' or 'kind end id',
//       kind one of bookmark, commentRange, moveFromRange,
//       moveToRange, perm (w:permStart / w:permEnd) and the four
//       w:customXml*Range kinds (customXmlInsRange, customXmlDelRange,
//       customXmlMoveFromRange, customXmlMoveToRange), paired by
//       kind and w:id (any prefix), sorted
//   newlyUnpaired(xml, was) -> [string]  unpaired(xml) less those of
//       was (an original part's XML, or null): what a change broke
//   partsUnpaired(zip, was?) -> [string]  newlyUnpaired for every XML
//       part under word/ of a !WimpLib Zip readZip map (was: the
//       original's, or none), each entry prefixed by its part name
const RE = new RegExp('<(?:[A-Za-z_][\\w.-]*:)?(bookmark|' +
  'commentRange|moveFromRange|moveToRange|perm|customXmlInsRange|' +
  'customXmlDelRange|customXmlMoveFromRange|customXmlMoveToRange)' +
  '(Start|End)(?=[\\s/>])([^>]*)>', 'g');
const ID = /(?:^|\s)(?:[A-Za-z_][\w.-]*:)?id\s*=\s*("[^"]*"|'[^']*')/;
const dec = new TextDecoder();

/** See the header. */
export function unpaired(xml) {
  const has = {Start: new Set(), End: new Set()};
  for (const m of String(xml).matchAll(RE)) {
    const id = (m[3].match(ID) || [, '""'])[1].slice(1, -1);
    has[m[2]].add(m[1] + ' ' + id);
  }
  const out = [];
  for (const k of has.Start) {
    if (!has.End.has(k)) out.push(k.replace(' ', ' start '));
  }
  for (const k of has.End) {
    if (!has.Start.has(k)) out.push(k.replace(' ', ' end '));
  }
  return out.sort();
}

/** See the header. */
export function newlyUnpaired(xml, was) {
  const old = new Set(was === null || was === undefined ? []
    : unpaired(was));
  return unpaired(xml).filter((k) => !old.has(k));
}

const text = (b) => (b ? dec.decode(b) : null);

/** See the header. */
export function partsUnpaired(zip, was = null) {
  const out = [];
  for (const [name, bytes] of zip) {
    if (!/^word\/.*\.xml$/.test(name)) continue;
    const old = was ? text(was.get(name)) : null;
    for (const k of newlyUnpaired(text(bytes), old)) {
      out.push(name + ': ' + k);
    }
  }
  return out;
}
