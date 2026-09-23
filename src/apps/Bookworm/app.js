// Descriptor for !Bookworm (Diversions / multimedia agent). Code loads on first run.
export default {
  name: 'Bookworm',
  appDir: 'ADFS::HardDisc4.$.Manuals.!Bookworm',
  sprites: [{ pool: 'Bookworm', file: '!Sprites22' }],
  memory: 64,
  info: { name: 'Bookworm', purpose: '', author: '© Acorn Computers Ltd, 1996', version: '' },
  load: () => import('./main.js'),
};
