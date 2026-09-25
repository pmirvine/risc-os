// HostFS name and filetype mapping (src/core/hostfs/names.js), host <-> RISC OS, no browser needed.
import { hostToRiscos, riscosToHost, isHidden, discName } from '../../src/core/hostfs/names.js';

const out = [];
const eq = (name, a, b) => out.push(`${JSON.stringify(a) === JSON.stringify(b) ? 'PASS' : 'FAIL'} ${name}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`);

// host -> RISC OS
eq('typed suffix', hostToRiscos('Letter,fff', false), { name: 'Letter', type: 0xfff });
eq('upper-case suffix', hostToRiscos('Sprites,FF9', false), { name: 'Sprites', type: 0xff9 });
eq('load-exec suffix', hostToRiscos('Code,8000-8004', false), { name: 'Code', load: 0x8000, exec: 0x8004 });
eq('extension', hostToRiscos('photo.png', false), { name: 'photo/png', type: 0xb60 });
eq('extension, any case', hostToRiscos('PHOTO.JPG', false), { name: 'PHOTO/JPG', type: 0xc85 });
eq('no extension is Text', hostToRiscos('ReadMe', false), { name: 'ReadMe', type: 0xfff });
eq('unknown extension is Text', hostToRiscos('main.c', false), { name: 'main/c', type: 0xfff });
eq('suffix beats extension', hostToRiscos('photo.png,fff', false), { name: 'photo/png', type: 0xfff });
eq('dot file', hostToRiscos('.profile', false), { name: '/profile', type: 0xfff });
eq('character swaps', hostToRiscos('a b#c$d^e', false).name, 'a\xa0b?c<d>e');
eq('illegal characters', hostToRiscos('x:y*z&@%"|', false).name, 'x_y_z_____');
eq('outside Latin-1', hostToRiscos('snow☃', false).name, 'snow_');
eq('NFD accents composed', hostToRiscos('café', false).name, 'caf\xe9');
eq('directory', hostToRiscos('!MyApp', true), { name: '!MyApp' });
eq('directory suffix stripped', hostToRiscos('Dir,fff', true), { name: 'Dir' });
eq('hidden', [isHidden('.DS_Store'), isHidden('._x'), isHidden('a.crswap'), isHidden('Thumbs.db'), isHidden('.profile'), isHidden('.a.hostfs-0a1b2c3d'), isHidden('b.hostfs-tmp')], [true, true, true, true, false, true, true]);

// RISC OS -> host ("smart" suffixes)
const f = (name, filetype, load = 0, exec = 0) => riscosToHost({ name, isDir: false, filetype, load, exec });
eq('Text, no suffix', f('Letter', 0xfff), 'Letter');
eq('type needs suffix', f('Sprites', 0xff9), 'Sprites,ff9');
eq('type from extension', f('photo/png', 0xb60), 'photo.png');
eq('extension would mislead', f('photo/png', 0xfff), 'photo.png,fff');
eq('Text with odd extension', f('main/c', 0xfff), 'main.c');
eq('untyped', f('Code', -1, 0x8000, 0x8004), 'Code,00008000-00008004');
eq('name that looks suffixed', f('a,fff', 0xfff), 'a,fff,fff');
eq('character swaps back', f('a\xa0b?c<d>e', 0xfff), 'a b#c$d^e');
eq('directory', riscosToHost({ name: '!App', isDir: true }), '!App');
eq('disc name', [discName('My Files'), discName('..'), discName('a.b')], ['My_Files', 'Host', 'a_b']);

// round trips
for (const n of ['Letter,ffb', 'photo.png', 'a b#c', 'Code,00008000-00008004', 'notes.txt', 'x.json']) {
  const r = hostToRiscos(n, false);
  eq(`round trip ${n}`, riscosToHost({ name: r.name, isDir: false, filetype: r.type ?? -1, load: r.load, exec: r.exec }), n);
}
console.log(out.join('\n'));
