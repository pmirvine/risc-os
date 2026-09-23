// Descriptor for !MemNow (Diversions): free memory display on the icon bar. Code loads on first run.
export default {
  name: 'MemNow',
  appDir: 'ADFS::HardDisc4.$.Diversions.!MemNow',
  sprites: [{ pool: 'MemNow', file: '!Sprites' }],
  memory: 16,                        // !Run: Wimpslot -min 16K
  info: { name: 'MemNow', purpose: 'Display free memory', author: '© Acorn Computers Ltd, 1993', version: '0.02 (08-Aug-94)' },
  load: () => import('./main.js'),
};
