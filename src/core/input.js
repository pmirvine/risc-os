// Mouse-button and keyboard mapping.
//
// RISC OS has three buttons: Select (left, value 4), Menu (middle, 2), Adjust (right, 1).
// Browser mapping (configurable via input.config / *Configure Buttons):
//   Acorn mapping (default, rightIsAdjust = true), as on an Acorn mouse and in RPCEmu/Arculator:
//     left -> Select   middle -> Menu   right -> Adjust   Ctrl+left (or Ctrl+right) -> Menu
//     Shift is left alone, so it keeps its RISC OS meaning (Shift-double-click, Shift-drag, ...).
//   Alternative (rightIsAdjust = false), for two-button mice:
//     left -> Select   middle/right -> Menu   Shift+left -> Adjust

export const BUT = { select: 4, menu: 2, adjust: 1 };

export const input = {
  config: {
    rightIsAdjust: true,
    doubleClickMs: 400,         // WimpDoubleClickDelay (default 10 = 1s, but browsers feel better at ~0.4s)
    doubleClickMove: 16,        // px
    dragMove: 8,                // WimpDragMove (px)
    dragDelayMs: 500,           // WimpDragDelay
    autoMenuDelayMs: 400,
  },
  scale: 1,                     // desktop zoom (CSS px per desktop px)
  screenEl: null,
  mouseX: 0, mouseY: 0,         // desktop coords
  buttonsDown: 0,
  keysDown: new Set(),          // DOM KeyboardEvent.code values currently held (for games: INKEY(-n) style scans)
  isDown(code) { return this.keysDown.has(code); },

  /** Convert a DOM mouse/pointer event to desktop coordinates. */
  pos(e) {
    const r = this.screenEl.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  },

  /** Map a pointer event to a RISC OS button name ('select'|'menu'|'adjust'). */
  button(e) {
    // macOS turns Ctrl+click into a secondary (right) click, and some browsers then clear ctrlKey,
    // so the Control key's own state is checked as well.
    const ctrl = e.ctrlKey || this.keysDown.has('ControlLeft') || this.keysDown.has('ControlRight');
    if (e.button === 1) return 'menu';
    if (e.button === 2) return this.config.rightIsAdjust && !ctrl ? 'adjust' : 'menu';
    if (e.button === 0) {
      if (this.config.rightIsAdjust) return ctrl ? 'menu' : 'select';
      return e.shiftKey ? 'adjust' : 'select';
    }
    return null;
  },

  /**
   * RISC OS button state (Select 4, Menu 2, Adjust 1) for a pointer event, through the same mapping as
   * button(): e.g. with the Acorn mapping Ctrl+left reads as Menu. For programs polling the mouse
   * (MOUSE, OS_Mouse, Wimp_GetPointerInfo) rather than receiving Wimp clicks.
   */
  buttonBits(e) {
    const b = e.buttons ?? 0;
    let bits = 0;
    if (b & 1) bits |= BUT[this.button({ ...pick(e), button: 0 })] ?? 0;
    if (b & 4) bits |= BUT.menu;
    if (b & 2) bits |= BUT[this.button({ ...pick(e), button: 2 })] ?? 0;
    return bits;
  },
  /** Hold down exactly the mouse-button keys (INKEY -10/-11/-12 = key numbers 9/10/11) in bits on a machine. */
  syncButtonKeys(m, bits) {
    for (const [bit, key] of [[BUT.select, 9], [BUT.menu, 10], [BUT.adjust, 11]]) (bits & bit ? m.keyDown(key) : m.keyUp(key));
  },
};
const pick = (e) => ({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });

// ---------------------------------------------------------------------------
// Keyboard: DOM KeyboardEvent -> Wimp key code (as delivered by Key_Pressed)

const FN = { F1: 0x181, F2: 0x182, F3: 0x183, F4: 0x184, F5: 0x185, F6: 0x186, F7: 0x187, F8: 0x188, F9: 0x189, F10: 0x1CA, F11: 0x1CB, F12: 0x1CC };
const SPECIAL = {
  Tab: 0x18A, End: 0x18B /* Copy */, ArrowLeft: 0x18C, ArrowRight: 0x18D, ArrowDown: 0x18E, ArrowUp: 0x18F,
  Insert: 0x1CD, PrintScreen: 0x180,
};

/** Returns {code, char} where code is the RISC OS Wimp key code, or null for pure modifiers. */
export function keyCode(e) {
  const k = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'AltGraph'].includes(k)) return null;
  const mod = (e.shiftKey ? 0x10 : 0) + (e.ctrlKey ? 0x20 : 0);
  if (FN[k]) return { code: FN[k] + mod };
  if (k === 'PageDown') return { code: 0x19E + (e.ctrlKey ? 0x20 : 0) };
  if (k === 'PageUp') return { code: 0x19F + (e.ctrlKey ? 0x20 : 0) };
  if (SPECIAL[k] != null) return { code: SPECIAL[k] + mod };
  if (k === 'Enter') return { code: 13 };
  if (k === 'Escape') return { code: 27 };
  if (k === 'Backspace') return { code: 8 };
  if (k === 'Delete') return { code: 127 };
  if (k === 'Home') return { code: 30 };
  if (k.length === 1) {
    let c = k.codePointAt(0);
    if (e.ctrlKey && !e.altKey) {
      const u = k.toUpperCase().charCodeAt(0);
      if (u >= 64 && u < 96) return { code: u - 64, ctrl: true };
    }
    if (c > 255) {
      // map to RISC OS Latin-1 where possible
      const map = { 0x20AC: 0x80, 0x2026: 0x8C, 0x2122: 0x8D, 0x2030: 0x8E, 0x2022: 0x8F, 0x2018: 0x90, 0x2019: 0x91, 0x201C: 0x94, 0x201D: 0x95, 0x2013: 0x97, 0x2014: 0x98 };
      c = map[c] ?? 0x3F;
    }
    return { code: c, char: String.fromCharCode(c) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generic pointer drag helper. Captures pointer movement until release.
//   startPointerDrag(e, {onMove(pos, e), onEnd(pos, e), cursor})

export function startPointerDrag(e, opts) {
  const move = (ev) => { const p = input.pos(ev); input.mouseX = p.x; input.mouseY = p.y; opts.onMove?.(p, ev); };
  const up = (ev) => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    document.body.classList.remove('dragging');
    if (opts.cursor) document.body.style.removeProperty('--drag-cursor');
    opts.onEnd?.(input.pos(ev), ev);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  document.body.classList.add('dragging');
  return () => up(e);
}

/** Auto-repeat helper (scroll arrows, click-auto-repeat icons). Returns a stop fn. */
export function autoRepeat(fn, first = 400, rate = 60) {
  let t = null, stopped = false;
  fn();
  const tick = () => { if (stopped) return; fn(); t = setTimeout(tick, rate); };
  t = setTimeout(tick, first);
  const stop = () => { stopped = true; clearTimeout(t); window.removeEventListener('pointerup', stop, true); };
  window.addEventListener('pointerup', stop, true);
  return stop;
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => input.keysDown.add(e.code), true);
  window.addEventListener('keyup', (e) => input.keysDown.delete(e.code), true);
  window.addEventListener('blur', () => input.keysDown.clear());   // a key released elsewhere never sends keyup
  window.addEventListener('blur', () => input.keysDown.clear());
}
