// Functional checks of the core in a real browser: node tests/core/test-core.mjs
import { launch, BASE_URL } from './pw.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
await page.waitForTimeout(500);
const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  const { vfs, cli, sysvars, filer, apps } = window.os;
  try {
    ok('canonical $', vfs.canonical('$') === 'ADFS::HardDisc4.$', vfs.canonical('$'));
    ok('case insensitive', vfs.canonical('adfs::harddisc4.$.readme') === 'ADFS::HardDisc4.$.ReadMe', vfs.canonical('adfs::harddisc4.$.readme'));
    ok('drive number', vfs.canonical('ADFS::4.$.Apps') === 'ADFS::HardDisc4.$.Apps');
    ok('parent ^', vfs.canonical('$.Apps.^.Images') === 'ADFS::HardDisc4.$.Images');
    ok('path var Boot:', vfs.canonical('Boot:Choices') === 'ADFS::HardDisc4.$.!Boot.Choices', vfs.canonical('Boot:Choices'));
    ok('resources', vfs.isDir('Resources:$.Apps'));
    ok('ram', vfs.canonical('RAM::RamDisc0.$') === 'RAM::RamDisc0.$');
    const st = vfs.stat('$.ReadMe');
    ok('stat readme', st && st.filetype === 0xFFF && st.size > 1000, JSON.stringify(st && { t: st.filetype, s: st.size }));
    const txt = await vfs.readText('$.ReadMe');
    ok('read seed file', txt.length === st.size);
    vfs.writeFile('RAM::RamDisc0.$.Test', 'hello', { filetype: 0xFFF });
    ok('write ram', (await vfs.readText('RAM::RamDisc0.$.Test')) === 'hello');
    vfs.mkdir('RAM::RamDisc0.$.Dir');
    await vfs.copy('RAM::RamDisc0.$.Test', 'RAM::RamDisc0.$.Dir.Copy');
    ok('copy', vfs.exists('RAM::RamDisc0.$.Dir.Copy'));
    vfs.rename('RAM::RamDisc0.$.Dir.Copy', 'RAM::RamDisc0.$.Dir.Renamed');
    ok('rename', vfs.exists('RAM::RamDisc0.$.Dir.Renamed') && !vfs.exists('RAM::RamDisc0.$.Dir.Copy'));
    let threw = false; try { vfs.delete('RAM::RamDisc0.$.Dir'); } catch (e) { threw = /not empty/.test(e.message); }
    ok('delete non-empty dir fails', threw);
    vfs.delete('RAM::RamDisc0.$.Dir', { recursive: true });
    ok('delete recursive', !vfs.exists('RAM::RamDisc0.$.Dir'));
    ok('wildcards', vfs.expandWild('$.D*').length === 1, vfs.expandWild('$.D*').join());
    // CLI
    const lines = [];
    const o = { write: (s) => lines.push(s), writeln: (s = '') => lines.push(s + '\n') };
    await cli.run('Set Test$Var Hello <Boot$OSVersion>', { out: o });
    ok('*Set gstrans', sysvars.get('Test$Var') === 'Hello 370', sysvars.get('Test$Var'));
    await cli.run('Echo <Test$Var>|M', { out: o });
    ok('*Echo', lines.join('').startsWith('Hello 370'));
    await cli.run('SetEval N 3*4+1', { out: o });
    ok('*SetEval', sysvars.get('N') === '13');
    await cli.run('CDir RAM::RamDisc0.$.X', { out: o });
    await cli.run('Dir RAM::RamDisc0.$.X', { out: o });
    ok('*Dir', vfs.csd === 'RAM::RamDisc0.$.X', vfs.csd);
    await cli.run('Dir $', { out: o });
    ok('*Dir $ same disc', vfs.csd === 'RAM::RamDisc0.$', vfs.csd);
    await cli.run('Dir ADFS::HardDisc4.$', { out: o });
    lines.length = 0;
    await cli.run('If 1+1=2 Then Echo yes Else Echo no', { out: o });
    ok('*If', lines.join('').trim() === 'yes', lines.join(''));
    lines.length = 0;
    await cli.run('Alias Hi Echo hi %0', { out: o });
    await cli.run('Hi there', { out: o });
    ok('alias', lines.join('').trim() === 'hi there', lines.join(''));
    lines.length = 0;
    await cli.run('Cat', { out: o });
    ok('*Cat', lines.join('').includes('ReadMe'));
    lines.length = 0;
    await cli.run('Info $.ReadMe', { out: o });
    ok('*Info', /ReadMe\s+WR\/r\s+Text/.test(lines.join('')), lines.join(''));
    let err = ''; try { await cli.run('NoSuchCommand', { out: o }); } catch (e) { err = e.message; }
    ok('unknown command', /not found/.test(err), err);
    ok('filetype alias', sysvars.get('Alias$@RunType_FEB') === 'Obey %*0');
    // Filer
    const v = filer.openDir('ADFS::HardDisc4.$.Apps');
    ok('filer open', v && v.items.length >= 5, v && v.items.map((i) => i.name).join(','));
    ok('filer title', v.win.title === 'ADFS::HardDisc4.$.Apps');
    v.setMode('full'); ok('full info mode', v.mode === 'full');
    v.close();
    ok('apps registered', apps.find('Example') != null);
  } catch (e) { out.push('FAIL exception ' + e.stack); }
  return out;
});
console.log(results.join('\n'));
if (logs.some((l) => /PAGEERROR/.test(l))) console.log(logs.join('\n'));
await browser.close();
