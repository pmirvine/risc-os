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
  // Filer_Boot: let !Printers print Drawfiles even when Draw isn't running
  boot(os) {
    const render = async (bytes) => {
      const DF = await import('./drawfile.js');
      const doc = DF.parseDrawfile(bytes);
      await DF.prepareDrawfile(doc);
      const bb = DF.docBBox(doc), scale = 2, k = scale / 512;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil((bb.x1 - bb.x0) * k)); canvas.height = Math.max(1, Math.ceil((bb.y1 - bb.y0) * k));
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
      DF.renderDrawfile(g, doc, { scale });
      return { canvas };
    };
    (os.printerRenderers ??= []).push([0xAFF, render]);
    os.printers?.registerRenderer?.(0xAFF, render);
  },
  load: () => import('./main.js'),
};
