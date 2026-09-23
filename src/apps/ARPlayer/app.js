// Descriptor for !ARPlayer - the Acorn Replay movie player (SJ Middleton / Uniqueway, 1.29).
// Code loads on first run.
//
// !ARMovie's !Boot (booted from !Boot.Resources after the app descriptors) sets
// Alias$@RunType_AE7 to run <ARMovie$Dir>.Player, a binary we can't run, so the boot hook claims
// the run type again once the desktop is up: double-clicking a movie opens and plays it in ARPlayer.
const RUNTYPE = 'Alias$@RunType_AE7';
const OURS = 'Run <ARPlayer$Dir>.!Run %*0';

export default {
  name: 'ARPlayer',
  appDir: 'ADFS::HardDisc4.$.Apps.!ARPlayer',
  sprites: [{ pool: 'ARPlayer', file: '!Sprites22' }],
  filetypes: { 0xAE7: { name: 'ARMovie', override: true } },
  memory: 192,
  info: { name: 'ARPlayer', purpose: 'ARMovie player', author: '© Uniqueway Ltd / Acorn', version: '1.29 (01-Jul-96)' },
  boot(os) {
    const claim = () => {
      const cur = os.sysvars.get(RUNTYPE) ?? '';
      if (!/ARPlayer/i.test(cur)) os.sysvars.set(RUNTYPE, OURS);
    };
    claim();
    if (!os.ready) os.wimp.on('desktopready', claim);
  },
  load: () => import('./main.js'),
};
