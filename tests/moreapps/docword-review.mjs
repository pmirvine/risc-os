// .doc import, task 15: the REVIEW sampler that real Word saves as a
// Word 97-2003 .doc (tools/doc-word-fixtures.mjs review, through
// docword-fixtures.mjs), and the measure docword.test.mjs compares
// our reading of the .doc and of the .docx with. Written by hand from
// ECMA-376 (WordprocessingML), with build-docx.mjs; not the output of
// any office program.
//
//   review() -> Promise<Uint8Array>  the .docx: a footnote and an
//     endnote with formatting; three comments with authors, initials
//     and dates (one over a range, one a point, one a reply);
//     insertions and deletions by two authors, a deleted paragraph
//     mark, a deletion over two paragraphs; links to http, mailto
//     and a bookmark; bookmarks; PAGE, NUMPAGES, DATE, SEQ, REF and
//     TOC fields; a PAGE field in the footer; a FORMTEXT form field;
//     an INCLUDETEXT field (to a file that is not there: Word never
//     updates it on the way)
//   reviewLook(doc) -> {...}  what the comparison looks at (see there)
//   reviewCounts(doc) -> {REVIEW_KEYS: n}  the corpus twins' counts:
//     footnotes, endnotes, comments, changes, fields (of the kinds
//     !Letters keeps, HYPERLINK aside: links), links, bookmarks
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {SAFE} from '../../tools/moreapps/!Letters/RtfFields';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const EXT_REL = 'http://schemas.microsoft.com/office/2011/' +
  'relationships/commentsExtended';
const D1 = '2024-05-06T07:08:00Z', D2 = '2023-12-31T23:59:00Z';
const ANN = `w:author="Ann Lee" w:date="${D1}"`;
const BOB = `w:author="Bob Ray" w:date="${D2}"`;

const fld = (code, result, rPr = '', begin = '') =>
  `<w:r>${rPr}<w:fldChar w:fldCharType="begin">${begin}</w:fldChar></w:r>` +
  `<w:r>${rPr}<w:instrText xml:space="preserve">${code}</w:instrText>` +
  `</w:r><w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
  r(result) + `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`;
const del = (text, who = BOB, id = 0) => `<w:del w:id="${id}" ${who}>` +
  `<w:r><w:delText xml:space="preserve">${text}</w:delText></w:r>` +
  '</w:del>';
const ins = (text, who = ANN, id = 0) => `<w:ins w:id="${id}" ${who}>` +
  r(text) + '</w:ins>';
const delMark = (id) => `<w:rPr><w:del w:id="${id}" ${BOB}/></w:rPr>`;
const SUP = '<w:vertAlign w:val="superscript"/>';

function body() {
  return [
    p(r('Notes: one') + `<w:r><w:rPr>${SUP}</w:rPr><w:footnoteReference ` +
      'w:id="1"/></w:r>' + r(' and an end') + `<w:r><w:rPr>${SUP}` +
      '</w:rPr><w:endnoteReference w:id="1"/></w:r>' + r('.')),
    p(r('Commented ') + '<w:commentRangeStart w:id="0"/>' +
      '<w:commentRangeStart w:id="2"/>' + r('range text') +
      '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/>' +
      '</w:r><w:commentRangeEnd w:id="2"/><w:r><w:commentReference ' +
      'w:id="2"/></w:r>' + r(' and a point') + '<w:r><w:commentReference' +
      ' w:id="1"/></w:r>' + r('.')),
    p(r('Keep ') + ins('inserted ', ANN, 10) + del('deleted ', BOB, 11) +
      r('end.')),
    p(r('Joined'), delMark(12)),
    p(r('with the next.')),
    p(r('Start ') + del('across', BOB, 13), delMark(14)),
    p(del('two', BOB, 15) + r(' paragraphs.')),
    p(r('Links: ') + '<w:hyperlink r:id="rIdL1" w:history="1">' +
      r('site') + '</w:hyperlink>' + r(' ') +
      '<w:hyperlink r:id="rIdL2" w:history="1">' + r('mail') +
      '</w:hyperlink>' + r(' ') + '<w:hyperlink w:anchor="target" ' +
      'w:history="1">' + r('inside') + '</w:hyperlink>'),
    p('<w:bookmarkStart w:id="0" w:name="target"/>' + r('Bookmarked') +
      '<w:bookmarkEnd w:id="0"/>' + r(' and ') +
      '<w:bookmarkStart w:id="1" w:name="second"/>' + r('two') +
      '<w:bookmarkEnd w:id="1"/>'),
    p(r('Page ') + fld(' PAGE ', '1') + r(' of ') +
      fld(' NUMPAGES ', '1') + r(' on ') +
      fld(' DATE \\@ "yyyy-MM-dd" ', '2024-05-06') + r(' figure ') +
      fld(' SEQ Figure \\* ARABIC ', '1') + r(' see ') +
      fld(' REF target \\h ', 'Bookmarked')),
    p('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText ' +
      'xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r><w:r>' +
      '<w:fldChar w:fldCharType="separate"/></w:r>' + r('Contents one')),
    p(r('Contents two') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'),
    p(r('Form: ') + fld(' FORMTEXT ', 'typed', '', '<w:ffData><w:name ' +
      'w:val="Text1"/><w:enabled/><w:calcOnExit w:val="0"/><w:textInput/>' +
      '</w:ffData>') + r(' include: ') +
      fld(' INCLUDETEXT "C:\\\\nofile.doc" ', 'included text')),
  ].join('');
}

const SECT = '<w:sectPr><w:footerReference w:type="default" r:id="rIdF1"/>' +
  '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" ' +
  'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" ' +
  'w:gutter="0"/></w:sectPr>';

const note = (kind, id, inner) => `<w:${kind} w:id="${id}">${inner}` +
  `</w:${kind}>`;
const seps = (kind) => `<w:${kind} w:type="separator" w:id="-1">` +
  p('<w:r><w:separator/></w:r>') + `</w:${kind}><w:${kind} ` +
  'w:type="continuationSeparator" w:id="0">' +
  p('<w:r><w:continuationSeparator/></w:r>') + `</w:${kind}>`;
const part = (root, inner, ns = '') => DECL + `<w:${root} xmlns:w="` +
  `${W_NS}" xmlns:r="${R_NS}"${ns}>${inner}</w:${root}>`;
const comment = (id, who, ini, date, text, pid) => `<w:comment w:id=` +
  `"${id}" w:author="${who}" w:initials="${ini}" w:date="${date}">` +
  `<w:p w14:paraId="${pid}">` + '<w:r><w:annotationRef/></w:r>' +
  r(text) + '</w:p></w:comment>';

/** See the header. */
export function review() {
  const parts = {
    'word/document.xml': documentXml(body() + SECT),
    'word/footnotes.xml': part('footnotes', seps('footnote') +
      note('footnote', 1, p(`<w:r><w:rPr>${SUP}</w:rPr><w:footnoteRef/>` +
        '</w:r>' + r(' A ') + r('bold', '<w:b/>') + r(' note.')))),
    'word/endnotes.xml': part('endnotes', seps('endnote') +
      note('endnote', 1, p(`<w:r><w:rPr>${SUP}</w:rPr><w:endnoteRef/>` +
        '</w:r>' + r(' An ') + r('italic', '<w:i/>') + r(' end.')))),
    'word/comments.xml': part('comments',
      comment(0, 'Ann Lee', 'AL', D1, 'Check this range', '00000001') +
      comment(1, 'Bob Ray', 'BR', D2, 'A point', '00000002') +
      comment(2, 'Bob Ray', 'BR', D2, 'A reply', '00000003'),
      ` xmlns:w14="${W14}"`),
    'word/commentsExtended.xml': DECL + `<w15:commentsEx xmlns:w15="${W15}">` +
      '<w15:commentEx w15:paraId="00000001" w15:done="0"/>' +
      '<w15:commentEx w15:paraId="00000002" w15:done="0"/>' +
      '<w15:commentEx w15:paraId="00000003" w15:paraIdParent="00000001" ' +
      'w15:done="0"/></w15:commentsEx>',
    'word/footer1.xml': part('ftr', p(r('Footer page ') +
      fld(' PAGE ', '1'))),
  };
  const docRels = [['rIdN1', REL('footnotes'), 'footnotes.xml'],
    ['rIdN2', REL('endnotes'), 'endnotes.xml'],
    ['rIdC1', REL('comments'), 'comments.xml'],
    ['rIdC2', EXT_REL, 'commentsExtended.xml'],
    ['rIdF1', REL('footer'), 'footer1.xml'],
    ['rIdL1', REL('hyperlink'), 'http://example.org/page', 'External'],
    ['rIdL2', REL('hyperlink'), 'mailto:someone@example.org',
      'External']];
  return buildDocx(parts, {docRels});
}

// ---------------------------------------------------------------------
// the measure

const blocksOf = (bs) => bs.flatMap((b) => (b.type === 'tbl'
  ? b.rows.flatMap((row) => row.cells.flatMap((c) => blocksOf(c.blocks)))
  : [b]));
const plain = (s) => s.replaceAll('\uFFFC', '').replace(/\s+/g, ' ')
  .trim();
const name = (x) => x && x.node && x.node.name;
const attr = (x, k) => {
  const a = (x.node.attrs || []).find((q) => q[0] === k);
  return a ? a[1] : undefined;
};

/** Each paragraph's inlines in order: [index, inline]. */
const inl = (p) => Object.entries(p.inlines || {}).map(([i, x]) =>
  [Number(i), x]).sort((a, b) => a[0] - b[0]);

/** A field's name: its code's first word (or '='), upper case. */
const fieldName = (code) => {
  const m = /^\s*(=|[A-Za-z]+)/.exec(code);
  return m ? m[1].toUpperCase() : '';
};

/** The fields of blocks: [name, result], in the order they end
 *  (nested ones too; a w:fldSimple's result is inside it). */
function fieldsOf(bs) {
  const out = [], open = [];
  let all = '';
  for (const p of blocksOf(bs).filter((b) => b.type === 'p')) {
    const base = all.length;
    all += p.text + ' ';
    for (const [i, x] of inl(p)) {
      const n = name(x), top = open.at(-1);
      if (n === 'w:fldSimple') {
        out.push([fieldName(attr(x, 'w:instr') || ''),
          plain(x.text || '')]);
      } else if (n === 'w:instrText' && top && top.from < 0) {
        top.code += x.node.children.join('');
      } else if (n === 'w:fldChar') {
        const t = attr(x, 'w:fldCharType');
        if (t === 'begin') open.push({code: '', from: -1});
        else if (t === 'separate' && top) top.from = base + i + 1;
        else if (t === 'end' && top) {
          open.pop();
          out.push([fieldName(top.code), top.from < 0 ? ''
            : plain(all.slice(top.from, base + i))]);
        }
      }
    }
  }
  return out;
}

/**
 * What the comparison looks at: notes [kind, text], comments [author,
 * initials, date, text, range text, has parent], tracked changes
 * [kind, author, date, text] of the runs and paragraph marks, fields
 * [name, result] of the body and of the footer, links [target], and
 * bookmark names.
 */
export function reviewLook(doc) {
  const body = doc.sections.flatMap((s) => s.blocks);
  const ps = blocksOf(body).filter((b) => b.type === 'p');
  const notes = [];
  for (const kind of ['footnotes', 'endnotes']) {
    for (const n of doc.notes[kind].values()) {
      if (n.type === 'normal') {
        notes.push([kind, plain(n.blocks.map((b) => b.text).join(' '))]);
      }
    }
  }
  const ranges = new Map();
  for (const p of ps) {
    for (const [i, x] of inl(p)) {
      if (name(x) === 'w:commentRangeStart') {
        ranges.set(attr(x, 'w:id'), {p, from: i});
      } else if (name(x) === 'w:commentRangeEnd') {
        const s = ranges.get(attr(x, 'w:id'));
        if (s && s.p === p) s.text = plain(p.text.slice(s.from, i));
      }
    }
  }
  const comments = [...doc.comments.map.values()].map((c) => [c.author,
    c.initials, c.date, plain(c.blocks.map((b) => b.text).join(' ')),
    (ranges.get(String(c.id)) || {}).text ?? null, c.parent !== null &&
    c.parent !== undefined]);
  const changes = [];
  for (const p of ps) {
    for (const x of p.runs) {
      if (x.rev) {
        changes.push([x.rev.kind, x.rev.author, x.rev.date,
          p.text.slice(x.start, x.end)]);
      }
    }
    const m = p.pPr.extra.find((e) => e && e.name === 'w:rPr');
    const k = m && m.children.find((e) => e && (e.name === 'w:del' ||
      e.name === 'w:ins'));
    if (k) {
      const a = Object.fromEntries(k.attrs);
      changes.push([k.name.slice(2) + ' mark', a['w:author'],
        a['w:date'], '']);
    }
  }
  const links = [], marks = [];
  for (const p of ps) {
    for (const [, x] of inl(p)) {
      if (name(x) === 'w:hyperlink') {
        const id = attr(x, 'r:id');
        const rel = id && doc.rels.find((q) => q.id === id);
        links.push(rel ? rel.target : '#' + attr(x, 'w:anchor'));
      } else if (name(x) === 'w:bookmarkStart') {
        marks.push(attr(x, 'w:name'));
      }
    }
  }
  const refs = refsOf(doc.sections[0], docScope(doc).map);
  const fid = refs.ftr && refs.ftr.default;
  const footer = fid ? fieldsOf(doc.stories.get(storyOfRef(doc, fid))
    .blocks) : [];
  return {notes, comments, changes, fields: fieldsOf(body), footer,
    links, bookmarks: marks.filter((m) => !m.startsWith('_'))};
}

/** See the header. */
export const REVIEW_KEYS = ['footnotes', 'endnotes', 'comments',
  'changes', 'fields', 'links', 'bookmarks'];

/** See the header. */
export function reviewCounts(doc) {
  const L = reviewLook(doc);
  return {footnotes: L.notes.filter((n) => n[0] === 'footnotes').length,
    endnotes: L.notes.filter((n) => n[0] === 'endnotes').length,
    comments: L.comments.length, changes: L.changes.length,
    fields: [...L.fields, ...L.footer].filter(([n]) => SAFE.has(n) &&
      n !== 'HYPERLINK').length,
    links: L.links.length, bookmarks: L.bookmarks.length};
}
