// !Alarm - RISC OS 3.71 clock & alarm system (ROM application).
export default {
  name: 'Alarm',
  appName: '!Alarm',
  sprite: '!alarm',
  memory: 96,
  filetypes: { 0xAE9: { name: 'Alarms' } },
  info: { name: 'Alarm', purpose: 'Clock and alarm system', author: '© Acorn Computers Ltd, 1994', version: '2.70 (13-Feb-95)' },
  load: () => import('./main.js'),
};
