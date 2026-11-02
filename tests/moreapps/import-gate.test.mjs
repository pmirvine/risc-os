// The import gate (Batch G1, task 9b): a !Letters source imports the
// library by name, as 'wimplib/<Name>', never by a relative path out
// of the application ('../!WimpLib/PdfFont'). Under Node both work
// (tools/moreapps/package.json), but on the disc !Letters lives in
// $.MoreApps and the library in $.!Boot.Resources.!WimpLib, so a
// relative import fails there ("Can't find '../!WimpLib/PdfWrite'")
// and !Letters does not start. Every import or export ... from, and
// every import(), in a !Letters source (comment lines left out) is
// checked: its specifier may not start with '../'.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = fileURLToPath(new URL('../../tools/moreapps/!Letters/',
  import.meta.url));

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Module specifiers that leave the application: ['../x', ...]. */
export function outsideImports(text) {
  const code = text.split('\n').filter((l) => !isComment(l))
    .join('\n');
  const re = /\b(?:from|import)\s*\(?\s*(['"`])(\.\.\/[^'"`]*)\1/g;
  return [...code.matchAll(re)].map((m) => m[2]);
}

/** Every source file of !Letters (not the Fonts directory). */
function sources() {
  return readdirSync(DIR).filter((f) => statSync(join(DIR, f))
    .isFile()).map((f) => ({file: f,
    text: readFileSync(join(DIR, f), 'latin1')}))
    .filter((x) => !x.text.includes('\0'));
}

/** Lines of text naming each import that leaves the application. */
function problems(files) {
  const out = [];
  for (const {file, text} of files) {
    for (const spec of outsideImports(text)) {
      out.push(`${file}: imports '${spec}' (import the library as ` +
        "'wimplib/<Name>': a relative path does not exist on the " +
        'disc)');
    }
  }
  return out;
}

describe('import gate: !Letters imports the library by name', () => {
  it('the matcher catches the forms it is for, not comments', () => {
    assert.deepEqual(outsideImports(
      "import {num} from '../!WimpLib/PdfWrite';"),
    ['../!WimpLib/PdfWrite']);
    assert.deepEqual(outsideImports(
      'import {FontSet}\n  from "../!WimpLib/PdfFont";'),
    ['../!WimpLib/PdfFont']);
    assert.deepEqual(outsideImports(
      "export {x} from '../WimpLib/Zip';"), ['../WimpLib/Zip']);
    assert.deepEqual(outsideImports(
      "const m = await import('../!WimpLib/Xml');"),
    ['../!WimpLib/Xml']);
    assert.deepEqual(outsideImports(
      "import {num} from 'wimplib/PdfWrite';\n" +
      "import {keyOf} from './PdfFiles';\n" +
      "import {print} from 'riscos';"), []);
    assert.deepEqual(outsideImports(
      "// fonts a ../!WimpLib/PdfFont FontSet\n" +
      " * from '../!WimpLib/PdfFont'"), []);
  });
  it('a planted ../!WimpLib import fails the gate', () => {
    const files = sources();
    const k = files.findIndex((x) => x.file === 'PdfSink');
    assert.ok(k >= 0);
    files[k] = {...files[k], text: files[k].text +
      "\nimport {num} from '../!WimpLib/PdfWrite';\n"};
    assert.match(problems(files).join('\n'),
      /PdfSink: imports '\.\.\/!WimpLib\/PdfWrite'/);
  });
  it('no !Letters source imports from outside the application', () => {
    const files = sources();
    assert.ok(files.length > 50, 'the sources were found');
    assert.deepEqual(problems(files), []);
  });
});
