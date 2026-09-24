// !CDPlayer - the Audio Panel (Leonardo Fei / Acorn, 1.14), $.Utilities.!CDPlayer on the hard disc.
// Its program, `cdplayer`, is ARM code (a placeholder on the seed disc): running the application
// directory, its !Run or the `cdplayer` file itself starts this JavaScript version. See docs/apps/CDPlayer.md.
import { registerNative } from '../../core/native.js';
import { os } from '../../core/os.js';

// `Run <AudioPanel$Dir>.cdplayer` (the last line of !Run) and running the file directly
registerNative('!CDPlayer.cdplayer', { run: async () => { await os.apps.start('CDPlayer'); } });

export default {
  name: 'CDPlayer',
  appName: '!CDPlayer',
  appDir: 'ADFS::HardDisc4.$.Utilities.!CDPlayer',
  dirVar: 'AudioPanel$Dir',            // !Run: Set AudioPanel$Dir <Obey$Dir>
  sprite: '!cdplayer',
  sprites: [{ pool: 'CDPlayer', file: '!sprites' }],   // !Boot / !Run: Iconsprites <AudioPanel$Dir>.!Sprites
  memory: 160,                         // Wimpslot -min 160K -max 160K
  help: false,                         // the disc copy has its own !Help
  info: { name: 'CD Player', purpose: 'CD Audio remote control', author: '© Next Technology, 1990', version: '1.14 (18 Oct 1993)' },
  load: () => import('./main.js'),
};
