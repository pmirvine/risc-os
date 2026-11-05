// The bug templates fix: DocxWrite keeps the main part's original
// [Content_Types].xml override, so a Doc read from a .dotx and saved
// as .docx keeps template.main+xml on the main part. This guards the
// writer's behaviour (the type is the Doc's meta, not the extension)
// and emits both variants for real Word (WORD_EMIT).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Letters/DocxWrite';
import {emit} from './word-emit.mjs';

const WML = 'application/vnd.openxmlformats-officedocument.' +
  'wordprocessingml.';
const DATE = new Date('2026-01-02T03:04:05Z');

const withMainType = (type) => {
  const doc = newDoc({date: DATE});
  const main = '/' + doc.meta.mainPart;
  doc.meta.contentTypes = {...doc.meta.contentTypes,
    overrides: doc.meta.contentTypes.overrides.map(([p, t]) =>
      p === main ? [p, type] : [p, t])};
  return doc;
};
const mainType = (doc) => doc.meta.contentTypes.overrides.find(
  ([p]) => p === '/' + doc.meta.mainPart)[1];

describe('main content type survives a write', () => {
  it('a template type written as .docx stays template (the bug)',
    async () => {
      const bytes = await writeDocx(withMainType(
        WML + 'template.main+xml'), {date: DATE});
      const back = await readDocx(bytes);
      assert.equal(mainType(back), WML + 'template.main+xml');
      emit('tpl-type-in-docx', bytes,
        {broken: 'template main type in a .docx (the bug)'});
    });
  it('the proper type is written as is', async () => {
    const bytes = await writeDocx(withMainType(WML + 'document.main+xml'),
      {date: DATE});
    assert.equal(mainType(await readDocx(bytes)),
      WML + 'document.main+xml');
    emit('tpl-type-proper', bytes);
  });
});
