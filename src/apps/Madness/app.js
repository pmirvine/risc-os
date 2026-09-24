// Descriptor for !Madness, the RISC OS 2/3 desktop toy that makes every window drift about the screen.
// Seed disc copy: $.Diversions.!Madness (tools/disc-classics.mjs). See docs/apps/Madness.md.
export default {
  name: 'Madness',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Madness',
  sprites: ['ADFS::HardDisc4.$.Diversions.!Madness.!Sprites22'],
  memory: 16,                            // !Run: Wimpslot -min 16K -max 16K
  multiInstance: true,                   // the original has no single-instance check
  load: () => import('./main.js'),
};
