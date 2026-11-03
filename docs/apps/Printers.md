# !Printers (Resources:$.Apps.!Printers)

Code: `src/apps/Printers/` (owner: accessories agent). Printer Manager 1.54 from
`vendor/ro371/Sources/Printing/Printers/Manager`, using the real Templates (`Printers`, `Printers-dp/-lj/-ps`
configuration windows), Messages and sprites (`!printers`, class sprites `dp`/`lj`/`ps` + grey `s_…`).

* Icon bar: "Printers" (grey `s!printers`) while no printer is active; otherwise one icon per active printer,
  text = its name, or the connection ("Parallel", "To file"…) / status ("Printing", "Paused"). The current printer
  is the highlighted (cream) one. Select = make current, Adjust = Queue control; Shift (or Ctrl, since with the two-button mapping
  Shift+click is Adjust) + Select = Configuration, + Adjust = Connections.
  Drop files on a printer icon (or the Queue window) to print; drop / double-click printer definition files
  (`&FC6`, `HardDisc4.Printing.Printers.*`, Squash-compressed — `unsquash.js`) to install a printer.
* Menu (ME1): Info, Printer control… (Name/Type/Connection/Status list; Select/Adjust select rows,
  double-click = Configure; its menu MC1: Configure…, Connection…, Active, Inactive, Remove, Select all, Clear
  selection), Queue control… (per printer line + jobs; MQ1 pause / suspend / resume / flush), Edit paper sizes…
  (generic A2–Fanfold read-only + user sizes), Save choices (localStorage `riscos371.printers`), Quit.
* First run installs one active PostScript Level 1 printer on "parallel".
* Output: the document is rendered to an HTML page with `@page` size = the printer's paper (orientation from the
  configuration) and printed via a new browser window + `window.print()` (hidden iframe if pop-ups are blocked).
  Text-like types (Text, Obey…) as Corpus monospace honouring Print title / line numbers / text scale / columns;
  BASIC as its listing; Sprite files at true size (180 OS units/inch); JPEG/GIF/PNG; HTML. Unknown types get the
  "Query from Printer Manager" box (Plain = print as text). Drawfiles are rendered at true size by Draw's `printDrawfile` (registered by Draw's boot hook; `print.js` also
  imports it directly as a fallback).
  Connection "File" writes the text/HTML to the file name instead (Append supported; the HTML page's title escaped: `fileHtml`).

## API for other applications (`os.printers`, null while !Printers isn't running)

```js
if (!os.printers) task.reportError('No printer driver');           // like PDriver not loaded
os.printers.current      // {name, type, class, connection, paper: {name, width, height (mm)}, landscape} | null
os.printers.printers     // [{name, type, class, active, current}]
await os.printers.print({ title, text })                 // or { html, css }, { canvas }, { images: [canvas|url] }
await os.printers.printFile(path)                        // same as dropping the file on the current printer
os.printers.registerRenderer(0xAFF, async (bytes, path) => ({ canvas }))   // or {html} / html string
```
Call `print()` from a click/menu handler: the output window is opened synchronously so pop-up blockers allow it.
`html` may be a Promise (made after the window opened: Paint, !Letters' Print). To abandon such a job (the user
cancelled while it was being made), reject the promise with `{cancelled: true}` (e.g.
`Object.assign(new Error('stopped'), {cancelled: true})`): the output window is closed, no error box is shown, the
job leaves the queue and `print()` resolves `false`. Any other rejection says "Printing aborted: <message>" and
leaves the window showing "Printing..." (so an app that reports its own error should reject with `cancelled`, as
!Letters does; a rejection with no reason says "Printing aborted: null"). The promise must always settle: the printer prints one job at a time and later jobs wait for it.
Apps that print through `os.printers` include !Letters (File > Print...: `docs/apps/Letters.md`, "Print"), which hands over page images as `html`.
`css` is put after the page CSS (`@page` size from the printer's paper, margin 12mm, `img.pic` pixelated), so an
app's rules of the same specificity win (e.g. `@page{margin:0}`).
Apps loaded before Printers starts can put `[type, fn]` pairs in `os.printerRenderers` (array) to be picked up.
