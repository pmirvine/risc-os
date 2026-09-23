// Descriptor for the example application (kept tiny: the code is loaded on first run).
import { os } from '../../core/os.js';

export default {
  name: 'Example',                       // task name (Task Manager, "Message from Example")
  appName: '!Example',
  hidden: true,                          // no application directory in the VFS; run with *Example
  sprite: 'application',                 // icon bar sprite (Wimp pool)
  memory: 32,                            // K shown by the Task Manager
  info: { name: 'Example', purpose: 'Demonstrates the core application API', author: '© The RISC OS Web Project, 2026', version: '1.00 (23-Sep-26)' },
  commands: {
    Example: { syntax: 'Syntax: *Example', help: '*Example starts the core API example application.', run: async (args) => { await os.apps.start('Example', args.join(' ')); } },
  },
  load: () => import('./main.js'),       // default export: start(task, ctx)
};
