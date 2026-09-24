// Placeholder descriptor for !AREncode (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'AREncode',
  appName: '!AREncode',
  appDir: 'ADFS::HardDisc4.$.Replay.!AREncode',
  help: false,
  start: (task) => { task.reportError('!AREncode is being written'); task.quit(); },
};
