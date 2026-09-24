// Placeholder descriptor for !Patch (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'Patch',
  appName: '!Patch',
  appDir: 'ADFS::HardDisc4.$.Utilities.Patches.!Patch',
  help: false,
  start: (task) => { task.reportError('!Patch is being written'); task.quit(); },
};
