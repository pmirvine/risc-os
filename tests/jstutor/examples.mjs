// Every example program in tools/jstutor/examples.json runs from $.Examples.JS without an error box and prints
// what it should.
import { launch, BASE_URL } from '../core/pw.mjs';
import { list, prepare, runExample, finish } from '../../tools/jstutor/harness.mjs';

const { browser, page, logs } = await launch();
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await prepare(page);
for (const e of list().filter((x) => x.run)) {
  const r = await runExample(page, e);
  const missing = (e.expect ?? []).filter((s) => !r.out.includes(s));
  if (e.expectError) {   // a program that goes wrong on purpose (and its error box is on screen, not collected)
    const box = await page.evaluate(() => document.body.innerText);
    const found = box.includes(e.expectError);
    console.log(`${found ? 'PASS' : 'FAIL'} ${e.run} reports "${e.expectError}"`);
    await finish(page);
    continue;
  }
  const ok = !r.msgs.length && !missing.length;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${e.run}${e.args ? ' ' + e.args : ''}${r.msgs.length ? ' errors: ' + r.msgs.join('; ') : ''}${missing.length ? ' missing output: ' + JSON.stringify(missing) + ' got: ' + JSON.stringify(r.out.slice(0, 300)) : ''}`);
  await finish(page);
}
const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
