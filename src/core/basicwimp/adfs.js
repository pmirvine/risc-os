// ADFS / FileCore disc operations for BASIC programs (!Verify, !HForm): the ADFS_* SWIs on an emulated
// IDE drive 4 that is HardDisc4, plus the floppy drive 0.
//
// The virtual filing system (src/core/vfs.js) has no sectors, so the drive is modelled the way the
// utilities see it: a 540MB IDE drive (Conner CFS540A identity, 1097 cylinders x 16 heads x 63
// sectors, LBA) with a valid new-map boot block at &C00 (empty defect lists, the disc record,
// the IDE parameters) that describes HardDisc4. Everything else reads as zeros.
//
//   * reads, verifies, seeks, restores and "specify" succeed (so !Verify finds no defects, and
//     !HForm identifies the drive, reads its shape and defect list and can soak-test it);
//   * writes and track formats of the hard disc are refused with ADFS's "Protected disc" error
//     (&108C9): HardDisc4 holds the running system and the user's files, so no program - !HForm
//     included - can overwrite or format it. !HForm stops at its first write ("Error &108C9
//     Protected disc" / "HFORM failed: Protected disc") and the disc is untouched.
//
// The drive geometry is exported for tests and docs (docs/apps/TierA.md).

import { BasicError } from '../../basic/errors.js';

const u32 = (x) => x >>> 0;

export const HD4 = {
  drive: 4, cyls: 1097, heads: 16, spt: 63, log2ss: 9, park: 1096,
  model: 'Conner Peripherals 540MB - CFS540A', firmware: '5.08', serial: 'AC7E1996',
  get sectors() { return this.cyls * this.heads * this.spt; },
  get bytes() { return this.sectors * 512; },
};
const BOOT_SECTOR = 6;                     // the boot block lives at byte &C00

export const ADFS_ERR = {
  protectedDisc: () => new BasicError(0x108C9, 'Protected disc'),
  badDrive: () => new BasicError(0x108AC, 'Bad drive'),
  driveEmpty: () => new BasicError(0x108D3, 'Drive empty'),
  badParms: () => new BasicError(0x108A1, 'Bad parameters'),
};

// ---------------------------------------------------------------------------------- disc structures
/** HForm's defect-list check value (PROCe then the final folds). */
function defectCheck(words) {
  let i = 0;
  for (const w of words) i = ((i >>> 13) ^ ((i & 0x1FFF) << 19) ^ w) >>> 0;
  i = (i ^ (i >>> 16)) >>> 0;
  return (i ^ (i >>> 8)) & 255;
}
/** FileCore's boot block / map checksum: sum with carry of bytes 0..n-2. */
export function blockChecksum(b, n = b.length) {
  let sum = 0, c = 0;
  for (let i = n - 2; i >= 0; i--) { sum = sum + b[i] + c; if (sum < 256) c = 0; else { sum &= 255; c = 1; } }
  return sum;
}

/** The 64-byte FileCore disc record of HardDisc4. */
export function discRecord(d = HD4, name = 'HardDisc4') {
  const r = new Uint8Array(64);
  const dv = new DataView(r.buffer);
  const size = d.bytes;
  r[0] = d.log2ss; r[1] = d.spt; r[2] = d.heads; r[3] = 0;           // density 0: hard disc
  r[4] = 15;                                                          // idlen
  r[5] = 10;                                                          // log2bpmb (1K per map bit)
  r[6] = 0; r[7] = 2;                                                 // skew, boot option (*Opt 4,2)
  r[8] = 1;                                                           // lowsector (IDE sectors start at 1)
  r[9] = 137 & 255;                                                   // nzones
  dv.setUint16(10, 0x620, true);                                      // zone_spare
  dv.setUint32(12, 0x2FA01, true);                                    // root directory
  dv.setUint32(16, size >>> 0, true);                                 // disc size (low)
  dv.setUint16(20, 0x3B7C, true);                                     // disc id
  for (let i = 0; i < 10; i++) r[22 + i] = i < name.length ? name.charCodeAt(i) : 32;
  dv.setUint32(32, 0, true);                                          // disc type
  dv.setUint32(36, Math.floor(size / 2 ** 32), true);                 // disc size (high)
  r[40] = 0;                                                          // log2sharesize
  r[41] = size >= 0x20000000 ? 1 : 0;                                 // big flag (> 512MB)
  return r;
}

/** The 512-byte boot block at &C00: defect list(s), hardware parameters, disc record, checksum. */
export function bootBlock(d = HD4) {
  const b = new Uint8Array(512);
  const dv = new DataView(b.buffer);
  const rec = discRecord(d);
  const big = rec[41] === 1;
  dv.setUint32(0, (0x20000000 | defectCheck([])) >>> 0, true);        // no defects (byte addresses)
  if (big) dv.setUint32(4, (0x40000000 | defectCheck([])) >>> 0, true); // no defects (sector addresses)
  // IDE hardware parameters just below the disc record (&1B0-&1BF)
  dv.setInt32(0x1C0 - 20, -1, true);
  b[0x1C0 - 6] = 1;                                                    // LBA flag
  b[0x1C0 - 5] = 1;                                                    // initialisation flag
  dv.setUint32(0x1C0 - 4, big ? d.spt * d.heads * d.park : 512 * d.spt * d.heads * d.park, true);   // parking
  b.set(rec, 0x1C0);
  b[511] = blockChecksum(b);
  return b;
}

/** ATA IDENTIFY DEVICE data (256 words) for the drive. */
export function identify(d = HD4) {
  const b = new Uint8Array(512);
  const dv = new DataView(b.buffer);
  const w = (n, v) => dv.setUint16(n * 2, v, true);
  const str = (n, words, s) => { s = s.padEnd(words * 2, ' '); for (let i = 0; i < words; i++) w(n + i, (s.charCodeAt(i * 2) << 8) | s.charCodeAt(i * 2 + 1)); };
  w(0, 0x0C5A); w(1, d.cyls); w(3, d.heads); w(4, 512 * d.spt); w(5, 512); w(6, d.spt);
  str(10, 10, d.serial); w(20, 3); w(21, 128); w(22, 4);
  str(23, 4, d.firmware); str(27, 20, d.model);
  w(47, 0x8010); w(49, 0x0200);                                        // LBA supported
  w(51, 0x0200); w(53, 1); w(54, d.cyls); w(55, d.heads); w(56, d.spt);
  dv.setUint32(57 * 2, d.sectors, true); dv.setUint32(60 * 2, d.sectors, true);
  return b;
}

// ---------------------------------------------------------------------------------- SWIs
/**
 * Install the ADFS SWIs on a BasicMachine. opts.delay(ms) → Promise lets long verifies take (a little)
 * time, as they would on the real drive; the default is no delay.
 */
export function installADFS(m, opts = {}) {
  const S = (name, fn) => m.registerSwi(name, fn);
  const M = m.mem;
  const boot = bootBlock();
  const state = { retries: 0x10, fsFlags: 0 };
  const hdPresent = (drive) => drive === HD4.drive;
  const sleep = opts.delay ?? (() => null);

  /** Drive number from a disc spec (":4", "4", ":HardDisc4", "ADFS::0"). */
  const specDrive = (s) => {
    const t = String(s).replace(/^adfs:/i, '').replace(/^:/, '').replace(/\..*$/, '').trim();
    if (/^\d$/.test(t)) return +t;
    if (/^harddisc4$/i.test(t)) return 4;
    if (/^floppy$/i.test(t)) return 0;
    throw new BasicError(0x108D4, 'Disc not found');
  };

  function readSectors(sector, buf, len) {
    for (let i = 0; i < len; i++) {
      const s = sector + Math.floor(i / 512), o = i % 512;
      M.wr8(buf + i, s === BOOT_SECTOR ? boot[o] : 0);
    }
  }

  /** The common part of DiscOp / SectorDiscOp: unit = 1 (sector addresses) or 512 (bytes). */
  function discOp(r, unitBytes) {
    const reason = r[1] & 15;
    const drive = (u32(r[2]) >>> 29) & 7;
    const addr = u32(r[2]) & 0x1FFFFFFF;
    const len = r[4] >>> 0;
    if (drive >= 4 && !hdPresent(drive)) throw ADFS_ERR.badDrive();
    const floppy = drive < 4;
    if (floppy && drive !== 0) throw ADFS_ERR.badDrive();
    const sector = unitBytes === 1 ? Math.floor(addr / 512) : addr;
    const limit = floppy ? 1600 * 2 : HD4.sectors;
    const done = () => {
      r[2] = ((drive << 29) | (unitBytes === 1 ? addr + len : addr + Math.ceil(len / 512))) >>> 0;
      if (reason === 1 || reason === 2) r[3] = u32(r[3]) + len;
      r[4] = 0;
    };
    switch (reason) {
      case 0: {                                           // verify
        if (sector + Math.ceil(len / 512) > limit + 1) throw new BasicError(0x108C7, 'Disc error');
        done();
        const ms = len >= 1 << 20 ? Math.min(4000, len / (160 << 20) * 1000) : 0;
        return ms ? sleep(ms) : undefined;
      }
      case 1:                                             // read sectors
        if (floppy) { for (let i = 0; i < len; i++) M.wr8(u32(r[3]) + i, 0); done(); return undefined; }
        readSectors(sector, u32(r[3]), len); done(); return undefined;
      case 2: case 4:                                     // write sectors / write (format) track
        if (floppy) throw ADFS_ERR.driveEmpty();
        throw ADFS_ERR.protectedDisc();
      case 3: done(); return undefined;                   // read track / ID
      case 5: case 6: case 7: case 8: case 15:            // seek, restore, step in/out, specify
        r[4] = 0; return undefined;
      default: throw ADFS_ERR.badParms();
    }
  }

  S('ADFS_DiscOp', (r) => discOp(r, 1));
  S('ADFS_SectorDiscOp', (r) => discOp(r, 512));
  S('ADFS_Drives', (r) => { r[0] = HD4.drive; r[1] = 1; r[2] = 1; });
  S('ADFS_DescribeDisc', (r) => {
    const drive = specDrive(M.rdStrCtrl(u32(r[0])));
    if (drive === HD4.drive) { const rec = discRecord(); for (let i = 0; i < 64; i++) M.wr8(u32(r[1]) + i, rec[i]); return; }
    if (drive === 0) {                                    // 1.6MB F format floppy
      const f = new Uint8Array(64); const dv = new DataView(f.buffer);
      f[0] = 10; f[1] = 10; f[2] = 2; f[3] = 4; f[4] = 15; f[5] = 7; f[6] = 1; f[9] = 4; dv.setUint16(10, 0x640, true); dv.setUint32(12, 0x209, true); dv.setUint32(16, 1600 * 1024, true);
      for (let i = 0; i < 64; i++) M.wr8(u32(r[1]) + i, f[i]);
      return;
    }
    throw ADFS_ERR.badDrive();
  });
  S('ADFS_ControllerType', (r) => { const d = r[0] & 7; r[0] = d === HD4.drive ? 4 : d === 0 ? 2 : 0; });   // 4 IDE, 2 82C710 floppy
  S('ADFS_Retries', (r) => { const old = state.retries; state.retries = ((old & ~r[0]) | (r[1] & r[0])) >>> 0; r[2] = old; r[3] = state.retries; });
  S('ADFS_ECCSAndRetries', () => {});
  S('ADFS_HDC', () => {});
  S('ADFS_PowerControl', (r) => { r[1] = 0; });
  S('ADFS_SetIDEController', () => {});
  S('ADFS_LockIDE', () => {});
  S('ADFS_FreeSpace', (r) => { const free = Math.min(0x7FFFFFFF, opts.freeBytes?.() ?? HD4.bytes / 2); r[0] = free; r[1] = free; });
  S('ADFS_FreeSpace64', (r) => { const free = opts.freeBytes?.() ?? HD4.bytes / 2; r[0] = free >>> 0; r[1] = Math.floor(free / 2 ** 32); r[2] = r[0]; });
  // FileCore_MiscOp through ADFS: 6 = information (FS flags: bit 9 = big disc support, as FileCore 2.98)
  S('ADFS_MiscOp', (r) => {
    if ((r[0] & 255) === 6) {
      state.flagsPtr ??= m.sysAlloc(8);
      M.wr32(state.flagsPtr, (1 << 9) | (1 << 8) | 0x3F);
      r[0] = state.flagsPtr;
    }
  });
  // IDE user op: only IDENTIFY DEVICE (&EC) is answered; anything that would write is refused
  S('ADFS_IDEUserOp', (r) => {
    const blk = u32(r[2]);
    const cmd = M.rd8(blk + 6);
    const drv = (M.rd8(blk + 5) >> 4) & 1;
    if (cmd === 0xEC && drv === 0) {
      const id = identify();
      const n = Math.min(512, r[4] >>> 0);
      for (let i = 0; i < n; i++) M.wr8(u32(r[3]) + i, id[i]);
      r[0] = 0; r[3] = u32(r[3]) + n; r[4] = (r[4] >>> 0) - n;
      return;
    }
    if (cmd === 0xEC) { r[0] = 0x108D3; return; }          // no slave drive: "Drive empty" status
    if (r[0] & (1 << 25)) throw ADFS_ERR.protectedDisc();  // write direction
    r[0] = 0; r[4] = 0;
  });
}
