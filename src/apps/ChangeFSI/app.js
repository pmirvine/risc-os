// Descriptor for !ChangeFSI (Utilities). The !Boot on the disc sets File$Type_FF0 TIFF and
// Alias$@RunType_FF0 to run ChangeFSI; for JPEG (C85) it only claims DataOpen while running
// (3.71's !Boot sets RunType_C85 to an error; here PhotoView provides the JPEG double-click).
export default {
  name: 'ChangeFSI',
  appDir: 'ADFS::HardDisc4.$.Utilities.!ChangeFSI',
  sprites: [{ pool: 'ChangeFSI', file: '!Sprites22' }],
  memory: 320,
  filetypes: { 0xFF0: { name: 'TIFF' }, 0xC85: { name: 'JPEG', run: false } },
  info: { name: 'ChangeFSI', purpose: 'Image Mastering', author: '© Acorn Computers, 1995', version: '1.12 (13 Mar 95)' },
  load: () => import('./main.js'),
};
