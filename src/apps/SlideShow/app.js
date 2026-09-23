// Descriptor for !SlideShow (Images): full-screen JPEG slide show with wipes and fades. Code loads on first run.
export default {
  name: 'SlideShow',
  appDir: 'ADFS::HardDisc4.$.Images.!SlideShow',
  sprites: [{ pool: 'SlideShow', file: '!Sprites22' }],
  memory: 32,                                   // !Run: WimpSlot -min 32k -max 32k
  info: { name: 'SlideShow', purpose: 'JPEG slide show with wipes and fades', author: '© Acorn Computers Ltd, 1994', version: '1.10 (06-Jan-95)' },
  load: () => import('./main.js'),
};
