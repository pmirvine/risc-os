// Descriptor for !Flasher (Diversions): the caret flasher. Code loads on first run.
export default {
  name: 'Flasher',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Flasher',
  sprites: [{ pool: 'Flasher', file: '!Sprites' }],
  memory: 24,                        // !Run: Wimpslot -min 24k
  help: false,                       // !Help is an application (the text reader, ./helpapp.js)
  info: { name: 'Flasher', purpose: 'Caret Flasher', author: 'By Minerva Software, 1990', version: '1.06 (15-Sep-94)' },
  load: () => import('./main.js'),
};
