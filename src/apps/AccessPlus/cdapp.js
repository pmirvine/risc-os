// !AccessCD (HardDisc4.Utilities.Access+.!AccessCD) - Acorn AccessCD 1.02, the CD-ROM share cache
// front end. See docs/apps/AccessCD.md. Its !RunImage lives in Resources, so that placeholder is
// registered as a native stand-in too; its !Boot / !RunCDFS (CDCache module, TestCDP, SetCache) are
// replaced by boot() below.
import { registerNative } from '../../core/native.js';
import { os } from '../../core/os.js';

const DIR = 'ADFS::HardDisc4.$.Utilities.Access+.!AccessCD';
registerNative('$.Utilities.Access+.!AccessCD.Resources.!RunImage', { run: async () => { await os.apps.start('AccessCD'); } });
registerNative('$.Utilities.Access+.!AccessCD.Resources.Utils.SetCache');   // sets the CDCache size (no cache here)
registerNative('$.Utilities.Access+.!AccessCD.Resources.rm.CDCacheP');      // the CD cache module

export default {
  name: 'AccessCD',
  appName: '!AccessCD',
  appDir: DIR,
  sprite: '!accesscd',
  sprites: [{ pool: 'AccessCD', file: '!Sprites22' }],
  memory: 32,
  help: false,
  info: { name: 'AccessCD', purpose: 'Peer to Peer CD Cacheing', author: '© Acorn Computers Ltd, 1994', version: '1.02 (23-May-1995)' },
  boot(os, d) {
    // !Boot: Set AccessCD$Dir / AccessCD$Path (and AccessCDS$… from !Run)
    if (!os.vfs.exists(d.appDir)) return;
    const c = os.vfs.canonical(d.appDir);
    os.sysvars.set('AccessCD$Path', c + '.');
    os.sysvars.set('AccessCDS$Dir', c);
    os.sysvars.set('AccessCDS$Path', c + '.');
  },
  load: () => import('./cdmain.js'),
};
