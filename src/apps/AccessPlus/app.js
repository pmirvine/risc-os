// !Access+ (HardDisc4.Utilities.Access+.!Access+) - the Acorn Access+ Sharer 1.01. See docs/apps/AccessPlus.md.
// Double-clicking the application directory (or *Run of its !Run / !RunImage) starts main.js; the
// disc's !Run (which loads ShareFS/Freeway and runs Resources.StartImage → !RunImage) is not needed.
// Also provides the ShareFS *Share / *UnShare / *Shares commands (local only, sharefs.js).
import { commands as shareCommands } from './sharefs.js';
import { os } from '../../core/os.js';

// what the disc's !Run sets up (file types of the ShareFS disc icons)
const TYPES = { BDA: 'Disc', BD9: 'DiscP', FB5: 'NoDisc', FB4: 'DiscR', F9F: 'DiscD', F9E: 'DiscDP', F9D: 'DiscCD' };

export default {
  name: 'Access+',
  appName: '!Access+',
  dirVar: 'Access+$Dir',
  appDir: 'ADFS::HardDisc4.$.Utilities.Access+.!Access+',
  sprite: '!access+',
  sprites: [{ pool: 'AccessPlus', file: '!Sprites22' }, { pool: 'ShareFS', file: '!Sprites22' }],
  memory: 32,
  help: false,                       // the disc copy has its own !Help
  info: { name: 'Access+', purpose: 'Access+ sharer application', author: '© Acorn Computers Ltd, 1994', version: '1.01 (24-May-1995)' },
  commands: shareCommands(() => os.vfs),
  boot(os, d) {
    const sv = os.sysvars;
    if (d.appDir && os.vfs.exists(d.appDir)) sv.set('Access$Path', os.vfs.canonical(d.appDir) + '.');
    sv.set('ShareFS$Path', 'Resources:$.Resources.ShareFS.');
    for (const [t, n] of Object.entries(TYPES)) sv.set('File$Type_' + t, n);
  },
  load: () => import('./main.js'),
};
