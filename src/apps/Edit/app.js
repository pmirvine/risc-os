// !Edit - the RISC OS 3.71 text editor (ROM application, Resources:$.Apps.!Edit).
// Text files double-click into Edit (Alias$@RunType_FFF, as set by Edit's !Boot).
export default {
  name: 'Edit',
  appName: '!Edit',
  sprite: '!edit',
  memory: 188,                                   // !Run: WimpSlot -min 188k
  filetypes: { 0xFFF: { name: 'Text' } },
  multiInstance: false,
  info: { name: 'Edit', purpose: 'Text editor', author: '© Acorn Computers Ltd, 1994', version: '1.54 (23-Feb-95)' },
  boot(os) {
    // Edit's !Boot also names the default TaskWindow server
    if (!os.sysvars.get('TaskWindow$Server')) os.sysvars.set('TaskWindow$Server', 'Resources:$.Apps.!Edit');
  },
  load: () => import('./main.js'),
};
