// Descriptor for !Hopper, Simon Foster's Frogger-style game (1994-96) from the RISC OS Diversions, published by
// RISC OS Open under the BSD licence (Apps/Diversions/Hopper 1.05). Seed disc copy: $.Diversions.!Hopper
// (tools/disc-classics.mjs, from tools/classics/Hopper). See docs/apps/Hopper.md.
export default {
  name: 'Hopper',                        // wimp_initialise ( ..., info_APPNAME ...)
  appDir: 'ADFS::HardDisc4.$.Diversions.!Hopper',
  sprite: '!hopper',
  sprites: ['ADFS::HardDisc4.$.Diversions.!Hopper.!Sprites22'],
  memory: 640,                           // !Run: WimpSlot -min 640K -max 640K
  info: { name: 'Hopper', purpose: 'Helping to save frogs', author: '© Simon Foster, 1994', version: '1.05 (23 Dec 2014)' },
  load: () => import('./main.js'),
};
