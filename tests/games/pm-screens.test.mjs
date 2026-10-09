import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keys } from '../../tools/games/!GameLib/Keys';
import { Surface } from '../../tools/games/!GameLib/Surface';
import { DEFAULTS } from '../../tools/games/!Pacman/Settings';
import { GHOSTS } from '../../tools/games/!Pacman/Theme';
import { Title } from '../../tools/games/!Pacman/Title';
import { Screens, wantFor, ACTIONS } from
  '../../tools/games/!Pacman/Screens';
import { Entry } from '../../tools/games/!Pacman/Entry';
import { SEED, loadScores, saveScores } from
  '../../tools/games/!Pacman/Scores';
import { choicesStore } from '../../tools/games/!GameLib/Choices';
import { Sound } from '../../tools/games/!Pacman/Sound';
import { fakeChoices, fakeVfs, fakeSysvars } from './fakes.mjs';

const press = (code, repeat = false) => ({ code, key: code, repeat });

function make(table = SEED.map((e) => ({ ...e }))) {
  const keys = new Keys(ACTIONS);
  const log = [];
  const app = {
    keys, settings: { ...DEFAULTS }, scores: { table, lastName: '' },
    saveScores: () => log.push('save'),
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
  const type = (key, code = key) => {
    keys.keyDown({ code, key });
    screens.frame(keys.takePresses());
    keys.keyUp({ code });
  };
  return { keys, app, screens, log, tap, type };
}

/** Play a game to its end with this score; true once it has ended. */
function endGame(screens, score, extra = {}) {
  const g = screens.game;
  Object.assign(g, { score, lives: 0 }, extra);
  g.setState('gameOver');
  for (let i = 0; i < 400 && screens.name === 'play'; i++) {
    screens.tick();
  }
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

test('P, Escape, Escape: the game is not left paused', () => {
  const { screens, tap } = make();
  tap('Enter');
  tap('KeyP');
  tap('Escape');
  assert.equal(screens.name, 'pause');
  tap('Escape');
  assert.equal(screens.name, 'play');
  assert.equal(screens.paused, false);
  screens.tick();
  assert.equal(screens.game.frame, 1);
});

test('Entry ignores odd characters', () => {
  const e = new Entry();
  const k = (key, extra = {}) => e.key({ key, ...extra });
  assert.equal(k('a'), null);
  assert.equal(e.name, 'A');
  for (const key of ['1', ' ', '.', '-']) assert.equal(k(key), null);
  assert.equal(e.name, 'A1 ');
  const odd = new Entry();
  for (const key of ['\u20ac', 'Tab', 'F1', 'Dead', 'Shift',
    '\u{1F600}', '', undefined]) {
    assert.equal(odd.key({ key }), null);
  }
  assert.equal(odd.name, '???');
  assert.equal(odd.text, '');
  const full = new Entry();
  for (const key of 'abcd') full.key({ key });
  assert.equal(full.name, 'ABC');
  full.key({ key: 'Backspace' });
  assert.equal(full.name, 'AB');
  full.key({ key: 'z' });
  assert.equal(full.name, 'ABZ');
  assert.equal(full.key({ key: 'Enter' }), 'done');
  assert.equal(new Entry().key({ key: 'Escape' }), 'done');
  assert.equal(new Entry().key({ key: 'a', ctrl: true }), null);
  assert.equal(new Entry().key({ key: 'a', repeat: true }), null);
});

test('Entry: initial name, blank counts as empty, backspace safe', () => {
  assert.equal(new Entry('xy\u20ac!qq').name, 'XYQ');
  assert.equal(new Entry('  ').name, '???');
  const e = new Entry();
  e.key({ key: 'Backspace' });
  assert.equal(e.name, '???');
  const r = new Entry('AB');
  r.key({ key: 'Backspace', repeat: true });
  assert.equal(r.name, 'A');
});

test('a game scoring 12000 asks for a name and is saved once', () => {
  const { screens, tap, type, app, log } = make();
  tap('Enter');
  screens.game.level = 3;
  endGame(screens, 12000);
  assert.equal(screens.name, 'entry');
  assert.equal(screens.typing, true);
  const s = new Surface(224, 288);
  screens.draw(s);
  type('p'); type('a', 'KeyA'); type('c');
  assert.deepEqual(log, []);
  type('Enter');
  assert.equal(log.filter((x) => x === 'save').length, 1);
  assert.equal(screens.typing, false);
  assert.equal(screens.name, 'scores');
  const t = app.scores.table;
  assert.equal(t.length, 10);
  assert.deepEqual({ ...t[0], date: 0 },
    { name: 'PAC', score: 12000, level: 3, date: 0 });
  assert.match(t[0].date, /^\d{4}-\d\d-\d\d$/);
  assert.equal(t[1].score, 10000);
  assert.equal(app.scores.lastName, 'PAC');
  screens.draw(s);
  tap('Enter');
  assert.equal(screens.name, 'title');
});

test('Escape ends name entry; empty gives ???; F types a letter', () => {
  const { screens, tap, type, app, log } = make();
  tap('Enter');
  endGame(screens, 12000);
  type('f', 'KeyF');
  type('Backspace');
  assert.ok(!log.includes('full'));
  type('Escape');
  assert.equal(app.scores.table[0].name, '???');
  assert.equal(log.filter((x) => x === 'save').length, 1);
  tap('Enter'); tap('Enter');
  endGame(screens, 13000);
  type('p', 'KeyP');                 // P is a letter here
  type('Escape');
  assert.equal(app.scores.table[0].name, 'P');
});

test('the next name entry starts with the last name', () => {
  const { screens, tap, type, app } = make();
  tap('Enter');
  endGame(screens, 12000);
  type('b'); type('o'); type('b'); type('Enter');
  tap('Enter');
  tap('Enter');
  endGame(screens, 13000);
  assert.equal(screens.entry.name, 'BOB');
});

test('no name for zero or a score below the tenth place', () => {
  const { screens, tap, log, app } = make();
  tap('Enter');
  endGame(screens, 0);
  assert.equal(screens.name, 'title');
  tap('Enter');
  endGame(screens, 1000);            // equal to the tenth: no
  assert.equal(screens.name, 'title');
  tap('Enter');
  endGame(screens, 900);
  assert.equal(screens.name, 'title');
  assert.equal(screens.typing, false);
  assert.deepEqual(log, []);
  assert.deepEqual(app.scores.table, SEED);
  tap('Enter');
  endGame(screens, 1001);
  assert.equal(screens.name, 'entry');
});

test('a short table takes any score above zero', () => {
  const { screens, tap, type, app } = make([]);
  tap('Enter');
  endGame(screens, 10);
  assert.equal(screens.name, 'entry');
  type('Enter');
  assert.equal(app.scores.table.length, 1);
});

test('a demo game is never recorded', () => {
  const { screens, tap, log, app } = make();
  tap('Enter');
  screens.game.demo = true;
  endGame(screens, 99999);
  assert.equal(screens.name, 'title');
  assert.equal(screens.typing, false);
  assert.deepEqual(log, []);
  assert.deepEqual(app.scores.table, SEED);
});

test('a game starts with the best score as its high score', () => {
  const { screens, tap, app } = make();
  tap('Enter');
  assert.equal(screens.game.high, 10000);
  app.scores.table = [];
  screens.title();
  tap('Enter');
  assert.equal(screens.game.high, 0);
});

test('the High scores screen shows the table', () => {
  const a = make();
  const b = make([{ name: 'ZZZ', score: 777, level: 9,
    date: '2026-01-02' }]);
  const sa = new Surface(224, 288), sb = new Surface(224, 288);
  a.tap('ArrowDown'); a.tap('Enter');
  b.tap('ArrowDown'); b.tap('Enter');
  a.screens.draw(sa); b.screens.draw(sb);
  assert.equal(a.screens.name, 'scores');
  assert.ok(sa.pixels.some((p, i) => p !== sb.pixels[i]));
  assert.ok(sa.pixels.filter((p) => p !== sa.pixels[0]).length > 500);
});

const store = (files = {}) => {
  const choices = fakeChoices(files);
  return { choices, store: choicesStore({ choices, vfs: fakeVfs(),
    sysvars: fakeSysvars() }, 'Pacman') };
};

test('SEED is ten entries of our own names', () => {
  assert.deepEqual(SEED.map((e) => e.name), ['ARM', 'BBC', 'VDU', 'RAM',
    'ROM', 'CPU', 'BIT', 'KEY', 'DOT', 'POW']);
  assert.deepEqual(SEED.map((e) => e.score), [10000, 9000, 8000, 7000,
    6000, 5000, 4000, 3000, 2000, 1000]);
  assert.ok(SEED.every((e) => e.level === 1 && e.date === '1987-06-01'));
});

test('loadScores: missing, corrupt and huge files', async () => {
  const miss = await loadScores(store().store);
  assert.deepEqual(miss, { table: SEED, lastName: '' });
  assert.notEqual(miss.table, SEED);
  miss.table[0].score = 1;
  assert.equal(SEED[0].score, 10000);
  for (const bad of ['str', null, [1, 2], 5, { table: 'x' },
    { table: [] }, { table: [null, { score: 'x' }] }]) {
    const r = await loadScores(store({ 'Pacman.Scores': bad }).store);
    assert.deepEqual(r.table, SEED);
  }
  const big = [];
  for (let i = 0; i < 10000; i++) {
    big.push({ name: 'Q\x07\u20acRSTU', score: i, level: 2,
      date: '2026-10-08\x00zzzz' });
  }
  const r = await loadScores(store({ 'Pacman.Scores':
    { table: big, lastName: 'abcdefg' } }).store);
  assert.equal(r.table.length, 10);
  assert.equal(r.table[0].score, 9999);
  assert.equal(r.table[0].name, 'QRS');
  assert.equal(r.table[0].date, '2026-10-08');
  assert.equal(r.lastName, 'abc'.toUpperCase());
  const hostile = await loadScores(store({ 'Pacman.Scores':
    { table: SEED, lastName: { x: 1 } } }).store);
  assert.equal(hostile.lastName, '');
});

test('saveScores writes the Scores leaf and reads back', async () => {
  const { store: st, choices } = store();
  const data = { table: [{ name: 'AAA', score: 5, level: 1,
    date: '2026-10-08' }], lastName: 'AAA' };
  assert.equal(await saveScores(st, data), true);
  assert.equal(choices.writes[0][0], 'Pacman.Scores');
  assert.deepEqual(await loadScores(st), data);
});

// ---- attract mode: title, demo, high scores, title ----

const ticks = (screens, n) => { for (let i = 0; i < n; i++) screens.tick(); };

test('idle on the title for 600 frames starts a demo game', () => {
  const { screens } = make();
  ticks(screens, 599);
  assert.equal(screens.name, 'title');
  screens.tick();
  assert.equal(screens.name, 'attract-demo');
  assert.equal(screens.game.demo, true);
  assert.equal(screens.game.high, 10000);
});

test('each demo has its own seed from the shell', () => {
  const { screens, app } = make();
  app.demoSeed = 5;
  ticks(screens, 600);
  const a = screens.game.snapshot().rng;
  assert.equal(app.demoSeed, 6);
  screens.title();
  ticks(screens, 600);
  assert.notEqual(screens.game.snapshot().rng, a);
});

test('a key at frame 599 restarts the wait', () => {
  const { screens, tap } = make();
  ticks(screens, 599);
  tap('ArrowUp');
  ticks(screens, 599);
  assert.equal(screens.name, 'title');
  screens.tick();
  assert.equal(screens.name, 'attract-demo');
});

test('the wait runs on the title only, not in Settings or help', () => {
  const { screens, tap } = make();
  ticks(screens, 400);
  tap('ArrowDown'); tap('ArrowDown');
  tap('Enter');                    // Settings
  assert.equal(screens.name, 'settings');
  ticks(screens, 1000);
  assert.equal(screens.name, 'settings');
  tap('Escape');
  assert.equal(screens.name, 'title');
  ticks(screens, 599);             // restarted from zero
  assert.equal(screens.name, 'title');
  screens.tick();
  assert.equal(screens.name, 'attract-demo');
});

test('a pointer click on the title restarts the wait', () => {
  const { screens } = make();
  ticks(screens, 599);
  screens.pointer({ type: 'down', x: 0, y: 0 });
  ticks(screens, 599);
  assert.equal(screens.name, 'title');
});

test('the demo ends on its first death, then scores, then title', () => {
  const { screens, log } = make();
  ticks(screens, 600);
  ticks(screens, 200);
  screens.game.debug.kill();
  let n = 0;
  while (screens.name === 'attract-demo' && n++ < 1000) screens.tick();
  assert.equal(screens.name, 'attract-scores');
  assert.equal(screens.game.state, 'over');
  ticks(screens, 359);
  assert.equal(screens.name, 'attract-scores');
  screens.tick();
  assert.equal(screens.name, 'title');
  assert.equal(screens.game, null);
  assert.deepEqual(log, []);
});

test('a demo that survives ends after 3600 frames', () => {
  const { screens } = make();
  ticks(screens, 600);
  const g = screens.game;
  g.debug.skipIntro?.();
  screens.attract.t = 3598;              // as if 3598 frames played
  screens.tick();
  assert.equal(screens.name, 'attract-demo');
  assert.notEqual(g.state, 'over');
  screens.tick();
  assert.equal(screens.name, 'attract-scores');
});

test('any key during the demo returns to the title, consumed', () => {
  const { screens, tap, log } = make();
  screens.titleScreen.menu.sel = 2;      // Settings is chosen
  ticks(screens, 700);
  assert.equal(screens.name, 'attract-demo');
  tap('Enter');
  assert.equal(screens.name, 'title');
  assert.equal(screens.game, null);
  assert.equal(screens.titleScreen.menu.sel, 0, 'a new title');
  assert.deepEqual(log, []);
});

test('a key is not passed to the menu (nothing starts)', () => {
  const { screens, tap, log } = make();
  ticks(screens, 700);
  tap('Escape');                          // would be Desktop
  assert.equal(screens.name, 'title');
  ticks(screens, 700);
  tap('KeyF');                            // would toggle full screen
  assert.equal(screens.name, 'title');
  ticks(screens, 700);
  tap('Space');                           // would be Play
  assert.equal(screens.name, 'title');
  assert.deepEqual(log, []);
});

test('a click during the demo returns to the title, consumed', () => {
  const { screens, log } = make();
  ticks(screens, 700);
  screens.pointer({ type: 'down', x: 112, y: 214 });  // over Play
  assert.equal(screens.name, 'title');
  assert.equal(screens.game, null);
  assert.deepEqual(log, []);
});

test('a key during the high scores shown after a demo goes back', () => {
  const { screens, tap } = make();
  ticks(screens, 600);
  screens.game.debug.kill();
  ticks(screens, 600);
  assert.equal(screens.name, 'attract-scores');
  tap('Enter');
  assert.equal(screens.name, 'title');
});

test('the demo draws a game and the scores draw the table', () => {
  const { screens } = make();
  ticks(screens, 700);
  const s = new Surface(224, 288);
  screens.draw(s);
  let lit = 0;
  for (let y = 24; y < 248; y++) lit += s.get(100, y) !== 0;
  assert.ok(lit > 0, 'the maze');
  screens.game.debug.kill();
  ticks(screens, 600);
  screens.draw(s);
});

test('the demo is silent and never writes the score table', () => {
  const { screens, log, app } = make();
  const calls = [];
  const snd = new Sound(app.settings, { get: () => undefined });
  snd.audio = { live: true,
    play: (n) => calls.push('play:' + n),
    loop: (n, on) => calls.push('loop:' + n + on),
    silence() {}, setVolume() {}, setDesktopGain() {} };
  ticks(screens, 600);
  screens.game.score = 99999;            // above the table
  let n = 0;
  while (screens.name !== 'title' && n++ < 3000) {
    snd.update(screens, screens.tick());
  }
  assert.equal(screens.name, 'title');
  assert.deepEqual(calls, []);
  assert.deepEqual(log, []);
  assert.deepEqual(app.scores.table, SEED);
  assert.equal(screens.typing, false);
});

test('the demo is a game the autopilot steers, not still', () => {
  const { screens } = make();
  ticks(screens, 600 + 200);
  const g = screens.game;
  assert.ok(g.frame >= 190);
  assert.ok(g.score > 0 || g.maze.dotsEaten > 0);
});
