// !System (Boot:Resources.!System). Double-clicking it runs !Run, which sets System$Dir and runs the
// SysPaths utility (an absolute file, not on the seed disc) to set System$Path to the version
// subdirectories. Nothing appears on screen - just as on RISC OS 3.71.
import { os } from '../../core/os.js';
export default {
  name: 'System', appName: '!System', appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!System', help: false, memory: 12,
  start(task, ctx) {
    const sv = os.sysvars, dir = ctx.dir ?? sv.get('System$Dir');
    sv.set('System$Dir', dir);
    // SysPaths: newest OS version directory first (3.71 uses 370, 350, 310, 300, 200)
    const vers = ['370', '350', '310', '300', '200'].filter((v) => os.vfs.exists(`${dir}.${v}`));
    sv.set('System$Path', vers.map((v) => `${dir}.${v}.`).join(',') + (vers.length ? ',' : '') + `${dir}.`);
    task.quit();
  },
};
