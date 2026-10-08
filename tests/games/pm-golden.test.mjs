// Golden runs: a fixed route for 3000 ticks gives a fixed game. If
// one of these hashes must change, the commit must say why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from '../../tools/games/!Pacman/Game';
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
