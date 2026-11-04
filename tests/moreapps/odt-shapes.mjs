// odt-shapes (ODT import, final review): the large files the review
// measured the element budget with (./OdtXml MAX_ELEMENTS), built
// from spec-derived markup (odt-helpers.mjs, from OpenDocument 1.3).
//
//   shape(kind, n?, k?) -> Uint8Array, an .odt
import {storedZip, NS, TEXT} from './odt-helpers.mjs';

/** The review's shapes. mixed: n paragraphs of 13 elements each
 *  (bookmarks, a comment over a range, a note, a span, spaces).
 *  two: content.xml of 190,000 paragraphs of 9 spans, styles.xml of
 *  1,900,000 tab stops. legit: n plain paragraphs, k styled spans
 *  each. Every part deflated, as office programs write them. */
export function shape(kind, n = 0, k = 0) {
  const man = '<?xml version="1.0"?><manifest:manifest xmlns:manifest=' +
    '"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
    '</manifest:manifest>';
  const doc = (body, auto = '') => '<?xml version="1.0" encoding=' +
    `"UTF-8"?><office:document-content ${NS}><office:automatic-styles>` +
    `${auto}</office:automatic-styles><office:body><office:text>` +
    `${body}</office:text></office:body></office:document-content>`;
  const parts = [['mimetype', TEXT], ['META-INF/manifest.xml', man]];
  const out = [];
  if (kind === 'mixed') {
    for (let i = 0; i < n; i++) {
      out.push(`<text:p text:style-name="P${i % 50}">a<text:bookmark-` +
        `start text:name="b${i}"/><office:annotation office:name="c${i}">` +
        `<dc:creator>A${i % 7}</dc:creator><text:p>c</text:p>` +
        `</office:annotation>x<text:span text:style-name="T${i % 30}">s` +
        '</text:span><text:s text:c="3"/><text:bookmark-end text:name=' +
        `"b${i}"/><office:annotation-end office:name="c${i}"/><text:note` +
        ' text:note-class="footnote"><text:note-citation>1</text:note-' +
        'citation><text:note-body><text:p>n</text:p></text:note-body>' +
        '</text:note></text:p>');
    }
    parts.push(['content.xml', doc(out.join('')), {deflate: true}]);
  } else if (kind === 'two') {
    const p = '<text:p>' + '<text:span>s</text:span>'.repeat(9) +
      '</text:p>';
    parts.push(['content.xml', doc(p.repeat(190000)), {deflate: true}]);
    parts.push(['styles.xml', '<?xml version="1.0" encoding="UTF-8"?>' +
      `<office:document-styles ${NS}><office:styles><style:style ` +
      'style:name="X" style:family="paragraph"><style:paragraph-' +
      'properties><style:tab-stops>' + '<style:tab-stop/>'
      .repeat(1900000) + '</style:tab-stops></style:paragraph-' +
      'properties></style:style></office:styles></office:document-' +
      'styles>', {deflate: true}]);
  } else {
    for (let i = 0; i < n; i++) {
      let p = `<text:p text:style-name="P${i % 5}">Paragraph ${i} of ` +
        'the text, with some words';
      for (let j = 0; j < k; j++) {
        p += ` and <text:span text:style-name="T${j % 3}">a span ${j}` +
          '</text:span>';
      }
      out.push(p + '.</text:p>');
    }
    const auto = [0, 1, 2, 3, 4].map((i) => `<style:style style:name=` +
      `"P${i}" style:family="paragraph"><style:paragraph-properties ` +
      `fo:margin-left="${i}mm"/></style:style>`).join('') +
      [0, 1, 2].map((i) => `<style:style style:name="T${i}" style:` +
      'family="text"><style:text-properties fo:font-weight="bold"/>' +
      '</style:style>').join('');
    parts.push(['content.xml', doc(out.join(''), auto), {deflate: true}]);
  }
  return storedZip(parts);
}

