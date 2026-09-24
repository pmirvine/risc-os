// !T1ToFont descriptor: the disc application HardDisc4.$.Utilities.!T1ToFont (its !RunImage is ARM code
// that isn't on the seed disc; double-clicking the application directory runs this JavaScript version).
// See docs/apps/T1ToFont.md.
//
// The disc !Run sets T1ToFont$Dir and T1ToFont$Path (<T1ToFont$Dir>.,<Font$Path>); the Filer skips it
// for a registered app, so start() sets them. Font$Path is normally set by the Font Manager and the
// !Fonts !Boot (*FontInstall), which don't run here: boot() gives it the same value when it is unset.
export default {
  name: 'T1ToFont',
  appName: '!T1ToFont',
  appDir: 'ADFS::HardDisc4.$.Utilities.!T1ToFont',
  sprite: '!t1tofont',
  sprites: [{ pool: 'T1ToFont', file: '!Sprites22' }],
  memory: 180,
  help: false,                                   // the disc copy has its own !Help
  info: { name: 'T1ToFont', purpose: 'Convert Type 1 fonts', author: '© Acorn Computers Ltd, 1994', version: '1.28 (31-Jan-95)' },
  boot(os) {
    const sv = os.sysvars;
    if (!sv.get('Font$Path')) {
      const fonts = 'ADFS::HardDisc4.$.!Boot.Resources.!Fonts';
      let dir = fonts;
      try { if (os.vfs.exists(fonts)) dir = os.vfs.canonical(fonts); } catch { /* */ }
      sv.set('Font$Path', `${dir}.,Resources:$.Fonts.`);
    }
  },
  load: () => import('./main.js'),
};
