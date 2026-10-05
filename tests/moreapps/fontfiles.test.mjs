// The bundled font binaries and their licence texts are present.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fontFiles} from '../../tools/moreapps/!Word/FontMap';

const DIR = new URL('../../tools/moreapps/!Word/Fonts/', import.meta.url);

describe('bundled font files', () => {
  it('exist with valid magic and size', () => {
    for (const n of fontFiles()) {
      const b = fs.readFileSync(new URL(n, DIR));
      const m = b.subarray(0, 4).toString('latin1');
      assert.ok(m === '\0\x01\0\0' || m === 'true' || m === 'wOF2', n);
      assert.ok(b.length > 10240, n);
    }
  });
  it('Licences names the families and licences', () => {
    const t = fs.readFileSync(new URL('Licences', DIR), 'latin1');
    for (const w of ['Carlito', 'Caladea', 'Liberation', 'SIL Open Font License'])
      assert.ok(t.includes(w), w);
  });
});
