// Descriptor for !Puzzle (Diversions): the fifteen-tile sliding block puzzle. Code loads on first run.
export default {
  name: 'Puzzle',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Puzzle',
  sprites: [{ pool: 'Puzzle', file: '!Sprites22' }],
  memory: 32,
  multiInstance: true,                          // each run opens another puzzle window
  info: { name: 'Puzzle', purpose: 'Fifteen tile sliding block puzzle', author: '© Acorn Computers Ltd, 1995', version: '0.53 (31-Jan-95)' },
  load: () => import('./main.js'),
};
