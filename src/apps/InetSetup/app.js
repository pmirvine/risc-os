// Placeholder descriptor for !InetSetup (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'InetSetup',
  appName: '!InetSetup',
  appDir: 'ADFS::HardDisc4.$.!Boot.Resources.!InetSetup',
  help: false,
  start: (task) => { task.reportError('!InetSetup is being written'); task.quit(); },
};
