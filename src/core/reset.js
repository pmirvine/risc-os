// Resetting the machine to its "as shipped" state.
//
//   *ResetDisc [-cmos]   discard every change made to the hard disc (and floppy) since the first boot -
//                        the IndexedDB overlay over the seed disc - and restart. -cmos also resets the
//                        configuration (below).
//   *ResetCMOS           reset the configuration ("CMOS RAM": !Configure settings, zoom, mouse buttons,
//                        pinboard, alarms, printers) and restart; files are kept.
//   Delete held down while the desktop starts ("Delete-power-on"): both of the above.
//   R held down while the desktop starts ("R-power-on"): the configuration only.
//   URL ?reset=disc | ?reset=cmos | ?reset=all does the same without the keyboard.

import { vfs } from './vfs.js';

const PREFIXES = ['riscos371.', 'riscos.'];
const FLAG = 'riscos.resetDone';

export function resetCMOS() {
  try {
    for (const k of Object.keys(localStorage)) if (PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}

export async function resetDisc() {
  await vfs.store.clear();
}

/** Reset and restart. what: 'disc' | 'cmos' | 'all'. */
export async function resetAndRestart(what) {
  if (what === 'cmos' || what === 'all') resetCMOS();
  if (what === 'disc' || what === 'all') await resetDisc();
  try { sessionStorage.setItem(FLAG, what); sessionStorage.removeItem('riscos.booted'); } catch { /* */ }
  const u = new URL(location.href);
  u.searchParams.delete('reset');
  location.replace(u.href);
}

/**
 * Watch for Delete / R being held while the desktop starts. Call as early as possible; the returned
 * function (call it once the desktop is up) resolves to the pending reset kind, or null.
 */
export function watchPowerOnKeys() {
  let kind = null;
  let done = false;
  try { done = !!sessionStorage.getItem(FLAG); sessionStorage.removeItem(FLAG); } catch { /* */ }
  const q = new URLSearchParams(location.search).get('reset');
  if (!done && /^(disc|cmos|all)$/.test(q ?? '')) kind = q;
  const onKey = (e) => {
    if (done) return;
    if (e.code === 'Delete') kind = 'all';
    else if (e.code === 'KeyR' && kind !== 'all') kind = 'cmos';
  };
  addEventListener('keydown', onKey, true);
  return () => { removeEventListener('keydown', onKey, true); return done ? null : kind; };
}

export function registerResetCommands(def) {
  def('ResetDisc', 'Syntax: *ResetDisc [-cmos]',
    '*ResetDisc discards all changes made to the hard disc and floppy disc (restoring the disc as supplied) and restarts the desktop. -cmos also resets the configuration.',
    async (a) => { await resetAndRestart(a.some((x) => /^-cmos$/i.test(x)) ? 'all' : 'disc'); });
  def('ResetCMOS', 'Syntax: *ResetCMOS',
    '*ResetCMOS resets the configuration (CMOS RAM) to the default settings and restarts the desktop. Files are not affected.',
    async () => { await resetAndRestart('cmos'); });
}
