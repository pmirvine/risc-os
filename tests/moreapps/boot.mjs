// $.MoreApps is booted at desktop start (src/main.js): from a cold boot,
// with no Filer window of $.MoreApps ever opened, !Word's sprites and
// .docx file type are known and running a .docx starts Word. A disc
// without $.MoreApps still boots.
// The library $.!Boot.Resources.!WimpLib is booted with the rest of
// !Boot.Resources, before $.MoreApps: from a cold boot WimpLib$Dir and
// WimpLib$Path are set (already when $.MoreApps's applications boot),
// its sprite is known and a program can import 'wimplib/<Name>' with no
// Filer window opened.
// Needs the disc built by tools/disc-wimplib.mjs and disc-moreapps.mjs.
import { launch, BASE_URL } from '../core/pw.mjs';

const { browser, page, logs } = await launch();
const out = [];
const ok = (name, v, detail) => out.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const boot = async () => {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
};
try {
  await boot();
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const res = {};
    // nothing has shown $.MoreApps
    res.viewers = [...os.wimp.windows].filter((w) => w.isOpen && /MoreApps/.test(w.title ?? '')).length;
    res.type = os.sysvars.get('File$Type_A7E') ?? null;
    res.alias = os.sysvars.get('Alias$@RunType_A7E') ?? null;
    res.sprite = os.wimp.sprites.has('!word') && os.wimp.sprites.has('file_a7e');
    // the library
    res.anyViewer = [...os.filer.viewers.keys()];
    res.lib = ['Dir', 'Path', 'Version'].map((n) => os.sysvars.get(`WimpLib$${n}`));
    res.libSprite = os.wimp.sprites.has('!wimplib') && os.wimp.sprites.has('sm!wimplib');
    let text = '';
    const libMsgs = [];
    os.hooks.jsOutput = (t, s) => { text += s; };
    const was = os.wimp.reportError;
    os.wimp.reportError = (m) => { libMsgs.push(String(m)); return Promise.resolve(1); };
    os.vfs.writeFile('RAM::RamDisc0.$.Crc', "import { print } from 'riscos';\n"
      + "import { crc32 } from 'wimplib/Crc32';\n"
      + "export default function start() {\n"
      + "  print(crc32(new TextEncoder().encode('123456789')).toString(16));\n}\n",
    { filetype: 0xF81 });
    await os.cli.run('JSRun RAM::RamDisc0.$.Crc');
    await sleep(300);
    os.wimp.reportError = was;
    res.crc = { text, libMsgs };
    // the stub's box comes from the 'riscos' module's reportError
    const msgs = [];
    globalThis.__riscos.reportError = (m) => {
      msgs.push({ m: String(m), tasks: os.wimp.tasks.filter((t) => t.alive).map((t) => t.name) });
      return Promise.resolve(1);
    };
    os.vfs.writeFile('RAM::RamDisc0.$.Doc', new Uint8Array([80, 75, 3, 4]), { filetype: 0xA7E });
    await Promise.race([os.cli.run('Run RAM::RamDisc0.$.Doc')
      .catch((e) => { res.runError = e.message; }), sleep(5000)]);
    for (let i = 0; i < 30 && !msgs.length; i++) await sleep(100);
    res.msgs = msgs;
    return res;
  });
  ok('no Filer window of $.MoreApps', r.viewers === 0, r.viewers);
  ok('File$Type_A7E', r.type === 'MSWordX', r.type);
  ok('Alias$@RunType_A7E runs !Word', /MoreApps\.!Word\.!Run %\*0$/.test(r.alias ?? ''), r.alias);
  ok('!word and file_a7e sprites', r.sprite);
  const LIB = 'ADFS::HardDisc4.$.!Boot.Resources.!WimpLib';
  ok('no Filer directory display open at all', r.anyViewer.length === 0, r.anyViewer);
  ok('WimpLib$Dir, WimpLib$Path, WimpLib$Version from a cold boot', r.lib[0] === LIB && r.lib[1] === LIB + '.' && /^\d+\.\d\d$/.test(r.lib[2] ?? ''), r.lib);
  ok('!wimplib and sm!wimplib sprites', r.libSprite);
  ok("a program imports 'wimplib/Crc32' with no Filer window opened", !r.crc.libMsgs.length && r.crc.text === 'cbf43926\n', r.crc);
  const m = r.msgs[0];
  // (four bytes are not a .docx: Word says so, naming the file)
  ok('running a .docx starts Word', r.msgs.length === 1 && /'Doc' could not be opened: it is not a Word \.docx file/.test(m.m) && m.tasks.includes('Word'), [r.runError, r.msgs]);

  // $.MoreApps's applications boot after the library: one whose !Boot
  // records WimpLib$Dir sees it set
  await page.evaluate(async () => {
    os.vfs.mkdir('ADFS::HardDisc4.$.MoreApps.!Probe');
    os.vfs.writeFile('ADFS::HardDisc4.$.MoreApps.!Probe.!Boot',
      'Set Probe$Saw <WimpLib$Dir>\n', { filetype: 0xFEB });
    await new Promise((res) => setTimeout(res, 1500));   // (saved)
  });
  await boot();
  const saw = await page.evaluate(() => os.sysvars.get('Probe$Saw'));
  ok('WimpLib$Dir is set when $.MoreApps boots', saw === LIB, saw);

  // without $.MoreApps the desktop still boots
  await page.evaluate(async () => {
    os.vfs.delete('ADFS::HardDisc4.$.MoreApps', { recursive: true, force: true });
    await new Promise((res) => setTimeout(res, 1500));   // (the deletion is saved)
  });
  await boot();
  const g = await page.evaluate(() => ({
    gone: !os.vfs.exists('ADFS::HardDisc4.$.MoreApps'),
    alias: os.sysvars.get('Alias$@RunType_A7E') ?? null,
    lib: os.sysvars.get('WimpLib$Dir'),
  }));
  ok('boots without $.MoreApps', g.gone && !g.alias, g);
  ok('... and the library is still known', g.lib === LIB, g.lib);
} catch (e) {
  out.push('FAIL exception ' + (e.stack ?? e));
}
console.log(out.join('\n'));
const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0;
