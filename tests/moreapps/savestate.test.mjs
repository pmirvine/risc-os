// SaveState: untitled names, leaf names, the Save box's suggested
// name and default directory (pure).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {untitledName, safeLeaf, leafOf, dirOf, defaultDir, HOME,
  suggestName}
  from '../../tools/moreapps/!Word/SaveState';

describe('untitledName', () => {
  it('Untitled, then Untitled 2, 3...', () => {
    assert.equal(untitledName([]), 'Untitled');
    assert.equal(untitledName(['Untitled']), 'Untitled 2');
    assert.equal(untitledName(['Untitled', 'Untitled 2']),
      'Untitled 3');
  });
  it('a name given up is used again (smallest free)', () => {
    assert.equal(untitledName(['Untitled 2']), 'Untitled');
    assert.equal(untitledName(['Untitled', 'Untitled 3']),
      'Untitled 2');
  });
  it('ignores case and other names; takes any iterable', () => {
    assert.equal(untitledName(new Set(['UNTITLED', 'Report'])),
      'Untitled 2');
    assert.equal(untitledName(['x', null, 3, undefined]), 'Untitled');
  });
  it('1000 taken', () => {
    const taken = ['Untitled'];
    for (let n = 2; n <= 1000; n++) taken.push(`Untitled ${n}`);
    assert.equal(untitledName(taken), 'Untitled 1001');
  });
});

describe('leaf names', () => {
  it('safeLeaf makes a name a file can have (no spaces)', () => {
    assert.equal(safeLeaf('Untitled'), 'Untitled');
    assert.equal(safeLeaf('Untitled 2'), 'Untitled2');
    assert.equal(safeLeaf('a.b:c*d#e$f&g@h^i%j\\k"l|m\tn'),
      'abcdefghijklmn');
    assert.equal(safeLeaf('report/docx'), 'report/docx');
    assert.equal(safeLeaf(''), 'Untitled');
    assert.equal(safeLeaf(' . '), 'Untitled');
    assert.equal(safeLeaf(null), 'Untitled');
  });
  it('leafOf and dirOf split a RISC OS path', () => {
    assert.equal(leafOf('RAM::RamDisc0.$.Report'), 'Report');
    assert.equal(dirOf('RAM::RamDisc0.$.Report'), 'RAM::RamDisc0.$');
    assert.equal(leafOf('Report'), 'Report');
    assert.equal(dirOf('Report'), null);
    assert.equal(dirOf('ADFS::HardDisc4.$'), null);
    assert.equal(dirOf(''), null);
    assert.equal(dirOf(42), null);
  });
});

describe('defaultDir', () => {
  it('the directory of the most recent path', () => {
    assert.equal(defaultDir(['RAM::RamDisc0.$.A.Report',
      'ADFS::HardDisc4.$.B']), 'RAM::RamDisc0.$.A');
  });
  it('skips what is not a full path; else the hard disc', () => {
    assert.equal(defaultDir([null, 'Report', 7,
      'ADFS::HardDisc4.$.Docs.X']), 'ADFS::HardDisc4.$.Docs');
    assert.equal(defaultDir([]), HOME);
    assert.equal(defaultDir(undefined), HOME);
    assert.equal(HOME, 'ADFS::HardDisc4.$');
  });
});

describe('suggestName', () => {
  it('a titled document: its own path', () => {
    assert.equal(suggestName({path: 'RAM::RamDisc0.$.R', leaf: 'R'},
      'ADFS::HardDisc4.$'), 'RAM::RamDisc0.$.R');
  });
  it('an untitled one: a full path in the directory', () => {
    assert.equal(suggestName({path: null, leaf: 'Untitled 2'},
      'RAM::RamDisc0.$'), 'RAM::RamDisc0.$.Untitled2');
    assert.equal(suggestName({path: null, leaf: 'Untitled'}),
      'ADFS::HardDisc4.$.Untitled');
  });
  it('a name no file there has: Untitled2, Untitled3 ...', () => {
    const there = new Set(['D.Untitled', 'D.Untitled2', 'D.Untitled3']);
    const ex = (p) => there.has(p);
    assert.equal(suggestName({leaf: 'Untitled'}, 'D', ex), 'D.Untitled4');
    assert.equal(suggestName({leaf: 'Untitled 2'}, 'D', ex),
      'D.Untitled4');
    assert.equal(suggestName({leaf: 'Untitled 9'}, 'D', ex),
      'D.Untitled9');
    assert.equal(suggestName({leaf: 'Report'}, 'D', () => false),
      'D.Report');
    // a titled document: its path even when it exists
    assert.equal(suggestName({path: 'D.R', leaf: 'R'}, 'D', () => true),
      'D.R');
    // exists throwing: taken as free
    assert.equal(suggestName({leaf: 'Untitled'}, 'D', () => {
      throw new Error('x'); }), 'D.Untitled');
  });
});
