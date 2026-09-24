// Placeholder descriptor for !Internet (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'Internet',
  appName: '!Internet',
  appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!Internet',
  help: false,
  start: (task) => { task.reportError('!Internet is being written'); task.quit(); },
};
