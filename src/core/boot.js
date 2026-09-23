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
