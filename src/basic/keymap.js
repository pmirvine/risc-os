// Browser keyboard -> RISC OS key codes and internal key numbers.
//   internalKey(e): RISC OS internal key number n (INKEY(-(n+1)) scans it), or undefined
//   keyCode(e, fx4): character code delivered to the input buffer (GET/INKEY/INPUT), or -1

export const INTERNAL = {
  ShiftLeft: 3, ShiftRight: 6, ControlLeft: 4, ControlRight: 7, AltLeft: 5, AltRight: 8,
  KeyQ: 16, Digit3: 17, Digit4: 18, Digit5: 19, F4: 20, Digit8: 21, F7: 22, Minus: 23,
  ArrowLeft: 25, Numpad6: 26, Numpad7: 27, F11: 28, F12: 29, F10: 30, ScrollLock: 31,
  PrintScreen: 32, KeyW: 33, KeyE: 34, KeyT: 35, Digit7: 36, KeyI: 37, Digit9: 38, Digit0: 39,
  ArrowDown: 41, Numpad8: 42, Numpad9: 43, Pause: 44, Backquote: 45, Backspace: 47,
  Digit1: 48, Digit2: 49, KeyD: 50, KeyR: 51, Digit6: 52, KeyU: 53, KeyO: 54, KeyP: 55, BracketLeft: 56,
  ArrowUp: 57, NumpadAdd: 58, NumpadSubtract: 59, NumpadEnter: 60, Insert: 61, Home: 62, PageUp: 63,
  CapsLock: 64, KeyA: 65, KeyX: 66, KeyF: 67, KeyY: 68, KeyJ: 69, KeyK: 70, Enter: 73, NumpadDivide: 74,
  NumpadDecimal: 76, NumLock: 77, PageDown: 78, Quote: 79,
  KeyS: 81, KeyC: 82, KeyG: 83, KeyH: 84, KeyN: 85, KeyL: 86, Semicolon: 87, BracketRight: 88, Delete: 89,
  NumpadMultiply: 91, Equal: 93, IntlBackslash: 94,
  Tab: 96, KeyZ: 97, Space: 98, KeyV: 99, KeyB: 100, KeyM: 101, Comma: 102, Period: 103, Slash: 104,
  End: 105, Numpad0: 106, Numpad1: 107, Numpad3: 108,
  Escape: 112, F1: 113, F2: 114, F3: 115, F5: 116, F6: 117, F8: 118, F9: 119, Backslash: 120,
  ArrowRight: 121, Numpad4: 122, Numpad5: 123, Numpad2: 124,
};

export function internalKey(e) { return INTERNAL[e.code]; }

const FKEYS = { F1: 0x81, F2: 0x82, F3: 0x83, F4: 0x84, F5: 0x85, F6: 0x86, F7: 0x87, F8: 0x88, F9: 0x89, F10: 0xCA, F11: 0xCB, F12: 0xCC,
  Insert: 0xCD, PageDown: 0x9E, PageUp: 0x9F };
const CURSOR = { ArrowLeft: 0, ArrowRight: 1, ArrowDown: 2, ArrowUp: 3 };

/** Character code for a keydown event; fx4 = *FX 4 state (0 edit, 1 codes 136-139, 2 function keys) */
export function keyCode(e, fx4 = 0) {
  const k = e.key;
  if (k === 'Enter') return 13;
  if (k === 'Backspace') return 8;
  if (k === 'Delete') return 127;
  if (k === 'Tab') return 9;
  if (k === 'Escape') return 27;
  if (k === 'Home') return 30;
  // Cursor keys give &88-&8B and Copy (End) &87; with *FX 4,0 (the default) the machine uses
  // them for copy-key editing, with *FX 4,1 they reach the program, *FX 4,2 = function keys.
  if (e.code in CURSOR) {
    const n = CURSOR[e.code];
    if (fx4 === 2) return 0x8C + n + (e.shiftKey ? 0x10 : 0) + (e.ctrlKey ? 0x20 : 0);
    return 0x88 + n;
  }
  if (k === 'End') return fx4 === 2 ? 0x8B : 0x87;
  if (e.code in FKEYS || k in FKEYS) {
    let c = FKEYS[e.code] ?? FKEYS[k];
    if (e.shiftKey) c += 0x10;
    if (e.ctrlKey) c += 0x20;
    return c;
  }
  if (k.length === 1) {
    let c = k.charCodeAt(0);
    if (c > 255) return -1;
    if (e.ctrlKey && !e.altKey) {
      if (c >= 64 && c < 128) return c & 31;
      if (c === 50) return 0; // ctrl-2
    }
    return c;
  }
  return -1;
}
