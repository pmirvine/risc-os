// !Configure — the RISC OS 3.71 configuration application (Sources/SystemRes/Configure).
// ROM application (Resources:$.Apps.!Configure); the copy in !Boot.Resources.!Configure on the
// hard disc is redirected here too (see boot()).
import { os } from '../../core/os.js';

const desc = {
  name: 'Configure',
  appName: '!Configure',
  sprite: '!configure',
  memory: 192,
  filetypes: { 0xFF2: { name: 'Config' } },
  info: { name: 'Configure', purpose: 'Configuring the computer', author: '© Acorn Computers Ltd, 1996', version: '1.85 (02-Aug-96)' },
  boot(os, d) {
    // !Boot.Resources.!Configure on the disc: its !Run ends "/Configure:!RunImage %*0" - route it to us.
    const disc = 'ADFS::HardDisc4.$.!Boot.Resources.!Configure';
    if (os.vfs.exists(disc) && !os.apps.apps.some((a) => a._configureAlias)) {
      os.apps.register({
        name: 'Configure', appName: '!Configure', appDir: disc, sprite: '!configure', memory: 192, help: false, _configureAlias: true,
        start: async (task, ctx) => { task.quit(); await os.apps.start(d, ctx.args ?? ''); },
      });
    }
  },
  load: () => import('./main.js'),
};
export default desc;
