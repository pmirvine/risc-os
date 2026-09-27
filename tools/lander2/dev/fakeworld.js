// A stand-in World for developing Render without the simulation: the
// terrain, objects placed like the original's PlaceObjectsOnMap, a few
// particles, one enemy of each type, and the player on the pad.
import { Terrain, PAD_ALTITUDE, UNDERCARRIAGE } from '../!Lander2/Terrain';
import { Rng, orientation, wrap } from '../!Lander2/Maths';

export function fakeWorld({ mode = 'lander', seed = 1, enemies = true } = {}) {
  const terrain = new Terrain(mode === 'lander' ? 'lander' : 'invasion', 0);
  const P = terrain.period;
  const rng = new Rng(seed);
  const objects = new Uint8Array(P * P).fill(0xFF);
  const tries = mode === 'lander' ? 2049 : 400;
  for (let n = 0; n < tries; n++) {
    const x = rng.int(P), z = rng.int(P), r = rng.next();
    const a = terrain.altitude(x + 0.5, z);
    if (a >= terrain.seaLevel || terrain.isPad(x + 0.5, z)) continue;
    objects[z * P + x] = (r & 7) + 1;
  }
  // the three rockets on the pad (the original's &0107, &0307, &0507)
  objects[P + 7] = 9; objects[3 * P + 7] = 9; objects[5 * P + 7] = 9;
  const mutated = new Uint8Array(P * P);
  const infection = mode === 'lander' ? undefined : new Uint8Array(P * P);
  if (infection) {
    for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) {
      const d = Math.hypot(wrap(x - 20, P) - (wrap(x - 20, P) > P / 2 ? P : 0),
        wrap(z - 14, P) - (wrap(z - 14, P) > P / 2 ? P : 0));
      infection[z * P + x] = Math.max(0, Math.min(255, (9 - d) * 40));
      if (infection[z * P + x] > 100 && objects[z * P + x] !== 0xFF) mutated[z * P + x] = 1;
    }
  }
  const y = PAD_ALTITUDE - UNDERCARRIAGE;
  const player = { x: 4, y, z: 4, vx: 0, vy: 0, vz: 0, pitch: 0, dir: 0,
    ...orientation(0.25, 0.6), alive: true, invulnerable: 0, fuel: 3413, maxFuel: 5120 };
  const world = {
    mode, terrain, period: P, tickCount: 0, objects, mutated, infection, player,
    camera: { x: player.x, y: Math.min(player.y, 0), z: wrap(player.z + 5, P) },
    enemies: [], projectiles: [], pickups: [], state: 'playing',
  };
  // particles: exhaust-like fading dots, smoke and a few bullets
  const list = [];
  for (let i = 0; i < 120; i++) {
    const life = rng.int(8);
    list.push({ x: 4 + rng.signed() * 2, y: y - rng.float() * 2.5, z: 4 + rng.signed() * 2,
      colour: (15 << 8) | (Math.min(15, 2 * life) << 4) | (life >= 8 ? 2 * (life - 8) : 0),
      big: false });
  }
  for (let i = 0; i < 12; i++) {
    list.push({ x: 4 + i * 0.4, y: y - 1 - i * 0.1, z: 4 + i * 0.5, colour: 0xFFF, big: true });
  }
  world.particles = { get count() { return list.length; }, forEach: (fn) => list.forEach(fn) };
  if (enemies) {
    const types = ['seeder', 'drone', 'mutant', 'bomber', 'pest', 'fighter', 'attractor',
      'rock'];
    types.forEach((type, i) => {
      const x = 4 + (i % 4 - 1.5) * 2.4, z = 4 + (i < 4 ? 2.5 : -1.5);
      const o = orientation(0.2 * i, 0.9 * i);
      world.enemies.push({ type, x: wrap(x, P), y: -0.5 - (i % 3) * 0.6, z: wrap(z, P), ...o,
        hp: 1, state: 'fly', flash: 0, id: i, landed: false, hurt: false });
    });
    world.enemies.push({ type: 'seeder', x: 12, y: terrain.altitude(12, 6) - 0.47, z: 6,
      ...orientation(0, 0.3), landed: true });
    world.enemies.push({ type: 'fighter', x: 10, y: -2, z: 8, ...orientation(0, 2),
      hurt: true });
    world.projectiles.push({ type: 'missile', x: 6, y: 1, z: 5, ...orientation(0.3, 1) });
    world.projectiles.push({ type: 'enemyMissile', x: 2, y: 1, z: 6,
      ...orientation(-0.2, 3) });
    world.projectiles.push({ type: 'bomb', x: 7, y: 0.5, z: 7, ...orientation(0, 0.4) });
    ['fuel', 'missile', 'shield', 'cleanse'].forEach((kind, i) => world.pickups.push(
      { kind, x: 1 + i * 2, y: 1.8, z: 1, spin: i }));
  }
  return world;
}

/** Move the player (and camera) to x, y, z. */
export function placePlayer(world, x, y, z) {
  const p = world.player, P = world.period;
  p.x = wrap(x, P); p.y = y; p.z = wrap(z, P);
  world.camera.x = p.x; world.camera.y = Math.min(p.y, 0); world.camera.z = wrap(p.z + 5, P);
}
