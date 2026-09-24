// Placeholder descriptor for !AccessCD (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'AccessCD',
  appName: '!AccessCD',
  appDir: 'ADFS::HardDisc4.$.Utilities.Access+.!AccessCD',
  help: false,
  start: (task) => { task.reportError('!AccessCD is being written'); task.quit(); },
};
