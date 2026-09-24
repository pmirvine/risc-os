// node --test tests/bw : original BASIC programs and Wimp apps through the BASIC Wimp bridge.
import { suite } from '../lib/suite.mjs';
suite('bw', ['bw-demo', 'bw-scicalc', 'bw-apps', 'bw-basicdemos'].map((f) => ({ name: f, args: [`tests/bw/${f}.mjs`] })));
