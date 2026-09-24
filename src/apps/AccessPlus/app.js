// Placeholder descriptor for !Access+ (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'AccessPlus',
  appName: '!Access+',
  appDir: 'ADFS::HardDisc4.$.Utilities.Access+.!Access+',
  help: false,
  start: (task) => { task.reportError('!Access+ is being written'); task.quit(); },
};
