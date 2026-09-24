// Descriptor for !Lander ($.Diversions.!Lander, tools/disc-lander.mjs): David Braben's 1987 Archimedes demo.
// The original program is (C) D. J. Braben and is not on the disc: main.js runs it on the emulated ARM2 when
// the user supplies it (store.js), and the JavaScript port (game.js) otherwise. See docs/apps/Lander.md.
export default {
  name: 'Lander',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Lander',
  sprites: ['ADFS::HardDisc4.$.Diversions.!Lander.!Sprites22'],
  memory: 168,                           // !Run: WimpSlot -min 168K -max 168K
  multiInstance: false,
  info: { name: 'Lander', purpose: 'Lander demo / practice', author: '© D.J.Braben 1987', version: '0.41 (16-Dec-88)' },
  load: () => import('./main.js'),
};
