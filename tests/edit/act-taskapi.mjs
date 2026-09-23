// Edit API as a TaskWindow would use it: install a text, echo keys through keyFilter, output().
export default async (page) => {
  await page.evaluate(async () => {
    const { getEdit } = await import('/src/apps/Edit/api.js');
    const edit = await getEdit();
    const s = edit.install({ title: 'Task window', noQuitCheck: true });
    const v = s.views[0];
    v.open();
    let line = '';
    s.doc.output('*');
    v.setCaret(s.doc.length, { take: true });
    s.keyFilter = (view, ev) => {
      if (ev.code === 13) { s.doc.output('\n'); const cmd = line; line = ''; s.doc.output(`Output of ${cmd}\x07\r\n*`); view.setCaret(s.doc.length); return true; }
      if (ev.code === 8 || ev.code === 127) { if (line) { line = line.slice(0, -1); s.doc.output('\x7f'); view.setCaret(s.doc.length); } return true; }
      if (ev.code >= 32 && ev.code < 256) { line += String.fromCharCode(ev.code); s.doc.output(String.fromCharCode(ev.code)); view.setCaret(s.doc.length); return true; }
      return false;
    };
    window.__tw = s;
  });
  await page.waitForTimeout(300);
  await page.keyboard.type('cat');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await page.keyboard.type('help');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  console.log(JSON.stringify(await page.evaluate(() => window.__tw.doc.text)), await page.evaluate(() => window.__tw.views[0].win.title));
  await page.screenshot({ path: 'tests/screens/edit-taskapi.png' });
};
