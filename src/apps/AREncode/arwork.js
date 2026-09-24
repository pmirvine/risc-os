// !ARWork ($.Replay.!ARWork) - the Acorn Replay work/scrap directory used by AREncode, ReplayDIY and
// Empire. It contains no program: its !boot and !Run are Obey files (IconSprites <Obey$Dir>.!Sprites;
// Set ARWork$Dir <Obey$Dir>.Work), which the core runs as they are on the disc. This descriptor is
// therefore `hidden` (no application directory of its own), so the Filer boots and runs the original
// Obey files. See docs/apps/ARWork.md.
export default {
  name: 'ARWork',
  appName: '!ARWork',
  hidden: true,
  help: false,
  memory: 0,
  info: { name: 'ARWork', purpose: 'Replay work directory', author: '© Uniqueway Ltd, 1994', version: '(April 1994)' },
  start: (task) => task.quit(),
};
