// node --test tests/tierb : tier-B disc applications (FontPrint, T1ToFont, CDPlayer, Access+/AccessCD, Patch,
// InetSetup/Internet, AREncode/ARWork). Each act-*.mjs launches its app from the Filer and saves tierB-*.png.
import { suite, actions } from '../lib/suite.mjs';
suite('tierb', [
  ...actions('tierb'),
]);
