// .doc import, task 14: the measures the pictures / sections corpus
// test compares between a .doc's reading and its .docx twin's.
//
//   partStats(doc) -> {sections, landscape, columns, titlePg, types,
//       headers, footers, pictures, floating, hfText}
//     sections the Doc's sections; landscape those wider than high;
//     columns those of more than one column; titlePg those with it;
//     types the sections with a break type other than the next page
//     (the first one's is not counted); headers / footers the
//     sections' headers and footers that are shown (a section with
//     no reference of a kind shows the one before's; a first-page
//     one with titlePg, an even one with evenAndOddHeaders) and hold
//     text (counted per section); pictures the inline
//     pictures (w:drawing wp:inline) of the body, its tables and the
//     headers and footers shown (a .docx's VML pictures and
//     embedded objects, whose .doc form is a picture, too); floating the wp:anchor ones (not read
//     from a .doc); hfText the headers' and footers' text, joined
import {pictureOf, docMap} from '../../tools/moreapps/!Letters/PicRead';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';

export const PART_KEYS = ['sections', 'landscape', 'columns', 'titlePg',
  'types', 'headers', 'footers', 'pictures'];

const local = (n) => String(n && n.name || '').split(':').pop();

function walkBlocks(bs, fn) {
  for (const b of bs || []) {
    if (b.type === 'tbl') {
      for (const r of b.rows) for (const c of r.cells) walkBlocks(c.blocks, fn);
    } else if (b.type === 'p') fn(b);
    else if (b.type === 'opaque') fn(null, b.node);
  }
}

const hasImage = (n) => !!n && (local(n) === 'imagedata' ||
  (n.children || []).some((c) => typeof c !== 'string' && hasImage(c)));

function rawPics(n, st) {
  if (!n || !n.children) return;
  const l = local(n);
  if (l === 'inline' || l === 'anchor') {
    st[l === 'inline' ? 'pictures' : 'floating']++;
    return;
  }
  // (a VML picture or an embedded object's preview: a picture)
  if (l === 'object' || (l === 'pict' && hasImage(n))) {
    st.pictures++;
    return;
  }
  for (const c of n.children) rawPics(c, st);
}

function countPics(doc, bs, st, sizes) {
  const map = docMap(doc);
  walkBlocks(bs, (p, raw) => {
    if (raw) return rawPics(raw, st);
    for (const x of Object.values(p.inlines || {})) {
      const pic = x && x.node ? pictureOf(x.node, map) : null;
      if (pic) {
        if (pic.floating) st.floating++;
        else {
          st.pictures++;
          if (sizes) sizes.push([pic.cx, pic.cy]);
        }
      } else if (x && x.node) rawPics(x.node, st);
    }
  });
}

const textOf = (bs) => {
  const out = [];
  walkBlocks(bs, (p) => p && out.push(p.text.replace(/￼/g, '')
    .replace(/\s+/g, ' ').trim()));
  return out.filter(Boolean).join(' / ');
};

/** See the header. */
export function partStats(doc, sizes) {
  const st = {sections: doc.sections.length, landscape: 0, columns: 0,
    titlePg: 0, types: 0, headers: 0, footers: 0, pictures: 0,
    floating: 0, hfText: []};
  const map = docScope(doc).map;
  const evenOdd = JSON.stringify(doc.rawSettings || '')
    .includes('evenAndOddHeaders');
  const shown = new Set(), eff = {};
  doc.sections.forEach((s, i) => {
    const p = s.props || {};
    if (p.pgSz && p.pgSz.w > p.pgSz.h) st.landscape++;
    if (p.cols && p.cols.num > 1) st.columns++;
    if (p.titlePg && !(i && p.type === 'continuous')) st.titlePg++;
    if (i && p.type && p.type !== 'nextPage') st.types++;
    countPics(doc, s.blocks, st, sizes);
    const refs = refsOf(s, map);
    for (const [kind, key] of [['hdr', 'headers'], ['ftr', 'footers']]) {
      for (const type of ['default', 'first', 'even']) {
        const id = refs[kind][type];
        const k = kind + type;
        if (id) eff[k] = storyOfRef(doc, id);
        if (!eff[k] || (type === 'first' && !p.titlePg) ||
          (type === 'even' && !evenOdd)) continue;
        const part = eff[k];
        const story = doc.stories.get(part);
        if (story && !shown.has(part)) {
          shown.add(part);
          countPics(doc, story.blocks, st, sizes);
        }
        const text = story ? textOf(story.blocks) : '';
        if (!text) continue;
        st[key]++;
        st.hfText.push(kind + ' ' + type + ': ' + text);
      }
    }
  });
  st.hfText = st.hfText.join(' | ');
  return st;
}
