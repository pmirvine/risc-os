// Standalone full-screen BBC BASIC V session (like pressing F12 and typing BASIC on RISC OS 3.71).
import { BasicMachine } from './machine.js';
import { VDU } from './vdu.js';
import { Sound } from './sound.js';
import { MemFS } from './memfs.js';
import { internalKey, keyCode } from './keymap.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const status = document.getElementById('status');
const sound = new Sound();
const fs = new MemFS({ persist: true });
let vdu, machine;

function boot() {
  vdu = new VDU({ canvas, mode: +(params.get('mode') ?? 28), onBell: () => sound.bell() });
  machine = new BasicMachine({
    vdu, fs, sound,
    onExit: () => { status.textContent = 'BASIC exited (QUIT) — press Reset to restart'; },
  });
  window.basic = machine; // handy for debugging / Playwright
  machine.opsPerSecond = +(params.get('speed') ?? document.getElementById('speed').value);
  const prog = params.get('run');
  (async () => {
    if (prog) {
      machine.printBanner();
      const src = await fetchExample(prog);
      if (src != null) { await machine.load(src); machine.writeC(62); machine.writeStr('RUN'); machine.newLine(); await machine.run(); }
      await machine.start({ banner: false });
    } else {
      await machine.start();
    }
  })().catch((e) => { console.error(e); status.textContent = 'Internal error: ' + e.message; });
}

// ---- display scaling ------------------------------------------------------------
function fit() {
  if (!vdu) return;
  const wrap = document.getElementById('wrap');
  const dw = vdu.displayWidth, dh = vdu.displayHeight;
  const k = Math.max(1, Math.min(Math.floor(wrap.clientWidth / dw), Math.floor(wrap.clientHeight / dh))) || 1;
  const s = params.get('scale') ? +params.get('scale') : k;
  canvas.style.width = dw * s + 'px';
  canvas.style.height = dh * s + 'px';
}
let lastDims = '';
function frame() {
  if (vdu) {
    vdu.render();
    const wrap = document.getElementById('wrap');
    const d = vdu.displayWidth + 'x' + vdu.displayHeight + '/' + wrap.clientWidth + 'x' + wrap.clientHeight;
    if (d !== lastDims) { lastDims = d; fit(); }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', fit);

// ---- keyboard -------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (!machine) return;
  sound.resume();
  if (e.metaKey) return; // leave browser shortcuts alone
  const ik = internalKey(e);
  if (ik !== undefined) machine.keyDown(ik);
  if (e.key === 'Escape') { machine.escape(); e.preventDefault(); return; }
  const c = keyCode(e, machine.fx4);
  if (c >= 0) { machine.keyPress(c); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (!machine) return;
  const ik = internalKey(e);
  if (ik !== undefined) machine.keyUp(ik);
});

// ---- mouse ----------------------------------------------------------------------
let buttons = 0;
function mouseXY(e) {
  const r = canvas.getBoundingClientRect();
  const ox = ((vdu.width) << vdu.modeVar(4)) , oy = ((vdu.height) << vdu.modeVar(5));
  const x = Math.floor((e.clientX - r.left) / r.width * ox);
  const y = Math.floor((1 - (e.clientY - r.top) / r.height) * oy);
  return [x, y];
}
const btnBits = (b) => ((b & 1) ? 4 : 0) | ((b & 4) ? 2 : 0) | ((b & 2) ? 1 : 0);
canvas.addEventListener('mousemove', (e) => { if (!machine) return; const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); });
canvas.addEventListener('mousedown', (e) => { sound.resume(); canvas.focus(); buttons = btnBits(e.buttons); const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); machine.keyDown([9, 10, 11][[0, 1, 2].indexOf(e.button)] ?? 9); });
canvas.addEventListener('mouseup', (e) => { buttons = btnBits(e.buttons); const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); machine.keyUp([9, 10, 11][e.button] ?? 9); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- toolbar --------------------------------------------------------------------
async function fetchExample(name) {
  try {
    const r = await fetch(new URL('../../tests/basic/programs/' + name, import.meta.url));
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) { return null; }
}
async function loadExamples() {
  try {
    const r = await fetch(new URL('../../tests/basic/programs/index.json', import.meta.url));
    const list = await r.json();
    const sel = document.getElementById('examples');
    for (const it of list) { const o = document.createElement('option'); o.value = it.file; o.textContent = it.title; sel.append(o); }
  } catch (e) { /* no examples */ }
}
document.getElementById('examples').addEventListener('change', async (e) => {
  const f = e.target.value; e.target.value = '';
  if (!f) return;
  const src = await fetchExample(f);
  if (src == null) return;
  await typeInto(`LOAD "${f}"`, src);
  canvas.focus();
});
async function typeInto(label, bytes) {
  // store in the RAM filing system and type the command at the prompt
  const name = label.match(/"(.*)"/)[1].replace(/\.[a-z]+$/i, '');
  await fs.writeFile(name, bytes, 0xFFB);
  for (const ch of `LOAD "${name}"\r`) machine.keyPress(ch.charCodeAt(0));
  for (const ch of 'RUN\r') machine.keyPress(ch.charCodeAt(0));
}
document.getElementById('speed').addEventListener('change', (e) => { machine.opsPerSecond = +e.target.value; canvas.focus(); });
document.getElementById('esc').addEventListener('click', () => { machine.escape(); canvas.focus(); });
document.getElementById('reset').addEventListener('click', () => { machine.escape(); machine.exited = true; setTimeout(() => { boot(); canvas.focus(); }, 50); });
document.getElementById('file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const b = new Uint8Array(await f.arrayBuffer());
  await typeInto(`LOAD "${f.name.replace(/,[0-9a-f]{3}$/i, '')}"`, b);
  canvas.focus();
});
// drag and drop
const drop = document.getElementById('drop');
window.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
window.addEventListener('dragleave', () => { drop.style.display = 'none'; });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); drop.style.display = 'none';
  const f = e.dataTransfer.files[0]; if (!f) return;
  const b = new Uint8Array(await f.arrayBuffer());
  await typeInto(`LOAD "${f.name.replace(/,[0-9a-f]{3}$/i, '')}"`, b);
});

boot();
loadExamples();
requestAnimationFrame(frame);
canvas.focus();
