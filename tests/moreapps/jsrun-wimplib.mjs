// The 'wimplib' import specifier (src/core/jsrun.js): a program imports
// the library's modules as 'wimplib/<Name>' wherever it is. The library
// is $.!Boot.Resources.!WimpLib, whose !Boot sets WimpLib$Dir and
// WimpLib$Path at start-up; a name is looked for in each directory of
// WimpLib$Path in turn, then in WimpLib$Dir, so a copy of a module in a
// directory put first in the path is used instead of the system one.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
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
    const head = "import { print } from 'riscos';\n";
    const res = {};
    res.crc = await run(D + 'Crc', head + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() {\n"
      + "  const b = new TextEncoder().encode('123456789');\n"
      + "  print(crc32(b).toString(16));\n}\n");
    res.zip = await run(D + 'Zip', head + "import { readZip, writeZip } from 'wimplib/Zip';\n"
      + "export default async function start() {\n"
      + "  const z = await writeZip([['a.txt', new TextEncoder().encode('hi')]]);\n"
      + "  const m = await readZip(z);\n"
      + "  print(new TextDecoder().decode(m.get('a.txt')));\n}\n");
    res.vars = ['Dir', 'Path', 'Version']
      .map((n) => os.sysvars.get(`WimpLib$${n}`));
    res.nope = await run(D + 'Nope', "import { x } from 'wimplib/Nope';\nexport default function start() {}\n");
    res.bare = await run(D + 'Bare', "import * as w from 'wimplib';\nexport default function start() {}\n");
    // names: letters, digits, _ and -, with / between directories;
    // the prefix in any case
    res.hostile = [];
    for (const spec of ['wimplib/../X', 'wimplib/^/X', 'wimplib/$',
      'wimplib/@', 'wimplib/a.b', 'wimplib//Zip', 'wimplib/Zip/',
      'wimplib/<Wimp$ScrapDir>', 'wimplib/a\\\\b', 'wimplib/Zip.js',
      'wimplib/.', 'wimplib/..', 'wimplib/:', 'wimplib/&', 'wimplib/%',
      'wimplib/*', 'wimplib/Zi#', 'wimplib/a b', 'wimplib/-Zip',
      'WimpLib/../Zip']) {
      const got = await run(D + 'Bad', `import * as w from '${spec}';\n`
        + 'export default function start() {}\n');
      res.hostile.push([spec, got.msgs]);
    }
    res.upper = await run(D + 'Up', head
      + "import { readZip, writeZip } from 'WimpLib/Zip';\n"
      + "import { crc32 } from 'WIMPLIB/CRC32';\n"
      + "export default async function start() {\n"
      + "  const z = await writeZip([['a', new TextEncoder().encode('ok')]]);\n"
      + "  const m = await readZip(z);\n"
      + "  print(new TextDecoder().decode(m.get('a')) + ' '"
      + " + crc32(new TextEncoder().encode('123456789')).toString(16));\n}\n");
    res.beside = await run('ADFS::HardDisc4.$.MoreApps.!Word.Try', head
      + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() {\n"
      + "  print(crc32(new Uint8Array([97])).toString(16));\n}\n");
    v.delete('ADFS::HardDisc4.$.MoreApps.!Word.Try');
    // relative imports are unaffected: ./Helper (which imports the
    // library itself) beside the program
    v.writeFile(D + 'Helper', "import { crc32 } from 'wimplib/Crc32';\n"
      + "export const sum = (s) => crc32(new TextEncoder().encode(s));\n",
    { filetype: J });
    res.relative = await run(D + 'Rel', head
      + "import { sum } from './Helper';\n"
      + "export default function start() { print(sum('a').toString(16)); }\n");

    // ---- overrides: WimpLib$Path first, then WimpLib$Dir
    const set = (cmd) => os.cli.run(cmd, { out: { write() {}, writeln() {} } });
    const keep = { dir: os.sysvars.get('WimpLib$Dir'), path: os.sysvars.get('WimpLib$Path') };
    const SYS = keep.dir + '.Hello';
    const hello = (who) => `export const who = '${who}';\n`;
    const useHello = head + "import { who } from 'wimplib/Hello';\n"
      + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() {\n"
      + "  print(who + ' ' + crc32(new Uint8Array([97])).toString(16));\n}\n";
    v.writeFile(SYS, hello('system'), { filetype: J });
    v.mkdir(D + 'MyLib');
    v.writeFile(D + 'MyLib.Hello', hello('mine'), { filetype: J });
    v.mkdir(D + 'Other');
    v.writeFile(D + 'Other.Hello/js', hello('other'), { filetype: J });
    res.system = await run(D + 'H1', useHello);
    await set(`Set WimpLib$Path ${D}MyLib.,<WimpLib$Dir>.`);
    res.pathValue = os.sysvars.get('WimpLib$Path');
    res.mine = await run(D + 'H2', useHello);
    res.missing2 = await run(D + 'M2', "import { x } from 'wimplib/Nope';\nexport default function start() {}\n");
    // an entry with no trailing separator that is a directory is
    // searched as that directory; repeated directories are named once
    const nope = "import { x } from 'wimplib/Nope';\nexport default function start() {}\n";
    await set(`Set WimpLib$Path ${D}MyLib`);
    res.noDot = await run(D + 'H6', useHello);
    res.noDotMissing = await run(D + 'M6', nope);
    await set(`Set WimpLib$Path ${D}MyLib.,${D}MyLib,${D}MyLib.`);
    res.dups = await run(D + 'M7', nope);
    await set('Unset WimpLib$Path');
    await set(`Set WimpLib$Dir ${D}Other.`);
    res.dirDot = await run(D + 'H7', head + "import { who } from 'wimplib/Hello';\n"
      + "export default function start() { print(who); }\n");
    res.dirDotMissing = await run(D + 'M8', nope);
    await set(`Set WimpLib$Dir ${D}Other`);
    res.other = await run(D + 'H3', head + "import { who } from 'wimplib/Hello';\n"
      + "export default function start() { print(who); }\n");
    res.missingDir = await run(D + 'M3', "import { x } from 'wimplib/Crc32';\nexport default function start() {}\n");
    await set('Unset WimpLib$Dir');
    res.unset = await run(D + 'M4', "import { x } from 'wimplib/Hello';\nexport default function start() {}\n");
    // a directory with the module's name is not the module
    await set(`Set WimpLib$Path ${D},<Dir$Unset>${keep.dir}.`);
    v.mkdir(D + 'Crc32');
    res.notDir = await run(D + 'H5', head + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() { print(crc32(new Uint8Array([97])).toString(16)); }\n");
    v.delete(D + 'Crc32', { recursive: true, force: true });
    // the system library again, as !Boot sets it
    await set('Unset WimpLib$Path');
    await set(`Obey ${keep.dir}.!Boot`);
    res.restored = [os.sysvars.get('WimpLib$Dir'), os.sysvars.get('WimpLib$Path')];
    res.keep = keep;
    v.delete(SYS);
    res.cli = os.vfs.exists('<WimpLib$Dir>.Zip') && os.vfs.exists('WimpLib:Zip');
    // double-clicking the library shows its help text
    msgs.length = 0;
    await os.filer.run(keep.dir);
    await sleep(1500);
    res.help = { msgs: [...msgs], open: [...os.wimp.windows]
      .some((w) => w.isOpen && w.title === keep.dir + '.!Help') };
    // the application starts (its modules and the 'wimplib' ones load)
    // and waits on the icon bar, with nothing to say
    msgs.length = 0;
    globalThis.__riscos.reportError = os.wimp.reportError;
    await os.filer.run('ADFS::HardDisc4.$.MoreApps.!Word');
    await sleep(1000);
    res.app = [...msgs];
    const word = os.wimp.tasks.find((t) => t.alive && t.name === 'Word');
    res.icon = !!word && word.iconbarIcons.size === 1;
    word?.quit();
    res.type = os.sysvars.get('File$Type_A7E');
    res.alias = os.sysvars.get('Alias$@RunType_A7E');
    return res;
  });
  ok("'wimplib/Crc32'", !r.crc.msgs.length && r.crc.text === 'cbf43926\n', r.crc);
  ok("'wimplib/Zip' (and its own relative imports)", !r.zip.msgs.length && r.zip.text === 'hi\n', r.zip);
  const LIB = 'ADFS::HardDisc4.$.!Boot.Resources.!WimpLib';
  ok('WimpLib$Dir, WimpLib$Path and WimpLib$Version are set', r.vars[0] === LIB && r.vars[1] === LIB + '.' && /^\d+\.\d\d$/.test(r.vars[2]), r.vars);
  ok("'wimplib/Nope' is not found, naming where it looked", r.nope.msgs.length === 1 && r.nope.msgs[0].includes(`Can't find 'wimplib/Nope' (not in WimpLib$Path: ${LIB})`), r.nope);
  ok("bare 'wimplib' needs a name", r.bare.msgs.length === 1 && /Can't find 'wimplib' \(no module name\)/.test(r.bare.msgs[0]), r.bare);
  const WL = "(a WimpLib module name is letters, digits, _ and -, with / between directories)";
  for (const [spec, msgs] of r.hostile) {
    const want = `Can't find '${spec}' ${WL}`;
    ok(`'${spec}' is refused`, msgs.length === 1 && msgs[0].includes(want), msgs);
  }
  ok("'WimpLib/Zip' and 'WIMPLIB/CRC32' (any case)", !r.upper.msgs.length && r.upper.text === 'ok cbf43926\n', r.upper);
  ok("'wimplib/Crc32' from $.MoreApps.!Word", !r.beside.msgs.length && r.beside.text === 'e8b7be43\n', r.beside);
  ok("relative imports are unaffected ('./Helper' imports 'wimplib/Crc32')", !r.relative.msgs.length && r.relative.text === 'e8b7be43\n', r.relative);
  ok('the system Hello, with WimpLib$Path as !Boot sets it', !r.system.msgs.length && r.system.text === 'system e8b7be43\n', r.system);
  ok('a directory first in WimpLib$Path is searched first', r.pathValue === `RAM::RamDisc0.$.MyLib.,${r.keep.dir}.` && !r.mine.msgs.length && r.mine.text === 'mine e8b7be43\n', [r.pathValue, r.mine]);
  ok('a missing module names every directory searched', r.missing2.msgs.length === 1 && r.missing2.msgs[0].includes(`Can't find 'wimplib/Nope' (not in WimpLib$Path: RAM::RamDisc0.$.MyLib, ${LIB})`), r.missing2);
  ok('a path entry without a final dot is searched as that directory', !r.noDot.msgs.length && r.noDot.text === 'mine e8b7be43\n', r.noDot);
  ok('... and the error names that directory', r.noDotMissing.msgs.length === 1 && r.noDotMissing.msgs[0].includes("(not in WimpLib$Path: RAM::RamDisc0.$.MyLib; nor in WimpLib$Dir: " + r.keep.dir + ')'), r.noDotMissing);
  ok('a directory repeated in the path is named once', r.dups.msgs.length === 1 && r.dups.msgs[0].includes("(not in WimpLib$Path: RAM::RamDisc0.$.MyLib; nor in WimpLib$Dir:"), r.dups);
  ok('WimpLib$Dir with a final dot works', !r.dirDot.msgs.length && r.dirDot.text === 'other\n', r.dirDot);
  ok('... and the error does not double the dot', r.dirDotMissing.msgs.length === 1 && r.dirDotMissing.msgs[0].includes("nor in WimpLib$Dir: RAM::RamDisc0.$.Other)") || r.dirDotMissing.msgs[0].includes("(not in WimpLib$Dir: RAM::RamDisc0.$.Other)"), r.dirDotMissing);
  ok('WimpLib$Dir when WimpLib$Path is not set (Hello/js)', !r.other.msgs.length && r.other.text === 'other\n', r.other);
  ok('... and only WimpLib$Dir is searched', r.missingDir.msgs.length === 1 && r.missingDir.msgs[0].includes("Can't find 'wimplib/Crc32' (not in WimpLib$Dir: RAM::RamDisc0.$.Other)"), r.missingDir);
  ok('neither variable set: WimpLib is not installed', r.unset.msgs.length === 1 && r.unset.msgs[0].includes("Can't find 'wimplib/Hello' (WimpLib is not installed: WimpLib$Dir is not set)"), r.unset);
  ok('a directory named like the module is skipped', !r.notDir.msgs.length && r.notDir.text === 'e8b7be43\n', r.notDir);
  ok('!Boot sets them again', r.restored[0] === LIB && r.restored[1] === LIB + '.', r.restored);
  ok('<WimpLib$Dir>.Zip and WimpLib:Zip name the module', r.cli);
  ok('double-clicking !WimpLib shows its !Help', !r.help.msgs.length && r.help.open, r.help);
  ok('!Word starts, on the icon bar, without errors', !r.app.length && r.icon, [r.app, r.icon]);
  ok('!Word knows .docx files', r.type === 'MSWordX' && /MoreApps\.!Word\.!Run %\*0$/.test(r.alias ?? ''), [r.type, r.alias]);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
