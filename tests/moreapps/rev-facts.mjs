// Prints the tracked-change facts of the corpus (Batch F2): run it
// with node tests/moreapps/rev-facts.mjs (WORD_EDIT_CORPUS=1 for
// every file, else one in ten). Not a test.
import {revFiles, factsOf, sumFacts} from './rev-oracle.mjs';
import {ALL} from './roundtrip-lib.mjs';

const files = await revFiles();
if (!files.length) {
  console.log('# no corpus (tests/moreapps/corpus) or no revisions');
  process.exit(0);
}
const list = [];
for (const f of files) {
  try { list.push(await factsOf(f.path)); }
  catch (e) { console.log(`# ${f.file}: unreadable`); }
}
console.log(`# revision facts${ALL ? '' : ' (sample)'}: ` +
  JSON.stringify(sumFacts(list)));
const per = {};
for (const f of list) for (const [k, v] of Object.entries(f))
  if (v > 0) per[k] = (per[k] || 0) + 1;
console.log('# files having each: ' + JSON.stringify(per));
if (revFiles.skipped.length)
  console.log('# skipped: ' + JSON.stringify(revFiles.skipped));
