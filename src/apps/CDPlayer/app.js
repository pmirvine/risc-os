// Placeholder descriptor for !CDPlayer (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'CDPlayer',
  appName: '!CDPlayer',
  appDir: 'ADFS::HardDisc4.$.Utilities.!CDPlayer',
  help: false,
  start: (task) => { task.reportError('!CDPlayer is being written'); task.quit(); },
};
