// Task windows: an Edit text connected to a child task (Edit's c.message + the TaskWindow module).
//
// openTaskWindow('<*TaskWindow command tail>') parses the *TaskWindow options, starts a child task
// (a Wimp task shown in the Task Manager, "TaskWindow" unless -name is given) running a ShellCLI
// style "*" prompt or the given command, and shows its output in an Edit window titled
// "Task window" with Edit's Task menu (Kill, Reconnect, Suspend, Resume, Unlink, Link, TaskInput,
// Ignore Ctl, Edit ▸).

import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { splitArgs } from '../../core/cli.js';
import { getEdit, scrap } from '../Edit/api.js';
import { TaskShell } from './shell.js';

let ignoreCtl = true;              // message.c: static, shared by all task windows
const sessions = new Set();
export const taskWindows = sessions;   // (tests / debugging)

/** Parse "*TaskWindow [<command>] [[-wimpslot] <n>K] [[-name] <taskname>] [-ctrl] [-display] [-quit]". */
export function parseTaskWindowArgs(tail = '') {
  const a = splitArgs(String(tail));
  const o = { command: '', wimpslot: 640, name: null, ctrl: false, display: false, quit: false };
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i].toLowerCase();
    if (x === '-wimpslot') o.wimpslot = parseSlot(a[++i]);
    else if (x === '-name') o.name = a[++i] ?? null;
    else if (x === '-ctrl') o.ctrl = true;
    else if (x === '-display') o.display = true;
    else if (x === '-quit') o.quit = true;
    else if (x === '-task' || x === '-txt') i++;
    else pos.push(a[i]);
  }
  // positional: <command> <n>K <taskname>
  if (pos.length) o.command = pos.shift();
  if (pos.length && /^\d+k?$/i.test(pos[0])) o.wimpslot = parseSlot(pos.shift());
  if (pos.length && !o.name) o.name = pos.shift();
  return o;
}
function parseSlot(s) {
  const m = /^(\d+)(k?)$/i.exec(String(s ?? ''));
  if (!m) return 640;
  return m[2] ? +m[1] : Math.ceil(+m[1] / 1024);
}

export async function openTaskWindow(tail = '') {
  const s = new TaskWindowSession(parseTaskWindowArgs(tail));
  sessions.add(s);
  await s.start();
  return s;
}

class TaskWindowSession {
  constructor(opts) {
    this.opts = opts;
    this.state = null;             // Edit TextState (created when the window is needed)
    this.shell = null;
    this.task = null;              // Wimp task of the child
    this.linked = true;
    this.pending = '';             // output held while suspended / before the window exists
  }

  get child() { return !!this.shell?.alive; }
  get suspended() { return !!this.shell?.suspended; }

  async start() {
    this.edit = await getEdit();
    this.M = this.edit.M;
    if (this.opts.display || !this.opts.command) await this._ensureWindow();
    this._startChild();
  }

  // ------------------------------------------------------------------ the child task
  _startChild() {
    const name = this.opts.name ?? 'TaskWindow';
    const task = this.task = wimp.createTask(name, { memory: this.opts.wimpslot });
    task.onMessage('Quit', () => { this.kill(); return true; });
    const shell = this.shell = new TaskShell({
      output: (str) => this._output(str),
      onDeath: () => {
        if (this.shell === shell) this._childDied();
        if (task.alive) task.quit();
      },
    });
    shell.start(this.opts.command, { quit: this.opts.quit, keepAlive: () => !!this.state });
    this._refreshMenu();
  }
  _childDied() {
    this._refreshMenu();
    if (!this.state) sessions.delete(this);
  }
  kill() {
    this.shell?.kill();
  }
  resume() {
    this.shell?.suspend(false);
    if (this.pending && !this._flushQueued) { this._flushQueued = true; queueMicrotask(() => this._flush()); }
  }

  // ------------------------------------------------------------------ output
  _output(str) {
    if (!str) return;
    this.pending += str;
    if (this._flushQueued || (this.suspended && this.state)) return;
    this._flushQueued = true;
    queueMicrotask(() => this._flush());
  }
  async _flush() {
    this._flushQueued = false;
    if (!this.state) await this._ensureWindow();
    if (!this.state?.alive) { this.pending = ''; return; }
    const out = this.pending;
    this.pending = '';
    const d = this.state.doc;
    const ro = d.readOnly; d.readOnly = false;
    d.output(out, { ignoreCtl });
    d.readOnly = ro;
    if (this.linked) {
      for (const v of this.state.views) v.setCaret(d.length, { take: false });
    }
  }

  // ------------------------------------------------------------------ the Edit window
  async _ensureWindow() {
    if (this.state) return;
    if (this._creating) return this._creating;
    this._creating = (async () => {
      const s = this.state = this.edit.install({ title: (v) => this._title(v), noQuitCheck: true });
      s.keyFilter = (view, ev) => this._key(view, ev);
      s.menuHook = (view, ev) => { this._openMenu(view, ev); return true; };
      s.closeHook = (view, ev) => this._close(view, ev);
      s.onDispose = () => { this.kill(); sessions.delete(this); };
      const v = s.views[0];
      v.open();
      v.setCaret(s.doc.length, { take: true });
    })();
    await this._creating;
  }
  _title(v) {
    const n = this.state?.views.length ?? 1;
    return n > 1 ? `${this.M.lookup('ME2')} ${n}` : this.M.lookup('ME2');
  }

  /** message_obeyeventcode: keys go to the task while it's linked, alive and not suspended. */
  _key(view, ev) {
    if (!this.linked || !this.child || this.suspended) return false;
    const code = ev.code;
    const fn = code & ~0x30;
    if (fn === 0x1CA || fn === 0x1CB || fn === 0x1CC) return false;       // F10-F12: Edit's
    if (code > 0xFF || code === 0) { this.shell.key(0); this.shell.key(code & 0xFF); }
    else this.shell.key(code);
    view.setCaret(view.doc.length, { take: true });
    return true;
  }

  async _close(view, ev) {
    const s = this.state;
    if (s.views.length > 1) return false;            // just this view: Edit removes it
    if (this.child) {
      const r = await this.edit.query('quit', this.M.lookup('ME5'), { discard: 0, cancel: 2 });
      if (r !== 'discard') return true;
      this.kill();
    }
    s.dispose();
    return true;
  }

  // ------------------------------------------------------------------ the Task menu (message_menumaker)
  _openMenu(view, ev) {
    this._menuView = view;
    wimp.menus.openAt(this._menu(view), ev, { task: this.edit.task });
  }
  _refreshMenu() { if (wimp.menus?.isOpen && wimp.menus.levels[0]?.menu === this._menuObj) wimp.menus.refresh(); }
  _menu(view) {
    const names = this.M.lookup('ME4').split(',');
    const h = (n) => () => this.edit.help('HELPT' + n);
    const items = [
      { text: names[0], shaded: () => !this.child, action: () => this.kill() },
      { text: names[1], shaded: () => this.child, action: () => { this._startChild(); } },
      { text: names[2], shaded: () => !this.child || this.suspended, action: () => this.shell.suspend(true) },
      { text: names[3], shaded: () => !this.child || !this.suspended, action: () => this.resume() },
      { text: names[4], shaded: () => !this.linked, action: () => { this.linked = false; } },
      { text: names[5], shaded: () => this.linked, action: () => { this.linked = true; } },
      { text: names[6], shaded: () => !scrap.doc, action: () => this._taskInput() },
      { text: names[7], ticked: () => ignoreCtl, action: () => { ignoreCtl = !ignoreCtl; } },
      { text: names[8], submenu: () => this.state.menu(view) },
    ];
    items.forEach((it, i) => { it.help = h(i); });
    return (this._menuObj = new Menu(this.M.lookup('ME3'), items));
  }
  /** TaskInput: send the current Edit selection to the task as if typed. */
  _taskInput() {
    if (!scrap.doc || !this.child) return;
    const text = scrap.doc.slice(scrap.start, scrap.end);
    for (let i = 0; i < text.length; i++) this.shell.key(text.charCodeAt(i) & 0xFF);
  }
}

export default { start: async (task, ctx) => { task.quit(); await openTaskWindow(ctx.args ?? ''); } };
