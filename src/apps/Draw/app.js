// !Draw - the RISC OS 3.71 object-based drawing program (ROM application).
// Descriptor only: the program is loaded on first run (main.js). See docs/apps/Draw.md.

export default {
  name: 'Draw',
  appName: '!Draw',
  appDir: 'Resources:$.Apps.!Draw',
  sprite: '!draw',                              // Wimp pool (ROM app icons live there)
  memory: 96,
  multiInstance: false,
  // Draw's private sprites (toolbox icons, line patterns, crosshair pointer) and the DXF file icon
  sprites: [{ pool: 'Draw', file: '!Sprites' }],
  filetypes: { 0xAFF: { name: 'DrawFile' } },
  info: { name: 'Draw', purpose: 'Object based drawing program', author: '© Acorn Computers Ltd, 1993', version: '1.11 (24-Jul-95)' },
  commands: {
    Desktop_Draw: {
      syntax: 'Syntax: *Desktop_Draw', help: 'The !Draw module runs the Draw desktop application',
      run: async (argv) => { const { os } = await import('../../core/os.js'); await os.apps.start('Draw', (argv ?? []).join(' ')); },
    },
  },
  open(task, path) { task.emit('dataopen', { path }); },
  load: () => import('./main.js'),
};
