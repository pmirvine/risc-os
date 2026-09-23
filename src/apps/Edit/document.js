// EditDocument: the text object behind one or more Edit windows (RISC_OSLib "txt" + "txtundo").
//
// Text is held as a JS string of character codes 0-255 (RISC OS Latin-1 bytes; newline = 10).
// Nothing here touches the DOM: views (view.js) listen for 'change' events.
//
//   const d = new EditDocument({ text, filename, filetype })
//   d.replace(pos, delLen, insText)      // the one primitive edit (records undo)
//   d.insert(pos, s); d.delete(pos, n)
//   d.separate()                         // start a new "major edit" (undo unit)
//   d.undo() / d.redo()                  // -> 'ok' | 'none'
//   d.on('change', ({pos, delLen, insLen, text}) => …); d.on('modified', …); d.on('title', …)
//
// Task-window support (see docs/apps/Edit.md): d.output(text) appends program output at the end
// of the text the way Edit's task windows do (BS/DEL delete, other control codes optionally dropped).

import { Emitter } from '../../core/util.js';

export class EditDocument extends Emitter {
  constructor({ text = '', filename = '', filetype = 0xFFF, date = null } = {}) {
    super();
    this.text = text;
    this.filename = filename;       // full RISC OS path, or '' = <untitled>
    this.filetype = filetype;
    this.date = date ?? new Date();
    this.modified = false;
    this.views = new Set();
    this.undoStack = [];            // [[op…]…] major edits; op = {pos, del, ins}
    this.redoStack = [];
    this._group = null;
    this.undoLimit = 5000;          // Edit$Options u<n>: approx. characters of undo kept
    this.readOnly = false;
  }

  get length() { return this.text.length; }
  charAt(i) { return this.text.charCodeAt(i); }
  slice(a, b) { return this.text.slice(a, b); }

  // ------------------------------------------------------------------ editing
  /** Replace delLen characters at pos with ins. The only primitive edit. */
  replace(pos, delLen, ins = '', { undo = true, modify = true } = {}) {
    pos = Math.max(0, Math.min(pos, this.text.length));
    delLen = Math.max(0, Math.min(delLen, this.text.length - pos));
    if (!delLen && !ins) return;
    const del = this.text.slice(pos, pos + delLen);
    this.text = this.text.slice(0, pos) + ins + this.text.slice(pos + delLen);
    if (undo) {
      if (!this._group) { this._group = []; this.undoStack.push(this._group); this._trimUndo(); }
      const last = this._group[this._group.length - 1];
      // coalesce typing
      if (last && !last.del && !del && last.pos + last.ins.length === pos) last.ins += ins;
      else if (last && !last.ins && !ins && pos + delLen === last.pos) { last.pos = pos; last.del = del + last.del; }
      else if (last && !last.ins && !ins && pos === last.pos) last.del += del;
      else this._group.push({ pos, del, ins });
      this.redoStack = [];
    }
    this.emit('change', { pos, delLen, insLen: ins.length, text: ins });
    if (modify) this.setModified(true);
  }
  insert(pos, s) { this.replace(pos, 0, s); }
  delete(pos, n) { this.replace(pos, n, ''); }
  setText(s, { modified = false } = {}) {
    this.replace(0, this.text.length, s, { undo: false, modify: false });
    this.clearUndo();
    this.setModified(modified);
  }

  setModified(m) {
    if (this.modified === !!m) return;
    this.modified = !!m;
    this.emit('modified', { modified: this.modified });
  }

  /** Close the current undo group: the next edit starts a new major edit. */
  separate() { this._group = null; }

  _trimUndo() {
    let n = 0;
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      for (const op of this.undoStack[i]) n += op.del.length + op.ins.length;
      if (n > this.undoLimit * 4 && i > 0) { this.undoStack.splice(0, i); break; }
    }
  }

  /** Undo one major edit. Returns the caret position after it, or -1 if nothing to undo. */
  undo() {
    this._group = null;
    let g = this.undoStack.pop();
    while (g && g.length === 0) g = this.undoStack.pop();
    if (!g) return -1;
    let caret = 0;
    for (let i = g.length - 1; i >= 0; i--) {
      const op = g[i];
      this.replace(op.pos, op.ins.length, op.del, { undo: false });
      caret = op.pos + op.del.length;
    }
    this.redoStack.push(g);
    if (!this.undoStack.length) this.setModified(false);
    return caret;
  }
  redo() {
    this._group = null;
    const g = this.redoStack.pop();
    if (!g) return -1;
    let caret = 0;
    for (const op of g) {
      this.replace(op.pos, op.del.length, op.ins, { undo: false });
      caret = op.pos + op.ins.length;
    }
    this.undoStack.push(g);
    return caret;
  }
  get canUndo() { return this.undoStack.some((g) => g.length); }
  get canRedo() { return this.redoStack.length > 0; }

  // ------------------------------------------------------------------ text queries (txtmisc)
  bol(i) { const p = this.text.lastIndexOf('\n', i - 1); return p + 1; }
  eol(i) { const p = this.text.indexOf('\n', i); return p < 0 ? this.text.length : p; }
  /** txtmisc_alphach: letters, digits and accented letters. */
  static isWordChar(c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c >= 192; }
  /** Start of word (txtmisc_bow). */
  bow(i) {
    const W = EditDocument.isWordChar, t = (k) => this.charAt(k);
    if (i > 0 && t(i - 1) === 10) i--;
    while (i > 0 && W(t(i - 1)) && t(i - 1) !== 10) i--;
    while (i > 0 && !W(t(i - 1)) && t(i - 1) !== 10) i--;
    return i;
  }
  /** End of word (txtmisc_eow). */
  eow(i) {
    const W = EditDocument.isWordChar, t = (k) => this.charAt(k), n = this.text.length;
    if (i < n && t(i) === 10) i++;
    while (i < n && W(t(i)) && t(i) !== 10) i++;
    while (i < n && !W(t(i)) && t(i) !== 10) i++;
    return i;
  }
  /** The word (plus trailing or leading space) around i (txtmisc_selectpointandword). */
  wordAt(i) {
    const W = (k) => k >= 0 && k < this.text.length && EditDocument.isWordChar(this.charAt(k));
    const non = (k) => k >= 0 && k < this.text.length && !EditDocument.isWordChar(this.charAt(k)) && this.charAt(k) !== 10;
    const n = this.text.length;
    let a = i, b = i;
    if (W(a - 1) || W(b)) {
      while (a > 0 && W(a - 1)) a--;
      while (W(b)) b++;
      if (b === n || this.charAt(b) === 10) { while (non(a - 1)) a--; } else { while (non(b)) b++; }
    } else {
      while (non(a - 1)) a--;
      while (non(b)) b++;
      if (a === 0 || this.charAt(a - 1) === 10) { while (W(b)) b++; } else { while (a > 0 && W(a - 1)) a--; }
    }
    return [a, b];
  }
  lineNumberAt(i) { let n = 1; for (let p = this.text.indexOf('\n'); p >= 0 && p < i; p = this.text.indexOf('\n', p + 1)) n++; return n; }
  lineStart(line) {
    let p = 0;
    for (let n = 1; n < line; n++) { const q = this.text.indexOf('\n', p); if (q < 0) return this.text.length; p = q + 1; }
    return p;
  }

  // ------------------------------------------------------------------ task-window output
  /**
   * Append program output at the end of the text, as Edit's task windows do (c.message,
   * message_output): BS (8) and DEL (127) delete the previous character; with ignoreCtl (Edit's
   * default "Ignore Ctl") every other control character except LF is dropped. Output is not
   * undoable. Returns the new end of text.
   */
  output(s, { ignoreCtl = true } = {}) {
    let buf = '', del = 0;
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i) & 0xFF;
      if (c === 8) c = 127;
      if (c >= 0x20 || c === 10 || !ignoreCtl) {
        if (c === 127) { if (buf) buf = buf.slice(0, -1); else del++; } else buf += String.fromCharCode(c);
      }
    }
    del = Math.min(del, this.text.length);
    if (del || buf) this.replace(this.text.length - del, del, buf, { undo: false });
    return this.text.length;
  }

  /** Forget all undo/redo information (txtundo_prevent_undo). */
  clearUndo() { this.undoStack = []; this.redoStack = []; this._group = null; }
}
