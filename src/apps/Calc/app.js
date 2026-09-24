// Descriptor for !Calc, the Arthur / RISC OS 2 / RISC OS 3.0-3.1 desktop calculator (dropped from the
// 3.5 ROM in favour of !SciCalc). Seed disc copy: $.Apps.!Calc (tools/disc-classics.mjs). See docs/apps/Calc.md.
export default {
  name: 'Calculator',                    // Wimp_Initialise ...,"Calculator" (Task Manager name)
  appName: '!Calc',
  appDir: 'ADFS::HardDisc4.$.Apps.!Calc',
  sprite: '!calc',                       // the ROM Wimp pool still has the 3.1 !calc / sm!calc sprites
  memory: 32,                            // !Run: Wimpslot -min 32K -max 32K
  info: { name: 'Calculator', purpose: 'Desktop Calculator', author: 'Acorn Computers', version: '0.40 (03-Nov-88)' },
  load: () => import('./main.js'),
};
