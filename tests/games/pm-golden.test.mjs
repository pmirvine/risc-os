// Golden runs: a fixed route for 3000 ticks gives a fixed game. If
// one of these hashes must change, the commit must say why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from '../../tools/games/!Pacman/Game';
import { Rng } from '../../tools/games/!GameLib/Maths';
import { Autopilot } from '../../tools/games/!Pacman/Autopilot';
import { scripted } from './script.mjs';

const PINNED = {
  1: '66c44314c12d02399f4bc46fb2cbe6809154dde1e9ca402dc85cbf51543ebb42',
  2: 'b312acb54ca068b33445b5fa1a167a74ad224955d7a59c179616e194dfd7b5d3',
  3: 'beeac7c69abc377430714772ee5acb69c0e81bab380f27b304ce8b34f66581f8',
};

function golden(seed) {
  const game = new Game({ seed });
  for (let f = 0; f < 3000; f++) game.tick({ want: scripted(f) });
  const json = JSON.stringify(game.snapshot());
  return createHash('sha256').update(json).digest('hex');
}

for (const seed of [1, 2, 3]) {
  test(`golden run, seed ${seed}`, () => {
    assert.equal(golden(seed), PINNED[seed]);
  });
}

test('two runs of seed 1 agree, and the seeds differ', () => {
  assert.equal(golden(1), golden(1));
  assert.notEqual(golden(1), golden(2));
});

// The rich golden: the autopilot plays a normal game (with lives to
// spare, so it is not cut short) for 9000 ticks. Seed 1 exercises, in
// that time: energizers and frights, ghosts eaten (several), ghosts
// let out of the house by dots eaten, deaths and the 'ready' that
// follows, the clearing of level 1 (the 'levelDone' show) and the
// start of level 2. The hash is of the whole snapshot at the end.
const RICH = '75f4fef138fd84194f38274a59014bcb4897168323e367a54a39ec03a0bb55e0';

function rich(seed, ticks) {
  const game = new Game({ seed, lives: 50 });
  const pilot = new Autopilot(new Rng(seed));
  const seen = {};
  let byDots = 0;
  for (let f = 0; f < ticks; f++) {
    const was = game.ghosts.map((g) => g.state);
    const want = game.state === 'play' ? pilot.drive(game) : -1;
    const ev = game.tick({ want });
    for (const e of ev) seen[e.type] = (seen[e.type] || 0) + 1;
    const ate = ev.some((e) => e.type === 'dot' || e.type === 'energizer');
    game.ghosts.forEach((g, i) => {
      if (ate && was[i] === 'house' && g.state === 'leaving') byDots++;
    });
  }
  const json = JSON.stringify(game.snapshot());
  return { game, seen, byDots,
    hash: createHash('sha256').update(json).digest('hex') };
}

test('rich golden: autopilot, seed 1, 9000 ticks', () => {
  const r = rich(1, 9000);
  assert.ok(r.seen.energizer >= 3, 'energizers');
  assert.ok(r.seen.frightStart >= 3, 'frights');
  assert.ok(r.seen.ghostEaten >= 5, 'ghosts eaten');
  assert.ok(r.byDots >= 3, 'ghosts let out by dots eaten');
  assert.ok(r.seen.death >= 1, 'a death');
  assert.ok(r.seen.levelDone >= 1, 'a level cleared');
  assert.ok(r.game.level >= 2, 'on level 2');
  assert.equal(r.hash, RICH);
});

test('rich golden: two runs agree', () => {
  assert.equal(rich(1, 2500).hash, rich(1, 2500).hash);
});
