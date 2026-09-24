// !Internet (!Boot.Resources.!Internet) - the TCP/IP Protocol Suite resources (5.00). Not a Wimp task: its
// !Boot sets Inet$Path / InetDBase$Path and adds bin to Run$Path; its !Run configures the stack from
// Choices:Internet.Startup (written by !InetSetup). The ARM programs in bin/utils have JavaScript
// stand-ins (./inet.js). See docs/apps/Internet.md.
import { COMMANDS, runInternet } from './inet.js';

export default {
  name: 'Internet',
  appName: '!Internet',
  appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!Internet',
  sprite: '!internet',
  sprites: [{ pool: 'Internet', file: '!Sprites22' }],
  memory: 0,
  help: false,
  commands: COMMANDS,
  boot(os) {
    // !Boot
    const dir = os.sysvars.get('Internet$Dir');
    if (!os.sysvars.get('Inet$Path')) {
      os.sysvars.set('Run$Path', `${os.sysvars.get('Run$Path') ?? ',%.'},${dir}.bin.`);
      os.sysvars.set('Inet$Path', `${dir}.`);
    }
    if (!os.sysvars.get('InetDBase$Path')) os.sysvars.set('InetDBase$Path', `${dir}.files.`);
    // The PreDesk SetUpNet written by InetSetup runs !Internet at start-up (the desktop here starts
    // without the PreDesk stage, so do what it would do once the desktop is up).
    const preDesk = async () => {
      const tbl = os.sysvars.get('Boot$ToBeLoaded') || `${os.sysvars.get('Choices$Write')}.Boot.PreDesk`;
      try {
        const p = os.vfs.canonical(tbl + '.SetUpNet');
        if (!os.vfs.exists(p)) return;
        if (/^\s*Run BootResources:!Internet\s*$/mi.test(await os.vfs.readText(p))) await runInternet();
      } catch (e) { os.dialogs?.reportError?.(e.message ?? String(e)); }
    };
    if (os.ready) preDesk(); else os.wimp.on('desktopready', preDesk);
  },
  // !Run: not a task - it configures the network and ends
  start: async (task, ctx) => {
    task.quit();
    try { await runInternet(); } catch (e) { ctx.os.dialogs.reportError(e.message ?? String(e)); }   // an Obey file's error
  },
};
