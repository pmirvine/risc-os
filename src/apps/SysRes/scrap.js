// !Scrap (Boot:Resources.!Scrap): the Wimp's scrap (temporary transfer) directory. As its !RunImage
// (PROCRun / PROCBoot): Wimp$ScrapDir = <Scrap$Dir>.ScrapDirs.ScrapDir, Wimp$Scrap = <that>.ScrapFile,
// and the directory is created ("CDir … 1"). !Boot (seen by the Filer at start-up) does it when
// Wimp$ScrapDir isn't set yet (here: still the core's placeholder), !Run always. Silent, like 3.71.
import { os } from '../../core/os.js';

function setScrap(dir, { boot = false } = {}) {
  const sv = os.sysvars;
  const cur = sv.get('Wimp$ScrapDir') ?? '';
  if (boot && cur && !/!Scrap\.ScrapDir$/i.test(cur) && cur !== 'System:ScrapDir') return;   // already set by someone else
  sv.set('Scrap$Dir', dir);
  const sd = `${dir}.ScrapDirs.ScrapDir`;
  try { if (!os.vfs.exists(sd)) os.vfs.mkdir(sd, { parents: true }); } catch { /* read-only */ }
  sv.set('Wimp$ScrapDir', sd);
  sv.set('Wimp$Scrap', `${sd}.ScrapFile`);
}

export default {
  name: 'Scrap', appName: '!Scrap', appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!Scrap', help: false, memory: 8,
  boot(os_, d) { setScrap(os.vfs.exists(d.appDir) ? os.vfs.canonical(d.appDir) : d.appDir, { boot: true }); },
  start(task, ctx) {
    setScrap(ctx.dir ?? os.sysvars.get('Scrap$Dir'));
    task.quit();
  },
};
