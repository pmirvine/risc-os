// !Help - interactive help (ROM application, Resources:$.Apps.!Help).
export default {
  name: 'Help',
  appName: '!Help',
  sprite: '!help',
  memory: 32,
  multiInstance: false,
  info: { name: 'Help', purpose: 'Interactive application help', author: '© Acorn Computers Ltd, 1994', version: '2.29 (19-Jul-96)' },
  load: () => import('./main.js'),
};
