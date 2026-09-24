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
  // The ROM !Printers directory holds the printer classes' resources; its !Boot (run when the Filer sees it at
  // start-up) sets Printers$Path, which is what "!Printers must be seen by the Filer" (!PrintEdit's !Run) checks.
  files: Object.fromEntries(['dp', 'lj', 'ps'].map((c) => [`${c}.Resources.PaperRO`, {
    filetype: 0xFC6, content: () => import('./paperro.js').then((m) => Uint8Array.from(m[c.toUpperCase()], (ch) => ch.charCodeAt(0) & 255)),
  }])),
  boot(os) {
    const sv = os.sysvars;
    if (!sv.get('Printers$Path')) sv.set('Printers$Path', `Choices:Printers.,${sv.get('Printers$Dir') ?? 'Resources:$.Apps.!Printers'}.,Resources:$.Resources.Printers.`);
  },
  load: () => import('./main.js'),
};
