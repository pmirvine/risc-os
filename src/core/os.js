// The "OS" hub: a single object through which core services find each other (avoids import
// cycles). Populated during boot. Apps may import { os } to reach any service:
//   os.wimp, os.vfs, os.sysvars, os.cli (OSCLI), os.filer, os.apps, os.dialogs, os.iconbar,
//   os.pinboard, os.switcher, os.sprites, os.messages
export const os = {};
globalThis.os = os;
