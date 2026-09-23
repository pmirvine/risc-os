// !Bookworm screenshots (tests/core/shot.mjs action module).
// BW = home | toc | chapter | index | app | link | back | adjust | menu (ITEM=n) | ibmenu | info | hot | find | choices | open
//   e.g. BW=link sh shot.sh div-bookworm-link tests/div/bookworm.mjs
const BW = process.env.BW || 'home';

export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.evaluate(() => os.apps.start('Bookworm'));
  await page.waitForTimeout(800);
  const ib = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Bookworm'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const menuItem = async (n) => {          // hover item n (0-based) of the last menu to open its submenu
    const m = await page.$$('.menu');
    const mb = await m[m.length - 1].boundingBox();
    await page.mouse.move(mb.x + mb.width - 8, mb.y + 32 + 22 * n);
    await page.waitForTimeout(700);
  };
  if (BW === 'ibmenu' || BW === 'info') {
    await page.mouse.click(ib.x, ib.y, { button: 'right' });
    await page.waitForTimeout(400);
    if (BW === 'info') await menuItem(0);
    return;
  }
  await page.mouse.click(ib.x, ib.y);                  // SELECT on the icon: home page
  await page.waitForTimeout(1500);
  const state = () => page.evaluate(() => {
    const t = os.apps.tasksOf('Bookworm')[0]; const v = [...t.bookworm.views].pop();
    return { views: t.bookworm.views.size, url: v.url, lines: v.layout?.lines.length, title: v.title, status: v.statusText, x: v.win.x, y: v.win.y, w: v.win.w, h: v.win.h, sy: v.win.scrollY };
  });
  const log = async () => console.log(JSON.stringify(await state()));
  await log();
  const go = async (u) => {
    await page.evaluate((u) => [...os.apps.tasksOf('Bookworm')[0].bookworm.views].pop().go(u), u);
    await page.waitForTimeout(1500);
    await log();
  };
  // click on the link token whose text (or image src) contains str
  const clickLink = async (str, button = 'left') => {
    const p = await page.evaluate((str) => {
      const v = [...os.apps.tasksOf('Bookworm')[0].bookworm.views].pop();
      const toks = v.doc.tokens;
      const li = v.layout.lines.findIndex((l) => l.chunks.some((c) => toks[c.t].href != null && (toks[c.t].text ?? toks[c.t].img?.src ?? '').includes(str)));
      if (li < 0) return null;
      const l = v.layout.lines[li];
      const wy = Math.round(-(l.y + l.b) / 2 - 4);
      v.win.scrollTo(0, Math.max(0, wy - 250));
      for (let x = 0; x < v.win.w; x += 2) { const t = v.linkAt(x, wy); if (t >= 0 && (toks[t].text ?? toks[t].img?.src ?? '').includes(str)) return v.win.workToScreen(x + 4, wy); }
      return null;
    }, str);
    if (!p) { console.log('link not found:', str); return; }
    await page.waitForTimeout(300);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    console.log('status over link:', (await state()).status);
    if (button === 'adjust') { await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); } else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(1500);
    await log();
  };
  const btn = async (i) => {        // click a button bar icon
    const p = await page.evaluate((i) => { const v = [...os.apps.tasksOf('Bookworm')[0].bookworm.views].pop(); const r = v.bbar.icons[i].el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(1200);
  };
  switch (BW) {
    case 'toc': await go('file://ROManual:BOOKB/TOC.HTM'); break;
    case 'chapter': await go('file://ROManual:BOOKB/BOOK_3.HTM#HEADING3-5'); break;
    case 'index': await go('file://ROManual:INDEX/MAIN.HTM'); break;
    case 'app': await go('file://ROManual:BOOK3B/BOOK3_9.HT'); break;
    case 'link': await clickLink('content'); await clickLink('Getting help'); break;
    case 'back': await clickLink('content'); await clickLink('Getting help'); await btn(7); await log(); break;
    case 'adjust': await clickLink('index', 'adjust'); break;
    case 'menu': {
      const s = await state();
      await page.mouse.click(s.x + 200, s.y + 300, { button: 'right' });
      await page.waitForTimeout(300);
      await menuItem(+(process.env.ITEM ?? 1));
      break;
    }
    case 'hot': await btn(5); break;
    case 'find': {
      await go('file://ROManual:BOOKB/BOOK_3.HTM');
      await page.keyboard.press('F4');
      await page.waitForTimeout(300);
      await page.keyboard.type('Pinboard');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      await log();
      break;
    }
    case 'choices': {
      await page.mouse.click(ib.x, ib.y, { button: 'right' });
      await page.waitForTimeout(300);
      const m = await page.$$('.menu');
      const mb = await m[m.length - 1].boundingBox();
      await page.mouse.click(mb.x + 30, mb.y + 32 + 22);
      await page.waitForTimeout(600);
      break;
    }
    case 'open': {           // double-click an HTML file in the Filer: opens a new view
      await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Manuals.!Bookworm.User.HotList'));
      await page.waitForTimeout(1500);
      await log();
      break;
    }
  }
};
