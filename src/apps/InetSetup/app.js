// !InetSetup (!Boot.Resources.!InetSetup) - Internet Setup 0.21, the network configuration program
// (Toolbox application, Sources/SystemRes/InetSetup). See docs/apps/InetSetup.md. Code loads on first run.
export default {
  name: 'InetSetup',
  appName: '!InetSetup',
  appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!InetSetup',
  sprite: '!inetsetup',
  sprites: [{ pool: 'InetSetup', file: '!Sprites22' }],   // !Boot: IconSprites <InetSetup$Dir>.!Sprites
  memory: 72,
  help: false,                                            // the disc copy has its own !Help
  info: { name: 'Internet Setup', purpose: 'Configuring the network', author: '© Acorn Computers Ltd, 1996', version: '0.21 (27-Nov-96)' },
  load: () => import('./main.js'),
};
