// !Fonts (Boot:Resources.!Fonts): the extra outline fonts (NewHall, Sassoon, Selwyn, Sidney, System).
// Double-clicking runs !Run = *FontInstall, which makes the Font Manager re-scan Font$Path for new
// fonts. The browser fonts are fixed (assets/fonts), so this just (re)adds the directory to Font$Path.
import { os } from '../../core/os.js';
export default {
  name: 'Fonts', appName: '!Fonts', appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!Fonts', help: false, memory: 0,
  start(task, ctx) {
    const sv = os.sysvars, dir = ctx.dir;
    const fp = sv.get('Font$Path') ?? 'Resources:$.Fonts.';
    if (dir && !fp.toLowerCase().includes(dir.toLowerCase())) sv.set('Font$Path', `${fp},${dir}.`);
    task.quit();
  },
};
