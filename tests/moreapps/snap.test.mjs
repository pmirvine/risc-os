// PosLine.snap (a window of text around an offset) against the true
// grapheme boundaries of the whole text, at EVERY offset, for short
// texts that stress the window: flags, long ZWJ chains, modifiers,
// many combining marks, conjuncts.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {snap} from '../../tools/moreapps/!Word/PosLine';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';

const flag = (a, b) => String.fromCodePoint(
  0x1F1E6 + a, 0x1F1E6 + b);
const man = '\u{1F468}', zwj = '‍', girl = '\u{1F467}';
const chain = man + (zwj + girl + zwj + man).repeat(8); // > 32 units
const combining = 'e' + '́'.repeat(70);
const TEXTS = {
  flags2: flag(0, 1) + flag(2, 3) + flag(4, 5),
  flagsOdd: 'a' + flag(0, 1).repeat(1) + '\u{1F1E6}' + flag(2, 3),
  flagRun: ('\u{1F1E6}').repeat(1) + flag(1, 2).repeat(20),
  flagRunOdd: ('\u{1F1E6}').repeat(41),
  flagRunEven: ('\u{1F1E6}').repeat(40),
  zwjChain: chain,
  zwjChainText: 'ab' + chain + 'cd' + chain,
  modifierZwj: '\u{1F469}\u{1F3FD}' + zwj + '\u{1F52C}' + 'x' +
    '\u{1F9D1}\u{1F3FB}' + zwj + '\u{1F91D}' + zwj + '\u{1F9D1}\u{1F3FF}',
  combiningFlags: combining + flag(0, 1) + flag(2, 3) + combining +
    '\u{1F1E6}',
  flagsAfterMarks: 'a' + '́'.repeat(70) + flag(5, 6).repeat(3),
  devanagari: 'क्षि स्त्र' +
    'ी क्ष्म्य',
  hangul: '각한',
  crlf: 'a\r\nb\r\n\r\nc',
  lone: 'a\uD83Db\uDE00c\uD83D',
  plain: 'hello world',
};

describe('PosLine snap equals the previous true boundary', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    it(name, () => {
      const bs = graphemes(text);
      for (let off = 0; off <= text.length; off++) {
        let want = 0;
        for (const b of bs) if (b <= off) want = b;
        assert.equal(snap(text, off), want,
          `${name}: offset ${off} of ${text.length}`);
      }
    });
  }
});
