// Test helpers: run BASIC programs headless and capture text output.
import { BasicMachine } from '../../src/basic/machine.js';

/** Run a program (text) and return its output with CRs removed. opts.input: keys to type */
export async function runBasic(src, opts = {}) {
  let out = '';
  const m = new BasicMachine({
    onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); },
    seed: opts.seed ?? 12345,
    fs: opts.fs,
    vdu: opts.vdu,
    swiHandlers: opts.swiHandlers,
  });
  if (opts.input) for (const ch of opts.input) m.keyPress(typeof ch === 'number' ? ch : ch.charCodeAt(0));
  await m.load(src);
  await m.run();
  return opts.machine ? { out, m } : out;
}

/** Run immediate mode lines, returning output */
export async function immediate(lines, opts = {}) {
  let out = '';
  const m = new BasicMachine({ onOutput: (c) => { if (c !== 13) out += String.fromCharCode(c); }, seed: 1, fs: opts.fs, vdu: opts.vdu });
  for (const l of lines) await m.immediate(l);
  return opts.machine ? { out, m } : out;
}
