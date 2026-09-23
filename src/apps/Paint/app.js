// !Paint - the RISC OS 3.71 sprite editor (ROM application). Descriptor only: the program is
// loaded on first run (main.js). See docs/apps/Paint.md.
import { os } from '../../core/os.js';

export default {
  name: 'Paint',
  appName: '!Paint',
  appDir: 'Resources:$.Apps.!Paint',
  sprite: '!paint',                         // Wimp pool (ROM app icons live there)
  memory: 128,
  multiInstance: false,
  filetypes: { 0xFF9: { name: 'Sprite' } },
  info: { name: 'Paint', purpose: 'Sprite editor', author: '© Acorn Computers Ltd, 1992', version: '1.94 (17-Feb-95)' },
  commands: {
    Desktop_Paint: {
      syntax: 'Syntax: *Desktop_Paint', help: 'The !Paint module runs the Paint desktop application',
      run: async (argv) => { await os.apps.start('Paint', (argv ?? []).join(' ')); },
    },
  },
  load: () => import('./main.js'),
};
