// RISC OS 3.71 desktop - boot sequence.
import { wimp } from './core/wimp.js';
import { sprites } from './core/sprites.js';
import { fonts, loadDesktopFonts } from './core/fonts.js';
import { vfs } from './core/vfs.js';
import { sysvars } from './core/sysvars.js';
import { initFiletypes } from './core/filetypes.js';
import { MenuManager } from './core/menu.js';
import { IconBar } from './core/iconbar.js';
import { initDialogs, reportError } from './core/dialogs.js';
import * as dialogs from './core/dialogs.js';
import { filer } from './core/filer.js';
import { pinboard } from './core/pinboard.js';
import { switcher } from './core/switcher.js';
import { cli } from './core/cli.js';
import { installCommands, timeString } from './core/commands.js';
import { initDevices } from './core/devices.js';
import { apps } from './core/app.js';
import { os } from './core/os.js';
import { loadMessages } from './core/messages.js';
import { input } from './core/input.js';
import { setHandlerErrorReporter } from './core/util.js';
import { bootScreen, desktopBanner } from './core/boot.js';
import { installBasicHost } from './core/basichost.js';
import { installBasicWimp } from './core/basicwimp/index.js';
import { config } from './core/config.js';
import { watchPowerOnKeys, resetAndRestart } from './core/reset.js';

const params = new URLSearchParams(location.search);

function setDefaultVars() {
  const HD = 'ADFS::HardDisc4.$';
  const set = (k, v) => sysvars.set(k, v);
  set('Boot$Dir', `${HD}.!Boot`);
  set('Boot$Path', `${HD}.!Boot.`);
  set('Boot$OSVersion', '370');   // as BootVars sets it: "%X0" of UtilityModule 3.71 / 16
  set('Boot$ToBeLoaded', '');
  set('BootResources$Dir', `${HD}.!Boot.Resources`);
  set('BootResources$Path', `${HD}.!Boot.Resources.`);
  set('Choices$Dir', `${HD}.!Boot.Choices`);
  set('Choices$Path', `${HD}.!Boot.Choices.`);
  set('Choices$Write', `${HD}.!Boot.Choices`);
  set('System$Dir', `${HD}.!Boot.Resources.!System`);
  set('System$Path', `${HD}.!Boot.Resources.!System.`);
  set('Scrap$Dir', `${HD}.!Boot.Resources.!Scrap`);
  set('Wimp$ScrapDir', `${HD}.!Boot.Resources.!Scrap.ScrapDir`);
  set('Wimp$Scrap', `${HD}.!Boot.Resources.!Scrap.ScrapDir.ScrapFile`);
  set('Run$Path', ',%.');
  set('File$Path', '');
  set('Resources$Path', 'Resources:');
  sysvars.set('Sys$RCLimit', 256, 'number');
  sysvars.set('Sys$ReturnCode', 0, 'number');
  sysvars.setCode('Sys$Time', () => timeString().slice(-8));
  sysvars.setCode('Sys$Date', () => timeString().slice(0, 14));
  sysvars.setCode('Sys$Year', () => String(new Date().getFullYear()));
  set('Wimp$Version', '369');
  set('Alias$@RunType_FEB', 'Obey %*0');
  set('Alias$@RunType_FFE', 'Exec %*0');
  set('Alias$@RunType_FFB', 'BASIC -quit "%*0"');
  set('Alias$@LoadType_FFB', 'BASIC -load "%0" %*1');
  set('Alias$@RunType_FEA', 'Desktop -file %*0');
  set('Alias$@RunType_FED', 'WimpPalette %0');   // FileSwitch default (Palette files); *WimpPalette is a no-op here
  set('Alias$.', 'Cat %*0');
}

const powerOnKeys = watchPowerOnKeys();   // Delete / R held down while starting: reset (src/core/reset.js)

async function boot() {
  const fast = params.has('fast') || sessionStorage.getItem('riscos.booted');
  const screen = fast ? null : bootScreen();
  os.wimp = wimp; os.vfs = vfs; os.sysvars = sysvars; os.cli = cli; os.filer = filer; os.apps = apps;
  os.pinboard = pinboard; os.switcher = switcher; os.sprites = sprites; os.dialogs = dialogs; os.fonts = fonts;
  os.loadMessages = loadMessages; os.input = input; os.hooks = os.hooks ?? {};
  os.config = config;
  config.load();

  setDefaultVars();
  installCommands();
  await Promise.all([sprites.init(), loadDesktopFonts(), vfs.init(), initFiletypes()]);
  wimp.init(document.body);
  config.apply();
  if (params.get('zoom')) wimp.setScale(+params.get('zoom'));
  if (params.get('buttons') === 'adjust') input.config.rightIsAdjust = true;
  wimp.menus = new MenuManager(wimp);
  wimp.cli = cli;
  await initDialogs();
  // *Desktop: the kernel's start-up text gives way to the grey screen and the Desktop welcome banner
  let banner = null;
  if (screen) { await screen.finish(); banner = await desktopBanner(wimp); }
  setHandlerErrorReporter((e) => reportError(e.message ?? String(e)));
  wimp.iconbar = new IconBar(wimp);
  os.iconbar = wimp.iconbar;
  await filer.init();
  await pinboard.init();
  await initDevices();
  await switcher.init();
  installBasicHost();
  installBasicWimp();                 // BASIC programs from the desktop / Wimp SWI bridge (TASKWINDOW agent)
  await apps.loadRegistry();
  apps.ensureRomApps();
  await apps.bootAll();

  // Hot keys
  wimp.on('hotkey:F12', () => cli.open());
  wimp.on('hotkey:CtrlF12', () => {
    if (os.hooks.taskWindow) os.hooks.taskWindow('');
    else if (apps.find('TaskWindow')) apps.start('TaskWindow');
    else reportError('Task windows are not available', { appName: 'Task Manager' });
  });

  // !Boot: the Desktop file boots the applications in !Boot.Resources (like Filer_Boot)
  try {
    await cli.run('Repeat Filer_Boot <BootResources$Dir> -Applications -Tasks', { out: { write() {}, writeln() {} } });
  } catch (e) { console.warn(e); }

  const reset = powerOnKeys();       // "Delete-power-on" (disc + CMOS) / "R-power-on" (CMOS), or ?reset=
  if (reset) { await resetAndRestart(reset); return; }
  banner?.closeLater();
  try { sessionStorage.setItem('riscos.booted', '1'); } catch { /* */ }
  document.title = 'RISC OS 3.71';
  os.ready = true;
  wimp.emit('desktopready', {});
  // developer conveniences: ?open=<path>  ?run=<app>  ?cmd=<*command>
  if (params.get('open')) filer.openDir(params.get('open'));
  if (params.get('run')) apps.start(params.get('run'));
  if (params.get('cmd')) cli.run(params.get('cmd')).catch((e) => reportError(e.message));
}

boot().catch((e) => {
  console.error(e);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#fff;position:fixed;left:8px;top:8px;z-index:9999999';
  pre.textContent = `Boot failed: ${e.stack ?? e}`;
  document.body.appendChild(pre);
});
