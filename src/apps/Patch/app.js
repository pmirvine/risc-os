// !Patch - the Application Patcher 1.32 (HardDisc4.Utilities.Patches.!Patch). See docs/apps/Patch.md.
// Its !RunImage is ARM code; running the application directory (or a Patch file) starts this version.
// The descriptor does what the disc's !Boot / !Run set up: Patch$Path, File$Type_FC3, the run type.
export default {
  name: 'Patch',
  appName: '!Patch',
  appDir: 'ADFS::HardDisc4.$.Utilities.Patches.!Patch',
  sprite: '!patch',
  sprites: [{ pool: 'Patch', file: '!Sprites22' }],
  filetypes: { 0xFC3: { name: 'Patch' } },
  memory: 96,
  help: false,                 // the disc copy has its own !Help
  info: { name: 'Patch', purpose: 'Program patcher', author: '© Acorn Computers Ltd, 1995', version: '1.32 (17-Mar-95)' },
  boot(os, d) {
    // !Boot: If "<Patch$Path>"="" Then Set Patch$Path <Obey$Dir>.
    if (!os.sysvars.get('Patch$Path')) {
      let dir = d.appDir;
      try { dir = os.vfs.canonical(d.appDir); } catch { /* */ }
      os.sysvars.set('Patch$Path', dir + '.');
    }
  },
  load: () => import('./main.js'),
};
