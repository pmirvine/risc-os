// An application's pointer shape (and Pointer_Entering/Leaving_Window) applies to the window's
// visible work area only; over the window furniture the pointer is the default arrow.
import { filerOpen } from '../edit/ui.mjs';
export default async (page) => {
  await filerOpen(page, 'ADFS::HardDisc4.$', 'ReadMe', { wait: 1500 });
  const r = await page.evaluate(() => {
    const w = [...os.wimp.windows].filter((w) => w.task?.name === 'Edit' && /ReadMe/.test(w.title)).pop();
    window.__ptrEv = [];
    w.on('pointerenter', () => __ptrEv.push('enter'));
    w.on('pointerleave', () => __ptrEv.push('leave'));
    const box = (sel) => { const b = w.el.querySelector(sel).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    return { work: box('[data-part=work]'), title: box('[data-part=title]'), vbar: box('[data-part=vbar]'), size: box('[data-part=size]') };
  });
  const cursor = () => page.evaluate(() => os.wimp.screen.style.cursor);
  const check = async (name, p, want) => {
    await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(100);
    const c = await cursor();
    const ok = want ? c.includes(want) : !c.includes('ptr_write');
    console.log(`${ok ? 'PASS' : 'FAIL'} pointer over ${name}: ${c.slice(0, 80)}`);
  };
  await check('work area', r.work, 'ptr_write');
  await check('title bar', r.title, null);
  await check('work area again', r.work, 'ptr_write');
  await check('scroll bar', r.vbar, null);
  await check('size icon', r.size, null);
  const ev = await page.evaluate(() => __ptrEv.join(','));
  console.log(`${ev === 'enter,leave,enter,leave' ? 'PASS' : 'FAIL'} enter/leave follow the work area: ${ev}`);
};
