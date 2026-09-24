// Task windows (the TaskWindow module + Edit's task window code). No application directory:
// started by Ctrl-F12, the Task Manager's "Task window" item, or *TaskWindow. See docs/apps/TaskWindow.md.
export default {
  name: 'TaskWindow',
  hidden: true,
  multiInstance: true,
  memory: 640,
  help: false,
  info: { name: 'TaskWindow', purpose: 'Task windows', author: '© Acorn Computers Ltd, 1996', version: '0.56' },
  boot(os) {
    // Ctrl-F12 (Switcher: "TaskWindow -Display") and *TaskWindow
    os.hooks.taskWindow = (tail = '') => import('./main.js')
      .then((m) => m.openTaskWindow(tail || '-display'))
      .catch((e) => os.wimp.reportError(e.message ?? String(e), { appName: 'TaskWindow' }));
  },
  load: () => import('./main.js'),
};
