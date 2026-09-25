// node --test tests/jsedit : !JsEdit, the programmer's editor (src/apps/JsEdit).
import { suite } from '../lib/suite.mjs';
suite('jsedit', [
  { name: 'lexers', args: ['tests/jsedit/lexers.mjs'], browser: false },
  { name: 'editor', args: ['tests/jsedit/editor.mjs'] },
]);
