// Descriptor for !MineHunt (Diversions). Code loads on first run. See docs/apps/MineHunt.md.
export default {
  name: 'MineHunt',
  appDir: 'ADFS::HardDisc4.$.Diversions.!MineHunt',
  sprite: '!minehunt',
  sprites: [{ pool: 'MineHunt', file: '!Sprites22' }],
  memory: 136,                            // WimpSlot -min 136k -max 136k (from !Run)
  info: { name: 'Mine Hunt', purpose: 'Exercise the brain?', author: '© 1992/93/94 Paul LeBeau', version: '1.10 (11 May 1994)' },
  load: () => import('./main.js'),
};
