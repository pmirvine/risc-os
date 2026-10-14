// Test-only (Batch D P3.4): the browser suites written for Draft's
// geometry (the text 24 px below the top of one tall page, clicks and
// pixels worked out from the galley) keep running in Draft now that a
// document opens in Print layout: the view chosen last is Draft
// (Choices:Letters {view: 'draft'}, ./ViewMode openingView) before !Letters
// starts. Print layout has its own suites (word-pages.mjs,
// word-pages-edit.mjs, word-print.mjs).
//
// P3.5: with WORD_VIEW=print in the environment the suite runs in Print
// layout instead (the choice written is 'print'): index.mjs runs
// word-edit, word-tables-edit and word-pictures-edit that way too,
// their geometry being asked of the layout (caretRect, boxRect), not
// worked out from Draft's page.
//
//   await asDraft(page)   after os.ready, before !Letters is run; it also
//                         gives the page window.__g2w(L, x, y): a galley
//                         point where the view shows it
//                         (identity in Draft)
//   VIEW                  the view the suite runs in ('draft' | 'print')
export const CHOICES = 'ADFS::HardDisc4.$.!Boot.Choices.Letters';
export const VIEW = process.env.WORD_VIEW === 'print' ? 'print' : 'draft';

/** See the header. */
export function asDraft(page) {
  return page.evaluate(async ([path, view]) => {
    let old = {};
    try {
      if (os.vfs.exists(path)) old = JSON.parse(await os.vfs.readText(path));
    } catch (e) {
      old = {};
    }
    os.vfs.mkdir(path.slice(0, path.lastIndexOf('.')), { parents: true });
    os.vfs.writeFile(path, JSON.stringify({ ...old, view }), { filetype: 0xFFF });
    /** A galley (Draft) point of layout L where L's view shows it: the shift of the line at galley y (Print
     *  layout: its page's; Draft: none). For suites that work points out from it.y, rows and cells. */
    window.__g2w = (L, x, y) => {
      const Pl = L.place;
      if (!Pl || !Pl.pages) return { x, y };
      const it = L.itemAtY(y);
      if (!it) return { x, y };
      let k = 0;
      const ls = it.lines || [];
      while (k < ls.length - 1 && it.y + ls[k].y + ls[k].h <= y) k++;
      const p = Pl.lineAt(it, k), top = ls[k] ? it.y + ls[k].y : it.y;
      return { x: x + p.x - it.x, y: y + p.y - top };
    };
  }, [CHOICES, VIEW]);
}
