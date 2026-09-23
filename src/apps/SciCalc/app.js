// !SciCalc descriptor: the disc application in HardDisc4.Apps (its !Run would start the
// BASIC !RunImage; double-clicking runs this native version instead).
export default {
  name: 'SciCalc',
  appName: '!SciCalc',
  appDir: 'ADFS::HardDisc4.$.Apps.!SciCalc',
  sprite: '!scicalc',
  sprites: [{ pool: 'SciCalc', file: '!Sprites' }],
  memory: 140,
  help: false,                 // the disc copy has its own !Help
  info: { name: 'SciCalc', purpose: 'Scientific calculator', author: '© Acorn Computers Ltd, 1993', version: '0.55 (13-Dec-94)' },
  load: () => import('./main.js'),
};
