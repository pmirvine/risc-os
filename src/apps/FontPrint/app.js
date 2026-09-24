// Placeholder descriptor for !FontPrint (tier-B apps agent); the real implementation replaces this file.
export default {
  name: 'FontPrint',
  appName: '!FontPrint',
  appDir: 'ADFS::HardDisc4.$.Printing.!FontPrint',
  help: false,
  start: (task) => { task.reportError('!FontPrint is being written'); task.quit(); },
};
