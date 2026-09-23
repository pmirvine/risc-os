// !Chars - the RISC OS 3.71 character map (ROM application).
export default {
  name: 'Chars',
  appName: '!Chars',
  sprite: '!chars',
  memory: 32,
  info: { name: 'Chars', purpose: 'Character map', author: '© Acorn Computers Ltd, 1989-1996', version: '1.13 (05-Nov-96)' },
  load: () => import('./main.js'),
};
