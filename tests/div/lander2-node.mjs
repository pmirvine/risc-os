// node tests/div/lander2-node.mjs - Lander II's game engine without a browser: the World
// (tools/lander2/!Lander2/World and the modules it uses) in both modes, flown by scripted
// inputs and by the crude autopilot in Player, checking the rules (fuel, score, landing,
// crashing, rocks, gravity, waves, infection, missiles, smart bombs, extra lives) and
// invariants (no NaN, wrapped positions, aliens never inside hills), determinism for a
// seed and independence from the particle detail setting; and the sound's one-voice
// channel (the Arcade set as the Williams board: one sound at a time, by priority).
import fs from 'fs';

const DIR = new URL('../../tools/lander2/!Lander2/', import.meta.url);
const { World, autopilotInput } = await import(new URL('World', DIR));
const { PF } = await import(new URL('Particles', DIR));
const { PAD_Y, stickTarget, stickFor, SHIP_VERTICES } = await import(new URL('Player', DIR));
const { waveInfo, DIFFICULTY } = await import(new URL('Waves', DIR));
const { spawnEnemy, ENEMY } = await import(new URL('Enemies', DIR));

let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const ok = (c, m) => { if (!c) fail(m); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const t0 = performance.now();
const IN = (o = {}) => ({ stickX: 0, stickY: 0, thrust: false, hover: false, fire: false,
  missile: false, smartBomb: false, ...o });

// ---------------------------------------------------------------- source rules
for (const f of ['World', 'Player', 'Enemies', 'Particles', 'Waves', 'Virus', 'Channel', 'Sound',
  'Settings', 'Williams', 'SfxArcade']) {
  const text = fs.readFileSync(new URL(f, DIR), 'latin1');
  ok(!/[^\n\x20-\x7e]/.test(text), `${f}: ASCII only, no tabs or CR`);
  text.split('\n').forEach((l, i) => ok(l.length <= 90, `${f}:${i + 1} is ${l.length} characters`));
}

// ---------------------------------------------------------------- sound: the one-voice channel
{
  const { Channel, priorityOf, bypasses } = await import(new URL('Channel', DIR));
  ok(priorityOf({}) === 0 && priorityOf({ priority: 5 }) === 5 && priorityOf(null) === 0,
    'channel: a sound without a priority has priority 0');
  ok(bypasses({ oneVoice: false }) && !bypasses({}) && !bypasses({ oneVoice: true }),
    'channel: only oneVoice === false bypasses');
  const ch = new Channel(), lo = { priority: 1 }, hi = { priority: 9 }, none = {};
  ok(ch.decide(lo, 0) === 'play' && !ch.busy(0), 'channel: free at first');
  ok(ch.start('a', hi, 0, 1, 'A') === null, 'channel: nothing to cut at first');
  ok(ch.decide(lo, 0.5) === 'refuse' && ch.decide(none, 0.5) === 'refuse',
    'channel: a lower priority is refused while a higher one plays');
  ok(ch.decide({ priority: 9 }, 0.5) === 'play', 'channel: an equal priority may cut in');
  ok(ch.decide({ priority: 0, oneVoice: false }, 0.5) === 'bypass', 'channel: bypass');
  ok(ch.decide(lo, 1) === 'play' && !ch.busy(1), 'channel: free once the sound has finished');
  ch.start('a', lo, 2, 1, 'A');
  const cut = ch.start('b', hi, 2.2, 0.5, 'B');
  ok(cut?.voice === 'A' && ch.playing(2.3)?.name === 'b', 'channel: the new sound cuts the old');
  ch.stopped('A');
  ok(ch.playing(2.3)?.name === 'b', 'channel: stopping another voice leaves it');
  ch.stopped('B');
  ok(!ch.busy(2.3), 'channel: stopping its voice frees it');
  ch.start('c', hi, 3, 1, 'C'); ch.clear();
  ok(ch.decide(lo, 3.1) === 'play', 'channel: clear frees it');
  // protect: the priority holds for def.protect seconds, then anything may cut in
  ch.start('d', { priority: 9, protect: 0.2 }, 4, 2, 'D');
  ok(ch.decide(lo, 4.1) === 'refuse', 'channel: protected at first');
  ok(ch.decide(none, 4.3) === 'play' && ch.busy(4.3), 'channel: after protect, anything cuts in');

  // Sound itself with a stand-in AudioContext and made-up recipes: which voices play
  const { Sound, SETS } = await import(new URL('Sound', DIR));
  const param = () => ({ value: 1, setTargetAtTime() {}, cancelScheduledValues() {},
    setValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), threshold: param(),
    knee: param(), ratio: param(), attack: param(), release: param(), pan: param(),
    frequency: param(), Q: param(), playbackRate: param() });
  const ctx = { currentTime: 10, destination: node(), createGain: node,
    createDynamicsCompressor: node, createWaveShaper: node, createStereoPanner: node,
    createBiquadFilter: node,
    createBufferSource: () => ({ ...node(), stopped: null, start() {},
      stop(t) { this.stopped = t; } }) };
  const defs = { shot: { priority: 2 }, boom: { priority: 8 }, plain: {},
    blip: { oneVoice: false } };
  const was = SETS.arcade;
  SETS.arcade = { ...was, sounds: { ...was.sounds, ...defs } };
  const snd = new Sound({ set: 'arcade', context: ctx });
  for (const n of Object.keys(defs)) snd.buffers.arcade = { ...snd.buffers.arcade,
    ['sound:' + n]: { duration: 1 } };
  ok(snd.voiceMode === 'one' && snd.oneVoice, 'sound: one voice by default for Arcade');
  ok(snd.play('boom') && snd.voices.length === 1 && snd.ducked, 'sound: boom plays, loops duck');
  ok(!snd.play('shot') && !snd.play('plain'), 'sound: lower priorities are refused');
  ok(snd.play('blip') && snd.voices.length === 2, 'sound: a bypassing sound plays alongside');
  const boom = snd.voices[0];
  ok(snd.play('boom') && boom.src.stopped !== null && snd.voices.length === 2,
    'sound: an equal priority cuts the one playing');
  ctx.currentTime = 11.5;
  ok(snd.play('plain'), 'sound: anything plays once the channel is free');
  snd.setVoices('many');
  ok(!snd.oneVoice && snd.play('shot') && snd.play('plain')
    && snd.voices.filter((v) => v.end > ctx.currentTime).length === 3,
  'sound: Many overlaps');
  snd.setVoices('one'); snd.setSet('original');
  ok(!snd.oneVoice, 'sound: the Original set is never one voice');
  snd.setSet('arcade'); snd.play('boom'); snd.silence();
  ok(!snd.channel.busy(ctx.currentTime) && !snd.ducked, 'sound: silence frees the channel');
  ok(new Sound({ voices: 'many' }).voiceMode === 'many' && new Sound({ voices: 'x' }).voiceMode
    === 'one', 'sound: the voices option');
  new Sound().setVoices('many');
  ok(!snd.lastError, 'sound: no errors ' + snd.lastError);
  snd.close();
  SETS.arcade = was;
}

// ---------------------------------------------------------------- invariants
function sane(w, label) {
  const P = w.period, t = w.terrain;
  const fin = (...v) => v.every(Number.isFinite);
  const inWorld = (o) => o.x >= 0 && o.x < P && o.z >= 0 && o.z < P;
  const p = w.player;
  if (!fin(p.x, p.y, p.z, p.vx, p.vy, p.vz, p.pitch, p.dir, p.fuel, w.score)) return fail(`${label}: NaN player`);
  if (!inWorld(p)) return fail(`${label}: player not wrapped ${p.x} ${p.z}`);
  if (p.fuel < 0 || p.fuel > p.maxFuel) return fail(`${label}: fuel ${p.fuel}`);
  for (const e of w.enemies) {
    if (!fin(e.x, e.y, e.z, e.vx, e.vy, e.vz)) return fail(`${label}: NaN ${e.type}`);
    if (!inWorld(e)) return fail(`${label}: ${e.type} not wrapped`);
    if (e.type !== 'monster' && e.type !== 'rock' && !e.dead && e.y > t.altitude(e.x, e.z) - 0.39) {
      return fail(`${label}: ${e.type} (${e.state}) inside the land at ${e.x},${e.y},${e.z}`);
    }
  }
  for (const m of w.projectiles) if (!fin(m.x, m.y, m.z) || !inWorld(m)) return fail(`${label}: bad ${m.type}`);
  let bad = 0;
  w.particles.forEach((q) => { if (!fin(q.x, q.y, q.z) || q.x < 0 || q.x >= P || q.z < 0 || q.z >= P) bad++; });
  if (bad) return fail(`${label}: ${bad} bad particles`);
  if (w.infection && (w.infectedPercent < 0 || w.infectedPercent > 100.0001)) fail(`${label}: infection ${w.infectedPercent}`);
  return true;
}
function run(w, n, input, label, each) {
  const counts = {};
  for (let i = 0; i < n; i++) {
    w.tick(typeof input === 'function' ? input(w, i) : input);
    for (const e of w.events) counts[e.type] = (counts[e.type] || 0) + 1;
    if (each) each(w, i);
    if (i % 25 === 0 && sane(w, label) !== true) break;
  }
  return counts;
}

// ---------------------------------------------------------------- the flight model
{
  const t = stickTarget(0, -512);
  ok(near(t.pitch, Math.PI) && near(t.dir, Math.PI / 2), 'full stick down = upside down');
  ok(near(stickTarget(300, 0).dir, 0) && near(stickTarget(0, 0).pitch, 0), 'stick right = dir 0');
  const u = stickTarget(0, 256);
  ok(near(u.pitch, Math.PI / 2) && near(u.dir, -Math.PI / 2), 'stick up tilts towards +z (away)');
  const s = stickFor(0.5, 1.2), b = stickTarget(s.stickX, s.stickY);
  ok(near(b.pitch, 0.5, 1e-9) && near(b.dir, 1.2, 1e-9), 'stickFor inverts stickTarget');
  ok(SHIP_VERTICES.length === 9, 'ship has the blueprint\'s 9 vertices');
}

// ---------------------------------------------------------------- Lander+
{
  const w = new World({ mode: 'lander', seed: 1 });
  ok(w.period === 256 && w.terrain.kind === 'lander', 'Lander+ uses the 256-tile landscape');
  ok(w.score === 500 && w.lives === 3 && w.player.fuel === 3413 && w.state === 'playing', 'Lander+ start');
  ok(w.objects[256 + 7] === 9 && w.objects[3 * 256 + 7] === 9 && w.objects[5 * 256 + 7] === 9, 'three rockets');
  let objs = 0;
  for (const o of w.objects) if (o !== 0xFF) objs++;
  ok(objs > 700 && objs < 1500, `about 1000 objects on the map (${objs})`);
  ok(near(w.camera.z, w.player.z + 5) && w.camera.y === 0, 'camera 5 tiles behind, at altitude 0');

  // sitting on the pad refuels (every other frame, as the original)
  let c = run(w, 200, IN(), 'pad');
  ok(w.player.landed && w.player.alive && !c.crash, 'sits on the pad');
  ok(near(w.player.fuel, 3413 + 8 * 200, 20), `refuels 0x20 every other frame (${w.player.fuel})`);
  run(w, 2000, IN(), 'pad');
  ok(w.player.fuel === w.player.maxFuel, 'fills to 0x1400');

  // take off straight up: fuel 4 a frame = 2 a tick
  const f0 = w.player.fuel;
  c = run(w, 20, IN({ thrust: true }), 'climb');
  ok(w.player.y < PAD_Y - 1.5 && !w.player.landed, `takes off (${w.player.y.toFixed(2)})`);
  ok(near(f0 - w.player.fuel, 40, 2.5), `thrust burns 2 a tick (${f0 - w.player.fuel})`);
  ok(w.camera.y === Math.min(w.player.y, 0), 'camera follows above altitude 0');
  // fire: autofire every 2 ticks, -1 each, fuel 1 a frame while held
  const s0 = w.score, f1 = w.player.fuel;
  c = run(w, 20, IN({ fire: true, hover: true }), 'fire');
  ok(c.fire === 10 && w.score === s0 - 10, `10 shots, -10 points (${c.fire}, ${w.score - s0})`);
  ok(near(f1 - w.player.fuel, 20 * 1.5, 0.01), `hover and fire burn 1 + 0.5 a tick (${f1 - w.player.fuel})`);
  // drift off the pad and fall: crash, then respawn after 60 ticks
  c = run(w, 1500, (ww, i) => IN({ stickX: i < 40 ? 60 : 0, thrust: i < 40 && i % 3 === 0 }),
    'fall', (ww) => { if (ww.state === 'playing' && ww.lives === 2) ww._stop = true; });
  run(w, 1, IN(), 'x');
  ok(c.crash === 1 && c.respawn === 1 && w.lives === 2 && w.state === 'playing', `crash and respawn (${JSON.stringify(c)})`);
  ok(w.player.landed && near(w.player.x, 4) && near(w.player.y, PAD_Y), 'respawned on the pad');

  // tilting while on the pad digs a corner in: the original's crash test
  c = run(w, 30, IN({ stickX: 200 }), 'tilt');
  ok(c.crash === 1, 'tilting on the pad crashes (Lander+)');
  run(w, 100, IN(), 'dying');

  // gravity rises with the score (0x50000 at 1024, 0x70000 at 1488)
  w.score = 1100; w.tick(IN());
  ok(w.gravityLevel === 0x50000, 'gravity 0x50000 from 1024');
  w.score = 1500; w.tick(IN());
  ok(w.gravityLevel === 0x70000, 'gravity 0x70000 from 1488');
  w.score = 600; w.tick(IN());
  ok(w.gravityLevel === 0x70000, 'gravity never falls back');

  // a bullet falling on an object destroys it: +20
  const w2 = new World({ mode: 'lander', seed: 3 });
  let k = w2.objects.findIndex((o, i) => o >= 1 && o <= 8 && i > 256 * 20);
  const ox = (k % 256) + 0.5, oz = Math.floor(k / 256) + 0.5, oy = w2.terrain.altitude(ox, oz) - 1;
  w2.particles.add(ox, oy, oz, 0, 0.3, 0, 40, PF.PLAYER | PF.DESTROY | PF.GRAVITY | PF.KEEP |
    PF.BOUNCE | PF.EXPLODE, 0xFFF);
  const sc = w2.score;
  c = run(w2, 5, IN(), 'object');
  ok(w2.objects[k] >= 13 && w2.score === sc + 20 && c.objectDestroyed === 1, `object destroyed for 20 (${w2.objects[k]})`);

  // rocks from 800 points: they fall, bounce, and one on the ship kills it
  const w3 = new World({ mode: 'lander', seed: 5 });
  w3.score = 800 + 16384;           // a rock every other tick or so
  let rocks = 0;
  c = run(w3, 400, IN(), 'rocks', (ww) => { rocks = Math.max(rocks, ww.enemies.length); ww.score = 800 + 16384; });
  ok(rocks > 5 && w3.enemies.every((e) => e.type === 'rock'), `rocks fall (${rocks} at once)`);
  ok(c.crash >= 1, 'a rock on the ship destroys it');

  // three crashes: game over
  const w4 = new World({ mode: 'lander', seed: 7 });
  c = run(w4, 1000, (ww) => IN({ stickX: ww.player.landed ? 300 : 0 }), 'gameover');
  ok(w4.state === 'gameOver' && c.gameOver === 1 && c.crash === 3 && w4.lives === 0, `game over after 3 lives (${JSON.stringify(c)})`);

  // the autopilot lands on the pad and refuels
  const w5 = new World({ mode: 'lander', seed: 9 });
  run(w5, 300, IN(), 'wait');        // fill up first
  const mem = {};
  run(w5, 700, (ww) => autopilotInput(ww, mem), 'auto-fly');
  ok(w5.player.alive && !w5.player.landed && w5.player.y < 0, `autopilot flies (${w5.player.y.toFixed(1)})`);
  mem.want = 'land';
  let landedAt = -1;
  c = run(w5, 6000, (ww) => autopilotInput(ww, mem), 'auto-land', (ww, i) => {
    if (landedAt < 0 && ww.player.landed) landedAt = i;
  });
  ok(landedAt > 0 && c.land >= 1 && !c.crash, `autopilot lands on the pad (${landedAt}, ${JSON.stringify(c)})`);
  const fl = w5.player.fuel;
  run(w5, 100, (ww) => autopilotInput(ww, mem), 'refuel');
  ok(w5.player.fuel > fl || fl === w5.player.maxFuel, 'landing refuels');
}

// ---------------------------------------------------------------- Invasion
{
  const w = new World({ mode: 'invasion', seed: 11 });
  ok(w.period === 64 && w.terrain.kind === 'invasion' && w.infection.length === 4096, 'Invasion: 64 x 64 tiles');
  ok(w.wave === 1 && w.state === 'waveStart' && w.lives === 3 && w.missiles === 3 && w.smartBombs === 1, 'Invasion start');
  ok(w.player.fuel === w.player.maxFuel && w.score === 0, 'full tank, no score');
  let c = run(w, 160, IN(), 'wave start');
  ok(w.state === 'playing' && w.enemies.filter((e) => e.type !== 'monster').length === 3, 'wave 1: three aliens arrive');
  // seeders left alone infect the land and mutate trees
  c = run(w, 6000, IN(), 'unopposed');
  ok(w.infectedPercent > 2, `infection grows (${w.infectedPercent.toFixed(1)}%)`);
  ok(c.seederSpray > 100 && c.treeMutated > 0, `seeders spray and mutate trees (${c.seederSpray}, ${c.treeMutated})`);
  ok(w.player.landed && !c.crash && !c.shieldHit, 'the pad is a refuge');
  let mutated = 0;
  for (let i = 0; i < 4096; i++) if (w.mutated[i]) mutated++;
  ok(mutated > 0, `mutated trees (${mutated})`);

  // killing everything ends the wave: tally, bonus, cleanse, next wave
  const before = w.score;
  w.debugKillAll();
  c = run(w, 2, IN(), 'wave end');
  ok(w.state === 'waveEnd' && c.waveCleared === 1 && w.tally && w.tally.wave === 1, 'wave cleared');
  ok(w.tally.landBonus === w.tally.cleanPercent * 10 && w.score >= before + w.tally.landBonus, 'land bonus');
  c = run(w, 260, IN(), 'next wave');
  ok(w.wave === 2 && w.state === 'waveStart' && c.waveStart === 1, 'wave 2 starts');
  ok(w.virus.sum === 0 && w.infectedPercent === 0, 'land cleansed between waves');
  ok(w.info.counts.bomber === 1, 'wave 2 brings a bomber');

  // waves progress: new landscape at 5, gravity at 3, 5, 7
  const names = new Set([w.terrain.name]);
  const grav = {};
  for (let n = 0; n < 8; n++) {
    run(w, 160, IN(), 'skip');
    w.debugKillAll();
    run(w, 260, IN(), 'skip', (ww) => { grav[ww.wave] = ww.gravityLevel; names.add(ww.terrain.name); });
  }
  ok(w.wave === 10, `reached wave 10 (${w.wave})`);
  ok(names.size === 3, `three landscapes by wave 10 (${[...names]})`);
  ok(grav[2] === 0x30000 && grav[3] === 0x50000 && grav[5] === 0x60000 && grav[7] === 0x70000,
    `gravity steps ${JSON.stringify(grav)}`);
  ok(waveInfo(8).counts.attractor === 1 && waveInfo(6).enemyMissiles, 'attractor at 8, missiles from 6');

  // extra life, missile and smart bomb every 5000
  const lives = w.lives, bombs = w.smartBombs;
  w.nextBonus = w.score + 10;
  w.addScore(20);
  ok(w.lives === lives + 1 && w.smartBombs === Math.min(3, bombs + 1) && w.events.some((e) => e.type === 'extraLife'), 'extra life');
}

{
  // missiles, smart bombs, shields
  const w = new World({ mode: 'invasion', seed: 12 });
  run(w, 160, IN(), 'start');
  run(w, 80, IN({ thrust: true }), 'up');
  run(w, 40, IN({ hover: true }), 'hover');
  const p = w.player;
  const e = spawnEnemy(w, 'drone', w.terrain.wrap(p.x + 8), p.z);
  e.y = p.y + 2;
  let c = run(w, 1, IN({ missile: true }), 'missile');
  ok(c.missileLaunch === 1 && w.missiles === 2 && w.projectiles.length === 1, 'missile launched');
  c = run(w, 150, IN({ hover: true }), 'missile flight');
  ok(e.dead && (c.explodeSmall || 0) >= 1, 'the homing missile gets the drone');
  for (let k = 0; k < 4; k++) spawnEnemy(w, 'seeder', w.terrain.wrap(p.x + k - 2), w.terrain.wrap(p.z - 6));
  const n0 = w.enemies.filter((q) => q.type !== 'monster').length;
  c = run(w, 1, IN({ smartBomb: true, hover: true }), 'smart bomb');
  ok(c.smartBomb === 1 && w.smartBombs === 0, 'smart bomb used');
  ok(w.enemies.filter((q) => q.type !== 'monster').length <= n0 - 4, 'smart bomb clears the view');
  const f = p.fuel;
  w.hitPlayer(1, p.x, p.y, p.z);
  ok(near(f - p.fuel, DIFFICULTY.normal.shieldCost), 'a hit costs fuel');
  p.shield = 1;
  w.hitPlayer(1, p.x, p.y, p.z);
  ok(p.shield === 0 && near(f - p.fuel, DIFFICULTY.normal.shieldCost), 'the shield takes a hit');
  p.fuel = 0;
  p.invulnerable = 0;
  w.hitPlayer(1, p.x, p.y, p.z);
  ok(!p.alive && w.state === 'dying', 'a hit with an empty tank is fatal');
}

{
  // infection game over (Normal) and not (Easy)
  for (const [difficulty, over] of [['normal', true], ['easy', false]]) {
    const w = new World({ mode: 'invasion', seed: 13, difficulty });
    run(w, 160, IN(), 'start');
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) w.virus.add(x, z, 255);
    run(w, 520, IN(), 'infected');
    ok((w.state === 'gameOver' && w.gameOverReason === 'infection') === over,
      `${difficulty}: infection game over ${over} (${w.state})`);
  }
}

{
  // long autopilot games in every difficulty: invariants, aliens obey the land
  for (const difficulty of Object.keys(DIFFICULTY)) {
    const w = new World({ mode: 'invasion', seed: 21, difficulty });
    const seen = new Set();
    const c = run(w, 12000, (ww) => autopilotInput(ww), difficulty, (ww) => {
      for (const e of ww.enemies) seen.add(e.type);
    });
    console.log(`${difficulty}: wave ${w.wave}, score ${w.score}, kills ${w.kills}, state ${w.state}, ` +
      `seen ${[...seen].join(' ')}, events ${Object.keys(c).length}`);
    ok(w.kills > 0 && (c.fire || 0) > 0, `${difficulty}: the autopilot fights`);
    ok(w.highScore === Math.max(0, w.score) || w.highScore >= w.score, `${difficulty}: high score tracked`);
  }
  // all alien types behave (spawned by hand in a later wave)
  const w = new World({ mode: 'invasion', seed: 22 });
  for (let n = 1; n < 8; n++) { run(w, 160, IN(), 'skip'); w.debugKillAll(); run(w, 260, IN(), 'skip'); }
  run(w, 160, IN(), 'wave 8');
  for (const type of Object.keys(ENEMY)) if (type !== 'rock') spawnEnemy(w, type);
  const c = run(w, 3000, (ww) => autopilotInput(ww), 'all types');
  ok((c.enemyFire || 0) > 0, 'aliens fire');
  console.log('all types:', JSON.stringify(c));
}

// ---------------------------------------------------------------- demo, determinism
{
  const w = new World({ mode: 'invasion', seed: 31, demo: true, highScore: 100 });
  run(w, 3000, (ww) => autopilotInput(ww), 'demo');
  ok(w.highScore === 100, 'demo games leave the high score alone');

  const play = (particles, mode) => {
    const ww = new World({ mode, seed: 77, particles });
    const mem = {};
    const log = [];
    for (let i = 0; i < 8000; i++) {
      ww.tick(autopilotInput(ww, mem));
      if (i % 500 === 0) {
        log.push([ww.score, ww.player.x, ww.player.y, ww.player.z, ww.enemies.length,
          ww.infectedPercent, ww.rng.s, ww.state].join());
      }
    }
    return { log: log.join('\n'), particles: ww.particles.count };
  };
  for (const mode of ['invasion', 'lander']) {
    const a = play(1000, mode), b = play(1000, mode), c = play(484, mode), d = play(2000, mode);
    ok(a.log === b.log, `${mode}: same seed and inputs, same game`);
    ok(a.log === c.log && a.log === d.log, `${mode}: the particle detail setting does not change the game`);
  }
  const x = new World({ mode: 'invasion', seed: 1 }), y = new World({ mode: 'invasion', seed: 2 });
  run(x, 400, IN(), 'seed'); run(y, 400, IN(), 'seed');
  ok(x.enemies[x.enemies.length - 1]?.x !== y.enemies[y.enemies.length - 1]?.x, 'different seeds differ');
  // particle pool limit
  const z = new World({ mode: 'lander', seed: 3, particles: 484 });
  for (let k = 0; k < 20; k++) z.particles.explosion(4, 0, 4, 81);
  ok(z.particles.cosmetic.count <= 484, `cosmetic particles capped (${z.particles.cosmetic.count})`);
  let n = 0; z.particles.forEach(() => n++);
  ok(n === z.particles.count, 'forEach visits every particle');
}

const ms = performance.now() - t0;
console.log(`time ${ms.toFixed(0)} ms`);
ok(ms < 30000, 'runs fast');
if (fails) { console.log(`FAIL ${fails} check(s)`); process.exit(1); } else console.log('OK');
