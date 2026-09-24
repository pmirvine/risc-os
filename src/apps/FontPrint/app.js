// !FontPrint 1.26 (31-Jan-95) - edits the RISC OS font -> PostScript font list of the current
// PostScript printer. Disc application $.Printing.!FontPrint (its !RunImage is ARM code that isn't
// on the seed disc: running the application directory starts this version). See docs/apps/FontPrint.md.
export default {
  name: 'FontPrint',
  appName: '!FontPrint',
  appDir: 'ADFS::HardDisc4.$.Printing.!FontPrint',
  sprite: '!fontprint',
  sprites: [{ pool: 'FontPrint', file: '!Sprites22' }],
  memory: 64,
  help: false,                 // the disc copy has its own !Help
  info: { name: 'FontPrint', purpose: 'Select printer fonts', author: '© Acorn Computers Ltd, 1995', version: '1.26 (31-Jan-95)' },
  load: () => import('./main.js'),
};
