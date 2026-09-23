// Descriptor for !ARPlayer (Diversions / multimedia agent). Code loads on first run.
export default {
  name: 'ARPlayer',
  appDir: 'ADFS::HardDisc4.$.Apps.!ARPlayer',
  sprites: [{ pool: 'ARPlayer', file: '!Sprites22' }],
  memory: 64,
  info: { name: 'ARPlayer', purpose: '', author: '© Acorn Computers Ltd, 1996', version: '' },
  load: () => import('./main.js'),
};
