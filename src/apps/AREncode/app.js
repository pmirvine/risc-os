// !AREncode ($.Replay.!AREncode) - the Acorn Replay compressor front end (Uniqueway / Acorn, 1994).
// The original is ARM code (object only); this is the interface rebuilt from its Templates, messages
// and ReadMe. The batch compressors themselves are unavailable here. See docs/apps/AREncode.md.
export default {
  name: 'AREncode',
  appName: '!AREncode',
  appDir: 'ADFS::HardDisc4.$.Replay.!AREncode',
  sprite: '!arencode',
  sprites: [{ pool: 'AREncode', file: '!Sprites' }],
  memory: 192,
  help: false,                 // the disc copy has its own !Help
  info: { name: 'AREncode', purpose: 'Compress Acorn Replay movies', author: '© Uniqueway Ltd, 1994', version: '1.00 (RISC OS 3.70)' },
  load: () => import('./main.js'),
};
