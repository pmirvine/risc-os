// ShareFS (Acorn Access / Access+ file sharing), local only. Behaviour of the ShareFS 3.40 "Access+"
// module (vendor/ro371/Sources/NetWorking/AUN/Access/ShareFS/ShareFS: cmhg/msharep command table,
// c/daemon *Share/*UnShare/*Shares, c/sharephow share options, password_to_pin). There is no network:
// a share is recorded here and listed by *Shares and the Access+ / AccessCD front ends; nothing else can
// see it. Errors use the ShareFS Messages (AUNMsgs Resources.ShareFS.Messages).

const shares = [];           // {name, path, how: {readonly, owner, subdir, cdrom, hidden, auth}, pin}
const listeners = new Set();

export const ERR = {
  NotFound: 'Not found',
  NotVol: 'Shared disc not available',
  NotDir: 'Not a Directory',
  Export: 'Bad share option',
  dexport: 'ShareFS cannot make a suitable disc name from this path',
  DupExprt: 'There is already a disc being shared with that name. Please rename your disc and try again',
  DiscName: 'Bad shared disc name',
};

const fsErr = (m) => { const e = new Error(m); e.riscos = true; return e; };

/** encode_psw_char / password_to_pin (c/daemon). */
export function passwordToPin(pw) {
  let pin = 0;
  for (const ch of String(pw).toUpperCase()) {
    const i = /[0-9]/.test(ch) ? ch.charCodeAt(0) - 48 + 1 : /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 65 + 11 : 0;
    pin = (pin * 37 + i) | 0;
  }
  return pin;
}

/** A valid Access+ key: two to six letters and numbers (Access+ Messages "Pin0"). Blank = no key. */
export const validKey = (k) => k === '' || /^[A-Za-z0-9]{2,6}$/.test(k);

/** howprint (c/sharephow). */
export function howPrint(h) {
  return `${h.readonly ? '-readonly ' : ''}${h.owner ? '' : '-protected '}${h.subdir ? '-subdir ' : ''}${h.cdrom ? '-cdrom ' : ''}${h.hidden ? '-noicon ' : ''}`;
}

export const list = () => shares.map((s) => ({ ...s, how: { ...s.how } }));
export const find = (name) => shares.find((s) => s.name.toLowerCase() === String(name).toLowerCase()) ?? null;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { for (const fn of listeners) try { fn(); } catch (e) { console.error(e); } };

/** The disc name ShareFS makes from a path (daemon.c: the leaf, or the disc name for a root). */
export function discNameFor(path) {
  const p = String(path);
  const dot = p.lastIndexOf('.');
  if (dot < 0 || p[dot + 1] === '$') {
    const m = /::?([^.]+)\.\$$/.exec(p) ?? /:([^.:]+)$/.exec(p);
    if (!m) throw fsErr(ERR.dexport);
    return m[1];
  }
  return p.slice(dot + 1);
}

/**
 * remoted_addexport: share a directory. how = {protected, readonly, cdrom, subdir, noicon}, pin = number|0.
 * Returns the share. Throws RISC OS style errors.
 */
export function share(vfs, path, name, opts = {}, pin = 0) {
  const st = vfs.stat(path);
  if (!st) throw fsErr(`File '${path}' not found`);
  if (st.type !== 'dir') throw fsErr(ERR.NotDir);
  const canon = st.path;
  name = name || discNameFor(canon);
  if (!/^[^\s.:$&@^%\\#*"|]+$/.test(name)) throw fsErr(ERR.DiscName);
  if (find(name)) throw fsErr(ERR.DupExprt);
  const how = { readonly: !!opts.readonly, owner: !opts.protected, subdir: !!opts.subdir, cdrom: !!opts.cdrom, hidden: !!opts.noicon, auth: !!pin };
  if (how.subdir && !how.auth) throw fsErr(ERR.Export);
  const s = { name, path: canon, how, pin: pin | 0 };
  shares.push(s);
  changed();
  return s;
}

/** remoted_removeexport: by disc name, or by the shared path (daemon.c case 1). */
export function unshare(vfs, nameOrPath) {
  let i = shares.findIndex((s) => s.name.toLowerCase() === String(nameOrPath).toLowerCase());
  if (i < 0) {
    let c = null;
    try { c = vfs.canonical(nameOrPath).toLowerCase(); } catch { /* */ }
    if (c) i = shares.findIndex((s) => s.path.toLowerCase() === c);
  }
  if (i < 0) throw fsErr(ERR.NotVol);
  const [s] = shares.splice(i, 1);
  changed();
  return s;
}

/** *Share argument parsing (daemon.c case 0): <pathname> [<discname>] [-options] [-auth <key>]. */
export function parseShareArgs(argv) {
  const [path, ...rest] = argv;
  let name = null, pin = 0;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i], l = a.toLowerCase();
    if (i === 0 && !a.startsWith('-')) { name = a; continue; }
    if (l === '-protected') opts.protected = true;
    else if (l === '-readonly') opts.readonly = true;
    else if (l === '-cdrom') opts.cdrom = true;
    else if (l === '-subdir') opts.subdir = true;
    else if (l === '-noicon') opts.noicon = true;
    else if (l === '-auth') {
      const k = rest[++i];
      if (k == null) throw fsErr(ERR.Export);
      // a number is a saved PIN (*Shares -spin output), otherwise a key
      pin = /^\d+$/.test(k) ? +k : passwordToPin(k);
      if (pin < 10) throw fsErr(ERR.Export);
    } else throw fsErr(ERR.Export);
  }
  return { path, name, opts, pin };
}

/** Lines for *Shares: "Export <name> <path> <how>"; with spin, re-runnable *Share lines (Access+ !Shares). */
export function sharesText({ spin = false, readonlyOnly = false } = {}) {
  return shares.filter((v) => !(readonlyOnly && !v.how.readonly) && !(spin && !v.how.subdir && !v.how.cdrom && !v.pin))
    .map((v) => spin ? `Share ${v.path} ${v.name} ${howPrint(v.how)}${v.pin ? `-auth ${v.pin}` : ''}`.trimEnd()
      : `Export ${v.name.padEnd(10)} ${v.path} ${howPrint(v.how)}`.trimEnd());
}

/** The ShareFS * commands (msharep command table), bound to a VFS. */
export function commands(getVfs) {
  return {
    Share: {
      syntax: 'Syntax: *Share <pathname> [<discname>] [-protected] [-readonly] [-cdrom] [-subdir] [-noicon] [-auth <key>]',
      help: '*Share allows a local directory to be seen as a shared disc.',
      min: 1, max: 9,
      run: async (argv) => { const a = parseShareArgs(argv); share(getVfs(), a.path, a.name, a.opts, a.pin); },
    },
    UnShare: {
      syntax: 'Syntax: *UnShare <discname>',
      help: '*UnShare stops sharing a local shared disc.',
      min: 1, max: 1,
      run: async (argv) => { unshare(getVfs(), argv[0]); },
    },
    Shares: {
      syntax: 'Syntax: *Shares',
      help: '*Shares lists the local directories currently being seen as shared discs.',
      min: 0, max: 1,
      run: async (argv, ctx) => {
        const opt = (argv[0] ?? '').toLowerCase();
        for (const l of sharesText({ spin: opt === '-spin', readonlyOnly: opt === '-readonly' })) ctx.out?.writeln?.(l);
      },
    },
  };
}
