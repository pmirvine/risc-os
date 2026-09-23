// !Scrap (Boot:Resources.!Scrap): the Wimp's scrap (temporary transfer) directory. !Run sets
// Scrap$Dir, Wimp$ScrapDir and Wimp$Scrap and creates the ScrapDirs directory. Silent, like 3.71.
import { os } from '../../core/os.js';
export default {
  name: 'Scrap', appName: '!Scrap', appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!Scrap', help: false, memory: 8,
  start(task, ctx) {
    const sv = os.sysvars, dir = ctx.dir ?? sv.get('Scrap$Dir');
    sv.set('Scrap$Dir', dir);
    const sd = `${dir}.ScrapDirs`;
    try { if (!os.vfs.exists(sd)) os.vfs.mkdir(sd, { parents: true }); } catch { /* read-only */ }
    sv.set('Wimp$ScrapDir', sd);
    sv.set('Wimp$Scrap', `${sd}.ScrapFile`);
    task.quit();
  },
};
