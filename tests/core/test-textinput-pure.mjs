// The text-input proxy's text cleaning (src/core/textinput.js sanitizeText) in node:
// node --test tests/core/test-textinput-pure.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, MAX_TEXT } from '../../src/core/textinput.js';

test('plain text, accents, astral characters pass unchanged', () => {
  assert.deepEqual(sanitizeText('é€😀 a'), { text: 'é€😀 a', truncated: false });
  assert.deepEqual(sanitizeText(''), { text: '', truncated: false });
  assert.deepEqual(sanitizeText(null), { text: '', truncated: false });
});

test('control characters other than \\n and \\t are dropped; CR and CRLF become \\n', () => {
  assert.equal(sanitizeText('a\u0001b\u0007c\td\ne\u007f\u0085f\u009f').text, 'abc\td\nef');
  assert.equal(sanitizeText('x\r\ny\rz').text, 'x\ny\nz');
  assert.equal(sanitizeText('\u0000\u001b').text, '');
});

test('lone surrogates become U+FFFD, pairs are kept', () => {
  assert.equal(sanitizeText('\uD800x').text, '�x');
  assert.equal(sanitizeText('x\uDC00').text, 'x�');
  assert.equal(sanitizeText('\uDC00\uD800').text, '��');
  assert.equal(sanitizeText('😀').text, '😀');
  assert.equal(sanitizeText('\uD83D').text, '�');
});

test('at most MAX_TEXT (100,000) UTF-16 units, flagged truncated, never splitting a pair', () => {
  assert.equal(MAX_TEXT, 100000);
  const r = sanitizeText('x'.repeat(150000));
  assert.equal(r.text.length, 100000);
  assert.equal(r.truncated, true);
  assert.deepEqual(sanitizeText('x'.repeat(100000)), { text: 'x'.repeat(100000), truncated: false });
  const p = sanitizeText('x'.repeat(99999) + '😀😀');
  assert.equal(p.truncated, true);
  assert.equal(p.text, 'x'.repeat(99999));
});

// ---- clipboard caps (src/core/textinput.js pastePayload / copyData, used by Wimp._paste / _copyCut)
import { pastePayload, copyData, MAX_HTML, MAX_FILES, MAX_COPY_TEXT, MAX_COPY_HTML, COPY_TYPES } from '../../src/core/textinput.js';

test('caps: constants', () => {
  assert.equal(MAX_HTML, 2000000);
  assert.equal(MAX_FILES, 8);
  assert.equal(MAX_COPY_TEXT, 5000000);
  assert.equal(MAX_COPY_HTML, 8000000);
  assert.deepEqual([...COPY_TYPES], ['text/plain', 'text/html', 'text/uri-list']);
});

test('pastePayload: text cleaned and capped like typed text, html kept as is', () => {
  const p = pastePayload({ text: 'a\r\nb\u0001', html: '<b>x</b><script>y</script>', files: [] });
  assert.deepEqual(p, { text: 'a\nb', html: '<b>x</b><script>y</script>', files: [] });
  assert.equal(pastePayload({ text: 'x'.repeat(150000) }).text.length, MAX_TEXT);
  assert.deepEqual(pastePayload({}), { text: '', html: '', files: [] });
  assert.deepEqual(pastePayload(null), { text: '', html: '', files: [] });
});

test('pastePayload: html over 2,000,000 characters is dropped, never truncated', () => {
  assert.equal(pastePayload({ html: 'h'.repeat(MAX_HTML) }).html.length, MAX_HTML);
  assert.equal(pastePayload({ html: 'h'.repeat(MAX_HTML + 1) }).html, '');
  assert.equal(pastePayload({ html: 42 }).html, '');
});

test('pastePayload: at most 8 files, passed through unread', () => {
  const files = Array.from({ length: 9 }, (_, i) => ({ name: 'f' + i }));
  const p = pastePayload({ files });
  assert.equal(p.files.length, 8);
  assert.equal(p.files[0], files[0]);
  assert.equal(p.files[7], files[7]);
  assert.deepEqual(pastePayload({ files: { length: 2, 0: 'a', 1: 'b' } }).files, ['a', 'b']);   // array-like (FileList)
});

test('copyData: only text/plain, text/html, text/uri-list with string data under the caps', () => {
  const d = copyData();
  assert.equal(d.setData('text/plain', 'a'), true);
  assert.equal(d.setData('text/html', '<b>a</b>'), true);
  assert.equal(d.setData('application/x-evil', 'x'), false);
  assert.equal(d.setData('text/uri-list', 'http://example.com/'), true);
  assert.equal(d.setData('TEXT/PLAIN', 'b'), false);
  assert.equal(d.setData('text/plain', 5), false);
  assert.equal(d.setData('text/plain', null), false);
  assert.deepEqual([...d.entries], [['text/plain', 'a'], ['text/html', '<b>a</b>'], ['text/uri-list', 'http://example.com/']]);
  assert.equal(d.setData('text/plain', 'c'), true);   // a later value replaces the earlier one
  assert.equal(d.entries.get('text/plain'), 'c');
});

test('copyData: larger than the caps is dropped (and an earlier value for that type removed)', () => {
  const d = copyData();
  assert.equal(d.setData('text/plain', 'x'.repeat(MAX_COPY_TEXT)), true);
  assert.equal(d.setData('text/plain', 'x'.repeat(MAX_COPY_TEXT + 1)), false);
  assert.equal(d.entries.has('text/plain'), false);
  assert.equal(d.setData('text/html', 'h'.repeat(MAX_COPY_HTML)), true);
  assert.equal(d.setData('text/html', 'h'.repeat(MAX_COPY_HTML + 1)), false);
  assert.equal(d.entries.size, 0);
  assert.equal(d.setData('text/uri-list', 'u'.repeat(MAX_COPY_TEXT + 1)), false);
});

test('copyData: setData after close() does nothing', () => {
  const d = copyData();
  d.setData('text/plain', 'a');
  d.close();
  assert.equal(d.setData('text/plain', 'b'), false);
  assert.equal(d.entries.get('text/plain'), 'a');
});
