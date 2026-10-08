import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTable, qualifies, insertScore, today }
  from '../../tools/games/!GameLib/ScoreTable';

test('cleanTable rejects non-tables and bad entries', () => {
  assert.equal(cleanTable('x'), null);
  assert.equal(cleanTable([]), null);
  assert.equal(cleanTable([{ score: NaN }, { score: '5' }, null]), null);
});

test('names are filtered, cut and defaulted', () => {
  const t = cleanTable([{ name: 'A\x07B€CD', score: 5 },
    { name: '', score: 4 }, { score: 3 }]);
  assert.deepEqual(t.map((e) => e.name), ['ABC', '???', '???']);
});

test('a long table is sorted and cut to size', () => {
  const big = [];
  for (let i = 0; i < 10000; i++) big.push({ name: 'X', score: i % 977 });
  const t = cleanTable(big);
  assert.equal(t.length, 10);
  assert.ok(t.every((e, i) => i === 0 || t[i - 1].score >= e.score));
  assert.equal(cleanTable(big, { size: 3 }).length, 3);
});

test('extra fields and dates', () => {
  const t = cleanTable([{ score: 9, level: 4, date: '2026-10-08T12:00' },
    { score: 8, level: 'x' }], { extra: ['level'] });
  assert.equal(t[0].level, 4);
  assert.equal(t[0].date, '2026-10-08');
  assert.equal(t[1].level, 0);
  assert.equal(t[1].date, '');
});

test('qualifies and insertScore', () => {
  const t = [{ score: 30 }, { score: 20 }, { score: 10 }];
  assert.equal(qualifies(t, 0, 3), false);
  assert.equal(qualifies(t, 10, 3), false);
  assert.equal(qualifies(t, 11, 3), true);
  assert.equal(qualifies(t, 1, 4), true);
  assert.equal(insertScore(t, { score: 40 }, 3), 0);
  assert.deepEqual(t.map((e) => e.score), [40, 30, 20]);
  assert.equal(insertScore(t, { score: 5 }, 3), -1);
  assert.equal(t.length, 3);
});

test('today formats a date', () => {
  assert.equal(today(new Date(2026, 9, 8)), '2026-10-08');
  assert.match(today(), /^\d{4}-\d\d-\d\d$/);
});
