// Keys for the page: a DOM keydown (the Wimp's key event carries it) as Chrome DevTools Protocol key events,
// and the editing shortcuts (select all, undo, cut...) the engine turns into its own computer's.
const MAC = /Mac|iP(hone|ad)/.test(navigator.platform);

// Ctrl-letter (Cmd on a Mac) editing commands: the engine needs these named on a Mac
const COMMANDS = { a: 'selectAll', z: 'undo', y: 'redo', x: 'cut' };

/** The modifier bits CDP uses: Alt 1, Ctrl 2, Meta 4, Shift 8. */
export function modifiers(e) {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
}

/** Is this the "primary" shortcut modifier: Cmd on a Mac, Ctrl elsewhere (and nothing else but Shift)? */
export function isShortcut(e) {
  return (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey;
}

/**
 * CDP Input.dispatchKeyEvent parameters for a keydown: [down, up]. Printable characters carry their text
 * (typing); other keys are "raw" (the page sees the key but nothing is typed). Returns null for keys
 * that aren't for the page.
 */
export function keyEvents(e) {
  const key = e.key;
  if (!key || key === 'Unidentified' || key === 'Dead') return null;
  const base = { key, code: e.code, keyCode: e.keyCode | 0, modifiers: modifiers(e), repeat: e.repeat };
  let text;
  if (key.length === 1 || (key.length === 2 && key.codePointAt(0) > 0xFFFF)) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) text = key;           // AltGr characters are text too
  } else if (key === 'Enter') text = '\r';
  else if (key === 'Tab') text = undefined;
  if (isShortcut(e) && !text) {
    const l = key.toLowerCase();
    const cmd = l === 'z' && e.shiftKey ? 'redo' : COMMANDS[l];
    base.shortcut = true;
    if (cmd) base.commands = [cmd];
  }
  return [{ ...base, type: text ? 'keyDown' : 'rawKeyDown', text }, { ...base, type: 'keyUp' }];
}

export { MAC };
