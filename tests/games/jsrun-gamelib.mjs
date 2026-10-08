// The 'gamelib' import specifier (src/core/jsrun.js, resolveLib): a
// program imports the game library's modules as 'gamelib/<Name>'. The
// library is $.!Boot.Resources.!GameLib, whose !Boot sets GameLib$Dir,
// GameLib$Path and GameLib$Version at start-up; a copy of a module in a
// directory put first in GameLib$Path is used instead of the system one.
// Needs the disc built by tools/disc-gamelib.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';

const { browser, page, logs } = await launch();
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
try {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  const r = await page.evaluate(async () => {
    const msgs = [];
    os.wimp.reportError = (m, o) => { msgs.push(`${m} [${o?.appName}]`); return Promise.resolve(1); };
    let text = '';
    os.hooks.jsOutput = (t, s) => { text += s; };
    const v = os.vfs, J = 0xF81, D = 'RAM::RamDisc0.$.';
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const run = async (path, src) => {
      v.writeFile(path, src, { filetype: J });
      msgs.length = 0; text = '';
      await os.cli.run(`JSRun ${path}`);
      await sleep(300);
      return { msgs: [...msgs], text };
    };
    const set = (cmd) => os.cli.run(cmd, { out: { write() {}, writeln() {} } });
    const head = "import { print } from 'riscos';\n";
    const res = {};
    res.vars = ['Dir', 'Path', 'Version'].map((n) => os.sysvars.get(`GameLib$${n}`));
    res.rng = await run(D + 'Rng', head + "import { Rng } from 'gamelib/Maths';\n"
      + "export default function start() { print(String(new Rng(1).int(100))); }\n");
    res.upper = await run(D + 'Up', head + "import { Rng } from 'GameLib/Maths';\n"
      + "export default function start() { print(String(new Rng(1).int(100))); }\n");
    const nope = (spec) => `import * as w from '${spec}';\nexport default function start() {}\n`;
    res.nope = await run(D + 'Nope', nope('gamelib/Nope'));
    res.bare = await run(D + 'Bare', nope('gamelib'));
    res.dotted = await run(D + 'Dot', nope('gamelib/a.b'));
    // WimpLib is unaffected by the change
    res.wimp = await run(D + 'Wl', head + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() { print(crc32(new Uint8Array([97])).toString(16)); }\n");
    const keep = { dir: os.sysvars.get('GameLib$Dir'), path: os.sysvars.get('GameLib$Path') };
    v.mkdir(D + 'MyLib');
    v.writeFile(D + 'MyLib.Maths', "export class Rng { constructor() {} int() { return 777; } }\n", { filetype: J });
    await set(`Set GameLib$Path ${D}MyLib.,<GameLib$Dir>.`);
    res.mine = await run(D + 'Mine', head + "import { Rng } from 'gamelib/Maths';\n"
      + "export default function start() { print(String(new Rng(1).int(100))); }\n");
    res.missing = await run(D + 'Miss', nope('gamelib/Nope'));
    await set('Unset GameLib$Path');
    await set('Unset GameLib$Dir');
    res.unset = await run(D + 'Unset', nope('gamelib/Maths'));
    await set('Unset GameLib$Path');
    await set(`Obey ${keep.dir}.!Boot`);
    res.restored = [os.sysvars.get('GameLib$Dir'), os.sysvars.get('GameLib$Path')];
    res.keep = keep;
    return res;
  });
  const LIB = 'ADFS::HardDisc4.$.!Boot.Resources.!GameLib';
  ok('GameLib$Dir, GameLib$Path and GameLib$Version are set', r.vars[0] === LIB && r.vars[1] === LIB + '.' && r.vars[2] === '1.00', r.vars);
  // Rng(1).int(100) is fixed by the generator; compare with Maths itself
  const { Rng } = await import('../../tools/games/!GameLib/Maths');
  const want = String(new Rng(1).int(100)) + '\n';
  ok("'gamelib/Maths' (Rng)", !r.rng.msgs.length && r.rng.text === want, r.rng);
  ok("'GameLib/Maths' (any case)", !r.upper.msgs.length && r.upper.text === want, r.upper);
  ok("'gamelib/Nope' is not found, naming where it looked", r.nope.msgs.length === 1 && r.nope.msgs[0].includes(`Can't find 'gamelib/Nope' (not in GameLib$Path: ${LIB})`), r.nope);
  ok("bare 'gamelib' needs a name", r.bare.msgs.length === 1 && r.bare.msgs[0].includes("Can't find 'gamelib' (no module name)"), r.bare);
  ok("'gamelib/a.b' is refused", r.dotted.msgs.length === 1 && r.dotted.msgs[0].includes("Can't find 'gamelib/a.b' (a GameLib module name is letters, digits, _ and -, with / between directories)"), r.dotted);
  ok("'wimplib/Crc32' still works", !r.wimp.msgs.length && r.wimp.text === 'e8b7be43\n', r.wimp);
  ok('a directory first in GameLib$Path wins', !r.mine.msgs.length && r.mine.text === '777\n', r.mine);
  ok('a missing module names every directory searched', r.missing.msgs.length === 1 && r.missing.msgs[0].includes(`Can't find 'gamelib/Nope' (not in GameLib$Path: RAM::RamDisc0.$.MyLib, ${LIB})`), r.missing);
  ok('neither variable set: GameLib is not installed', r.unset.msgs.length === 1 && r.unset.msgs[0].includes("Can't find 'gamelib/Maths' (GameLib is not installed: GameLib$Dir is not set)"), r.unset);
  ok('!Boot sets them again', r.restored[0] === LIB && r.restored[1] === LIB + '.', r.restored);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
