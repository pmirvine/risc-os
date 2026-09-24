// Placeholder descriptor for !ARWork (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'ARWork',
  appName: '!ARWork',
  appDir: 'ADFS::HardDisc4.$.Replay.!ARWork',
  help: false,
  start: (task) => { task.reportError('!ARWork is being written'); task.quit(); },
};
