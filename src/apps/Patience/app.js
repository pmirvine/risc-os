// Descriptor for !Patience (Diversions). Code loads on first run.
export default {
  name: 'Patience',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Patience',
  sprites: [{ pool: 'Patience', file: '!Sprites22' }],
  memory: 32,                                   // WimpSlot -min 32K -max 32K
  info: { name: 'Patience', purpose: 'Card game', author: '© Acorn Computers Ltd, 1989-1994', version: '0.67 (31-Jan-95)' },
  load: () => import('./main.js'),
};
