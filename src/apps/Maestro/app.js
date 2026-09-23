// !Maestro - music editor/player (Apps.!Maestro on the hard disc). See docs/apps/Maestro.md.
export default {
  name: 'Maestro',
  appName: '!Maestro',
  appDir: 'ADFS::HardDisc4.$.Apps.!Maestro',
  sprite: '!maestro',
  sprites: [{ pool: 'Maestro', file: '!Sprites22' }],
  filetypes: { 0xAF1: { name: 'Music' } },
  memory: 256,
  help: false,                     // the disc copy has its own !Help
  info: { name: 'Maestro', purpose: 'Music player', author: '© Acorn Computers Ltd, 1993', version: '2.13 (13-Dec-94)' },
  load: () => import('./main.js'),
};
