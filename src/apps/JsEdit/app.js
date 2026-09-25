// !JsEdit - a programmer's editor for JavaScript (and BBC BASIC, Obey, JSON, text), with syntax colouring,
// line numbers, smart indentation, completion, Run, a syntax check, throwback and a Functions list.
// Not part of RISC OS 3.71: an application on the hard disc, $.Apps.!JsEdit (tools/disc-jsedit.mjs), in the
// style of the programmers' editors of the time (StrongED, Zap). Built on !Edit's code. See docs/apps/JsEdit.md.
export default {
  name: 'JsEdit',
  appName: '!JsEdit',
  appDir: 'ADFS::HardDisc4.$.Apps.!JsEdit',
  sprite: '!jsedit',
  sprites: ['ADFS::HardDisc4.$.Apps.!JsEdit.!Sprites'],
  memory: 256,
  // Shift-double-click on a JSScript file opens it here (double-clicking still runs it: see filer.js)
  edits: [0xF81],
  multiInstance: false,
  info: { name: 'JsEdit', purpose: 'Programmer\'s editor', author: 'RISC OS 3.71 in the browser', version: '1.00 (25-Sep-26)' },
  load: () => import('./main.js'),
};
