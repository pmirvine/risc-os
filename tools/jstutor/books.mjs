// Which tutorial book the tools work on: tools/<dir> with a book.json, chosen with --book <dir> or the JSBOOK
// environment variable (default jstutor, "Programming in JavaScript"; jsapps is "Writing Desktop Applications in
// JavaScript"). book.json's "disc" gives where it goes: {"manual": "JSTutor", "examples": "JS"} makes
// $.Manuals.JSTutor and $.Examples.JS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function bookDir(argv = process.argv) {
  const i = argv.indexOf('--book');
  return (i >= 0 ? argv[i + 1] : null) ?? process.env.JSBOOK ?? 'jstutor';
}

/** {id, src (its tools directory), book (book.json), manual, examples, examplesPath (RISC OS)} */
export function currentBook(argv = process.argv) {
  const id = bookDir(argv).replace(/^tools\//, '').replace(/\/$/, '');
  const src = path.join(ROOT, 'tools', id);
  const book = JSON.parse(fs.readFileSync(path.join(src, 'book.json'), 'utf8'));
  const manual = book.disc?.manual ?? 'JSTutor', examples = book.disc?.examples ?? 'JS';
  return { id, src, book, manual, examples, examplesPath: `ADFS::HardDisc4.$.Examples.${examples}` };
}
