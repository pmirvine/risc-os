// Placeholder descriptor for !T1ToFont (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'T1ToFont',
  appName: '!T1ToFont',
  appDir: 'ADFS::HardDisc4.$.Utilities.!T1ToFont',
  help: false,
  start: (task) => { task.reportError('!T1ToFont is being written'); task.quit(); },
};
