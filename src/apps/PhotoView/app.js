// Descriptor for !PhotoView (Acorn's PhotoCD Toolkit example application, 0.10). In this desktop it
// is the JPEG viewer: the "Source" is a directory of JPEG files instead of a PhotoCD disc.
// Code loads on first run.
export default {
  name: 'PhotoView',
  appDir: 'ADFS::HardDisc4.$.Utilities.!PhotoView',
  sprites: [{ pool: 'PhotoView', file: '!Sprites22' }],
  memory: 288,                                   // WimpSlot -min 288k -max 288k (!Run)
  filetypes: {
    0xC85: { name: 'JPEG', override: true },      // double-click a JPEG: view it
    0xBE8: { name: 'PhotoCD', run: false },
  },
  info: { name: 'PhotoView', purpose: 'PhotoCD Toolkit example app', author: '© Acorn Computers Ltd, 1993', version: '0.10 (31 Mar 1995)' },
  load: () => import('./main.js'),
};
