// Descriptor for !Player - the digital sample player (Diversions). Code loads on first run.
// Its !Boot only names the sound file types: double-clicking a sound file does not load it
// ("drop it onto !Player"), so no run actions are registered.
export default {
  name: 'Player for sample data',          // Wimp_Initialise task name used by the original
  appName: '!Player',
  dirVar: 'Player$Dir',
  appDir: 'ADFS::HardDisc4.$.Diversions.!Player',
  sprite: '!player',
  sprites: [{ pool: 'Player', file: '!Sprites22' }],
  filetypes: { 0xBF7: { name: 'RIFF', run: false }, 0xFB1: { name: 'WaveForm', run: false }, 0xD3C: { name: 'ArmSamps', run: false } },
  memory: 160,
  help: 'assets/help/Player.txt',
  info: { name: '!Player', purpose: 'Digital sample player', author: '© Expressive Software Projects, 1994', version: '1.23 (22-Nov-94)' },
  load: () => import('./main.js'),
};
