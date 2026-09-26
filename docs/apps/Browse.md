# !Browse — the web browser

`$.Apps.!Browse` (disc: `tools/disc-browse.mjs`; code: `src/apps/Browse/`; engine: `tools/browser-server.mjs`).
Not part of RISC OS 3.71: a modern web browser with the look of Acorn's Browse 2 — the button bar, URL bar and
status bar (with the spinning globe) are Browse's own Templates and sprites, as !Bookworm has them — whose pages
are drawn by a real browser engine.

Two ways of showing pages:

* **The engine** (`node serve.mjs --browser`): serve.mjs runs Chrome headless and !Browse shows its pages. Everything
  a browser does works: scripts, logins (kept in a profile of its own), video, sound, downloads, uploads, printing,
  pop-ups.
* **Embedded**, when there's no engine (another web server, another computer, or no `--browser`): the page in an
  `<iframe>`. Many sites refuse to be framed (X-Frame-Options, CSP `frame-ancestors`); when served by serve.mjs,
  !Browse asks it first (`/__browse/check`) and shows a note with an *Open in your own browser* button instead.
  Pages are sandboxed without `allow-top-navigation`, so they can't navigate the desktop away; only `http:` /
  `https:` addresses are framed (a `javascript:` one would run as the desktop), and a page from the desktop's own
  server loses `allow-same-origin` (it could otherwise lift its own sandbox).

Why an engine rather than a proxy: a rewriting proxy would put every site on the desktop's own origin (its
IndexedDB disc, the HostFS token), breaks many sites, and is an open proxy; streaming a real browser keeps sites
in a separate browser, with its own profile, and works with any site.

## Files

| file | contents |
|---|---|
| `app.js` | descriptor: `appDir` on the hard disc, `!Sprites` from the disc, file types &F91 URI and &B28 URL, `boot` sets `Alias$URLOpen_http` / `_https` |
| `main.js` | icon bar icon and menu (Info, Choices, Quit); the engine's requests: page dialogues, `<select>` menus, downloads (Save box), uploads (a box to drag files into), pop-ups as tabs; hotlist and history lists, Find, Save boxes (HTML, URI file, PDF), Choices; `-url` / URI files / DataOpen |
| `view.js` | `BrowserWindow` (panes, tab bar, scroll bars that follow the page, the page canvas, pointer and keys, the window menu); `PageTab` (a page in the engine: frames, state); `FrameTab` (an embedded page) |
| `engine.js` | `Engine`: finds the engine (`GET /__browse/`), the WebSocket, requests and replies, frames, sound playback, uploads and fetching downloads |
| `keys.js` | a DOM keydown as Chrome DevTools Protocol key events; the editing shortcuts |
| `uri.js` | URI / URL files; extensions for uploaded files' types |
| `Help.txt` | `!Help` |

`tools/browser-server.mjs` (with `serve.mjs`): Chrome discovery, the pipe to Chrome, a small WebSocket server, the
helper script injected into pages, the frame check and the guards. `tools/browse-ext/`: the sound extension.

## The engine

* **Chrome**: `--browser=/path` or `RISCOS_BROWSER`/`CHROME_PATH`, else Playwright's or Puppeteer's Chrome for
  Testing / Chromium, then Chromium, Chrome, Edge or Brave where they're installed. Chrome for Testing or Chromium
  is best: branded Chrome no longer loads extensions from the command line, so it has no sound.
* It runs `--headless` with `--remote-debugging-pipe` (Chrome DevTools Protocol over file descriptors 3 and 4: no
  debugging port is opened), started the first time a page connects, stopped with the server. Profile:
  `~/.riscos-browse` (or `--browser-profile`), so cookies and logins persist; its downloads and uploads go to a
  temporary directory removed on exit.
* **Tabs**: one Chrome page per tab, each in a window of its own (only one page per window is drawn). The window is
  sized to the page, allowing for the room Chrome keeps for its (unseen) tabs and toolbar, measured once; below
  Chrome's smallest window the page is emulated in its top left corner and each frame says how much of it is page.
* **Frames**: `Page.startScreencast` (JPEG, 80%), each frame acknowledged once sent, or once the WebSocket drains
  when over 2 MB is queued, so a slow link gets fewer frames rather than a backlog. Only shown tabs send frames. A
  screenshot starts a tab off (the screencast only sends changes).
* **Input**: `Input.dispatchMouseEvent` / `dispatchKeyEvent` / `insertText`; Select is the left button, Adjust the
  middle one (so Adjust on a link opens a tab behind, the way Browse used Adjust), Menu is !Browse's menu. On a Mac
  the engine needs editing commands named (`selectAll`, `undo`, `cut`...), elsewhere the keys do it.
* **The helper script** runs in an isolated world of every frame (the page can't see it) and reports through a
  binding: a `<select>` being opened (the default is stopped; !Browse shows a RISC OS menu and sets the choice),
  the pointer shape and the link under the pointer, and the top page's scroll position and size (its own root
  scroll bars are hidden: the window's show it instead).
* **Downloads**: `Browser.setDownloadBehavior` (allowAndName); !Browse shows a Save box straight away (name and type
  from the file's name, `hostfs/names.js`) and fetches the file (`GET /__browse/file/<id>`) once it's complete and a
  place is chosen; closing the box cancels it. **Uploads**: `Page.setInterceptFileChooserDialog`; files dragged into
  !Browse's box (or onto the page, as a drop) are sent with `POST /__browse/upload` and given to the page with
  `DOM.setFileInputFiles` / `Input.dispatchDragEvent`.
* **Dialogues**: `Page.javascriptDialogOpening` → RISC OS error boxes (alert, confirm), a prompt box, a Leave/Stay query.
* **Pop-ups** (`window.open`, `target=_blank`, Adjust on a link): `Target.targetCreated` with an opener → a tab next
  to the opener's.
* **Zoom**: CSS `zoom` on the page's root element, as a browser's own zoom (reflows), kept for later pages.
* **Sound**: `tools/browse-ext` (key fixed, so its id is known and allowlisted with `--allowlisted-extension-id`) has
  an unseen page that captures each tab with `chrome.tabCapture` (the tab is found by a unique title the server gives
  its blank page first) and sends 16-bit stereo 48 kHz samples, silence left out, through a binding; the server passes
  them on and !Browse plays them with WebAudio, a little behind so that chunks join up.

### Protocol (`/__browse/ws`)

JSON from the page: `{op, tab, req?}` with `open {url, w, h, zoom}` → `{tab}`, `close`, `navigate {url}`, `back`,
`forward`, `reload {hard}`, `stop`, `size {w, h}`, `zoom {zoom}`, `show {on}`, `mouse {type, x, y, button, buttons,
clickCount, modifiers}`, `wheel {x, y, dx, dy}`, `key {type, key, code, keyCode, text, modifiers, shortcut,
commands}`, `text {text}`, `scrollTo {x, y}`, `dialog {accept, text}`, `select {index}`, `find {text, caseSensitive}`
→ `{found}`, `copy` → `{text}`, `source` → `{text}`, `pdf` → `{file}`, `files {files}`, `drop {files, x, y}`,
`download {id, action: 'cancel'}`, `audio {on}`. Replies `{ev: 'reply', req, ...}`.

Events: `hello {id}`, `ready {audio, engine}`, `state {tab, url, title, loading, canBack, canForward, link, cursor,
scroll, error, crashed}`, `dialog`, `select {options, index, x, y}`, `files {multiple}`, `download {id, name, url}`,
`progress {id, state, received, total}`, `opened {tab, opener, url}`, `closed {tab}`, `error`. Binary: `[1][tab u32]
[page w, h, shown w, h: u16][JPEG]` frames, `[2][tab u32][samples]` sound.

### Security

As HostFS: only requests from this machine (the socket's address), for this server's own host names (no DNS
rebinding), not cross-site (`Sec-Fetch-Site`), the WebSocket only from the desktop's origin and with the per-run
token from `GET /__browse/` (which other sites can't read); `nosniff` / `Cross-Origin-Resource-Policy`. The engine
only opens `http:`, `https:`, `data:`, `blob:` and `about:blank` addresses (no `file:`). Tabs, downloads and
uploads belong to the connection that made them (`c=` on `/__browse/file/` and `/upload`); the helper script
ignores events a page makes up (`isTrusted`), so a page can't open menus by itself. serve.mjs answers malformed
requests with 400 rather than stopping, and its pages carry `frame-ancestors 'self'`, so other sites (or pages in
!Browse) can't show the desktop in a frame and click in it. Chrome uses its own profile,
so the host's own browser's cookies are never involved. With `--lan` the desktop is served to the network but the
engine still only answers this machine (other computers get the embedded mode).

## Behaviour

* Window: title = the page's title; button bar (Home, Back, Reload — Adjust: without the cache —, Stop, Forward, Add
  to hotlist, Hotlist), URL bar (Return goes; words that aren't an address are searched for with the Choices'
  search site; the arrow on the right lists the history), tab bar (when there's more than one tab, or always from
  Choices), status bar (what's happening, the link under the pointer, the zoom). Scroll bars follow the page's
  scrolling (the extent is to the window as the page is to its view) and scroll it; the window can be made any size
  (`ignoreRight` / `ignoreBottom`).
* Keys: F3 Save, F4 Find, F5 Reload, Ctrl-L URL bar, Ctrl-T new tab, Ctrl-W close tab, Ctrl-N new window, Alt-←/→
  (Cmd for Ctrl on a Mac); Ctrl-C / Ctrl-X copy the page's selection to the host's clipboard, Ctrl-V pastes it into
  the page; everything else goes to the page.
* Menu: File (Save ▸ HTML, Save location ▸ URI file, Print to PDF ▸), Navigate (Open URL, Home, Back, Forward,
  Reload, Stop, History ▸), Hotlist (Go to page ▸, Add this page, Remove page ▸), Tabs, Display (Zoom ▸, Toolbar, URL
  bar, Status bar, Sound), Utilities (Find text ▸, Copy address, Open in your own browser).
* Choices (`Choices:Browse`, JSON, with the hotlist; history in `Choices:BrowseHist`): home page, search site, sound,
  always show the tab bar. Default / Cancel / Set / Save.
* Files: URI (&F91) and URL (&B28) files open in !Browse (double-click, drag to the icon bar icon or a window);
  `*URLOpen_http <address>` opens an address (!Bookworm's web links use it).

## Known gaps

* Pages are drawn at the desktop's pixel size (not at a high-DPI screen's), as JPEG: fine for reading, a little soft
  for small text when the desktop is zoomed.
* A `<select>` inside a cross-origin frame opens Chrome's own (unseen) popup; keyboard-opened selects likewise.
* Embedded pages: no Find, no zoom, and Back/Forward only know the addresses typed or chosen in !Browse (not links
  followed inside the frame); the title is the site's name.
* No bookmarks folders, password manager UI, extensions or developer tools; Chrome's permission prompts
  (location, camera, notifications) are refused.
* The first frame after a resize may be the old size (it's stretched until the next one).
* Keys reach the page as a press and release together (a key held down repeats, but isn't "held"), and characters
  outside Latin-1 typed on the keyboard (emoji) don't arrive; pasting them works.

Tests: `node --test tests/browse` (the engine over its WebSocket; the app in the desktop; the embedded mode). They
start their own servers on ports 8396-8400 with a throw-away profile and use only local pages.
