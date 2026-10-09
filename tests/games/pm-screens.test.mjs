import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keys } from '../../tools/games/!GameLib/Keys';
import { Surface } from '../../tools/games/!GameLib/Surface';
import { DEFAULTS } from '../../tools/games/!Pacman/Settings';
import { GHOSTS } from '../../tools/games/!Pacman/Theme';
import { Title } from '../../tools/games/!Pacman/Title';
import { Screens, wantFor, ACTIONS } from
  '../../tools/games/!Pacman/Screens';

const press = (code, repeat = false) => ({ code, key: code, repeat });

function make() {
  const keys = new Keys(ACTIONS);
  const log = [];
  const app = {
    keys, settings: { ...DEFAULTS }, high: 0,
    changeSetting: (k) => log.push('set:' + k),
    toggleBrowserFull: () => log.push('full'),
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
  tap('ArrowDown'); tap('ArrowDown'); tap('ArrowDown');
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
  for (let i = 0; i < 4; i++) tap('ArrowDown');
  tap('Enter');                      // View source is the fifth
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

const texts = (m) => m.items.map((i) =>
  typeof i.text === 'function' ? i.text() : i.text);

test('the title menu has exactly the six items', () => {
  const { screens } = make();
  assert.deepEqual(texts(screens.menu), ['Play', 'High scores',
    'Settings', 'How to play', 'View source', 'Desktop']);
});

test('the roll-call shows a ghost every 60 frames', () => {
  const t = new Title([]);
  const seen = [];
  for (let f = 0; f < 400; f++) {
    seen.push(t.shown());
    t.tick();
  }
  assert.equal(seen[0], 0);
  const at = [1, 2, 3, 4].map((n) => seen.indexOf(n));
  assert.ok(at.every((x) => x > 0));
  assert.deepEqual(at.slice(1).map((x, i) => x - at[i]), [60, 60, 60]);
  assert.equal(seen[399], 4);
  assert.deepEqual(t.rollCall(), GHOSTS.map((g) => [g.name,
    g.nickname]));
  assert.deepEqual(t.legend, [10, 50]);
});

test('the pause menu lists five items', () => {
  const { screens, tap } = make();
  tap('Enter'); tap('Escape');
  assert.deepEqual(texts(screens.menu), ['Continue', 'Restart',
    'Settings', 'Title', 'Desktop']);
});

test('Continue loses no tick; Restart uses lives and bonus', () => {
  const { screens, tap, app } = make();
  tap('Enter');
  for (let i = 0; i < 9; i++) screens.tick();
  tap('Escape');
  for (let i = 0; i < 9; i++) screens.tick();
  tap('Enter');                      // Continue
  assert.equal(screens.game.frame, 9);
  screens.tick();
  assert.equal(screens.game.frame, 10);
  app.settings.lives = 5;
  app.settings.bonus = 20000;
  tap('Escape'); tap('ArrowDown'); tap('Enter');
  assert.equal(screens.game.frame, 0);
  assert.equal(screens.game.lives, 5);
  assert.equal(screens.game.bonus, 20000);
});

test('blur pauses play and clears want; keys then start fresh', () => {
  const { screens, tap, keys } = make();
  tap('Enter');
  tap('ArrowUp');
  assert.equal(screens.want, 0);
  keys.release();
  screens.blur();
  assert.equal(screens.paused, true);
  assert.equal(screens.want, -1);
  tap('ArrowLeft');
  assert.equal(screens.want, 1);
});

test('Settings: arrows step options, changes are announced', () => {
  const { screens, tap, app, log } = make();
  tap('ArrowDown'); tap('ArrowDown'); tap('Enter');
  assert.equal(screens.name, 'settings');
  assert.match(texts(screens.menu)[0], /Full screen/);
  tap('ArrowRight');
  assert.equal(app.settings.display, 'window');
  assert.match(texts(screens.menu)[0], /Window/);
  tap('ArrowLeft');
  assert.equal(app.settings.display, 'full');
  tap('ArrowDown'); tap('ArrowDown'); tap('ArrowDown');
  tap('ArrowRight');                 // volume 0.8 -> 1
  assert.equal(app.settings.volume, 1);
  tap('ArrowDown'); tap('ArrowRight');   // lives 3 -> 5
  assert.equal(app.settings.lives, 5);
  tap('ArrowDown'); tap('ArrowLeft');    // bonus 10000 -> none
  assert.equal(app.settings.bonus, 0);
  assert.deepEqual(log, ['set:display', 'set:display', 'set:volume',
    'set:lives', 'set:bonus']);
  tap('Escape');
  assert.equal(screens.name, 'title');
});

test('Settings from the pause menu returns to it', () => {
  const { screens, tap } = make();
  tap('Enter'); tap('Escape');
  tap('ArrowDown'); tap('ArrowDown'); tap('Enter');
  assert.equal(screens.name, 'settings');
  screens.tick();
  assert.equal(screens.game.frame, 0);
  tap('Escape');
  assert.equal(screens.name, 'pause');
  assert.equal(screens.menu.sel, 2);
});

test('F toggles browser full screen unless typing', () => {
  const { screens, tap, log } = make();
  tap('KeyF');
  assert.deepEqual(log, ['full']);
  screens.typing = true;
  tap('KeyF');
  assert.deepEqual(log, ['full']);
  screens.typing = false;
  tap('Enter');
  tap('KeyF');
  assert.deepEqual(log, ['full', 'full']);
});

test('High scores and How to play screens open and close', () => {
  const { screens, tap } = make();
  const s = new Surface(224, 288);
  tap('ArrowDown'); tap('Enter');
  assert.equal(screens.name, 'scores');
  screens.draw(s);
  tap('Enter');
  assert.equal(screens.name, 'title');
  tap('ArrowDown'); tap('ArrowDown'); tap('Enter');
  assert.equal(screens.name, 'help');
  screens.draw(s);
  tap('Escape');
  assert.equal(screens.name, 'title');
  assert.equal(screens.menu.sel, 3);
});

test('gameFinished: GAME OVER returns to the title', () => {
  const { screens, tap } = make();
  tap('Enter');
  const calls = [];
  const orig = screens.gameFinished.bind(screens);
  screens.gameFinished = (g) => { calls.push(g); orig(g); };
  const g = screens.game;
  g.lives = 0;
  g.setState('gameOver');
  for (let i = 0; i < 400 && screens.name === 'play'; i++) {
    screens.tick();
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0], g);
  assert.equal(screens.name, 'title');
  assert.equal(screens.game, null);
});

test('P, Escape, Continue: the game runs again, not paused', () => {
  const { screens, tap } = make();
  tap('Enter');
  tap('KeyP');
  assert.equal(screens.paused, true);
  tap('Escape');
  tap('Enter');                      // Continue
  assert.equal(screens.name, 'play');
  assert.equal(screens.paused, false);
  screens.tick();
  assert.equal(screens.game.frame, 1);
});
