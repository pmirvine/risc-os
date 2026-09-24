// Tier-A: the original BASIC utilities from the 3.71 hard disc, run unmodified through the BASIC Wimp
// bridge and launched by double-clicking them in the Filer (src/core/basicwimp/hardware.js, adfs.js,
// src/core/cmos.js; docs/apps/TierA.md). Screenshots: tests/screens/tierA-*.png.   (server on 8371)
//   node tests/bw/bw-tiera.mjs [calibrate saveCMOS resetBoot verify hform printEdit warning showScrap]
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { filerItem } from '../edit/ui.mjs';

const HD = 'ADFS::HardDisc4.$';
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; return ok; };

async function session(name, fn) {
  const { browser, page, logs } = await launch({ width: 1024, height: 768 });
  try {
    await page.goto(BASE_URL + '?fast=1');
    await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
    // remember every BASIC process started (they leave the set when they end, while their screen is still shown)
    await page.evaluate(async () => { const { processes } = await import('/src/core/basicwimp/runner.js'); const add = processes.add.bind(processes); processes.add = (p) => { window.__tierAProc = p; return add(p); }; });
    await fn(page, logs);
  } catch (e) {
    check(false, `${name}: ${e.message}`);
    try { await page.screenshot({ path: path.join(SHOTS, `tierA-${name}-crash.png`) }); } catch { /* */ }
  }
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  check(!errs.length, `${name}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
}

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierA-${n}.png`) });
/** Double-click leaf in a Filer viewer of dir (as a user would). */
async function dbl(page, dir, leaf, pos = { x: 40, y: 40, w: 560, h: 300 }) {
  const p = await filerItem(page, dir, leaf, pos);
  await page.mouse.dblclick(p.x, p.y);
}
/** The most recent BASIC process (window.bwProcesses). */
const proc = (page) => page.evaluate(() => { const p = [...(window.bwProcesses ?? [])].pop(); return p ? { task: p.bridge?.task?.name ?? null, errors: p.errors.map((e) => `${e.message} at ${e.line}`), ended: !!p.ended } : null; });
const screenText = (page) => page.evaluate(() => { const p = window.__tierAProc; return p ? p.vdu.textLines().map((x) => x.trimEnd()).filter(Boolean).join('\n') : ''; });
async function waitText(page, re, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await screenText(page); if (re.test(t)) return t; await page.waitForTimeout(150); }
  return screenText(page);
}
const fullScreen = (page) => page.evaluate(() => !!document.querySelector('.fullscreen-program'));
/** Open windows whose title matches re: [{title, text}] */
const windows = (page, re) => page.evaluate((src) => [...window.wimp.windows].filter((w) => w.isOpen && new RegExp(src, 'i').test(w.title ?? '')).map((w) => ({ title: w.title, text: w.el.innerText.replace(/\s+/g, ' ').trim() })), re.source);
async function waitWindow(page, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const w = await windows(page, re); if (w.length) return w[0]; await page.waitForTimeout(120); }
  return null;
}
/** Click the icon showing text in the open window whose title matches re. */
async function clickButton(page, re, text, button = 'left') {
  const p = await page.evaluate(([src, text]) => {
    const w = [...window.wimp.windows].reverse().find((q) => q.isOpen && new RegExp(src, 'i').test(q.title ?? ''));
    const ic = w?.icons?.find((i) => i?.el && (i.text ?? i.el.innerText ?? '').trim().toLowerCase() === text.toLowerCase());
    if (!ic) return null;
    const b = ic.el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, [re.source, text]);
  if (!p) return false;
  await page.mouse.click(p.x, p.y, { button });
  await page.waitForTimeout(250);
  return true;
}
const taskRunning = (page, name) => page.evaluate((n) => window.wimp.tasks.some((t) => t.name === n), name);

// ---------------------------------------------------------------------------------------------- tests
const tests = {
  // $.Diversions.Tools.!Calibrate: Joystick_CalibrateBottomLeft / TopRight
  async calibrate(page) {
    await dbl(page, `${HD}.Diversions.Tools`, '!Calibrate');
    const w = await waitWindow(page, /Analogue Joystick Calibration/);
    check(w && /bottom-left/.test(w.text), `Calibrate: window "${w?.title}" asks for bottom-left`);
    check(await taskRunning(page, 'Calibrate joysticks'), 'Calibrate: task "Calibrate joysticks" in the Task Manager');
    await shot(page, 'calibrate');
    check(await clickButton(page, /Joystick Calibration/, 'Calibrate'), 'Calibrate: click Calibrate');
    await page.waitForTimeout(400);
    const w2 = await waitWindow(page, /Analogue Joystick Calibration/);
    check(w2 && /top-right/.test(w2.text), 'Calibrate: now asks for top-right');
    await shot(page, 'calibrate-topright');
    await clickButton(page, /Joystick Calibration/, 'Calibrate');
    await page.waitForTimeout(800);
    const cal = await page.evaluate(() => window.riscHardware?.joystickCalibration);
    check(cal?.[0]?.bottomLeft && cal?.[0]?.topRight, 'Calibrate: both extremes recorded by the Joystick module');
    check(!(await windows(page, /Joystick Calibration/)).length && !(await taskRunning(page, 'Calibrate joysticks')), 'Calibrate: closes and quits');
  },

  // $.Utilities.!SaveCMOS: OS_Byte 161 x 240 -> <SaveCMOS$Dir>.Saved (&FF2); Restore = OS_Byte 162
  async saveCMOS(page) {
    const SAVED = `${HD}.Utilities.!SaveCMOS.Saved`;
    const cfg = (k, v) => page.evaluate(([k, v]) => { if (v !== undefined) { window.os.config.values[k] = v; window.os.config.save(); } return window.os.config.values[k]; }, [k, v]);
    await cfg('keyDelay', 32);
    await dbl(page, `${HD}.Utilities`, '!SaveCMOS');
    const w = await waitWindow(page, /CMOS RAM saver/);
    check(!!w, 'SaveCMOS: "CMOS RAM saver" window');
    const greyed = await page.evaluate(() => { const w = [...window.wimp.windows].find((q) => q.isOpen && /CMOS RAM saver/.test(q.title)); const ic = w.icons.find((i) => /Restore/.test(i.text ?? '')); return !!ic?.shaded || !!(ic?.flags & 0x400000); });
    check(greyed, 'SaveCMOS: Restore is shaded until something has been saved');
    await shot(page, 'savecmos');
    check(await clickButton(page, /CMOS RAM saver/, 'Save'), 'SaveCMOS: click Save');
    await page.waitForTimeout(1500);
    const st = await page.evaluate(async (p) => { const s = window.os.vfs.stat(p); if (!s) return null; const b = await window.os.vfs.readFile(p); const { cmos } = await import('/src/core/cmos.js'); return { size: s.size, type: s.filetype, b12: b[0x0C], match: [...b].every((x, i) => x === cmos.read(i)) }; }, SAVED);
    check(st?.size === 240 && st.type === 0xFF2, `SaveCMOS: Saved is 240 bytes of type Configure (${JSON.stringify(st)})`);
    check(st?.match && st.b12 === 32, 'SaveCMOS: the file holds the CMOS RAM (keyboard auto-repeat delay 32 at &0C)');
    // change the setting, then Restore
    await cfg('keyDelay', 50);
    check(await clickButton(page, /CMOS RAM saver/, 'Restore'), 'SaveCMOS: click Restore');
    await page.waitForTimeout(1500);
    check(await cfg('keyDelay') === 32, 'SaveCMOS: Restore writes the CMOS back (keyDelay config is 32 again)');
    await clickButton(page, /CMOS RAM saver/, 'Cancel');
    await page.waitForTimeout(600);
    check(!(await taskRunning(page, 'Save CMOS RAM')), 'SaveCMOS: Cancel quits');
    // the file loads back with *LoadCMOS, and by double-clicking it (a Configure file)
    await cfg('keyDelay', 60);
    await page.evaluate((p) => window.os.cli.run(`LoadCMOS ${p}`), SAVED);
    check(await cfg('keyDelay') === 32, '*LoadCMOS loads the saved file');
    await cfg('keyDelay', 70);
    await dbl(page, `${HD}.Utilities.!SaveCMOS`, 'Saved');
    await page.waitForTimeout(2500);
    check(await cfg('keyDelay') === 32, 'double-clicking the saved CMOS file loads it');
    await shot(page, 'savecmos-loaded');
  },

  // $.Utilities.!ResetBoot: Choices$Dir -> -Choices, fresh copy of !ResetBoot.Choices
  async resetBoot(page) {
    const CH = `${HD}.!Boot.Choices`;
    await page.evaluate((ch) => window.os.vfs.writeFile(`${ch}.Boot.Tasks.MyTask`, 'Echo mine\n', { filetype: 0xFEB }), CH);
    await dbl(page, `${HD}.Utilities`, '!ResetBoot');
    const w = await waitWindow(page, /Message from ResetBoot/);
    check(w && /factory initial setting/.test(w.text) && /RESTORE/.test(w.text) && /Help/.test(w.text), `ResetBoot: confirmation box with Cancel, Help, RESTORE (${w?.text?.slice(0, 80)})`);
    await shot(page, 'resetboot');
    check(await clickButton(page, /Message from ResetBoot/, 'RESTORE'), 'ResetBoot: click RESTORE');
    const w2 = await waitWindow(page, /Message from ResetBoot/, 8000);
    check(w2 && /Completed/.test(w2.text) && /RESET/.test(w2.text) && /Exit/.test(w2.text), `ResetBoot: "Completed" box with Exit / RESET (${w2?.text?.slice(0, 60)})`);
    await shot(page, 'resetboot-done');
    const r = await page.evaluate((ch) => {
      const { vfs } = window.os;
      const names = (d) => { try { return vfs.list(d).map((s) => s.name).sort().join(','); } catch { return null; } };
      return { mine: vfs.exists(`${ch}.Boot.Tasks.MyTask`), old: vfs.exists(`${ch.replace(/Choices$/, '-Choices')}.Boot.Tasks.MyTask`), tasks: names(`${ch}.Boot.Tasks`), fresh: names('ADFS::HardDisc4.$.Utilities.!ResetBoot.Choices.Boot.Tasks'), predesk: names(`${ch}.Boot.PreDesk`) };
    }, CH);
    check(!r.mine && r.old, `ResetBoot: the old choices are kept in !Boot.-Choices (${JSON.stringify(r)})`);
    check(r.tasks === r.fresh && !!r.predesk, 'ResetBoot: Choices holds the factory choices');
    check(await clickButton(page, /Message from ResetBoot/, 'Exit'), 'ResetBoot: Exit');
    await page.waitForTimeout(1500);
    const left = await windows(page, /Message from ResetBoot/);
    check(!left.length, `ResetBoot: finished ${left.map((x) => x.text).join(' / ')}`);
    await shot(page, 'resetboot-exit');
  },

  // $.Utilities.!Verify: ADFS_SectorDiscOp verify of every sector of drive 4
  async verify(page) {
    await dbl(page, `${HD}.Utilities`, '!Verify');
    const t = await waitText(page, /Verify which drive/);
    check(await fullScreen(page) && /Verify which drive \?/.test(t), 'Verify: single tasking, asks for the drive');
    await page.keyboard.type('4'); await page.keyboard.press('Enter');
    const t0 = Date.now();
    const t2 = await waitText(page, /defects? found/, 90000);
    check(/Verifying\.\.\n0 defects found/.test(t2), `Verify: "0 defects found" on HardDisc4 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    await shot(page, 'verify');
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    check(!(await fullScreen(page)), 'Verify: SPACE returns to the desktop');
  },

  // $.Utilities.!HForm: identifies the IDE drive, goes through the questions, and is refused at its first write
  async hform(page) {
    const before = await page.evaluate(() => window.os.vfs.list('ADFS::HardDisc4.$').map((s) => s.name).join(','));
    await dbl(page, `${HD}.Utilities`, '!HForm');
    let t = await waitText(page, /Format which drive/);
    check(await fullScreen(page) && /H A R D   D I S C   F O R M A T T E R/.test(t), 'HForm: banner, single tasking');
    const answer = async (re, keys, ms = 20000) => { const s = await waitText(page, re, ms); if (keys != null) { if (keys) await page.keyboard.type(keys); await page.keyboard.press('Enter'); } return s; };
    await answer(/Format which drive \(4 - 7\) \?/, '');                     // default 4
    t = await answer(/retain this shape \(Y\/N\) \?$/, 'Y');
    check(/identifies itself as :\nDescription\s+: Conner Peripherals 540MB - CFS540A/.test(t) && /1097 cylinders, 16 heads and 63 sectors/.test(t), `HForm: IDE IDENTIFY: Conner CFS540A, 1097/16/63 ${JSON.stringify(t.slice(0, 400))}`);
    await answer(/A,B,C or D \?$/, 'A');
    t = await answer(/\(F\/I\) \?$/, 'I');
    check(/Disc will be formatted as :/.test(t), 'HForm: shows the shape it will use');
    await answer(/\(Long\/Short\/None\) \?$/, 'N');
    await answer(/bootable disc \(Y\/N\)\?$/, 'Y');
    await answer(/Are you SURE you want to do this to drive ADFS:4 \(Y\/N\) \?$/, 'Y');
    await answer(/Large file allocation unit \?\d*$/, '', 60000);
    t = await waitText(page, /HFORM failed/, 30000);
    check(/Writing defect list\nHFORM failed: Protected disc/.test(t), 'HForm: refused at the first write: "HFORM failed: Protected disc"');
    await shot(page, 'hform');
    const after = await page.evaluate(() => ({ list: window.os.vfs.list('ADFS::HardDisc4.$').map((s) => s.name).join(','), boot: window.os.vfs.exists('ADFS::HardDisc4.$.!Boot.Choices'), status: window.os.sysvars.get('HForm$EndStatus') }));
    check(after.list === before && after.boot, 'HForm: HardDisc4 is untouched');
    check(after.status === '1', 'HForm: HForm$EndStatus 1 (failed)');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    check(!(await fullScreen(page)), 'HForm: back to the desktop');
  },

  // $.Printing.!PrintEdit: needs Printers$Path; loads (Squash_Decompress) and saves (Squash_Compress,
  // DragASprite, DataSave to a Filer viewer) printer definitions
  async printEdit(page) {
    const pp = await page.evaluate(() => { const v = window.os.sysvars.get('Printers$Path'); window.os.sysvars.unset('Printers$Path'); return v; });
    check(!!pp, `PrintEdit: !Printers has been seen (Printers$Path ${pp})`);
    await dbl(page, `${HD}.Printing`, '!PrintEdit');
    const e = await waitWindow(page, /Message from|Error/, 4000);
    check(e && /!Printers must be seen by the Filer before !PrintEdit can be used/.test(e.text), 'PrintEdit: without Printers$Path, !Run stops with its error');
    await shot(page, 'printedit-noprinters');
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await clickButton(page, /Message from|Error/, 'OK');
    await page.evaluate((v) => window.os.sysvars.set('Printers$Path', v), pp);
    await dbl(page, `${HD}.Printing`, '!PrintEdit');
    await page.waitForFunction(() => window.wimp.iconbar.items.some((i) => i.task?.name === 'PrintEdit'), null, { timeout: 10000 });
    check(true, 'PrintEdit: icon on the icon bar');
    const ib = await page.evaluate(() => { const it = window.wimp.iconbar.items.find((i) => i.task?.name === 'PrintEdit'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    // drag Epson.LQ-860 to the icon bar icon
    const p = await filerItem(page, `${HD}.Printing.Printers.Epson`, 'LQ-860', { x: 100, y: 60, w: 440, h: 300 });
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 30, p.y + 30, { steps: 5 });
    await page.mouse.move(ib.x, ib.y, { steps: 10 }); await page.mouse.up();
    const ok8 = await waitWindow(page, /Message from PrintEdit/, 8000);
    check(ok8 && /Old type of printer definition file/.test(ok8.text), 'PrintEdit: LQ-860 (Squash) loads; old graphics format translated');
    await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    const w = await waitWindow(page, /Printer definition editor/);
    check(w && /Printer type/.test(w.text), `PrintEdit: editor window "${w?.title}"`);
    const vals = await page.evaluate(() => { const w = [...window.wimp.windows].find((q) => q.isOpen && /Printer definition editor/.test(q.title)); return w.icons.filter((i) => i?.writable || (i?.flags & 0xF000) === 0xF000).map((i) => i.text).filter(Boolean); });
    check(vals.includes('Epson LQ-860 Colour') && vals.includes('LQ-860') && vals.includes('dp'), `PrintEdit: fields ${vals.slice(0, 5).join(' | ')}`);
    await shot(page, 'printedit');
    // Save: menu > Save > drag the file icon to a RAM disc viewer
    await page.evaluate(() => window.os.filer.openDir('RAM::RamDisc0.$', { x: 740, y: 420, w: 270, h: 200 }));
    await page.waitForTimeout(500);
    const mw = await page.evaluate(() => { const w = [...window.wimp.windows].find((q) => q.isOpen && /Printer definition editor/.test(q.title)); w.open({ behind: 'top', x: 100, y: 120 }); const r = w.el.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 60 }; });
    await page.waitForTimeout(300);
    await page.mouse.click(mw.x, mw.y, { button: 'middle' }); await page.waitForTimeout(500);
    const item = await page.locator('.menu').nth(0).locator('.mitem').nth(0).boundingBox();
    await page.mouse.move(item.x + 20, item.y + item.height / 2, { steps: 2 });
    await page.mouse.move(item.x + item.width - 6, item.y + item.height / 2, { steps: 3 });
    const sw = await waitWindow(page, /^Save as$/, 3000);
    check(sw && /LQ-860/.test(sw.text) && /OK/.test(sw.text), `PrintEdit: Save as box (${sw?.text})`);
    await shot(page, 'printedit-saveas');
    const sp = await page.evaluate(() => { const w = [...window.wimp.windows].find((q) => q.isOpen && q.title === 'Save as'); const ic = w.icons[0]; const r = ic.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(sp.x, sp.y); await page.mouse.down(); await page.mouse.move(sp.x + 20, sp.y + 20, { steps: 5 });
    await page.mouse.move(900, 540, { steps: 15 }); await page.mouse.up();
    await page.waitForTimeout(2000);
    const f = await page.evaluate(async () => { const s = window.os.vfs.stat('RAM::RamDisc0.$.LQ-860'); if (!s) return null; const b = await window.os.vfs.readFile(s.path); return { type: s.filetype, size: s.size, head: String.fromCharCode(...b.slice(0, 4)) }; });
    check(f?.type === 0xFC6 && f.head === 'SQSH', `PrintEdit: saved RAM::RamDisc0.$.LQ-860 by dragging to the Filer (${JSON.stringify(f)})`);
    const title = (await windows(page, /Printer definition editor/))[0]?.title;
    check(title === 'Printer definition editor', 'PrintEdit: window no longer marked modified');
    await shot(page, 'printedit-saved');
    // the saved (re-squashed, now new-format) file loads back without the translation message
    const p2 = await filerItem(page, 'RAM::RamDisc0.$', 'LQ-860', { x: 740, y: 420, w: 270, h: 200 });
    await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await page.mouse.move(p2.x - 30, p2.y + 30, { steps: 5 });
    await page.mouse.move(ib.x, ib.y, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(2500);
    const again = await windows(page, /Message from PrintEdit/);
    check(!again.length, `PrintEdit: saved file loads back cleanly ${again.map((x) => x.text).join(' ')}`);
    const pr = await proc(page);
    check(!pr?.errors?.length, `PrintEdit: no BASIC errors ${pr?.errors?.join('; ')}`);
  },

  // $.Video.!Warning and $.Video.HiRes.!Warning: OS_Memory 8 (VRAM) and VIDC bandwidth checks
  async warning(page) {
    await dbl(page, `${HD}.Video`, '!Warning');
    await page.waitForTimeout(2000);
    check(!(await windows(page, /Warning|Message from/)).length, 'Warning: nothing to say on a Risc PC with VRAM');
    await page.evaluate(() => { window.riscHardware.vramK = 0; });
    await dbl(page, `${HD}.Video`, '!Warning');
    const w = await waitWindow(page, /Warning/, 5000);
    check(w && /To play videos smoothly on this machine/.test(w.text) && /Info/.test(w.text), 'Warning: without VRAM, the warning box with an Info button');
    await shot(page, 'warning');
    check(await clickButton(page, /Warning/, 'Info'), 'Warning: click Info');
    const info = await waitWindow(page, /Video\.!Warning\.Info$/, 6000);
    check(!!info, `Warning: Info opens the hints file (${info?.title})`);
    await shot(page, 'warning-info');
    await dbl(page, `${HD}.Video`, 'HiRes');
    await page.waitForTimeout(600);
    await dbl(page, `${HD}.Video.HiRes`, '!Warning ', { x: 80, y: 360, w: 500, h: 250 });
    // an untrapped ERROR in a program that isn't a Wimp task: its report in the command window, as on RISC OS
    const t = await waitText(page, /continue/, 5000);
    check(/best viewed only in full-screen mode on this computer at line 110\nPress SPACE or click mouse to continue/.test(t), `HiRes.!Warning: its ERROR is reported (${t.split('\n')[0]})`);
    await shot(page, 'warning-hires');
    await page.keyboard.press('Space'); await page.waitForTimeout(700);
    check(!(await fullScreen(page)), 'HiRes.!Warning: SPACE returns to the desktop');
  },

  // $.Diversions.Tools.!ShowScrap (Obey): Filer_OpenDir <Wimp$ScrapDir>
  async showScrap(page) {
    await dbl(page, `${HD}.Diversions.Tools`, '!ShowScrap');
    const scrap = await page.evaluate(() => window.os.sysvars.get('Wimp$ScrapDir'));
    const w = await waitWindow(page, /ScrapDir$/, 4000);
    check(w && w.title.toLowerCase() === scrap.toLowerCase(), `ShowScrap: opens a viewer on <Wimp$ScrapDir> (${w?.title})`);
    await shot(page, 'showscrap');
  },
};

const pick = process.argv.slice(2);
for (const [name, fn] of Object.entries(tests)) {
  if (pick.length && !pick.includes(name)) continue;
  console.log(`--- ${name}`);
  await session(name, fn);
}
process.exit(fail ? 1 : 0);
