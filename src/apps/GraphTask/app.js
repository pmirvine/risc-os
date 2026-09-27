// !GraphTask - BASIC programs in desktop windows ("graphic task windows"), after David Ruck's !GraphTask
// (DEEJ Technology, 1990-2021): an icon bar application that runs non-desktop BBC BASIC programs, or BASIC's
// > prompt, each in a window of its own with its own screen mode and palette, multitasking. Not part of
// RISC OS 3.71: an application on the hard disc, $.Apps.!GraphTask (tools/disc-graphtask.mjs). The windows
// themselves are src/core/basicwimp (startBasicWindow); this is the application around them: the icon bar
// icon, the window menu, Choices, *GraphTask. See docs/apps/GraphTask.md.
export default {
  name: 'GraphTask',
  appName: '!GraphTask',
  appDir: 'ADFS::HardDisc4.$.Apps.!GraphTask',
  sprite: '!graphtask',
  sprites: ['ADFS::HardDisc4.$.Apps.!GraphTask.!Sprites'],
  memory: 64,
  multiInstance: false,
  // BASIC files dropped on !GraphTask in a Filer window run in windows (as on its icon bar icon)
  appIconDrop: true,
  info: { name: 'GraphTask', purpose: 'Graphic task windows', author: 'After David Ruck\'s !GraphTask', version: '1.00 (27-Sep-26)' },
  commands: {
    GraphTask: {
      syntax: 'Syntax: *GraphTask [<filename> [<arguments>]]',
      help: '*GraphTask runs a BASIC program in a graphics task window on the desktop, starting !GraphTask if it isn\'t running. With no file name it opens a window at BASIC\'s > prompt.',
      run: async (argv, ctx) => (await import('./main.js')).command(argv, ctx),
    },
  },
  // *BASIC -window (src/core/basicwimp/runner.js) opens its windows through !GraphTask, which it starts if need be
  boot(os) {
    os.hooks = os.hooks ?? {};
    os.hooks.basicWindow = async (o) => (await import('./main.js')).openWindow(o);
  },
  load: () => import('./main.js'),
};
