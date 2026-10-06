// The text-input proxy: one hidden <textarea> outside .screen that a window can opt into with
// wimp.setCaret(win, null, -1, {x, y, h}, {text: true}). While it has the focus, the browser's text input
// (typed characters, dead keys, input methods, emoji pickers, mobile keyboards) reaches the caret's window as
//   textinput      {text, truncated}  committed text (cleaned by sanitizeText)
//   composition    {text, start}      the text an input method is composing (start: true on the first update)
//   compositionend {text, cancelled}  the composition finished (committed text follows as textinput) or was dropped
// Keys other than plain printable ones keep using the Wimp's `key` event (see Wimp._keyDown). The proxy's value
// is never kept: it is cleared after every commit, and every browser edit that is not text being typed or composed
// is cancelled, so Backspace, Enter, paste and so on never change it. The proxy never evaluates, fetches or stores
// text. With no text caret it stays blurred and the desktop's keyboard handling is unchanged.

export const MAX_TEXT = 100000;     // UTF-16 units in one textinput event

/**
 * Clean committed text: CR LF and lone CR become LF; control characters (C0, DEL, C1) other than LF and TAB are
 * dropped; lone surrogates become U+FFFD; at most MAX_TEXT UTF-16 units (never splitting a surrogate pair).
 * Returns {text, truncated}.
 */
export function sanitizeText(s) {
  s = String(s ?? '').replace(/\r\n?/g, '\n');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { out += s[i] + s[i + 1]; i++; } else out += '�';
    } else if (c >= 0xDC00 && c <= 0xDFFF) out += '�';
    else if ((c < 0x20 && c !== 10 && c !== 9) || (c >= 0x7F && c <= 0x9F)) continue;
    else out += s[i];
  }
  if (out.length <= MAX_TEXT) return { text: out, truncated: false };
  let n = MAX_TEXT;
  const last = out.charCodeAt(n - 1);
  if (last >= 0xD800 && last <= 0xDBFF) n--;
  return { text: out.slice(0, n), truncated: true };
}

// beforeinput types that are typed text (not composing); everything else that would edit the proxy is cancelled
const TEXT_TYPES = new Set(['insertText', 'insertReplacementText']);
// edits a keyboard makes without a usable keydown (keyCode 229, e.g. Android): delivered as these Wimp keys
const KEY_TYPES = { deleteContentBackward: 8, deleteContentForward: 127, insertLineBreak: 13, insertParagraph: 13 };

export class TextInput {
  constructor() {
    this.el = null;
    this.wimp = null;
    this.composing = false;
    this._compWin = null;       // the window a composition is going to
    this._started = false;      // a composition event has been sent for the current composition
    this._realKey = false;      // the last keydown was an ordinary key (already delivered as `key`)
    this._sent = false;         // text was delivered by beforeinput; the matching input event only clears
    this._muted = false;        // blur() is ending a composition itself: ignore the browser's events
  }

  /** Create the element (once) and connect it to the Wimp. */
  attach(wimp) {
    if (this.el) return this;
    this.wimp = wimp;
    const t = this.el = document.createElement('textarea');
    t.className = 'wimp-textinput';
    for (const [k, v] of Object.entries({ autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', 'aria-hidden': 'true' })) t.setAttribute(k, v);
    t.spellcheck = false;
    t.tabIndex = -1;
    Object.assign(t.style, {
      position: 'fixed', left: '0px', top: '0px', width: '1px', height: '1px', padding: '0', border: '0', margin: '0',
      opacity: '0', fontSize: '16px', resize: 'none', overflow: 'hidden', zIndex: '-1', pointerEvents: 'none',
      color: 'transparent', background: 'transparent', caretColor: 'transparent',
    });
    t.addEventListener('keydown', (e) => { this._realKey = !(e.isComposing || e.keyCode === 229); });
    t.addEventListener('keyup', () => { this._realKey = false; });
    t.addEventListener('beforeinput', (e) => this._beforeInput(e));
    t.addEventListener('input', (e) => this._input(e));
    t.addEventListener('compositionstart', () => this._compStart());
    t.addEventListener('compositionupdate', (e) => this._compUpdate(e));
    t.addEventListener('compositionend', (e) => this._compEnd(e));
    document.body.appendChild(t);
    return this;
  }

  get focused() { return !!this.el && document.activeElement === this.el; }

  /** Move to client position (x, y) (where an input method shows its candidates) and take the focus. */
  focusAt(x, y) {
    this.moveTo(x, y);
    if (!this.focused) this.el.focus({ preventScroll: true });
  }
  moveTo(x, y) {
    this.el.style.left = Math.round(x) + 'px';
    this.el.style.top = Math.round(y) + 'px';
  }

  /** Drop the focus; a composition in progress ends, cancelled, in the window it was going to. */
  blur() {
    if (!this.el) return;
    if (this.composing) {
      const w = this._compWin;
      this._endComposition();
      if (w?.isOpen) w.emit('compositionend', { text: '', cancelled: true, window: w });
    }
    if (this.focused) {
      this._muted = true;
      try { this.el.blur(); } finally { this._muted = false; }
    }
    this.el.value = '';
  }

  /** The window text goes to: the caret's, when it is a text caret in an open window. */
  _target() {
    const c = this.wimp?.caret;
    return c?.text && c.window?.isOpen ? c.window : null;
  }

  _emitText(raw) {
    const w = this._target();
    if (!w) return null;
    const { text, truncated } = sanitizeText(raw);
    if (!text) return null;
    return w.emit('textinput', { text, truncated, window: w });
  }

  _beforeInput(e) {
    if (this._muted) return;
    this._sent = false;
    // an input method's own edits (insertCompositionText, deleteCompositionText, insertFromComposition) are left to
    // it; the committed text is taken from compositionend
    if (this.composing || e.isComposing || /Composition/.test(e.inputType)) return;
    e.preventDefault();
    if (TEXT_TYPES.has(e.inputType)) {
      // a cancelled edit has no input event; one the browser would not cancel is only cleared by _input
      this._sent = !e.defaultPrevented;
      this._emitText(e.data ?? e.dataTransfer?.getData('text/plain') ?? '');
    } else if (KEY_TYPES[e.inputType] && !this._realKey) {
      // a key with no ordinary keydown (that one was delivered as `key` already): send it as the key
      if (this._target()) this.wimp.processKey(KEY_TYPES[e.inputType]);
    }
    this._realKey = false;
  }

  // fallback for browsers that did not cancel the edit: deliver what was typed (once) and clear
  _input(e) {
    if (this._muted || this.composing || e.isComposing) return;
    const v = this.el.value;
    this.el.value = '';
    if (v && !this._sent) this._emitText(v);
    this._sent = false;
  }

  _compStart() {
    if (this._muted) return;
    this.composing = true;
    this._compWin = this._target();
    this._started = false;
  }

  _compUpdate(e) {
    if (this._muted || !this.composing) return;
    const w = this._compWin;
    if (!w?.isOpen) return;
    const start = !this._started;
    this._started = true;
    w.emit('composition', { text: sanitizeText(e.data).text, start, window: w });
  }

  _compEnd(e) {
    if (this._muted || !this.composing) return;
    const w = this._compWin;
    // some browsers end a composition with empty data although the field holds the committed text (after a real
    // cancel the field is empty)
    const raw = e.data || this.el.value;
    this._endComposition();
    const { text } = sanitizeText(raw);
    if (w?.isOpen) w.emit('compositionend', { text, cancelled: !text, window: w });
    if (text && w && w === this._target()) this._emitText(raw);
  }

  _endComposition() {
    this.composing = false;
    this._compWin = null;
    this._started = false;
    this._sent = false;
    if (this.el) this.el.value = '';
  }
}
