// Descriptor for !Clock (Diversions): an analogue clock in a window. Code loads on first run.
export default {
  name: 'Clock',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Clock',
  sprites: [{ pool: 'Clock', file: '!Sprites22' }],
  memory: 24,                       // !Run: WimpSlot -min 24K
  multiInstance: true,              // each run opens another clock (the original has no single-instance check)
  info: { name: 'Clock', purpose: 'Analogue clock', author: 'Merlyn Kline (Minerva Software) / Acorn', version: '0.23 (31-Jan-95)' },
  load: () => import('./main.js'),
};
