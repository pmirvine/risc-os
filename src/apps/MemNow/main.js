// !MemNow - shows the free memory (the Wimp's free pool, in K) in an icon bar icon.
// Port of Sources/Diversions/MemNow/bas/!RunImage (Acorn, 0.02 08-Aug-94).
//
// The icon is a ridged (R3), filled text icon 130x64 OS units. Every half second (Wimp_PollIdle +50cs)
// it reads Wimp_SlotSize's free pool. When the value changes, the background is reset to colour 1; when
// free memory is below 16K the icon's background colour bit is toggled each poll, so it flashes.

import { Menu } from '../../core/menu.js';
import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';

export default async function start(task, ctx) {
  const M = await loadMessages('MemNow');
  const [title, ...items] = M.lookup('Menu').split(',');      // "MemNow,Info,Quit"

  // free pool in bytes (Wimp_SlotSize -1,-1 TO ,,free): from the Task Manager's memory model
  const freeBytes = () => {
    try { return (os.switcher?.memory?.().free ?? 0) * 1024; } catch { return 0; }
  };
  let FreeMem = freeBytes();
  const fmt = (t) => String(Math.round((t / 1024) * 1e6) / 1e6);   // STR$(t%/1024)

  // info window from the MemNow Templates
  const info = await task.createWindowFromTemplate('assets/templates/MemNow.json', 'info');

  const menu = () => new Menu(title, [
    { text: items[0], submenu: info },
    { text: items[1], action: () => task.quit() },
  ]);

  // Wimp_CreateIcon: bbox 0,0,130,64, flags &1700313D (text, border, h/v centred, filled,
  // indirected, button type 3, fg 7, bg 1), validation "R3"
  const ib = task.addIconbarIcon({
    text: fmt(FreeMem), sprite: '',
    raw: { flags: 0x1700313D, validation: 'R3', w: 65, h: 32 },
    menu,
  });

  task.every(500, () => {                                          // PROCnull
    const t = freeBytes();
    ib.icon.setText(fmt(t));
    if (t >= 16384) {
      if (t !== FreeMem) ib.icon.setState(0x10000000, 0x10000000);
    } else {
      ib.icon.setState(0x10000000, 0);                             // flash
    }
    FreeMem = t;
  });

  task.onMessage('Quit', () => task.quit());
}
