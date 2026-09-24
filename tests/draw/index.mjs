// node --test tests/draw : Drawfile round trips and every UI scenario (one browser per scenario).
import { suite } from '../lib/suite.mjs';
const scenarios = ['empty', 'shapes', 'select', 'menu', 'map', 'sign', 'demo', 'styles', 'picker', 'savebox', 'info', 'zoom',
  'gridmenu', 'fontmenu', 'selmenu', 'filerrun', 'roundtrip', 'edit', 'drags', 'imports', 'closeq', 'zoomed', 'e2e', 'monkey'];
suite('draw', [
  { name: 'drawfile round trip', args: ['tests/draw/test-drawfile.mjs'], browser: false },
  ...scenarios.map((s) => ({ name: s, args: ['tests/draw/run.mjs', s] })),
]);
