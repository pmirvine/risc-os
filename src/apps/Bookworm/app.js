// Descriptor for !Bookworm (Manuals): Acorn's HTML browser for the RISC OS 3.7 User Guide. Code loads on first run.
export default {
  name: 'Bookworm',
  appDir: 'ADFS::HardDisc4.$.Manuals.!Bookworm',
  sprites: [{ pool: 'Bookworm', file: '!Sprites22' }],
  filetypes: { 0xFAF: { name: 'HTML' } },      // !Boot: Set File$Type_FAF HTML, Alias$@RunType_FAF Run <Bookworm$Dir>.!Run %*0
  memory: 352,                                   // *WimpSlot -Min 352k -Max 352k
  info: { name: 'Bookworm', purpose: 'HTML file browser', author: '© Acorn Computers 1997', version: '1.00 (12-Feb-97)' },
  load: () => import('./main.js'),
};
