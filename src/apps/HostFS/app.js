// !HostFS - mounting folders from the computer running the browser as RISC OS discs (HostFS). The mounts
// themselves are part of the desktop (src/core/hostfs: an icon on the left for each, remembered across
// sessions); this is the application that makes and manages them, run when needed from $.Utilities, as
// !Access+ is for ShareFS. Its application directory is written by tools/disc-hostfs.mjs.
export default {
  name: 'HostFS',
  appName: '!HostFS',
  appDir: 'ADFS::HardDisc4.$.Utilities.!HostFS',
  sprite: '!hostfs',
  sprites: ['ADFS::HardDisc4.$.Utilities.!HostFS.!Sprites'],
  memory: 64,
  multiInstance: false,
  info: { name: 'HostFS', purpose: 'Folders from this computer', author: 'RISC OS 3.71 in the browser', version: '1.00 (26-Sep-26)' },
  load: () => import('./main.js'),
};
