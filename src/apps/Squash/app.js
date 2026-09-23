// !Squash descriptor: the disc application in HardDisc4.Apps (its !RunImage is an absolute
// file that isn't on the seed disc; running the app directory starts this native version).
export default {
  name: 'Squash',
  appName: '!Squash',
  appDir: 'ADFS::HardDisc4.$.Apps.!Squash',
  sprite: '!squash',
  sprites: [{ pool: 'Squash', file: '!Sprites22' }],
  filetypes: { 0xFCA: { name: 'Squash' } },
  memory: 96,
  help: false,                 // the disc copy has its own !Help
  info: { name: 'Squash', purpose: 'File compression/decompression', author: '© Acorn Computers Ltd, 1993', version: '0.49 (13-Dec-94)' },
  commands: {
    Squash: {
      syntax: 'Syntax: *Squash <source file> [<destination file>]',
      help: '*Squash compresses a file (or decompresses a Squash file) in place or to another file.',
      min: 1, max: 2,
      run: async (argv) => { const { squashObject } = await import('./main.js'); await squashObject(argv[0], argv[1] ?? argv[0]); },
    },
  },
  load: () => import('./main.js'),
};
