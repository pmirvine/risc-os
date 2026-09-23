// Render a gallery of real application templates to check the icon/flags model.
export default async (page) => {
  await page.evaluate(async () => {
    const list = [['Draw', 'pane', 10, 30], ['Draw', 'find', 0, 0], ['Edit', 'find', 120, 30], ['Paint', 'create', 500, 30], ['Alarm', 'setup', 10, 330], ['SciCalc', 'Calculator', 420, 300], ['Configure', 'Main', 640, 360], ['Chars', 'Characters', 620, 90], ['Edit', 'indent', 150, 250]];
    const t = wimp.createTask('Gallery');
    for (const [app, name, x, y] of list) {
      try {
        const w = await t.createWindowFromTemplate(`assets/templates/${app}.json`, name, { x, y: y + 20 });
        w.open({ behind: 'top' });
      } catch (e) { console.log(app, name, e.message); }
    }
  });
  await page.waitForTimeout(800);
};
