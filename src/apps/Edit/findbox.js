// Edit's Find / Replace system (RISC_OSLib txtedit_find): the "Find text" box (template "find")
// and the "Text found" box (template "found"), as an event-driven state machine.
//
// Find box icons: 0 Go, 1 Previous, 2 Find field, 3 Replace field, 4 message, 7 Count,
// 8 Case sensitive, 9 Magic characters (old '\' patterns), 10 Wildcarded expressions,
// 11-26 wildcard buttons (shown with 10), 27-36 magic-character summary (shown with 9).
// The box grows by the height of the lower section while 9 or 10 is on.
// Found box icons: 0 Stop, 1 Continue, 2 Replace, 3 Last Replace, 4 End of file replace,
// 5 message, 6 Undo, 7 reDo.

import { wimp } from '../../core/wimp.js';
import { DBox } from './dbox.js';
import { compileFind, findNext, countMatches, expandReplace, PatternError } from './find.js';
import { setSelection } from './view.js';

const FI = { go: 0, previous: 1, find: 2, replace: 3, msg: 4, count: 7, cse: 8, magic: 9, wild: 10 };
const WILD = [11, 26], MAGIC = [27, 36];
const WILD_CHARS = { 11: '.', 12: '$', 13: '@', 14: '#', 15: '|', 16: '\\', 17: '[', 18: ']', 19: '~', 20: '*', 21: '^', 22: '%', 23: '-', 24: '&', 25: '?', 26: '\x84' };
const FO = { stop: 0, cont: 1, rep: 2, lastRep: 3, endRep: 4, msg: 5, undo: 6, redo: 7 };

export class FindController {
  constructor(app) {
    this.app = app;
    const M = app.M, task = app.task;
    this.fbox = new DBox(app.tpl, 'find', { task, messages: M, help: 'FIND', onAction: (i, o) => this.findAction(i, o), onClose: () => this._closed('find') });
    this.obox = new DBox(app.tpl, 'found', { task, messages: M, help: 'FOUND', onAction: (i, o) => this.foundAction(i, o), onClose: () => this._closed('found') });
    const I = this.fbox.icons;
    this.smallH = this.fbox.win.h;
    this.growth = Math.max(0, I[24].bbox.y1 - I[FI.magic].bbox.y1);
    this.state = null;        // TextState being searched
    this.session = false;
  }

  get M() { return this.app.M; }
  get view() { return this.state?.activeView ?? null; }
  get doc() { return this.state?.doc ?? null; }

  // ------------------------------------------------------------------ opening
  _prepare(state) {
    this.state = state;
    this.session = true;
    this.majorEdits = 0;
    this.undone = 0;
    const b = this.fbox;
    this.prev = { find: b.field(FI.find), repl: b.field(FI.replace), magic: b.selected(FI.magic), wild: b.selected(FI.wild), cse: b.selected(FI.cse) };
    b.setField(FI.msg, '');
    b.setField(FI.find, '');
    b.setField(FI.replace, '');
  }
  /** F4: show the Find box near the caret (or pointer). */
  open(state, how = 'key') {
    this.obox.hide();
    this._prepare(state);
    this.fbox.show(how);
    this._resize();
  }
  /** Edit ▸ Find ▸ : the Find box as a submenu. */
  submenu(state) {
    this._prepare(state);
    const w = this.fbox.asSubmenu();
    queueMicrotask(() => this._resize());
    return w;
  }

  _large() { return this.fbox.selected(FI.magic) || this.fbox.selected(FI.wild); }
  _resize() {
    const w = this.fbox.win;
    if (!w.isOpen) return;
    const h = this.smallH + (this._large() ? this.growth : 0);
    if (w.h !== h) w.open({ h, behind: 'keep' });
  }
  _swap(showWild) {
    const I = this.fbox.icons;
    for (let i = WILD[0]; i <= WILD[1]; i++) I[i].setState({ deleted: !showWild });
    for (let i = MAGIC[0]; i <= MAGIC[1]; i++) I[i].setState({ deleted: showWild });
  }

  _closed(which) {
    if (this._switching) return;
    if (which === 'find' && this.obox.showing) return;
    this.endSession();
  }
  endSession() {
    if (!this.session) return;
    this.session = false;
    this.doc?.separate();
    this.obox.hide();
    this.fbox.hide();
  }
  /** A text is going away: forget it. */
  forget(state) { if (this.state === state) { this.endSession(); this.state = null; } }

  // ------------------------------------------------------------------ helpers
  _pattern() {
    const b = this.fbox;
    const text = b.field(FI.find);
    if (!text) return null;
    const mode = b.selected(FI.magic) ? 'magic' : b.selected(FI.wild) ? 'wild' : 'plain';
    try {
      return { ...compileFind(text, { mode, caseSensitive: b.selected(FI.cse) }), repl: b.field(FI.replace), mode };
    } catch (e) {
      if (e instanceof PatternError) { this.app.task.reportError(this.M.lookup('txtfind4')); return null; }
      throw e;
    }
  }
  _search(from) { return this.doc ? findNext(this.doc.text, this.pat, from) : null; }
  _select(r) {
    const v = this.view;
    if (v) v.setCaret(r.start); else this.state.caret = r.start;
    setSelection(this.doc, r.start, r.end);
  }
  get dot() { return this.view?.caret ?? 0; }
  _foundMsg(tok, ...a) { this.obox.setField(FO.msg, this.app.msg(tok, ...a)); }

  // ------------------------------------------------------------------ Find box
  findAction(i, { persist } = {}) {
    const b = this.fbox, I = b.icons;
    if (!this.state || !this.state.alive) { b.hide(); return; }
    switch (i) {
      case FI.previous: {
        const p = this.prev;
        b.setSelected(FI.magic, p.magic); b.setSelected(FI.wild, p.wild); b.setSelected(FI.cse, p.cse);
        if (p.magic) this._swap(false); else if (p.wild) this._swap(true);
        b.setField(FI.find, p.find); b.setField(FI.replace, p.repl);
        this._resize();
        const f = I[FI.find];
        if (b.win.isOpen) wimp.setCaret(b.win, f, f.text.length);
        break;
      }
      case FI.count: {
        const pat = this._pattern();
        if (!pat) break;
        this.pat = pat;
        b.setField(FI.msg, this.M.lookup('txt31'));
        const n = countMatches(this.doc.text, pat, this.dot);
        b.setField(FI.msg, this.app.msg('txt32', n));
        break;
      }
      case FI.go: {
        const pat = this._pattern();
        if (!pat) break;
        this.pat = pat;
        b.setField(FI.msg, this.M.lookup('txt33'));
        this.doc.separate();
        const r = this._search(this.dot);
        if (!r) { b.setField(FI.msg, this.M.lookup('txt34')); break; }
        this._select(r);
        this._foundMsg('txt35');
        const pos = b.win.isOpen ? { x: b.win.x, y: b.win.y } : null;
        this._switching = true;
        b.hide();
        this._switching = false;
        this.obox.show('pointer', pos);
        wimp.setCaret(this.obox.win);
        break;
      }
      case FI.magic: case FI.wild: {
        const on = !b.selected(i);
        b.setSelected(i, on);
        if (on) { b.setSelected(i === FI.magic ? FI.wild : FI.magic, false); this._swap(i === FI.wild); }
        this._resize();
        break;
      }
      case FI.cse: break;
      default:
        if (WILD_CHARS[i] != null) {
          // insert the wildcard character at the caret in the Find / Replace field
          const c = wimp.caret;
          if (c?.window !== b.win || !c.icon?.writable) { const f = I[FI.find]; wimp.setCaret(b.win, f, f.text.length); }
          wimp.processKey(WILD_CHARS[i].charCodeAt(0), WILD_CHARS[i]);
        }
    }
  }

  // ------------------------------------------------------------------ Found box
  foundAction(i) {
    if (!this.state || !this.state.alive) { this.obox.hide(); return; }
    const doc = this.doc, pat = this.pat;
    const commitUndone = () => { if (this.undone) { doc.redoStack = []; this.undone = 0; } };
    switch (i) {
      case FO.cont: {
        commitUndone();
        doc.separate();
        this._foundMsg('txt33');
        const wasat = this.dot;
        let r = this._search(wasat);
        if (r && r.start === wasat) r = this._search(r.end > wasat ? r.end : wasat + 1);
        if (!r) this._foundMsg('txt34'); else { this._select(r); this._foundMsg('txt35'); }
        break;
      }
      case FO.rep: case FO.lastRep: {
        commitUndone();
        doc.separate();
        this._foundMsg('txt33');
        const wasat = this.dot;
        const r = this._search(wasat);
        if (r && r.start === wasat) {
          const rep = expandReplace(pat.repl, r.match, pat.mode);
          doc.replace(r.start, r.end - r.start, rep);
          this.majorEdits++;
          setSelection(doc, r.start, r.start + rep.length);
          if (i === FO.lastRep) { this.view?.setCaret(r.start + rep.length); this.endSession(); return; }
          this.view?.setCaret(r.start);
          const n = this._search(r.start + rep.length);
          if (!n) this._foundMsg('txt34'); else { this._select(n); this._foundMsg('txt35'); }
        } else if (!r) this._foundMsg('txt34');
        else { this._select(r); this._foundMsg(i === FO.lastRep ? 'txt37' : 'txt36'); }
        break;
      }
      case FO.endRep: {
        commitUndone();
        doc.separate();
        const start = this.dot;
        let at = start, count = 0;
        // one pass over a copy of the text, then a single replacement (one undo step)
        const text = doc.text;
        let out = '', last = start;
        for (;;) {
          const r = findNext(text, pat, at);
          if (!r || r.end === r.start) break;
          out += text.slice(last, r.start) + expandReplace(pat.repl, r.match, pat.mode);
          last = r.end;
          at = r.end;
          count++;
        }
        if (count) {
          doc.replace(start, text.length - start, out + text.slice(last));
          this.majorEdits++;
        }
        this.view?.setCaret(start);
        this._foundMsg('txt38', count);
        break;
      }
      case FO.undo: {
        if (!this.majorEdits || doc.undo() < 0) { this._foundMsg('txt39'); break; }
        this.majorEdits--; this.undone++;
        this.view?.showCaret(false);
        this._foundMsg('txt40');
        break;
      }
      case FO.redo: {
        if (this.undone && doc.redo() >= 0) { this.majorEdits++; this.undone--; this._foundMsg('txt41'); }
        else this._foundMsg('txt42');
        break;
      }
      default:
        this.endSession();
    }
  }
}
