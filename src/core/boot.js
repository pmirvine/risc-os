// The power-on screen: the kernel prints "RISC OS <n>MB" and the processor type
// (Kernel/s/NewReset: SystemName, RAM size in MB, processor_names) before !Boot starts the desktop.

import { TextConsole, loadSystemFont } from './console.js';

export function bootScreen({ ramMB = 8, cpu = 'ARM 710 Processor' } = {}) {
  const div = document.createElement('div');
  div.className = 'boot-screen';
  document.body.appendChild(div);
  const start = performance.now();
  let con = null;
  loadSystemFont().then(() => {
    const cols = Math.floor(window.innerWidth / 16), rows = Math.floor(window.innerHeight / 16);
    con = new TextConsole({ cols, rows, charW: 8, charH: 8 });
    con.canvas.style.cssText = `position:absolute;left:0;top:0;width:${cols * 16}px;height:${rows * 16}px;image-rendering:pixelated`;
    div.appendChild(con.canvas);
    con.write(`\nRISC OS ${ramMB}MB\n\n${cpu}\n\n`);
  });
  return {
    async finish() {
      const elapsed = performance.now() - start;
      if (elapsed < 1400) await new Promise((r) => setTimeout(r, 1400 - elapsed));
      con?.destroy();
      div.remove();
    },
  };
}

// The Desktop module's welcome banner (Desktop/s/Desktop DisplayNewWelcome, RISC OS 3.5+): when
// *Desktop starts, the 'desktop' template window (Acorn logo, "RISC OS 3.7", copyright) is opened
// centred on the screen with the 'backdrop' template as a drop shadow (+16 OS units right and
// down), in front of everything. It stays up while the module tasks and the boot file start, then
// until 4 seconds after it appeared, or until a mouse button is pressed (KeepItUpLoop).
export async function desktopBanner(wimp, { keepMs = 4000 } = {}) {
  const url = 'assets/templates/Desktop.json';
  const wins = [];
  try {
    for (const [name, d] of [['backdrop', 4], ['desktop', 0]]) {
      const w = await wimp.createWindowFromTemplate(url, name, {}, wimp.systemTask);
      w.open({ x: Math.round((wimp.width - w.w) / 2) + d, y: Math.round((wimp.height - w.h) / 2) + d, behind: 'top' });
      w.el.style.zIndex = String(90000);   // like the Desktop module's icon bar hack: stay in front
      w.el.classList.add('desktop-banner');
      wins.push(w);
    }
  } catch (e) { console.warn('banner', e); }
  const shown = performance.now();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', close, true);
    for (const w of wins) w.delete();
  };
  document.addEventListener('pointerdown', close, true);
  return {
    close,
    /** Close once keepMs have passed since the banner appeared (or at once if clicked already). */
    closeLater() { setTimeout(close, Math.max(0, keepMs - (performance.now() - shown))); },
  };
}
