// Functional check of !Patience rules via real mouse drags (run with tests/core/shot.mjs).
export default async (page) => {
  await page.evaluate(async () => { await os.apps.start('Patience'); });
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => {
    const p = os.apps.tasksOf('Patience')[0].patience; p.win.open({ behind: 'top' });
    const s = p.state;
    // rig: waste = ace of hearts (2+4=6), pile A top = 5 of spades (3+20=23), pile B top = 4 of hearts (2+16=18)
    s.pack.length = 0; s.pack.push(6, 7, 8); 
    s.piles[0].length = 0; s.piles[0].push(128 + 40, 23);
    s.piles[1].length = 0; s.piles[1].push(18);
    s.piles[6].length = 0;
    return { x: p.win.x, y: p.win.y };
  });
  const P = (X, Y) => ({ x: t.x + X / 2, y: t.y - Y / 2 });
  async function drag(a, b) { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150); }
  await page.mouse.click(P(24 + 9 * 68 + 30, -220).x, P(0, -220).y);  // deal: place=3 -> waste top = pack[2] (dealreverse)
  const r1 = await page.evaluate(() => { const s = os.apps.tasksOf('Patience')[0].patience.state; return { place: s.place, pack: s.pack.slice() }; });
  console.log('after deal', JSON.stringify(r1));
  // drag 4 of hearts (pile B) onto 5 of spades (pile A)
  await drag(P(8 + 68 + 30, -110), P(8 + 30, -110));
  // drag pile A run onto empty pile G (kings only -> should fail)
  await drag(P(8 + 30, -150), P(8 + 6 * 68 + 30, -100));
  // adjust-click (shift-click) waste -> suit stack
  const r = await page.evaluate(() => { const s = os.apps.tasksOf('Patience')[0].patience.state; return { A: s.piles[0], B: s.piles[1], G: s.piles[6], S: s.S }; });
  console.log('state', JSON.stringify(r));
  await page.waitForTimeout(300);
};
