// node --test tests/bw : original BASIC programs and Wimp apps through the BASIC Wimp bridge, BASIC
// programs in desktop windows (bw-window) and !GraphTask, the application around them (bw-graphtask).
import { suite } from '../lib/suite.mjs';
suite('bw', ['bw-demo', 'bw-scicalc', 'bw-apps', 'bw-basicdemos', 'bw-window', 'bw-graphtask'].map((f) => ({ name: f, args: [`tests/bw/${f}.mjs`] })).concat([
  { name: 'bw-tiera', args: ['tests/bw/bw-tiera.mjs'], timeout: 480000 },   // Tier-A utilities (docs/apps/TierA.md)
]));
