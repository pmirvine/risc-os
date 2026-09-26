// Program choices kept as JSON in the Choices directory, as the RISC OS Style Guide asks (not beside the
// program, which may be on a read-only disc): read from Choices:<name> and written to <Choices$Write>.<name>.
//
//   const prefs = await choices.read('Contacts', { sort: 'name' })   // the defaults if there are none yet
//   choices.write('Contacts', prefs)
import { vfs } from './vfs.js';
import { sysvars } from './sysvars.js';

export const choices = {
  /** The saved choices for name, merged over defaults (a copy of defaults if there are none or they're unreadable). */
  async read(name, defaults = {}) {
    try {
      if (vfs.exists(`Choices:${name}`)) return { ...defaults, ...JSON.parse(await vfs.readText(`Choices:${name}`)) };
    } catch { /* bad file: the defaults */ }
    return { ...defaults };
  },
  /** Save the choices for name (a JSON Text file). */
  write(name, value) {
    const dir = sysvars.get('Choices$Write') ?? 'ADFS::HardDisc4.$.!Boot.Choices';
    vfs.mkdir(dir, { parents: true });
    return vfs.writeFile(`${dir}.${name}`, JSON.stringify(value, null, 2) + '\n', { filetype: 0xFFF });
  },
};
