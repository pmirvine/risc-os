// Descriptor for !Flasher.!Help - the "Minerva Software Text Reader" (a BASIC app inside !Flasher
// that shows Flasher's HelpText a page at a time). Runs when the Filer's Help is used on !Flasher.
export default {
  name: 'Helper',
  appName: '!Help',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Flasher.!Help',
  dirVar: 'Helper$Dir',
  sprite: '!flasher',
  memory: 32,                        // !Run: WimpSlot -min 32K
  help: false,
  multiInstance: true,
  info: { name: 'Helper', purpose: 'Minerva Software Text Reader', author: 'Merlyn Kline, 1989', version: '1.00' },
  load: () => import('./helper.js'),
};
