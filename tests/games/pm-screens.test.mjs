import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keys } from '../../tools/games/!GameLib/Keys';
import { Surface } from '../../tools/games/!GameLib/Surface';
import { Screens, wantFor, ACTIONS } from
  '../../tools/games/!Pacman/Screens';

const press = (code, repeat = false) => ({ code, key: code, repeat });

function make() {
  const keys = new Keys(ACTIONS);
  const log = [];
  const app = {
    keys, settings: { lives: 3, bonus: 10000 }, high: 0,
    toDesktop: () => log.push('desktop'),
    viewSource: () => log.push('source'),
    seed: () => 7,
  };
  const screens = new Screens(app);
  const tap = (code) => {
    keys.keyDown({ code });
    screens.frame(keys.takePresses());
    keys.keyUp({ code });
  };
  return { keys, app, screens, log, tap };
}

test('wantFor: the latest held direction, else the old want', () => {
  const keys = new Keys(ACTIONS);
  assert.equal(wantFor(keys, 2), 2);
  keys.keyDown({ code: 'ArrowLeft' });
  assert.equal(wantFor(keys, 2), 1);
  keys.keyDown({ code: 'KeyW' });
  assert.equal(wantFor(keys, 2), 0);
  keys.keyDown({ code: 'ArrowRight' });
  assert.equal(wantFor(keys, 2), 3);
  keys.keyUp({ code: 'ArrowRight' });
  assert.equal(wantFor(keys, 2), 0);
  keys.release();
  assert.equal(wantFor(keys, 2), 2);
});

test('the actions are the ones the spec lists', () => {
  assert.deepEqual(ACTIONS.up.slice(0, 3),
    ['ArrowUp', 'KeyW', 'Quote']);
  assert.ok(ACTIONS.left.includes('KeyZ'));
  assert.ok(ACTIONS.right.includes('KeyX'));
  assert.ok(ACTIONS.down.includes('Slash'));
  assert.deepEqual(ACTIONS.pause.slice(0, 1), ['KeyP']);
  assert.deepEqual(ACTIONS.menu.slice(0, 1), ['Escape']);
  assert.deepEqual(ACTIONS.full, ['KeyF']);
  assert.deepEqual(ACTIONS.select.slice(0, 2), ['Enter', 'Space']);
});

test('Enter on the title starts a game', () => {
  const { screens, tap } = make();
  assert.equal(screens.name, 'title');
  assert.equal(screens.game, null);
  tap('Enter');
  assert.equal(screens.name, 'play');
  assert.equal(screens.game.state, 'start');
  assert.equal(screens.game.lives, 3);
});

test('ticks run the game; P pauses and resumes', () => {
  const { screens, tap } = make();
  tap('Enter');
  for (let i = 0; i < 5; i++) screens.tick();
  assert.equal(screens.game.frame, 5);
  tap('KeyP');
  assert.equal(screens.paused, true);
  for (let i = 0; i < 5; i++) screens.tick();
  assert.equal(screens.game.frame, 5);
  tap('KeyP');
  assert.equal(screens.paused, false);
  screens.tick();
  assert.equal(screens.game.frame, 6);
});

test('Escape opens the pause menu; Continue resumes', () => {
  const { screens, tap } = make();
  tap('Enter');
  tap('Escape');
  assert.equal(screens.name, 'pause');
  screens.tick();
  assert.equal(screens.game.frame, 0);
  tap('Escape');
  assert.equal(screens.name, 'play');
  tap('Escape');
  tap('Enter');                      // Continue is the first item
  assert.equal(screens.name, 'play');
  screens.tick();
  assert.equal(screens.game.frame, 1);
});

test('the pause menu restarts, goes to the title or desktop', () => {
  const { screens, tap, log } = make();
  tap('Enter');
  for (let i = 0; i < 4; i++) screens.tick();
  tap('Escape');
  tap('ArrowDown');
  tap('Enter');                      // Restart
  assert.equal(screens.name, 'play');
  assert.equal(screens.game.frame, 0);
  tap('Escape');
  tap('ArrowDown'); tap('ArrowDown');
  tap('Enter');                      // Title
  assert.equal(screens.name, 'title');
  tap('Enter');
  tap('Escape');
  tap('ArrowUp');                    // wraps to Desktop
  tap('Enter');
  assert.deepEqual(log, ['desktop']);
});

test('a direction press sets want and it persists', () => {
  const { screens, tap, keys } = make();
  tap('Enter');
  tap('ArrowUp');
  assert.equal(screens.want, 0);
  screens.frame([]);
  assert.equal(screens.want, 0);
  keys.keyDown({ code: 'KeyD' });
  screens.frame(keys.takePresses());
  assert.equal(screens.want, 3);
});

test('losing focus pauses a game', () => {
  const { screens, tap } = make();
  tap('Enter');
  screens.blur();
  assert.equal(screens.paused, true);
});

test('the title menu: View source and Desktop; drawing works', () => {
  const { screens, tap, log } = make();
  const s = new Surface(224, 288);
  for (let i = 0; i < 400; i++) screens.tick();
  screens.draw(s);
  assert.ok(s.pixels.some((p) => p !== 0 && p !== s.pixels[0]));
  tap('ArrowDown');
  tap('Enter');
  assert.deepEqual(log, ['source']);
  tap('Escape');
  assert.deepEqual(log, ['source', 'desktop']);
  tap('Enter');
  screens.draw(s);
  tap('Escape');
  screens.draw(s);
});

test('the pointer chooses menu items', () => {
  const { screens } = make();
  const s = new Surface(224, 288);
  screens.draw(s);
  const r = screens.menu.rect(0);
  screens.pointer({ type: 'move', x: r.x + 4, y: r.y + 2 });
  screens.pointer({ type: 'down', x: r.x + 4, y: r.y + 2,
    button: 'select' });
  assert.equal(screens.name, 'play');
});
