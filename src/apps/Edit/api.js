// Public API of !Edit for other applications (notably TaskWindow). See docs/apps/Edit.md.
//
//   import { getEdit } from '../Edit/api.js';
//   const edit = await getEdit();                 // starts !Edit if needed; resolves to the EditApp
//   const s = edit.install({ title: 'Task window', noQuitCheck: true });   // a TextState
//   s.views[0].open();                             // show its window (EditView)
//   s.doc.output('hello\n');                       // append output at the end (BS/DEL/ctl handling)
//   s.keyFilter = (view, ev) => { ...; return true; };   // route keys before Edit sees them
//   s.menuHook = (view, ev) => { open own menu; return true; };  s.menu(view) = Edit's own menu
//   s.closeHook = async (view, ev) => true;       // intercept close requests
//   s.titleOverride = 'Task window';               // or (view) => string
//   s.dispose();

import { os } from '../../core/os.js';

let current = null;
const waiters = [];

export function setCurrentEdit(app) {
  current = app;
  if (app) while (waiters.length) waiters.shift()(app);
}

/** The running Edit application, or null. */
export function currentEdit() { return current; }

/** Resolve to the EditApp, starting !Edit if necessary. */
export async function getEdit() {
  if (current) return current;
  const p = new Promise((res) => waiters.push(res));
  await os.apps.start('Edit');
  return current ?? p;
}

export { EditDocument } from './document.js';
export { EditView, scrap, setSelection, clearSelection } from './view.js';
export { EditApp, TextState } from './editor.js';
