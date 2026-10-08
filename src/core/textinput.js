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
//
// The clipboard (Wimp._paste / _copyCut / readClipboard): a text caret's window gets `paste` {text, html, files} and
// `copy` / `cut` {cut, setData}. pastePayload and copyData below hold the caps; the clipboard's contents are
// passed on as strings (and File objects, unread) and never interpreted here. exec('copy' | 'cut') runs the
// browser's own command from a menu item; setHasSelection keeps a selected placeholder in the proxy for browsers
// that fire copy / cut only with a selection (opt-in: setCaret option clipboard: true).

export const MAX_TEXT = 100000;     // UTF-16 units in one textinput event

/**
 * Clean committed text: CR LF and lone CR become LF; control characters (C0, DEL, C1) other than LF and TAB are
 * dropped; lone surrogates become U+FFFD; at most MAX_TEXT UTF-16 units (never splitting a surrogate pair).
 * Returns {text, truncated}.
 */
export function sanitizeText(s) {
  s = String(s ?? '').replace(/\r\n?/g, '\n');
  let out = '';
  // (stops once past the cap: the rest cannot change the result, so a 5 MB paste is not scanned to the end)
  for (let i = 0; i < s.length && out.length <= MAX_TEXT; i++) {
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

export const MAX_HTML = 2000000;          // characters of pasted text/html; more is dropped (never truncated)
export const MAX_FILES = 8;               // pasted File objects passed on
export const MAX_COPY_TEXT = 5000000;     // UTF-16 units a copy may put on the clipboard as text/plain (or text/uri-list)
export const MAX_COPY_HTML = 8000000;     // characters a copy may put on the clipboard as text/html
export const COPY_TYPES = new Set(['text/plain', 'text/html', 'text/uri-list']);

/**
 * The `paste` payload from raw clipboard data {text, html, files}: text cleaned and capped by sanitizeText, html
 * passed through unless longer than MAX_HTML (then ''), at most MAX_FILES files (File objects, not read).
 */
export function pastePayload(raw) {
  const html = raw?.html;
  return {
    text: sanitizeText(raw?.text).text,
    html: typeof html === 'string' && html.length <= MAX_HTML ? html : '',
    files: Array.from(raw?.files ?? []).slice(0, MAX_FILES),
  };
}

/**
 * What a `copy` / `cut` handler may put on the clipboard: setData(type, data) -> true when kept. Only COPY_TYPES
 * with string data under the caps; a value over its cap is dropped (with any earlier value for that type).
 * close() ends it: setData afterwards does nothing.
 */
export function copyData() {
  const entries = new Map();
  let open = true;
  const setData = (type, data) => {
    if (!open || !COPY_TYPES.has(type) || typeof data !== 'string') return false;
    if (data.length > (type === 'text/html' ? MAX_COPY_HTML : MAX_COPY_TEXT)) { entries.delete(type); return false; }
    entries.set(type, data);
    return true;
  };
  return { entries, setData, close() { open = false; } };
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
    this._hasSel = false;       // the caret's window has a selection (setHasSelection; for the placeholder)
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
    this._syncPlaceholder();
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
    this._hasSel = false;
    this.el.value = '';
  }

  /**
   * Run the browser's copy or cut command (a menu item's Copy / Cut, inside the click): the proxy takes the focus
   * if it does not have it and the caret's window gets the usual `copy` / `cut` event. Only for a text caret.
   * Returns what document.execCommand returned (false for any other command).
   */
  exec(cmd) {
    if ((cmd !== 'copy' && cmd !== 'cut') || !this.el || !this._target()) return false;
    if (!this.focused) this.el.focus({ preventScroll: true });
    this._syncPlaceholder();
    try { return document.execCommand(cmd); } catch { return false; }
  }

  /**
   * The caret's window says whether it has a selection. With the caret option clipboard: true, a selected
   * placeholder (one space) is kept in the proxy meanwhile, for browsers that fire copy / cut only when the focused
   * field has a selection; without it this only records the state.
   */
  setHasSelection(on) {
    this._hasSel = !!on;
    this._syncPlaceholder();
  }

  _syncPlaceholder() {
    if (!this.el || this.composing) return;
    const on = this._hasSel && !!this.wimp?.caret?.clipboard && !!this._target() && this.focused;
    const want = on ? ' ' : '';
    if (this.el.value !== want) this.el.value = want;
    if (on && (this.el.selectionStart !== 0 || this.el.selectionEnd !== 1)) this.el.setSelectionRange(0, 1);
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
    // pasted text reaches the window only through the `paste` event (Wimp._paste), never also as typed text
    if (v && !this._sent && !/^insertFromPaste/.test(e.inputType ?? '')) this._emitText(v);
    this._sent = false;
    this._syncPlaceholder();
  }

  _compStart() {
    if (this._muted) return;
    this.composing = true;
    this._compWin = this._target();
    this._started = false;
    this._phStart = this.el.value === ' ' && this._hasSel;   // the placeholder was selected when it started
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
    // (a cancelled composition may leave the selection placeholder behind: that is not text)
    const raw = e.data || (this._phStart && this.el.value === ' ' ? '' : this.el.value);
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
    this._syncPlaceholder();
  }
}
