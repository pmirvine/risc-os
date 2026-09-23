// Descriptor for !Blocks (Diversions): the falling-blocks game. Code loads on first run.
export default {
  name: 'Blocks',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Blocks',
  sprites: [{ pool: 'Blocks', file: '!Sprites' }],
  memory: 40,                        // !Run: Wimpslot -min 40K
  info: { name: 'Blocks', purpose: 'Falling blocks game', author: '© Acorn Computers Ltd', version: '' },
  load: () => import('./main.js'),
};
