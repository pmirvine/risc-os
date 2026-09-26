// !Browse - a modern web browser in the style of Acorn's Browse 2: pages rendered by a real browser engine
// (headless Chrome, when the server runs with node serve.mjs --browser: tools/browser-server.mjs), or shown
// in a frame when there's no engine. Not part of RISC OS 3.71: an application on the hard disc,
// $.Apps.!Browse (tools/disc-browse.mjs). See docs/apps/Browse.md.
export default {
  name: 'Browse',
  appName: '!Browse',
  appDir: 'ADFS::HardDisc4.$.Apps.!Browse',
  sprite: '!browse',
  sprites: ['ADFS::HardDisc4.$.Apps.!Browse.!Sprites'],
  memory: 512,
  // URI files (Acorn's URI handler) and ANT URL files open in !Browse
  filetypes: { 0xF91: { name: 'URI' }, 0xB28: { name: 'URL' } },
  multiInstance: false,
  info: { name: 'Browse', purpose: 'Web browser', author: 'RISC OS 3.71 in the browser', version: '1.00 (26-Sep-26)' },
  // other programs open web addresses with *URLOpen_http <address> (as with the URI handler's Alias$URLOpen_)
  boot: (os, d) => {
    for (const scheme of ['http', 'https']) {
      if (os.sysvars.get(`Alias$URLOpen_${scheme}`) == null) os.sysvars.set(`Alias$URLOpen_${scheme}`, `Run <${d.dirVar}>.!Run -url %*0`);
    }
  },
  load: () => import('./main.js'),
};
