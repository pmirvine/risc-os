// The desktop's BASIC scheduler (src/core/basicwimp/scheduler.js): speed limits, fair turns, the share of
// each frame left to the desktop, suspend/resume/remove, and the steady 50Hz vsync for WAIT / *FX 19.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BasicMachine } from '../../src/basic/machine.js';
import { Scheduler, Vsync, SPEEDS, speedOps } from '../../src/core/basicwimp/scheduler.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// counts iterations: VDU 46 every 100 (a REPEAT / += / IF / UNTIL loop: a few micro-ops per iteration)
const COUNTER = '10 T%=0\n20 REPEAT T%+=1:IF T% MOD 100=0 VDU 46\n30 UNTIL FALSE\n';

async function counter(sched, speed) {
  let dots = 0;
  const m = new BasicMachine({ onOutput: (c) => { if (c === 46) dots++; }, seed: 1 });
  await m.load(COUNTER);
  const job = sched.add(m, { speed });
  const done = m.run();
  return { m, job, done, dots: () => dots * 100, stop: async () => { m.interp.quit(0); job.remove(); await done; } };
}

/** micro-ops per iteration of COUNTER (measured, so the test follows the compiler) */
async function opsPerIteration() {
  const m = new BasicMachine({ onOutput: () => {} });
  await m.load('10 T%=0\n20 REPEAT T%+=1:IF T% MOD 100=0 VDU 46\n30 UNTIL T%=10000\n');
  let n = 0;
  const I = m.interp;
  m.slice = () => { for (;;) { const r = I.ops[I.pc++](); n++; if (r && r.then) return r; if (!I.running) return undefined; } };
  await m.run();
  return n / 10000;
}

test('speed names map to ops/second', () => {
  assert.equal(speedOps('ARM2').ops, SPEEDS.arm2.ops);
  assert.equal(speedOps('StrongARM').key, 'strongarm');
  assert.equal(speedOps('unlimited').ops, 0);
  assert.equal(speedOps(undefined).key, 'strongarm');
  assert.equal(speedOps(12345).ops, 12345);
  assert.ok(SPEEDS.arm2.ops < SPEEDS.arm3.ops && SPEEDS.arm3.ops < SPEEDS.arm610.ops && SPEEDS.arm610.ops < SPEEDS.strongarm.ops);
});

test('a speed limit holds a program to its ops per second', async () => {
  const per = await opsPerIteration();
  const s = new Scheduler();
  const c = await counter(s, 'arm3');
  const t0 = performance.now();
  await sleep(600);
  const it = c.dots(), dt = (performance.now() - t0) / 1000;
  await c.stop();
  const rate = it * per / dt;
  assert.ok(rate > SPEEDS.arm3.ops * 0.7 && rate < SPEEDS.arm3.ops * 1.2, `ARM3 ran at ${Math.round(rate)} ops/s`);
});

test('changing speed takes effect at once', async () => {
  const s = new Scheduler();
  const c = await counter(s, 'arm2');
  await sleep(300);
  const slow = c.dots();
  c.job.setSpeed('unlimited');
  await sleep(300);
  const fast = c.dots() - slow;
  await c.stop();
  assert.ok(fast > slow * 20, `unlimited (${fast}) is much faster than ARM2 (${slow})`);
});

test('unlimited programs share the time fairly and leave the desktop a share of each frame', async () => {
  const s = new Scheduler();
  const a = await counter(s, 'unlimited'), b = await counter(s, 'unlimited');
  // the host keeps getting time: a 5ms timer keeps ticking
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  const t0 = performance.now();
  await sleep(800);
  const dt = performance.now() - t0;
  clearInterval(timer);
  const ra = a.dots(), rb = b.dots();
  const cpu = a.job.cpuMs + b.job.cpuMs;
  await a.stop(); await b.stop();
  assert.ok(Math.min(ra, rb) / Math.max(ra, rb) > 0.7, `fair shares (${ra} / ${rb})`);
  assert.ok(Math.abs(a.job.cpuMs - b.job.cpuMs) < dt * 0.15, `CPU ${a.job.cpuMs.toFixed(0)} / ${b.job.cpuMs.toFixed(0)}ms`);
  assert.ok(cpu / dt < 0.8, `BASIC used ${(100 * cpu / dt).toFixed(0)}% of the time`);
  assert.ok(ticks > 800 / 5 / 3, `host timers ran (${ticks})`);
});

test('suspend stops a program where it is; resume carries on; remove lets a killed program end', async () => {
  const s = new Scheduler();
  const c = await counter(s, 'unlimited');
  await sleep(100);
  c.job.suspend();
  await sleep(30);
  const at = c.dots();
  await sleep(200);
  assert.equal(c.dots(), at, 'no progress while suspended');
  c.job.resume();
  await sleep(100);
  assert.ok(c.dots() > at, 'progress after resume');
  c.job.suspend();
  c.m.interp.quit(0);
  c.job.remove();
  const r = await Promise.race([c.done, sleep(1000).then(() => 'hung')]);
  assert.notEqual(r, 'hung', 'a suspended program that is killed still ends');
});

test('WAIT and *FX 19 tick at a steady 50Hz', async () => {
  // fake clock: waits resolve at the next 20ms boundary, all waiters together
  let now = 0;
  const timers = [];
  const v = new Vsync({ now: () => now, later: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; } });
  const seen = [];
  v.wait().then(() => seen.push(['a', now]));
  now = 5; v.wait().then(() => seen.push(['b', now]));
  assert.equal(timers.length, 1, 'one timer for both waiters');
  assert.equal(timers[0].at, 20);
  now = 20; timers.shift().fn();
  await Promise.resolve();
  assert.deepEqual(seen, [['a', 20], ['b', 20]]);
  now = 39.5; v.wait();
  assert.equal(timers[0].at, 40);
  // real clock: 25 WAITs take half a second, whatever the display does
  const m = new BasicMachine({ onOutput: () => {} });
  const real = new Vsync();
  m.waitVsync = () => real.wait();
  await m.load('10 FOR I%=1 TO 25:WAIT:NEXT\n20 *FX 19\n');
  const t0 = performance.now();
  await m.run();
  const dt = performance.now() - t0;
  assert.ok(dt > 480 && dt < 620, `26 frames took ${dt.toFixed(0)}ms`);
});
