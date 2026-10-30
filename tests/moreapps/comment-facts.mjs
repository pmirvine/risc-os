// Prints the comment facts of the corpus (Batch F1): run it with
// node tests/moreapps/comment-facts.mjs (WORD_EDIT_CORPUS=1 for every
// file, else one in ten). Not a test.
import {commentFiles, factsOf, sumFacts} from './comment-oracle.mjs';
import {ALL} from './roundtrip-lib.mjs';

const files = await commentFiles();
if (!files.length) {
  console.log('# no corpus (tests/moreapps/corpus) or no comments');
  process.exit(0);
}
const list = [];
for (const f of files) {
  try { list.push(await factsOf(f.path)); }
  catch (e) { console.log(`# ${f.file}: unreadable`); }
}
console.log(`# comment facts${ALL ? '' : ' (sample)'}: ` +
  JSON.stringify(sumFacts(list)));
