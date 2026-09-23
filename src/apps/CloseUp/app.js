// !CloseUp - pointer/caret magnifier (Apps.!CloseUp on the hard disc). See docs/apps/CloseUp.md.
export default {
  name: 'CloseUp',
  appName: '!CloseUp',
  appDir: 'ADFS::HardDisc4.$.Apps.!CloseUp',
  sprite: '!closeup',
  sprites: [{ pool: 'CloseUp', file: '!Sprites' }],
  memory: 32,
  help: false,                     // the disc copy has its own !Help
  info: { name: 'CloseUp', purpose: 'CloseUp of pointer area', author: '© S.Hickinbottom and Acorn', version: '3.09 (15-Sep-94)' },
  load: () => import('./main.js'),
};
