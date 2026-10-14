// FieldFormat and FieldDates' pictures (Batch D P8.2, D17): the
// general switch \* (Arabic, roman, ROMAN, alphabetic, ALPHABETIC,
// Ordinal, Upper, Lower, Caps, FirstCap, MERGEFORMAT, CHARFORMAT),
// numeric pictures \# (0 # , . and literal text; anything else
// null), date pictures \@ (English (UK) names; PG18's dd/MM/yyyy);
// hostile pictures never throw or hang.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {formatGeneral, formatNumeric, MAX_PICTURE, MAX_DECIMALS}
  from '../../tools/moreapps/!Letters/FieldFormat';
import {formatDate, DATE_PICTURE, w3cdtf}
  from '../../tools/moreapps/!Letters/FieldDates';

const star = (...args) => args.map((arg) => ({sw: '\\*', arg}));
// Sunday 11 October 2026, 14:05:09 local time
const NOW = new Date(2026, 9, 11, 14, 5, 9);

describe('formatGeneral (\\*)', () => {
  it('number formats: roman, ROMAN, alphabetic, Ordinal, Arabic',
    () => {
      assert.equal(formatGeneral(14, star('roman')), 'xiv');
      assert.equal(formatGeneral(14, star('ROMAN')), 'XIV');
      assert.equal(formatGeneral(3, star('alphabetic')), 'c');
      assert.equal(formatGeneral(28, star('ALPHABETIC')), 'BB');
      assert.equal(formatGeneral(22, star('Ordinal')), '22nd');
      assert.equal(formatGeneral(11, star('ordinal')), '11th');
      assert.equal(formatGeneral(7, star('Arabic')), '7');
      assert.equal(formatGeneral('14', star('roman')), 'xiv');
      assert.equal(formatGeneral(' 9 ', star('ROMAN')), 'IX');
    });

  it('text formats: Upper, Lower, Caps, FirstCap', () => {
    const s = 'the quick bROWN fox';
    assert.equal(formatGeneral(s, star('Upper')), 'THE QUICK BROWN FOX');
    assert.equal(formatGeneral(s, star('Lower')), 'the quick brown fox');
    assert.equal(formatGeneral(s, star('Caps')), 'The Quick BROWN Fox');
    assert.equal(formatGeneral(s, star('FirstCap')),
      'The quick bROWN fox');
    assert.equal(formatGeneral('  été x', star('caps')),
      '  Été X');
    assert.equal(formatGeneral('', star('Caps')), '');
  });

  it('MERGEFORMAT and CHARFORMAT change nothing; no switch: the ' +
    'text', () => {
    assert.equal(formatGeneral('Ab', star('MERGEFORMAT')), 'Ab');
    assert.equal(formatGeneral('Ab', star('CHARFORMAT')), 'Ab');
    assert.equal(formatGeneral(12, []), '12');
    assert.equal(formatGeneral('x', undefined), 'x');
  });

  it('switches apply in order; other switches are ignored', () => {
    assert.equal(formatGeneral(4, [...star('roman', 'Upper')]), 'IV');
    assert.equal(formatGeneral(4, [{sw: '\\#', arg: '00'},
      ...star('ROMAN', 'Lower')]), 'iv');
  });

  it('a number format of text that is no whole number: null', () => {
    assert.equal(formatGeneral('abc', star('roman')), null);
    assert.equal(formatGeneral('1.5', star('Ordinal')), null);
    assert.equal(formatGeneral(1e300, star('roman')), null);
    assert.equal(formatGeneral(NaN, star('Arabic')), null);
    assert.equal(formatGeneral(2.6, star('ROMAN')), 'III');
  });

  it('unknown or missing switch arguments: null', () => {
    assert.equal(formatGeneral(3, star('CardText')), null);
    assert.equal(formatGeneral(3, star('__proto__')), null);
    assert.equal(formatGeneral(3, star(null)), null);
    assert.equal(formatGeneral(3, star('x'.repeat(10000))), null);
  });

  it('values that are not text or numbers: null', () => {
    assert.equal(formatGeneral(null, []), null);
    assert.equal(formatGeneral({}, star('Upper')), null);
  });
});

describe('formatNumeric (\\#)', () => {
  it('the brief\'s picture', () => {
    assert.equal(formatNumeric(1234.5, '#,##0.00'), '1,234.50');
    assert.equal(formatNumeric(1234567.891, '#,##0.00'),
      '1,234,567.89');
  });

  it('0 forces a digit, # gives a space when there is none', () => {
    assert.equal(formatNumeric(5, '000'), '005');
    assert.equal(formatNumeric(22, '$###'), '$ 22');
    assert.equal(formatNumeric(0.5, '0.0'), '0.5');
    assert.equal(formatNumeric(0.5, '#.00'), ' .50');
    assert.equal(formatNumeric(2.345, '0'), '2');
    assert.equal(formatNumeric(2.5, '0'), '3');
  });

  it('literal text before and after, quoted or not', () => {
    assert.equal(formatNumeric(3, "0 'items'"), '3 items');
    assert.equal(formatNumeric(9.5, '£0.00 each'), '£9.50 each');
    assert.equal(formatNumeric(42, "'#'0"), '#42');
  });

  it('negative numbers get a minus before the digits', () => {
    assert.equal(formatNumeric(-1234.5, '#,##0.00'), '-1,234.50');
    assert.equal(formatNumeric(-0.001, '0.00'), '0.00');
  });

  it('bad pictures: null', () => {
    for (const pic of ['', 'abc', '0.0.0', '0 0', '0;0', 'x##', '+0',
      '-0', '`0`', "0 'x", '0,.0,0', 12, null, undefined]) {
      assert.equal(formatNumeric(5, pic), null, String(pic));
    }
  });

  it('numbers that cannot be shown: null', () => {
    for (const n of [NaN, Infinity, -Infinity, 1e21, '5', null]) {
      assert.equal(formatNumeric(n, '0'), null, String(n));
    }
  });

  it('hostile pictures: capped, never thrown', () => {
    assert.equal(formatNumeric(1, '0'.repeat(MAX_PICTURE)).length,
      MAX_PICTURE);
    assert.equal(formatNumeric(1, '0'.repeat(MAX_PICTURE + 1)), null);
    assert.equal(formatNumeric(1, '#'.repeat(10000)), null);
    assert.equal(formatNumeric(1, "'".repeat(9999)), null);
    assert.equal(formatNumeric(1, '0.' + '0'.repeat(200)), null);
    assert.equal(formatNumeric(1, '0.' + '0'.repeat(MAX_DECIMALS)),
      '1.' + '0'.repeat(MAX_DECIMALS));
    assert.equal(formatNumeric(1, '0.' + '0'.repeat(MAX_DECIMALS + 1)),
      null);
  });
});

describe('formatDate (\\@)', () => {
  it('PG18: the default for DATE is dd/MM/yyyy', () => {
    assert.equal(DATE_PICTURE, 'dd/MM/yyyy');
    assert.equal(formatDate(NOW, DATE_PICTURE), '11/10/2026');
  });

  it('day and month names in English (UK)', () => {
    assert.equal(formatDate(NOW, 'dddd d MMMM yyyy'),
      'Sunday 11 October 2026');
    assert.equal(formatDate(NOW, 'ddd d MMM yy'), 'Sun 11 Oct 26');
    assert.equal(formatDate(new Date(2027, 0, 4), 'd/M/yy dddd'),
      '4/1/27 Monday');
  });

  it('times: H HH h hh m mm s ss am/pm AM/PM', () => {
    assert.equal(formatDate(NOW, 'HH:mm'), '14:05');
    assert.equal(formatDate(NOW, 'H:m:s'), '14:5:9');
    assert.equal(formatDate(NOW, 'h:mm am/pm'), '2:05 pm');
    assert.equal(formatDate(NOW, 'hh:mm:ss AM/PM'), '02:05:09 PM');
    const am = new Date(2026, 9, 11, 0, 7);
    assert.equal(formatDate(am, 'h:mm AM/PM'), '12:07 AM');
    assert.equal(formatDate(am, 'HH'), '00');
  });

  it("'quoted text' is literal; other characters too", () => {
    assert.equal(formatDate(NOW, "'Day' d 'of' MMMM"),
      'Day 11 of October');
    assert.equal(formatDate(NOW, "yyyy-MM-dd'T'HH"), '2026-10-11T14');
    assert.equal(formatDate(NOW, "d''"), '11');
  });

  it('bad dates and pictures: null', () => {
    assert.equal(formatDate(new Date(NaN), 'dd'), null);
    assert.equal(formatDate('2026-10-11', 'dd'), null);
    assert.equal(formatDate(NOW, ''), null);
    assert.equal(formatDate(NOW, null), null);
    assert.equal(formatDate(NOW, "d 'unclosed"), null);
  });

  it('hostile pictures: capped, never thrown', () => {
    assert.equal(formatDate(NOW, 'd'.repeat(10000)), null);
    assert.equal(formatDate(NOW, "'".repeat(10000)), null);
    assert.equal(formatDate(NOW, "'".repeat(MAX_PICTURE - 1)), null);
    assert.equal(formatDate(NOW, 'M'.repeat(MAX_PICTURE)), 'October');
    assert.equal(formatDate(NOW, 'M'.repeat(MAX_PICTURE + 1)), null);
  });
});

describe('w3cdtf (core.xml dates)', () => {
  it('reads the W3CDTF forms', () => {
    assert.equal(w3cdtf('2026-10-11T09:30:00Z').toISOString(),
      '2026-10-11T09:30:00.000Z');
    assert.equal(w3cdtf(' 2026-10-11T09:30:00.25+01:00 ')
      .toISOString(), '2026-10-11T08:30:00.250Z');
    assert.equal(w3cdtf('2026-10-11').toISOString(),
      '2026-10-11T00:00:00.000Z');
    assert.equal(w3cdtf('2026').toISOString(),
      '2026-01-01T00:00:00.000Z');
  });

  it('anything else: null', () => {
    for (const s of ['', 'yesterday', '2026-13-01', '2026-10-11T25:00Z',
      '2026-10-11T09:30', '1'.repeat(100000), null, 5, '__proto__']) {
      assert.equal(w3cdtf(s), null, String(s).slice(0, 20));
    }
  });
});
