// !Printers - the Printer Manager (ROM application). See docs/apps/Printers.md.
export default {
  name: 'Printers',
  appName: '!Printers',
  sprite: '!printers',
  sprites: [
    { pool: 'Printers', file: '!Sprites22' },
    { pool: 'Printers-dp', file: '!Sprites22' },
    { pool: 'Printers-lj', file: '!Sprites22' },
    { pool: 'Printers-ps', file: '!Sprites22' },
  ],
  filetypes: { 0xFC6: { name: 'PrintDfn' } },
  memory: 128,
  info: { name: 'Printers', purpose: 'Printer manager', author: '© Acorn Computers Ltd, 1995', version: '1.54 (19-Jul-96)' },
  load: () => import('./main.js'),
};
