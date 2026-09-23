// Checks the IndexedDB overlay: files written to the hard disc survive a reload; seed files deleted stay deleted.
import { launch, BASE_URL } from './pw.mjs';
const { browser, page, logs } = await launch();
const ready = () => page.waitForFunction(() => window.os?.filer?.task && window.os.vfs.hd, null, { timeout: 15000 });
await page.goto(BASE_URL + '?fast=1'); await ready();
await page.evaluate(async () => {
  os.vfs.mkdir('$.MyWork');
  os.vfs.writeFile('$.MyWork.Hello', 'Hello world', { filetype: 0xFFF });
  os.vfs.rename('$.Replay', '$.ReplayOld');
  os.vfs.delete('$.Video', { recursive: true, force: true });
  os.vfs.writeFile('ADFS::0.$.OnFloppy', 'x');
  os.vfs.writeFile('RAM::RamDisc0.$.Temp', 'x');
  await new Promise((r) => setTimeout(r, 300));
});
await page.reload(); await ready();
const r = await page.evaluate(async () => [
  os.vfs.exists('$.MyWork.Hello') && (await os.vfs.readText('$.MyWork.Hello')) === 'Hello world',
  os.vfs.stat('$.MyWork.Hello')?.filetype === 0xFFF,
  os.vfs.exists('$.ReplayOld.!ReadMe') || os.vfs.exists('$.ReplayOld'),
  !os.vfs.exists('$.Replay'),
  !os.vfs.exists('$.Video'),
  os.vfs.exists('ADFS::0.$.OnFloppy'),
  !os.vfs.exists('RAM::RamDisc0.$.Temp'),
]);
console.log(['file persisted', 'type persisted', 'renamed dir kept', 'old name gone', 'deleted stays deleted', 'floppy persisted', 'RAM not persisted'].map((n, i) => `${r[i] ? 'PASS' : 'FAIL'} ${n}`).join('\n'));
// clean up
await page.evaluate(() => os.vfs.store.clear());
await browser.close();
