// Double-clicking !Boot in the HardDisc4 Filer opens !Configure, as in RISC OS 3.71: !Boot.!Run runs
// Utils.BootVars (a native stand-in for the ARM program) and then Utils.DeskRun (/BootResources:!Configure).
// Also: the placeholder ARM executables show in the Filer with their file types.
import { filerOpen } from '../edit/ui.mjs';

export default async (page) => {
  await page.evaluate(() => {
    window.__errs = [];
    const orig = wimp.reportError.bind(wimp);
    wimp.reportError = (m, o) => { window.__errs.push(m); return orig(m, o); };
  });
  await filerOpen(page, 'ADFS::HardDisc4.$', '!Boot', { wait: 1500 });
  const r = await page.evaluate(() => ({
    errs: window.__errs,
    configure: wimp.tasks.some((t) => t.name === 'Configure'),
    wins: wimp.stack.filter((w) => w.isOpen).map((w) => w.title),
    errorBox: !!document.querySelector('.error-box, .errorbox') || wimp.stack.some((w) => w.isOpen && /^(Error|Message from)/.test(w.title ?? '')),
    vars: Object.fromEntries(['Boot$OSVersion', 'Boot$State', 'Boot$Unique', 'Boot$Dir'].map((v) => [v, os.sysvars.get(v)])),
    bootvars: os.vfs.stat('ADFS::HardDisc4.$.!Boot.Utils.BootVars'),
  }));
  const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`);
  check('!Configure started', r.configure, r.wins.join(' | '));
  check('Configuration window open', r.wins.includes('Configuration'), r.wins.join(' | '));
  check('no error reported', !r.errs.length && !r.errorBox, r.errs.join(' | '));
  check('BootVars variables', r.vars['Boot$OSVersion'] === '370' && r.vars['Boot$State'] === 'desktop' && r.vars['Boot$Unique'] === 'Local' && /\$\.!Boot$/.test(r.vars['Boot$Dir']), JSON.stringify(r.vars));
  check('BootVars placeholder is an Absolute file of size 0', r.bootvars?.filetype === 0xFF8 && r.bootvars.size === 0 && r.bootvars.placeholder, JSON.stringify(r.bootvars));

  // running a placeholder with no stand-in gives a RISC OS error, and reading one gives no data
  const r2 = await page.evaluate(async () => {
    // (ARMovie's Join tool has no stand-in. An application's !RunImage, e.g. !T1ToFont's, starts its JS version.)
    let msg = null;
    try { await os.cli.run('Run ADFS::HardDisc4.$.!Boot.Resources.!ARMovie.Tools.Join'); } catch (e) { msg = e.message; }
    const data = await os.vfs.readFile('ADFS::HardDisc4.$.Utilities.!T1ToFont.!RunImage');
    let jsApp = null;
    try {
      await os.cli.run('Run ADFS::HardDisc4.$.Utilities.!T1ToFont.!RunImage');
      for (let i = 0; i < 50 && !(jsApp = os.apps.tasksOf('T1ToFont').length > 0); i++) await new Promise((res) => setTimeout(res, 100));
      os.apps.tasksOf('T1ToFont').forEach((t) => t.quit());
    } catch (e) { jsApp = e.message; }
    let obeyEnd = null;
    await os.vfs.writeFile('RAM::RamDisc0.$.ObeyEnd', 'Set Test$ObeyEnd 1\nObey\nSet Test$ObeyEnd 2\n', { filetype: 0xFEB });
    await os.cli.run('Run RAM::RamDisc0.$.ObeyEnd');
    obeyEnd = os.sysvars.get('Test$ObeyEnd');
    return { msg, len: data.length, obeyEnd, jsApp };
  });
  check('placeholder without a stand-in reports an error', /ARM code/.test(r2.msg ?? ''), r2.msg);
  check('placeholder reads as empty', r2.len === 0);
  check("a registered app's !RunImage starts the JS app", r2.jsApp === true, String(r2.jsApp));
  check('*Obey with no file ends the Obey file', r2.obeyEnd === '1', r2.obeyEnd);
  await page.screenshot({ path: 'tests/screens/boot-configure.png' });
};
