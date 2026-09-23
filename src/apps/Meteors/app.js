// Descriptor for !Meteors (Diversions). The original is a relocatable module started by
// *Meteors_Start from !Run; it has no icon bar icon - just the Arena window.
import { os } from '../../core/os.js';

export default {
  name: 'Meteors',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Meteors',
  sprites: [{ pool: 'Meteors', file: '!Sprites' }],
  memory: 28,
  multiInstance: true,
  info: { name: 'Meteors', purpose: 'Asteroids game', author: 'Neil Raine', version: '0.18 (28 Jan 1994)' },
  commands: {
    Meteors_Start: {
      syntax: 'Syntax: *Meteors_Start',
      help: '*Meteors_Start starts up an instance of the meteors module',
      run: async () => { await os.apps.start('Meteors'); },
    },
  },
  load: () => import('./main.js'),
};
