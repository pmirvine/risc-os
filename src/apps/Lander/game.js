// Lander - a JavaScript port of David Braben's 1987 Archimedes demo.
//
// Lander is (C) D. J. Braben 1987. This port follows Mark Moxon's fully documented reconstruction
// of the original ARM source (https://lander.bbcelite.com/, github.com/markmoxon/lander-source-code-
// acorn-archimedes; commentary (C) Mark Moxon): every routine below has the name of its original and
// does the same 32-bit integer arithmetic in the same order, on the same workspace layout, graphics
// buffers and screen memory layout. With the same mouse input it draws the same pixels as the
// original binary (tests/basic/lander.test.mjs checks this frame by frame).
//
// The game talks to the machine only through `os` (the handful of RISC OS calls the original makes):
//   os.writeC(b)            OS_WriteC (VDU stream: MODE 13, text, cursor)
//   os.osByte(a, x, y)      OS_Byte 4 (cursor keys), 112/113 (screen banks), 126 (acknowledge Escape)
//   os.mouse() -> {x, y, buttons}          OS_Mouse (OS units, buttons 4 Select, 2 Menu, 1 Adjust)
//   os.mouseTo(x, y)        OS_Word 21,3
//   os.escape() -> bool     OS_Byte 129 read with a zero time limit returned &1B (Escape pressed)
//   os.readC() -> Promise   OS_ReadC
//   os.vsync() -> Promise   OS_Byte 19
//   os.screen() -> Uint8Array   the screen memory of both MODE 13 banks (bank 1 then bank 2)
// run() resolves when the player presses Escape (after EndGame's MODE 0). The host is src/apps/Lander/host.js
// (portOs); `stats` counts the work done since the last vsync, from which the host works out how long the
// original would have taken over the frame on an 8MHz ARM2 (host.js portFrameCycles), so the port runs at
// the original's frame rate.
//
// Lander makes no sound: the original has no Sound calls, so neither has this port.

// ---------------------------------------------------------------------------- configuration
const TILE_SIZE = 0x01000000;
const TILES_X = 13;
const TILES_Z = 11;
const MAX_PARTICLES = 484;
const LAUNCHPAD_OBJECT = 9;
const LAUNCHPAD_ALTITUDE = 0x03500000;
const SEA_LEVEL = 0x05500000;
const LANDING_SPEED = 0x00200000;
const SMOKE_RISING_SPEED = 0x00080000;
const UNDERCARRIAGE_Y = 0x00640000;
const BUFFER_SIZE = 4308;
const LAUNCHPAD_Y = LAUNCHPAD_ALTITUDE - UNDERCARRIAGE_Y;
const LAUNCHPAD_SIZE = TILE_SIZE * 8;
const HIGHEST_ALTITUDE = TILE_SIZE * 52;
const SPLASH_HEIGHT = TILE_SIZE / 16;
const CRASH_CLOUD_Y = TILE_SIZE * 5 / 16;
const SMOKE_HEIGHT = TILE_SIZE * 3 / 4;
const SAFE_HEIGHT = TILE_SIZE * 3 / 2;
const CAMERA_PLAYER_Z = (TILES_Z - 6) * TILE_SIZE;
const LAND_MID_HEIGHT = TILE_SIZE * 5;
const PLAYER_FRONT_Z = (TILES_Z - 5) * TILE_SIZE;
const ROCK_HEIGHT = TILE_SIZE * 32;
const LANDSCAPE_X_WIDTH = TILE_SIZE * (TILES_X - 2);
const LANDSCAPE_Z_DEPTH = TILE_SIZE * (TILES_Z - 1);
const LANDSCAPE_X = LANDSCAPE_X_WIDTH / 2;
const LANDSCAPE_Y = 0;
const LANDSCAPE_Z = LANDSCAPE_Z_DEPTH + 10 * TILE_SIZE;
const LANDSCAPE_X_HALF = TILE_SIZE * Math.floor(TILES_X / 2);
const LANDSCAPE_Z_BEYOND = LANDSCAPE_Z_DEPTH + TILE_SIZE;
const LANDSCAPE_Z_FRONT = LANDSCAPE_Z - LANDSCAPE_Z_DEPTH;
const LANDSCAPE_Z_MID = LANDSCAPE_Z - CAMERA_PLAYER_Z;

// ---------------------------------------------------------------------------- workspace layout
// Byte offsets into the workspace, as in the original (R11 points at it there).
const xObject = 0x00;
const rotationMatrix = 0x30;
const xNoseV = 0x30, xRoofV = 0x34, xSideV = 0x38, yNoseV = 0x3C, yRoofV = 0x40, ySideV = 0x44;
const zNoseV = 0x48, zRoofV = 0x4C, zSideV = 0x50;
const xVertex = 0x54, yVertex = 0x58;
const xVertexRotated = 0x64;
const xCoord = 0x74, yCoord = 0x78;
const xObjectScaled = 0x84;
const xPlayer = 0x94, yPlayer = 0x98, zPlayer = 0x9C;
const xVelocity = 0xA0, yVelocity = 0xA4, zVelocity = 0xA8;
const xExhaust = 0xAC;
const previousColumn = 0xC4;
const tileCornerRow = 0xE4;
const unusedConfig = 0xF0;
const objectType = 0xF4;
const tileRowOddEven = 0xF8;
const altitude = 0x100, prevAltitude = 0x104;
const particleEnd = 0x108, particleCount = 0x10C;
const objectData = 0x110, objectFlags = 0x114;
const mainLoopCount = 0x118, crashLoopCount = 0x11C, crashedFlag = 0x120;
const currentScore = 0x124, fuelLevel = 0x128, gravity = 0x12C, playingGame = 0x130;
const remainingLives = 0x134, highScore = 0x138;
const xCamera = 0x13C, yCamera = 0x140, zCamera = 0x144;
const xCameraTile = 0x148, zCameraTile = 0x150;
const shipDirection = 0x154, shipPitch = 0x158, fuelBurnRate = 0x15C;
const xLandscapeRow = 0x160, zLandscapeRow = 0x168;
const xLandscapeCol = 0x170, yLandscapeCol = 0x174;
const stringBuffer = 0x200;
const cornerStore1 = 0x400, cornerStore2 = 0x500;
const vertexProjected = 0x600;
const particleData = 0x700;
const objectMap = 0x4400;
const buffers = 0x14400;
const WORKSPACE_SIZE = buffers + (TILES_Z + 1) * BUFFER_SIZE;

// screen memory: MODE 13 (320 x 256, 1 byte per pixel), two banks; the game draws below the two text rows
const BANK_SIZE = 320 * 256;
const screenBank2Addr = 320 * 16;               // (the original's names: &01FD8000 + 320 * 16)
const screenBank1Addr = BANK_SIZE + 320 * 16;   // (&01FEC000 + 320 * 16)

// ---------------------------------------------------------------------------- lookup tables
// The original tables were made by BBC BASIC's 5-byte floating point: (2^31 - 1) * SIN(2 * PI * n / 1024),
// ((2^31 - 1) / PI) * ATN(n / 128), (2^31 - 1) * SQR(n / 1024) and 65536 * n / d. Rounding each step to a
// 32-bit mantissa gives the same values, except for the last-bit differences listed here (BASIC's SIN and
// ATN algorithms round differently from the JavaScript ones): with them every entry equals the original's
// (checked against the binary by tests/basic/lander.test.mjs).
const M31 = 2147483647;
const f5 = (v) => { if (v === 0) return 0; const e = Math.floor(Math.log2(Math.abs(v))) + 1, s = 2 ** (32 - e); return Math.round(v * s) / s; };
const SIN_FIX = 'z-12-1l-1p-1u-2g-2m-2v-2z-35-36-39-3a-3d-3e-3g-3h-3j-3n-3u-3v-3w-42-4b-4j-4v+51+54+59-5b-5c-61-62-6b+6m+6p-6r+73+74-75+7j-7v-7x+7z-86-87-8j-8m-8n-8x-8z-9b-9e-9n-9v+a0-a1-ao+as-b1-bv+bx+by+c3-cc-ci-ck-db-dd-dg-dw-el+ep+eq+et+ev+ew+ez+f2+ff+fg+fh+fi+fr+fz+g0+g2+g9+gb+gk+gm+gn+go+gq+gu+gv+gy+gz+h1+h4+h5+h6+h7+hd+hs+hu+hv+hx+hy+hz+i0+i1+i2+i5+i9+ic+id+im+it-j6-j7-jc-kl+km+kp+kz-l7-lj-lp+lr+m1-m3+m4+n1-n3-n9-nd-ne-nf-nk-nl-no-nr-nt-nu-nw-o0+o3+o8+oe+ok+ol+oo+os+oy+pc+pd+pf+pk+pn+po+pu+pw+px+q4-q9+qb+qh+qr+qy+r1+rn+';
const ATN_FIX = 'h-1t-21-2m-32+';
function makeTables() {
  const sin = new Int32Array(1024), atn = new Int32Array(128), sqr = new Int32Array(1024), div = new Int32Array(4096);
  const twoPi = f5(2 * f5(Math.PI));
  for (let n = 0; n < 1024; n++) sin[n] = Math.trunc(f5(M31 * f5(Math.sin(f5(f5(twoPi * n) / 1024)))));
  const k = f5(M31 / f5(Math.PI));
  for (let n = 0; n < 128; n++) atn[n] = Math.trunc(f5(k * f5(Math.atan(f5(n / 128)))));
  for (let n = 0; n < 1024; n++) sqr[n] = Math.trunc(f5(M31 * f5(Math.sqrt(f5(n / 1024)))));
  for (let n = 0; n < 64; n++) for (let d = 0; d < 64; d++) div[n * 64 + d] = d === 0 ? -1 : Math.trunc(65536 * n / d);
  applyFix(sin, SIN_FIX); applyFix(atn, ATN_FIX);
  return { sin, atn, sqr, div };
}
/** fixes: "<index base 36><sign>" entries joined by nothing ('+' adds 1, '-' subtracts 1) */
function applyFix(t, fix) {
  const re = /([0-9a-z]+)([+-])/g; let m;
  while ((m = re.exec(fix))) t[parseInt(m[1], 36)] += m[2] === '+' ? 1 : -1;
}
export const TABLES = makeTables();
export { applyFix };

// ---------------------------------------------------------------------------- 3D object blueprints
// objectX = [vertex count, face count, (faces offset), flags, vertices (x, y, z)..., faces (normal x, y, z,
// vertex 1, 2, 3, colour &RGB)...]. Flags: bit 0 rotates, bit 1 casts a shadow.
const O = (v, f, flags, verts, faces) => ({ nv: v, nf: f, flags, verts: Int32Array.from(verts), faces: Int32Array.from(faces) });
const objectRock = O(6, 8, 3, [
  0x00000000, 0x00000000, 0x00A00000, 0x00A00000, 0x00A00000, 0x00000000, 0xFF600000, 0x00A00000, 0x00000000,
  0x00A00000, 0xFF600000, 0x00000000, 0xFF600000, 0xFF600000, 0x00000000, 0x00000000, 0x00000000, 0xFF600000,
], [
  0x00000000, 0x54DA5200, 0x54DA5200, 0, 1, 2, 0x444, 0x54DA5200, 0x00000000, 0x54DA5200, 0, 3, 1, 0x444,
  0x00000000, 0xAB25AE00, 0x54DA5200, 0, 4, 3, 0x444, 0xAB25AE00, 0x00000000, 0x54DA5200, 0, 2, 4, 0x444,
  0x00000000, 0x54DA5200, 0xAB25AE00, 5, 1, 2, 0x444, 0x54DA5200, 0x00000000, 0xAB25AE00, 5, 3, 1, 0x444,
  0x00000000, 0xAB25AE00, 0xAB25AE00, 5, 4, 3, 0x444, 0xAB25AE00, 0x00000000, 0xAB25AE00, 5, 2, 4, 0x444,
]);
const objectPyramid = O(5, 6, 1, [
  0x00000000, 0x01000000, 0x00000000, 0x00C00000, 0xFF800000, 0x00C00000, 0xFF400000, 0xFF800000, 0x00C00000,
  0x00C00000, 0xFF800000, 0xFF400000, 0xFF400000, 0xFF800000, 0xFF400000,
], [
  0x00000000, 0x35AA66D2, 0x6B54CDA5, 0, 1, 2, 0x800, 0x6B54CDA5, 0x35AA66D2, 0x00000000, 0, 3, 1, 0x088,
  0x00000000, 0x35AA66D2, 0x94AB325B, 0, 4, 3, 0x880, 0x94AB325B, 0x35AA66D2, 0x00000000, 0, 2, 4, 0x808,
  0x00000000, 0x88000000, 0x00000000, 1, 2, 3, 0x444, 0x00000000, 0x88000000, 0x00000000, 2, 3, 4, 0x008,
]);
const objectPlayer = O(9, 9, 3, [
  0x01000000, 0x00500000, 0x00800000, 0x01000000, 0x00500000, 0xFF800000, 0x00000000, 0x000A0000, 0xFECCCCCD,
  0xFF19999A, 0x00500000, 0x00000000, 0x00000000, 0x000A0000, 0x01333333, 0xFFE66667, 0xFF880000, 0x00000000,
  0x00555555, 0x00500000, 0x00400000, 0x00555555, 0x00500000, 0xFFC00000, 0xFFCCCCCD, 0x00500000, 0x00000000,
], [
  0x457C441A, 0x9E2A1F4C, 0x00000000, 0, 1, 5, 0x080, 0x35F5D83B, 0x9BC03EC1, 0xDA12D71D, 1, 2, 5, 0x040,
  0x35F5D83B, 0x9BC03EC1, 0x25ED28E3, 0, 5, 4, 0x040, 0xB123D51C, 0xAF3F50EE, 0xD7417278, 2, 3, 5, 0x040,
  0xB123D51D, 0xAF3F50EE, 0x28BE8D88, 3, 4, 5, 0x040, 0xF765D8CD, 0x73242236, 0xDF4FD176, 1, 2, 3, 0x088,
  0xF765D8CD, 0x73242236, 0x20B02E8A, 0, 3, 4, 0x088, 0x00000000, 0x78000000, 0x00000000, 0, 1, 3, 0x044,
  0x00000000, 0x78000000, 0x00000000, 6, 7, 8, 0xC80,
]);
const objectSmallLeafyTree = O(11, 5, 2, [
  0x00300000, 0xFE800000, 0x00300000, 0xFFD9999A, 0x00000000, 0x00000000, 0x00266666, 0x00000000, 0x00000000,
  0x00000000, 0xFEF33334, 0xFF400000, 0x00800000, 0xFF400000, 0xFF800000, 0xFF400000, 0xFECCCCCD, 0xFFD55556,
  0xFF800000, 0xFEA66667, 0x00400000, 0x00800000, 0xFE59999A, 0x002AAAAA, 0x00C00000, 0xFEA66667, 0xFFC00000,
  0xFFA00000, 0xFECCCCCD, 0x00999999, 0x00C00000, 0xFF400000, 0x00C00000,
], [
  0x14A01873, 0xAF8F9F93, 0x56A0681E, 0, 9, 10, 0x040, 0x00000000, 0x00000000, 0x00000000, 0, 1, 2, 0x400,
  0x499A254E, 0xB123FC2C, 0xCB6D5299, 0, 3, 4, 0x080, 0xE4D2EEBE, 0x8DC82837, 0xE72FE5E9, 0, 5, 6, 0x080,
  0xD5710585, 0xB29EF364, 0xAEC07EB3, 0, 7, 8, 0x080,
]);
const objectTallLeafyTree = O(14, 6, 2, [
  0x0036DB6D, 0xFD733334, 0x00300000, 0xFFD00000, 0x00000000, 0x00000000, 0x00300000, 0x00000000, 0x00000000,
  0x00000000, 0xFE0CCCCD, 0xFF400000, 0x00800000, 0xFE59999A, 0xFF800000, 0xFF533334, 0xFE333334, 0xFFC92493,
  0xFF400000, 0xFEA66667, 0x00600000, 0x00000000, 0xFF19999A, 0xFF666667, 0xFF800000, 0xFF400000, 0xFFA00000,
  0xFFA00000, 0xFE800000, 0x00999999, 0x00C00000, 0xFECCCCCD, 0x00C00000, 0xFFB33334, 0xFF19999A, 0x00E66666,
  0x00800000, 0xFF400000, 0x00C00000, 0x00300000, 0xFE59999A, 0x00300000,
], [
  0xFD3D01DD, 0xD2CB371E, 0x6F20024E, 0, 9, 10, 0x040, 0x1E6F981A, 0xBB105ECE, 0x5D638B16, 13, 11, 12, 0x080,
  0x00000000, 0x00000000, 0x00000000, 0, 1, 2, 0x400, 0x49D96509, 0xB8E72762, 0xC19E3A19, 0, 3, 4, 0x080,
  0xAD213B74, 0xB641CA5D, 0x2DC40650, 0, 5, 6, 0x040, 0xC9102051, 0xAC846CAD, 0xBD92A8C1, 13, 7, 8, 0x040,
]);
const objectSmokingRemainsLeft = O(5, 2, 0, [
  0xFFD9999A, 0x00000000, 0x00000000, 0x00266666, 0x00000000, 0x00000000, 0x002B3333, 0xFFC00000, 0x00000000,
  0x00300000, 0xFF800000, 0x00000000, 0xFFD55556, 0xFECCCCCD, 0x00000000,
], [0, 0, 0, 0, 1, 3, 0x000, 0, 0, 0, 2, 3, 4, 0x000]);
const objectSmokingRemainsRight = O(5, 2, 0, [
  0x002AAAAA, 0x00000000, 0x00000000, 0xFFD55556, 0x00000000, 0x00000000, 0xFFD4CCCD, 0xFFD00000, 0x00000000,
  0xFFD00000, 0xFFA00000, 0x00000000, 0x002AAAAA, 0xFEA66667, 0x00000000,
], [0, 0, 0, 0, 1, 3, 0x000, 0, 0, 0, 2, 3, 4, 0x000]);
const objectFirTree = O(5, 2, 2, [
  0xFFA00000, 0xFFC92493, 0xFFC92493, 0x00600000, 0xFFC92493, 0xFFC92493, 0x00000000, 0xFE333334, 0x0036DB6D,
  0x00266666, 0x00000000, 0x00000000, 0xFFD9999A, 0x00000000, 0x00000000,
], [0, 0, 0, 2, 3, 4, 0x400, 0x00000000, 0xE0B0E050, 0x8C280943, 0, 1, 2, 0x040]);
const objectGazebo = O(13, 8, 2, [
  0x00000000, 0xFF000000, 0x00000000, 0xFF800000, 0xFF400000, 0x00800000, 0xFF800000, 0xFF400000, 0xFF800000,
  0x00800000, 0xFF400000, 0xFF800000, 0x00800000, 0xFF400000, 0x00800000, 0xFF800000, 0x00000000, 0x00800000,
  0xFF800000, 0x00000000, 0xFF800000, 0x00800000, 0x00000000, 0xFF800000, 0x00800000, 0x00000000, 0x00800000,
  0xFF99999A, 0xFF400000, 0x00800000, 0xFF99999A, 0xFF400000, 0xFF800000, 0x00666666, 0xFF400000, 0xFF800000,
  0x00666666, 0xFF400000, 0x00800000,
], [
  0x00000000, 0x00000000, 0x78000000, 1, 5, 9, 0x444, 0x00000000, 0x00000000, 0x88000000, 2, 6, 10, 0x444,
  0x00000000, 0x94AB325B, 0x35AA66D2, 0, 1, 4, 0x400, 0x00000000, 0x00000000, 0x88000000, 3, 7, 11, 0x444,
  0x00000000, 0x00000000, 0x78000000, 4, 8, 12, 0x444, 0xCA55992E, 0x94AB325B, 0x00000000, 0, 1, 2, 0x840,
  0x35AA66D2, 0x94AB325B, 0x00000000, 0, 3, 4, 0x840, 0x00000000, 0x94AB325B, 0xCA55992E, 0, 2, 3, 0x400,
]);
const objectBuilding = O(16, 12, 0, [
  0xFF19999A, 0xFF266667, 0x00000000, 0xFF400000, 0xFF266667, 0x00000000, 0x00C00000, 0xFF266667, 0x00000000,
  0x00E66666, 0xFF266667, 0x00000000, 0xFF19999A, 0xFF8CCCCD, 0x00A66666, 0xFF19999A, 0xFF8CCCCD, 0xFF59999A,
  0x00E66666, 0xFF8CCCCD, 0x00A66666, 0x00E66666, 0xFF8CCCCD, 0xFF59999A, 0xFF400000, 0xFF666667, 0x00800000,
  0xFF400000, 0xFF666667, 0xFF800000, 0x00C00000, 0xFF666667, 0x00800000, 0x00C00000, 0xFF666667, 0xFF800000,
  0xFF400000, 0x00000000, 0x00800000, 0xFF400000, 0x00000000, 0xFF800000, 0x00C00000, 0x00000000, 0x00800000,
  0x00C00000, 0x00000000, 0xFF800000,
], [
  0x00000000, 0x99CD0E6D, 0x3EE445CC, 0, 4, 6, 0x400, 0x00000000, 0x99CD0E6D, 0x3EE445CC, 0, 3, 6, 0x400,
  0x88000000, 0x00000000, 0x00000000, 1, 8, 9, 0xDDD, 0x78000000, 0x00000000, 0x00000000, 2, 10, 11, 0x555,
  0x88000000, 0x00000000, 0x00000000, 8, 12, 13, 0xFFF, 0x88000000, 0x00000000, 0x00000000, 8, 9, 13, 0xFFF,
  0x78000000, 0x00000000, 0x00000000, 10, 14, 15, 0x777, 0x78000000, 0x00000000, 0x00000000, 10, 11, 15, 0x777,
  0x00000000, 0x00000000, 0x88000000, 9, 13, 15, 0xBBB, 0x00000000, 0x00000000, 0x88000000, 9, 11, 15, 0xBBB,
  0x00000000, 0x99CD0E6D, 0xC11BBA34, 0, 5, 7, 0x800, 0x00000000, 0x99CD0E6D, 0xC11BBA34, 0, 3, 7, 0x800,
]);
const objectSmokingBuilding = O(6, 6, 0, [
  0xFF400000, 0x00000001, 0x00800000, 0xFF400000, 0x00000001, 0xFF800000, 0x00C00000, 0x00000001, 0x00800000,
  0x00C00000, 0x00000001, 0xFF800000, 0xFF400000, 0xFF99999A, 0x00800000, 0x00C00000, 0xFFB33334, 0xFF800000,
], [
  0x00000000, 0x78000000, 0x00000000, 0, 1, 2, 0x000, 0x00000000, 0x78000000, 0x00000000, 1, 2, 3, 0x000,
  0x00000000, 0x00000000, 0x78000000, 0, 2, 4, 0x333, 0x88000000, 0x00000000, 0x00000000, 0, 1, 4, 0x666,
  0x78000000, 0x00000000, 0x00000000, 2, 3, 5, 0x555, 0x00000000, 0x00000000, 0x88000001, 1, 3, 5, 0x777,
]);
const objectSmokingGazebo = O(6, 4, 2, [
  0x00000000, 0xFF8CCCCD, 0xFFF00000, 0x00199999, 0xFF8CCCCD, 0xFFF00000, 0x00800000, 0x00000000, 0x00800000,
  0xFF800000, 0x00000000, 0x00800000, 0x00800000, 0x00000000, 0xFF800000, 0xFF800000, 0x00000000, 0xFF800000,
], [
  0x00000000, 0xA24BB5BE, 0x4AF6A1AD, 0, 1, 2, 0x000, 0x00000000, 0xA24BB5BE, 0x4AF6A1AD, 0, 1, 3, 0x333,
  0x00000000, 0xAC59C060, 0xA9F5EA98, 0, 1, 4, 0x444, 0x00000000, 0xAC59C060, 0xA9F5EA98, 0, 1, 5, 0x000,
]);
const objectRocket = O(13, 8, 2, [
  0x00000000, 0xFE400000, 0x00000000, 0xFFC80000, 0xFFD745D2, 0x00380000, 0xFFC80000, 0xFFD745D2, 0xFFC80000,
  0x00380000, 0xFFD745D2, 0x00380000, 0x00380000, 0xFFD745D2, 0xFFC80000, 0xFF900000, 0x00000000, 0x00700000,
  0xFF900000, 0x00000000, 0xFF900000, 0x00700000, 0x00000000, 0x00700000, 0x00700000, 0x00000000, 0xFF900000,
  0xFFE40000, 0xFF071C72, 0x001C0000, 0xFFE40000, 0xFF071C72, 0xFFE40000, 0x001C0000, 0xFF071C72, 0x001C0000,
  0x001C0000, 0xFF071C72, 0xFFE40000,
], [
  0, 0, 0, 9, 1, 5, 0xCC0, 0, 0, 0, 11, 3, 7, 0xCC0, 0x00000000, 0xEFA75F67, 0x76E1A76B, 0, 1, 3, 0xC00,
  0x891E5895, 0xEFA75F67, 0x00000000, 0, 1, 2, 0x800, 0x76E1A76B, 0xEFA75F67, 0x00000000, 3, 0, 4, 0x800,
  0x00000000, 0xEFA75F67, 0x891E5895, 0, 2, 4, 0xC00, 0, 0, 0, 10, 2, 6, 0xCC0, 0, 0, 0, 12, 4, 8, 0xCC0,
]);
// object map values 0-24 (12-24: destroyed versions of 0-12)
const objectTypes = [
  objectPyramid, objectSmallLeafyTree, objectTallLeafyTree, objectSmallLeafyTree, objectSmallLeafyTree, objectGazebo,
  objectTallLeafyTree, objectFirTree, objectBuilding, objectRocket, objectRocket, objectRocket, objectRocket,
  objectSmokingRemainsRight, objectSmokingRemainsLeft, objectSmokingRemainsLeft, objectSmokingRemainsLeft,
  objectSmokingGazebo, objectSmokingRemainsRight, objectSmokingRemainsRight, objectSmokingBuilding,
  objectSmokingRemainsRight, objectSmokingRemainsLeft, objectSmokingRemainsLeft, objectSmokingRemainsLeft,
];

// ---------------------------------------------------------------------------- ARM helpers
const u = (x) => x >>> 0;
/** register-specified shifts (only the bottom byte of the amount counts) */
const lsl = (v, n) => { n &= 255; return n === 0 ? v | 0 : n < 32 ? (v << n) | 0 : 0; };
const lsr = (v, n) => { n &= 255; return n === 0 ? v | 0 : n < 32 ? (v >>> n) | 0 : 0; };
const asr = (v, n) => { n &= 255; return n === 0 ? v | 0 : n < 32 ? v >> n : v >> 31; };
/** CMN x, #imm then LO: the unsigned add of x and imm does not carry */
const cmnLO = (x, imm) => (x >>> 0) + (imm >>> 0) <= 0xFFFFFFFF;

/**
 * The shift-and-add multiply used throughout Lander (e.g. GetDotProduct): a 32-bit sign-magnitude
 * product a * b / 2^31, keeping 8 bits of a (bits 30 to 23).
 */
function mul(a, b) {
  const sign = a ^ b;
  const A = a < 0 ? u(-a) : u(a);
  let c = (A >>> 30) & 1;                 // MOVS R4, R4, LSL #2 shifts bit 30 into C
  let m = u(u(A << 2) & 0xFE000000 | 0x01000000);
  let v = u((b < 0 ? u(-b) : u(b)) << 1);
  let acc = 0;
  do { v >>>= 1; if (c) acc = u(acc + v); c = m >>> 31; m = u(m << 1); } while (m !== 0);
  acc >>>= 1;
  return sign < 0 ? (-acc) | 0 : acc | 0;
}
/** the unsigned square in GetMouseInPolarCoordinates (part 2) */
function square(a) {
  let c = a >>> 31;
  let m = u(u(a << 1) & 0xFE000000 | 0x01000000);
  let v = u(a), acc = 0;
  do { v >>>= 1; if (c) acc = u(acc + v); c = m >>> 31; m = u(m << 1); } while (m !== 0);
  return acc | 0;
}
/** restoring division loops: MOVS num,num,LSL #1 / CMPCC num,den / SUBCS / ORRCS q,q,bit / MOVS bit,bit,LSR #1 / BCC */
function divLoop(num, den, bit) {
  let q = 0, r = u(num), c;
  den = u(den);
  do {
    c = r >>> 31; r = u(r << 1);
    if (!c) c = r >= den ? 1 : 0;
    if (c) { r = u(r - den); q = u(q | bit); }
    c = bit & 1; bit >>>= 1;
  } while (!c);
  return q | 0;
}
/** the colour byte for red, green and blue levels 0-15 (the 256-colour palette's bit order) */
function colourByte(r, g, b) {
  let c = (((g | b) & 3) | r) & 7;
  if (r & 8) c |= 0x10;
  c |= (g & 12) << 3;
  if (b & 4) c |= 0x08;
  if (b & 8) c |= 0x80;
  return c;
}
const clamp15 = (x) => (u(x) >= 16 ? 15 : x);

class LoseLifeSignal { }
const LOSE_LIFE = new LoseLifeSignal();

// ---------------------------------------------------------------------------- the game
export function createLander(os) {
  const ws = new ArrayBuffer(WORKSPACE_SIZE);
  const W = new Int32Array(ws);      // W[offset >> 2]
  const B = new Uint8Array(ws);
  const { sin: sinT, atn: atnT, sqr: sqrT, div: divT } = TABLES;
  const rd = (o) => W[o >> 2];
  const wr = (o, v) => { W[o >> 2] = v; };
  const rdB = (o) => B[o];
  const wrB = (o, v) => { B[o] = v; };

  // work done since the last vsync (the host uses it to take as long over a frame as the original would)
  const stats = { tris: 0, lines: 0, pixels: 0, particles: 0, objects: 0, altitudes: 0, dots: 0, verts: 0, divs: 0, rows: 0 };
  // variables kept in the code in the original
  let randomSeed1 = 0x4F9C3490, randomSeed2 = 0xDA0383CF | 0;
  let screenAddr = screenBank2Addr;
  let screenBankNumber = 0;
  let scr = null;                    // screen memory (both banks)
  const graphicsBuffers = [];        // start of each graphics buffer (workspace byte offsets)
  const graphicsBuffersEnd = [];     // next free entry of each buffer
  for (let i = 0; i < TILES_Z + 1; i++) { graphicsBuffers.push(buffers + i * BUFFER_SIZE); graphicsBuffersEnd.push(buffers + i * BUFFER_SIZE); }
  // landscapeConfig: (first byte, corner count) for each row of tile corners
  const landscapeConfig = [0x3A, TILES_X];
  for (let i = 1; i <= (TILES_Z - 1) / 2; i++) landscapeConfig.push(0xE3, TILES_X, 0xE4, TILES_X);
  landscapeConfig.push(0xE3, TILES_X);
  const landscapeOffset = [-LANDSCAPE_X | 0, LANDSCAPE_Y, LANDSCAPE_Z];
  const initialScore = 500, initialHighScore = 500, initialFuelLevel = 3413;
  const fuelBarColour = 0x37373737;

  const writeS = (s) => { for (let i = 0; i < s.length; i++) os.writeC(s.charCodeAt(i)); };
  const vdu = (...b) => { for (const x of b) os.writeC(x & 255); };
  const binaryToDecimal = (v, buf) => { const s = String(v | 0); for (let i = 0; i < s.length; i++) B[buf + i] = s.charCodeAt(i); return s.length; };

  // ---------------------------------------------------------------- maths
  function getRandomNumbers() {
    const r0 = randomSeed1, r1 = randomSeed2;
    const c1 = r1 & 1;                                   // TST R1, R1, LSR #1
    let t = u((c1 << 31) | (r0 >>> 1));                  // MOVS R14, R0, RRX
    const c2 = r0 & 1;
    const n1 = (u(r1 << 1) + c2) | 0;                    // ADC R1, R1, R1
    t = u(t ^ (r0 << 12));
    const n0 = (t ^ (t >>> 20)) | 0;
    randomSeed1 = n1; randomSeed2 = n0;
    return [n0, n1];
  }
  const sinIdx = (a) => sinT[(a & ~0x00300000) >>> 22];

  function getLandscapeAltitude(R8, R9) {
    stats.altitudes++;
    wr(prevAltitude, rd(altitude));
    let R0 = (R8 - (R9 << 1)) | 0;
    R0 = sinIdx(R0) >> 7;
    let R1 = (R9 + (R8 << 1)) | 0;
    R1 = (R9 + (R1 << 1)) | 0;
    const R3 = (R1 + R8) | 0;
    R0 = (R0 + (sinIdx(R1) >> 7)) | 0;
    R1 = (R9 - (R8 << 1)) | 0;
    R1 = ((R1 << 1) - R8) | 0;
    R1 = (R1 + R9) | 0;
    R0 = (R0 + (sinIdx(R1) >> 7)) | 0;
    R1 = (R9 + (R8 << 1)) | 0;
    R1 = (R9 + (R1 << 2)) | 0;
    R1 = (R1 - R8) | 0;
    R0 = (R0 + (sinIdx(R1) >> 7)) | 0;
    R1 = (R3 + (R9 << 3)) | 0;
    R0 = (R0 + (sinIdx(R1) >> 8)) | 0;
    R1 = (R9 + (R3 << 1)) | 0;
    R0 = (R0 + (sinIdx(R1) >> 8)) | 0;
    R0 = (LAND_MID_HEIGHT - R0) | 0;
    if (R0 > SEA_LEVEL) R0 = SEA_LEVEL;
    if (u(R8) < LAUNCHPAD_SIZE && u(R9) < LAUNCHPAD_SIZE) R0 = LAUNCHPAD_ALTITUDE;
    wr(altitude, R0);
    return R0;
  }

  /** GetLandscapeBelowVertex: ground height under the vertex at xCoord (camera-relative) */
  function getLandscapeBelowVertex(p) {
    const R8 = (rd(p) + rd(xCamera)) | 0;
    const R9 = (((rd(p + 8) + rd(zCamera)) | 0) - LANDSCAPE_Z) | 0;
    return (getLandscapeAltitude(R8, R9) - rd(yCamera)) | 0;
  }

  function getLandscapeTileColour() {
    const R3 = rd(prevAltitude), R4 = rd(altitude);
    let R14 = (R3 - R4) | 0;
    if (R14 < 0) R14 = 0;
    let R2 = 0;
    let R1 = ((R4 & 8) >> 1) + 4;
    let R0 = R4 & 4;
    if (R4 === LAUNCHPAD_ALTITUDE) { R0 = 4; R1 = 4; R2 = 4; }
    if (R4 === SEA_LEVEL && R3 === SEA_LEVEL) { R1 = 0; R2 = 4; R0 = 0; }
    const t = rdB(tileCornerRow) + (R14 >>> 22);
    R0 = clamp15(R0 + t); R1 = clamp15(R1 + t); R2 = clamp15(R2 + t);
    return Math.imul(colourByte(R0, R1, R2), 0x01010101);
  }

  function multiplyVectorByMatrix(src, dst) {
    if (!(rdB(objectFlags) & 1)) { wr(dst, rd(src)); wr(dst + 4, rd(src + 4)); wr(dst + 8, rd(src + 8)); return; }
    for (let row = 0; row < 3; row++) wr(dst + row * 4, getDotProduct(src, rotationMatrix + row * 12));
  }
  function getDotProduct(vec, mat) {
    return (mul(rd(mat), rd(vec)) + mul(rd(mat + 4), rd(vec + 4)) + mul(rd(mat + 8), rd(vec + 8))) | 0;
  }

  function calculateRotationMatrix(a, b) {
    const R2 = sinIdx((a + 0x40000000) | 0), R3 = sinIdx((b + 0x40000000) | 0);
    const R0 = sinIdx(a), R1 = sinIdx(b);
    wr(xNoseV, mul(R2, R3));
    wr(zRoofV, mul(R0, R1));
    wr(zNoseV, -mul(R1, R2) | 0);
    wr(xRoofV, -mul(R0, R3) | 0);
    wr(yNoseV, R0); wr(xSideV, R1); wr(yRoofV, R2); wr(zSideV, R3); wr(ySideV, 0);
  }

  function getMouseInPolarCoordinates(R0, R1) {
    let R3 = 0;
    if (R0 < 0) { R3 ^= 3; R0 = -R0 | 0; }
    if (R1 < 0) { R3 ^= 7; R1 = -R1 | 0; }
    const ax = R0, ay = R1;
    let R2;
    if (u(R0) < u(R1)) { R3 ^= 1; R2 = divLoop(R0, R1, 0x80); }
    else R2 = divLoop(R1, R0, 0x80);
    R2 = (R2 << 24) & ~0x01800000;
    let angle = atnT[(R2 >>> 23) >> 2];
    if (!(R3 & 1)) angle = (angle + (R3 << 29)) | 0;
    else { R3 += 1; angle = ((R3 << 29) - angle) | 0; }
    let d = (square(ax) + square(ay)) | 0;
    d &= ~0x00300000;
    return [sqrT[d >>> 22], angle];
  }

  /** ProjectParticleOntoScreen: [x, y] on screen, or null (C set: behind or outside the view) */
  function projectParticleOntoScreen(R0, R1, R2) {
    if (R2 < 0) return null;
    let R3 = R0 < 0 ? -R0 | 0 : R0, R5 = R0 < 0 ? ~R3 : R3;
    let R4 = R1 < 0 ? -R1 | 0 : R1, R6 = R1 < 0 ? ~R4 : R4;
    R5 = R5 | R6 | R2 | 1;
    R6 = 0;
    for (;;) { R5 = R5 << 1; if (R5 < 0) break; R6++; }
    R2 = lsl(R2, R6); R3 = lsl(R3, R6); R4 = lsl(R4, R6);
    if (u(R3) >= u(R2) || u(R4) >= u(R2)) return null;
    let q6 = divLoop(R4, R2, 0x200);
    let q5 = divLoop(R3, R2, 0x200);
    q5 = (q5 << 22) >>> 24; q6 = (q6 << 22) >>> 24;
    const x = R0 >= 0 ? 160 + q5 : 160 - q5;
    const y = R1 >= 0 ? 64 + q6 : 64 - q6;
    if (u(x) >= 320 || u(y) >= 239) return null;
    return [x, y];
  }

  /** ProjectVertexOntoScreen of the vector at workspace offset p: [x, y] (the raw x, y if behind the camera) */
  function projectVertexOntoScreen(p) {
    const R0 = rd(p), R1 = rd(p + 4);
    let R2 = rd(p + 8);
    if (R2 < 0) return [R0, R1];
    let R3 = R0 < 0 ? -R0 | 0 : R0, R5 = R0 < 0 ? ~R3 : R3;
    let R4 = R1 < 0 ? -R1 | 0 : R1, R6 = R1 < 0 ? ~R4 : R4;
    R5 = R5 | R6 | R2 | 1;
    R6 = 0;
    for (;;) { R5 = R5 << 1; if (R5 < 0) break; R6++; }
    R2 = lsl(R2, R6); R3 = lsl(R3, R6); R4 = lsl(R4, R6);
    let q5, q6;
    if (u(R2) >= u(R3) && u(R2) >= u(R4)) {
      q6 = divLoop(R4, R2, 0x100);
      q6 = u(q6 << 23);
      q5 = divLoop(R3, R2, 0x200);
      q5 = u(q5 << 22);
      q5 >>>= 24; q6 >>>= 24;
    } else {
      // pver4: a point outside the field of view (the division result would not fit)
      let s = 24;
      let R6b = R3 >>> 1;               // (both branches of the original use R3)
      for (;;) { const lo = u(R2) < u(R6b); if (lo) s++; R6b >>>= 1; if (!lo) break; }
      R2 = R2 >>> 23;
      R3 = lsr(R3, s); R4 = lsr(R4, s);
      q6 = divLoop(u(R4 << 24), u(R2 << 24), 0x80);
      q6 = u(q6 << 24);
      q5 = divLoop(u(R3 << 22), u(R2 << 22), 0x200);
      q5 = u(q5 << 22);
      const sh = (23 - ((s - 23) | 0)) | 0;
      q5 = lsr(q5, sh) >>> 0; q6 = lsr(q6, sh) >>> 0;
      q6 >>>= 1;
    }
    const x = R0 >= 0 ? (160 + q5) | 0 : (160 - q5) | 0;
    const y = R1 >= 0 ? (64 + q6) | 0 : (64 - q6) | 0;
    return [x, y];
  }

  // ---------------------------------------------------------------- particles
  /** particle fields: x, y, z, vx, vy, vz, lifetime, flags/colour (StoreParticleData) */
  function storeParticleData(R0, R1, R2, R3, R4, R5, R6, R7) {
    const n = rd(particleCount);
    if (u(n) >= MAX_PARTICLES) return;
    wr(particleCount, n + 1);
    let p = rd(particleEnd);
    W[p >> 2] = R0; W[(p >> 2) + 1] = R1; W[(p >> 2) + 2] = R2; W[(p >> 2) + 3] = R3;
    W[(p >> 2) + 4] = R4; W[(p >> 2) + 5] = R5; W[(p >> 2) + 6] = R6; W[(p >> 2) + 7] = R7;
    p += 32;
    wr(particleEnd, p);
    wr(p + 28, 0);
  }
  function addMovingParticleToBuffer(R0, R1, R2, R3, R4, R5, R6, R7, R8, R9) {
    R3 = (R3 + asr(getRandomNumbers()[0], R8)) | 0;
    R4 = (R4 + asr(getRandomNumbers()[0], R8)) | 0;
    R5 = (R5 + asr(getRandomNumbers()[0], R8)) | 0;
    R6 = (R6 + lsr(getRandomNumbers()[0], R9)) | 0;
    storeParticleData(R0, R1, R2, R3, R4, R5, R6, R7);
  }
  const addStaticParticleToBuffer = (R0, R1, R2, R6, R7, R8, R9) => addMovingParticleToBuffer(R0, R1, R2, 0, 0, 0, R6, R7, R8, R9);
  const addRisingParticleToBuffer = (R0, R1, R2, R4, R6, R7, R8, R9) => addMovingParticleToBuffer(R0, R1, R2, 0, R4, 0, R6, R7, R8, R9);
  const addExhaustParticleToBuffer = addMovingParticleToBuffer;
  const addBulletParticleToBuffer = storeParticleData;

  function initialiseParticleData() {
    wr(particleEnd, particleData);
    wr(particleData + 28, 0);
    wr(particleCount, 0);
  }
  function addSmokeParticleToBuffer(R0, R1, R2) {
    const g = (getRandomNumbers()[0] & 7) + 3;
    const R7 = colourByte(g, g, g) | 0x00080000;
    addRisingParticleToBuffer(R0, R1, R2, ~SMOKE_RISING_SPEED, 15, R7, 13, 25);
  }
  function debrisColour() {
    const [a, b] = getRandomNumbers();
    const g = (b >>> 29) + 2, bl = (a >>> 30) + 4, r = (a & 7) + 4;
    return colourByte(r, g, bl);
  }
  function addDebrisParticleToBuffer(R0, R1, R2) {
    addStaticParticleToBuffer(R0, R1, R2, 15, debrisColour() | 0x001C0000, 10, 26);
  }
  function dropARockFromTheSky(R0, R1, R2) {
    addStaticParticleToBuffer(R0, R1, R2, 170, debrisColour() | 0x00FE0000, 10, 27);
  }
  function addSparkParticleToBuffer(R0, R1, R2) {
    addStaticParticleToBuffer(R0, R1, R2, 8, 0x001D0000, 8, 29);
  }
  function addSprayParticleToBuffer(R0, R1, R2) {
    const a = getRandomNumbers()[0];
    const bl = (a & 3) + 12, r = (a & 4) + 8;
    addStaticParticleToBuffer(R0, R1, R2, 20, colourByte(r, r, bl) | 0x00100000, 10, 26);
  }
  function addExplosionToBuffer(R0, R1, R2, R8) {
    do {
      addSparkParticleToBuffer(R0, R1, R2);
      addDebrisParticleToBuffer(R0, R1, R2);
      addSmokeParticleToBuffer(R0, R1, R2);
      addSparkParticleToBuffer(R0, R1, R2);
      R8 = (R8 - 1) | 0;
    } while (R8 >= 0);
  }
  function dropRocksFromTheSky() {
    const R4 = (rd(currentScore) - 800) | 0;
    if (R4 < 0) return;
    const R0 = getRandomNumbers()[0] >>> 18;
    if (u(R0) >= u(R4)) return;
    dropARockFromTheSky(rd(xCamera), ~ROCK_HEIGHT, (rd(zCamera) - PLAYER_FRONT_Z) | 0);
  }

  function setParticleColourToFade(R6) {
    const g = u(R6) >= 8 ? 15 : R6 << 1;
    const b = u(R6) >= 8 ? (R6 - 8) << 1 : 0;
    return colourByte(15, g, b) | 0x001D0000;
  }

  // MoveAndDrawParticles and the routines that jump back into its loop (DeleteParticleData etc.)
  function moveAndDrawParticles() {
    let R10 = particleData;
    for (;;) {
      let p = R10 >> 2;
      let R0 = W[p], R1 = W[p + 1], R2 = W[p + 2], R3 = W[p + 3], R4 = W[p + 4], R5 = W[p + 5], R6 = W[p + 6], R7 = W[p + 7];
      if (R7 === 0) return;
      stats.particles++;
      // dpar2
      R6 = (R6 - 1) | 0;
      let del = false;
      if (R6 === 0) del = true;
      else {
        R0 = (R0 + R3) | 0; R1 = (R1 + R4) | 0; R2 = (R2 + R5) | 0;
        if (R7 & 0x00100000) R4 = (R4 + rd(gravity)) | 0;
        if (R7 & 0x00010000) R7 = setParticleColourToFade(R6);
        const R9 = getLandscapeAltitude(R0, R2);
        if (R7 & 0x00200000) {
          // ProcessObjectDestruction
          const R8 = (R9 - R1) | 0;
          if (u(R8) < SAFE_HEIGHT) {
            const m = objectMap + (R0 >>> 24) + ((R2 & 0xFF000000) >>> 16);
            const t = rdB(m);
            if (t !== 0xFF) {
              if (t >= 12) { addExplosionToBuffer(R0, R1, R2, 3); del = true; }
              else {
                wrB(m, t + 12);
                if (!(R7 & 0x00020000)) wr(currentScore, (rd(currentScore) + 20) | 0);
                addExplosionToBuffer(R0, R1, R2, 20);
                del = true;
              }
            }
          }
        }
        if (!del && R1 > R9) {
          // BounceParticle
          R1 = R9;
          if (R9 === SEA_LEVEL) {
            // SplashParticleIntoSea
            if (R7 & 0x00040000) {
              let n = (R7 & 0x00800000) ? 65 : 4;
              R1 = (R1 - SPLASH_HEIGHT) | 0;
              do { addSprayParticleToBuffer(R0, R1, R2); n--; } while (n !== 0);
            }
            del = true;
          } else if (!(R7 & 0x00080000)) del = true;
          else if (R7 & 0x01000000) { addExplosionToBuffer(R0, R1, R2, 3); del = true; }
          else { R3 >>= 1; R4 >>= 1; R5 >>= 1; R4 = -R4 | 0; }
        }
        if (!del) {
          W[p] = R0; W[p + 1] = R1; W[p + 2] = R2; W[p + 3] = R3; W[p + 4] = R4; W[p + 5] = R5; W[p + 6] = R6; W[p + 7] = R7;
          R10 += 32;
          // part 2: is it in the visible landscape?
          R0 = (R0 - rd(xCamera)) | 0;
          R2 = (((R2 - rd(zCamera)) | 0) + LANDSCAPE_Z) | 0;
          R1 = (R1 - rd(yCamera)) | 0;
          if (u(R2) >= LANDSCAPE_Z || u(R2) < LANDSCAPE_Z_FRONT) continue;
          if (u(R0 < 0 ? -R0 : R0) >= LANDSCAPE_X_HALF) continue;
          if (R7 & 0x00020000) {
            // part 3: a rock - does it hit the player?
            if (rd(playingGame) !== 0) {
              const dx = u(R0 < 0 ? -R0 : R0);
              let dz = (R2 - LANDSCAPE_Z_MID) | 0; dz = u(dz < 0 ? -dz : dz);
              if (dx < TILE_SIZE && dz < TILE_SIZE) {
                let dy = (((R1 + rd(yCamera)) | 0) - rd(yPlayer)) | 0;
                dy = u(dy < 0 ? -dy : dy);
                if (dy < TILE_SIZE) throw LOSE_LIFE;     // LoseLifeFromParticleLoop
              }
            }
            wr(objectData, 0); curObject = objectRock;
            drawObject(R0, R1, R2, rotationMatrix);
            continue;
          }
          // part 4: shadow on the ground, then the particle
          const sp = projectParticleOntoScreen(R0, (R9 - rd(yCamera)) | 0, R2);
          if (sp) drawParticleShadowToBuffer(sp[0], sp[1], R2);
          const pp = projectParticleOntoScreen(R0, R1, R2);
          if (pp) drawParticleToBuffer(pp[0], pp[1], R7, R2);
          continue;
        }
      }
      // DeleteParticleData: move the last particle into this slot
      const e = (rd(particleEnd) - 32) | 0;
      wr(particleEnd, e);
      for (let i = 0; i < 8; i++) W[(R10 >> 2) + i] = W[(e >> 2) + i];
      wr(e + 28, 0);
      wr(particleCount, (rd(particleCount) - 1) | 0);
    }
  }

  // ---------------------------------------------------------------- graphics buffers
  const bufIndex = (z) => (z & ~0x00C00000) >>> 24;
  function drawParticleToBuffer(x, y, R7, R8) {
    const k = bufIndex((((LANDSCAPE_Z - R8) | 0) + TILE_SIZE) | 0);
    let R9 = graphicsBuffersEnd[k];
    let size = R8 >>> 25; if (size >= 8) size = 8;
    W[R9 >> 2] = size;
    W[(R9 >> 2) + 1] = (y + ((R7 & 0xFF) << 12) + (x << 20)) | 0;
    graphicsBuffersEnd[k] = R9 + 8;
  }
  function drawParticleShadowToBuffer(x, y, R8) {
    const k = bufIndex((LANDSCAPE_Z - R8) | 0);
    const R9 = graphicsBuffersEnd[k];
    let size = R8 >>> 25; if (size >= 8) size = 8;
    W[R9 >> 2] = size + 9;
    W[(R9 >> 2) + 1] = (y + (x << 20)) | 0;
    graphicsBuffersEnd[k] = R9 + 8;
  }
  function triangleToBuffer(z, pts, R8) {
    if (u(z) >= LANDSCAPE_Z_BEYOND) z = LANDSCAPE_Z_DEPTH;
    const k = bufIndex(z);
    const R9 = graphicsBuffersEnd[k] >> 2;
    W[R9] = 18;
    for (let i = 0; i < 6; i++) W[R9 + 1 + i] = pts[i];
    W[R9 + 7] = R8;
    graphicsBuffersEnd[k] = (R9 + 8) << 2;
  }
  const drawTriangleShadowToBuffer = (pts, R8) => triangleToBuffer((LANDSCAPE_Z - rd(xObject + 8)) | 0, pts, R8);
  const drawTriangleToBuffer = (pts, R8) => triangleToBuffer((((LANDSCAPE_Z - rd(xObject + 8)) | 0) + TILE_SIZE) | 0, pts, R8);

  function addTerminatorsToBuffers() {
    for (let i = TILES_Z; i >= 0; i--) { W[graphicsBuffersEnd[i] >> 2] = 19; graphicsBuffersEnd[i] = graphicsBuffers[i]; }
  }

  // particle sizes in bufferJump: [dx0, dx1, rows] for types 0-17
  const PARTICLE_SHAPES = [
    [-1, 1, 2], [-1, 1, 2], [-1, 1, 2], [-1, 1, 2], [-1, 1, 2], [-1, 1, 2], [0, 1, 2], [0, 1, 1], [0, 0, 1],
    [-1, 1, 1], [-1, 1, 1], [-1, 1, 1], [-1, 1, 1], [-1, 1, 1], [-1, 1, 1], [0, 1, 1], [0, 1, 1], [0, 0, 1],
  ];
  function drawGraphicsBuffer(n) {
    let R9 = graphicsBuffersEnd[n];
    const R12 = screenAddr;
    for (;;) {
      const t = W[R9 >> 2]; R9 += 4;
      if (t === 19) return;
      if (t === 18) {
        const q = R9 >> 2;
        drawTriangle(W[q], W[q + 1], W[q + 2], W[q + 3], W[q + 4], W[q + 5], W[q + 6]);
        R9 += 28;
        continue;
      }
      const shape = PARTICLE_SHAPES[t];
      stats.dots++;
      if (!shape) return;           // (the original would jump into the unknown)
      const R1 = W[R9 >> 2]; R9 += 4;
      const a = R12 + (R1 >>> 20) + (R1 & 0xFF) * 320;
      const c = (R1 >>> 12) & 0xFF;
      for (let row = 0; row < shape[2]; row++) for (let dx = shape[0]; dx <= shape[1]; dx++) scr[a + row * 320 + dx] = c;
    }
  }

  // ---------------------------------------------------------------- 3D objects
  let curObject = null;              // objectData (the blueprint being drawn)
  function drawObject(R0, R1, R2, R3) {
    stats.objects++;
    wr(xObject, R0); wr(xObject + 4, R1); wr(xObject + 8, R2);
    let R4 = R0 < 0 ? ~R0 : R0;
    const R5a = R1 < 0 ? ~R1 : R1;
    R4 = R4 | R5a | R2 | 1;
    if (R4 >= 0) R4 = R4 << 1;
    let R5 = 0;
    wrB(crashedFlag, 0);
    for (;;) { R4 = R4 << 1; if (R4 < 0) break; R5++; }
    wr(xObjectScaled, lsl(R0, R5)); wr(xObjectScaled + 4, lsl(R1, R5)); wr(xObjectScaled + 8, lsl(R2, R5));
    if (R3 !== rotationMatrix) for (let i = 0; i < 9; i++) wr(rotationMatrix + i * 4, R3[i]);
    // part 2: rotate and project the vertices, and their shadows on the ground
    const obj = curObject;
    wrB(objectFlags, obj.flags);
    let R10 = vertexProjected;
    stats.verts += obj.nv;
    for (let v = 0; v < obj.nv; v++) {
      wr(xVertex, obj.verts[v * 3]); wr(xVertex + 4, obj.verts[v * 3 + 1]); wr(xVertex + 8, obj.verts[v * 3 + 2]);
      multiplyVectorByMatrix(xVertex, xVertexRotated);
      for (let i = 0; i < 12; i += 4) wr(xCoord + i, (rd(xObject + i) + rd(xVertexRotated + i)) | 0);   // AddVectorToVertices
      const pv = projectVertexOntoScreen(xCoord);
      wr(R10, pv[0]); wr(R10 + 4, pv[1]);
      wr(yCoord, getLandscapeBelowVertex(xCoord));
      const ps = projectVertexOntoScreen(xCoord);
      wr(R10 + 8, ps[0]); wr(R10 + 12, ps[1]);
      R10 += 16;
      if (u(pv[1]) >= u(ps[1])) wrB(crashedFlag, 0xFF);
    }
    // part 3-5: the faces
    for (let f = 0; f < obj.nf; f++) {
      const fo = f * 7;
      // MultiplyVectorByMatrix from the blueprint's normal into xVertex (the source is not xVertex itself)
      if (obj.flags & 1) {
        const nx = obj.faces[fo], ny = obj.faces[fo + 1], nz = obj.faces[fo + 2];
        for (let row = 0; row < 3; row++) {
          const m = rotationMatrix + row * 12;
          wr(xVertex + row * 4, (mul(rd(m), nx) + mul(rd(m + 4), ny) + mul(rd(m + 8), nz)) | 0);
        }
      } else { wr(xVertex, obj.faces[fo]); wr(xVertex + 4, obj.faces[fo + 1]); wr(xVertex + 8, obj.faces[fo + 2]); }
      let R1n = rd(yVertex), vis;
      if (!(obj.flags & 1)) { vis = -1; R1n = -1; }
      else vis = getDotProduct(xVertex, xObjectScaled);
      const v1 = obj.faces[fo + 3], v2 = obj.faces[fo + 4], v3 = obj.faces[fo + 5];
      if (R1n < 0 && (obj.flags & 2)) {
        const s = vertexProjected + 8;
        drawTriangleShadowToBuffer([rd(s + v1 * 16), rd(s + v1 * 16 + 4), rd(s + v2 * 16), rd(s + v2 * 16 + 4), rd(s + v3 * 16), rd(s + v3 * 16 + 4)], 0);
      }
      if (vis < 0) {
        let lvl = u((0x80000000 - rd(yVertex)) | 0) >>> 28;
        if (rd(xVertex) < 0) lvl += 1;
        lvl -= 5; if (lvl < 0) lvl = 0;
        const col = obj.faces[fo + 6];
        const r = clamp15(((col >>> 8) & 15) + lvl), g = clamp15(((col >>> 4) & 15) + lvl), b = clamp15((col & 15) + lvl);
        const R8 = Math.imul(colourByte(r, g, b), 0x01010101);
        const s = vertexProjected;
        drawTriangleToBuffer([rd(s + v1 * 16), rd(s + v1 * 16 + 4), rd(s + v2 * 16), rd(s + v2 * 16 + 4), rd(s + v3 * 16), rd(s + v3 * 16 + 4)], R8);
      }
    }
  }

  function drawObjects() {
    const R9start = rd(zCamera) & 0xFF000000;
    let R8 = ((rd(xCamera) & 0xFF000000) - LANDSCAPE_X) | 0;
    wr(xCameraTile, R8);
    let R9 = R9start;
    for (let R7 = TILES_Z; R7 > 0; R7--) {
      R8 = rd(xCameraTile);
      for (let R6 = TILES_X; R6 > 0; R6--) {
        const t = rdB(objectMap + (R8 >>> 24) + (R9 >>> 16));
        if (t !== 0xFF) {
          wrB(objectType, t);
          curObject = objectTypes[t];
          const alt = getLandscapeAltitude(R8, R9);
          if (alt !== SEA_LEVEL) {
            const R0 = (R8 - rd(xCamera)) | 0;
            const R2 = (((R9 - rd(zCamera)) | 0) + LANDSCAPE_Z) | 0;
            const R1 = (alt - rd(yCamera)) | 0;
            if (rdB(objectType) >= 12 && !(rd(mainLoopCount) & 3)) {
              addSmokeParticleToBuffer(R8, (alt - SMOKE_HEIGHT) | 0, R9);
            }
            drawObject(R0, R1, R2, rotationMatrix);
          }
        }
        R8 = (R8 + TILE_SIZE) | 0;
      }
      R9 = (R9 - TILE_SIZE) | 0;
    }
  }

  // ---------------------------------------------------------------- the landscape
  function drawLandscapeAndBuffers() {
    const R3z = rd(zCamera);
    let R9 = R3z & 0xFF000000;
    const R3 = (R3z - R9) | 0;
    wr(zCameraTile, R9);
    const R4x = rd(xCamera);
    let R8 = R4x & 0xFF000000;
    const R4 = (R4x - R8) | 0;
    wr(xCameraTile, R8);
    wr(xLandscapeRow, (landscapeOffset[0] - R4) | 0);
    wr(xLandscapeRow + 4, landscapeOffset[1]);
    wr(zLandscapeRow, (landscapeOffset[2] - R3) | 0);
    wrB(tileCornerRow, 0);
    let R6 = 0;                      // previous row's corner store (0 = none)
    let R7 = cornerStore1;           // this row's corner store
    wrB(tileRowOddEven, 0);
    for (;;) {
      const row = rdB(tileCornerRow);
      let R10 = landscapeConfig[row * 2 + 1];
      wrB(unusedConfig, landscapeConfig[row * 2]);
      for (let i = 0; i < 12; i += 4) wr(xLandscapeCol + i, rd(xLandscapeRow + i));
      R8 = (rd(xCameraTile) - LANDSCAPE_X) | 0;
      wr(previousColumn, 0x80000000 | 0);
      for (;;) {
        const alt = getLandscapeAltitude(R8, R9);
        wr(yLandscapeCol, (alt - rd(yCamera)) | 0);
        if (rd(xLandscapeCol + 8) >= 0) {            // (ProjectVertexOntoScreen's C set: behind the camera)
          const [R0, R1] = projectVertexOntoScreen(xLandscapeCol);
          wr(R7, R0); wr(R7 + 4, R1); R7 += 8;
          if (R6 !== 0) {
            const R2 = rd(R6), R3b = rd(R6 + 4); R6 += 8;
            if (R2 === (0x80000000 | 0)) R6 = 0;
            else {
              const R4p = rd(previousColumn), R5p = rd(previousColumn + 4), R6p = rd(previousColumn + 8), R7p = rd(previousColumn + 12);
              wr(previousColumn, R0); wr(previousColumn + 4, R1); wr(previousColumn + 8, R2); wr(previousColumn + 12, R3b);
              if (R4p !== (0x80000000 | 0)) {
                const R8c = getLandscapeTileColour();
                drawTriangle(R0, R1, R2, R3b, R4p, R5p, R8c);       // DrawQuadrilateral
                drawTriangle(R2, R3b, R4p, R5p, R6p, R7p, R8c);
              }
            }
          }
        }
        R10--;
        if (R10 === 0) break;
        wr(xLandscapeCol, (rd(xLandscapeCol) + TILE_SIZE) | 0);
        R8 = (R8 + TILE_SIZE) | 0;
      }
      // part 3
      const r = rdB(tileCornerRow);
      if (r - 2 >= 0) drawGraphicsBuffer(r - 2);
      const next = r + 1;
      if (next === TILES_Z) break;
      wrB(tileCornerRow, next);
      wr(zLandscapeRow, (rd(zLandscapeRow) - TILE_SIZE) | 0);
      R9 = (R9 - TILE_SIZE) | 0;
      wr(R7, 0x80000000 | 0);
      const oe = rdB(tileRowOddEven) ^ 1;
      wrB(tileRowOddEven, oe);
      if (oe) { R6 = cornerStore1; R7 = cornerStore2; } else { R6 = cornerStore2; R7 = cornerStore1; }
    }
    drawGraphicsBuffer(TILES_Z - 2);
    drawGraphicsBuffer(TILES_Z - 1);
  }

  // ---------------------------------------------------------------- drawing
  function drawHorizontalLine(a, len, colour) {
    stats.lines++; stats.pixels += len;
    const c = colour & 0xFF;
    if (u(len) < 18) { for (let i = len - 1; i >= 0; i--) scr[a + i] = c; return; }
    // aligned words (the first unconditionally), then the odd bytes
    const end = a + len;
    scr.fill(c, a, end);
  }

  /** the slope of an edge: 65536 * dx / dy, from the division table for small values */
  function slope(dx, dy) {
    if (u(dx) < 64 && u(dy) < 64) return divT[dx * 64 + dy];
    stats.divs++;
    return divLoop(dx, u(dy << 16), 0x80000000);
  }

  function drawTriangle(R0, R1, R2, R3, R4, R5, R8) {
    let t;
    stats.tris++;
    if (!(u(R0) < 320 && u(R1) < 239 && u(R2) < 320 && u(R3) < 239 && u(R4) < 320 && u(R5) < 239)) { drawClippedTriangle(R0, R1, R2, R3, R4, R5, R8); return; }
    let R12 = screenAddr;
    if (u(R1) < u(R3)) { t = R0; R0 = R2; R2 = t; t = R1; R1 = R3; R3 = t; }
    if (u(R1) < u(R5)) { t = R0; R0 = R4; R4 = t; t = R1; R1 = R5; R5 = t; }
    if (u(R3) < u(R5)) { t = R2; R2 = R4; R4 = t; t = R3; R3 = R5; R5 = t; }
    R12 += R1 * 320;
    let R6, R7, R9, R14, R10, R11;
    R9 = (R1 - R3) | 0;
    if (R9 === 0) {
      // part 5: the top edge is horizontal
      R9 = (R3 - R5) | 0;
      if (R9 === 0) return;
      R14 = (R0 - R4) | 0; if (R14 < 0) R14 = (R4 - R0) | 0;
      R6 = slope(R14, R9); if (((R4 - R0) | 0) < 0) R6 = -R6 | 0;
      R9 = (R3 - R5) | 0;
      R14 = (R2 - R4) | 0; if (R14 < 0) R14 = (R4 - R2) | 0;
      R7 = slope(R14, R9); if (((R4 - R2) | 0) < 0) R7 = -R7 | 0;
      R9 = (R3 - R5) | 0;
      let R4a = (R0 << 16) | 0x8000, R5a = (R2 << 16) | 0x8000;
      if (u(R4a) >= u(R5a)) { t = R6; R6 = R7; R7 = t; t = R4a; R4a = R5a; R5a = t; }
      spans(R4a, R5a, R6, R7, R9, R12, R8);
      return;
    }
    // parts 2-3: the slopes from the top vertex
    R14 = (R2 - R0) | 0; if (R14 < 0) R14 = (R0 - R2) | 0;
    R6 = slope(R14, R9); if (((R2 - R0) | 0) < 0) R6 = -R6 | 0;
    R9 = (R1 - R5) | 0;
    R14 = (R4 - R0) | 0; if (R14 < 0) R14 = (R0 - R4) | 0;
    R7 = slope(R14, R9); if (((R4 - R0) | 0) < 0) R7 = -R7 | 0;
    // part 4: the upper part
    R9 = (R1 - R3) | 0;
    let R4a = (R0 << 16) | 0x8000, R5a = R4a;
    if (R6 > R7) { t = R6; R6 = R7; R7 = t; }
    do {
      R4a = (R4a + R6) | 0; R5a = (R5a + R7) | 0;
      R11 = R12 + (R4a >>> 16);
      R10 = ((R5a >>> 16) - (R4a >>> 16)) | 0;
      if (R10 >= 0) drawHorizontalLine(R11, R10, R8);
      R12 -= 320;
      R9 = (R9 - 1) | 0;
    } while (R9 !== 0);
    // the lower part
    const X = R4, Y = R5;
    R9 = (R3 - Y) | 0;
    if (R9 === 0) return;
    R14 = (X - R2) | 0; if (R14 < 0) R14 = (R2 - X) | 0;
    R11 = slope(R14, R9); if (((X - R2) | 0) < 0) R11 = -R11 | 0;
    R9 = (R3 - Y) | 0;
    R14 = (R2 - (R4a >>> 16)) | 0;
    R10 = R14 !== 0 ? (R2 - (R5a >>> 16)) | 0 : 0;
    if (R14 !== 0 && R10 !== 0) {
      if (R10 < 0) R10 = -R10 | 0;
      if (R14 < 0) R14 = -R14 | 0;
      if (u(R14) >= u(R10)) R6 = R11; else R7 = R11;
    } else if (R2 === (R4a >>> 16)) { R6 = R11; R4a = (R4a & ~0xFFFF) | 0x8000; }
    else { R7 = R11; R5a = (R5a & ~0xFFFF) | 0x8000; }
    spans(R4a, R5a, R6, R7, R9, R12, R8);
  }
  /** trin14: R9 horizontal lines upwards from R12 */
  function spans(R4, R5, R6, R7, R9, R12, R8) {
    do {
      R4 = (R4 + R6) | 0; R5 = (R5 + R7) | 0;
      const R10 = ((R5 >>> 16) - (R4 >>> 16)) | 0;
      if (R10 >= 0) drawHorizontalLine(R12 + (R4 >>> 16), R10, R8);
      R12 -= 320;
      R9 = (R9 - 1) | 0;
    } while (R9 !== 0);
  }

  /** DrawTriangle parts 6-11: a triangle partly off screen, clipped line by line */
  function drawClippedTriangle(R0, R1, R2, R3, R4, R5, R8) {
    let t;
    if (u(R1) >= 239 && u(R3) >= 239 && u(R5) >= 239) return;
    if (u(R0) >= 320 && u(R2) >= 320 && u(R4) >= 320) return;
    if (!(R1 > R3)) { t = R0; R0 = R2; R2 = t; t = R1; R1 = R3; R3 = t; }
    if (!(R1 > R5)) { t = R0; R0 = R4; R4 = t; t = R1; R1 = R5; R5 = t; }
    if (!(R3 > R5)) { t = R2; R2 = R4; R4 = t; t = R3; R3 = R5; R5 = t; }
    const st = { R4: 0, R5: 0, R6: 0, R7: 0, R11: R1 };
    let R9, R14, R10, R12;
    R9 = (R1 - R3) | 0;
    if (R9 === 0) {
      // part 10
      R9 = (R3 - R5) | 0;
      if (R9 === 0) return;
      R14 = (R0 - R4) | 0; if (R14 < 0) R14 = (R4 - R0) | 0;
      st.R6 = slope(R14, R9); if (((R4 - R0) | 0) < 0) st.R6 = -st.R6 | 0;
      R9 = (R3 - R5) | 0;
      R14 = (R2 - R4) | 0; if (R14 < 0) R14 = (R4 - R2) | 0;
      st.R7 = slope(R14, R9); if (((R4 - R2) | 0) < 0) st.R7 = -st.R7 | 0;
      R9 = (R3 - R5) | 0;
      st.R4 = (R0 << 16) | 0x8000; st.R5 = (R2 << 16) | 0x8000;
      if (st.R4 > st.R5) { t = st.R6; st.R6 = st.R7; st.R7 = t; t = st.R4; st.R4 = st.R5; st.R5 = t; }
      clippedSpans(st, R9, R8);
      return;
    }
    // part 7
    R14 = (R2 - R0) | 0; if (R14 < 0) R14 = (R0 - R2) | 0;
    st.R6 = slope(R14, R9); if (((R2 - R0) | 0) < 0) st.R6 = -st.R6 | 0;
    R9 = (R1 - R5) | 0;
    R14 = (R4 - R0) | 0; if (R14 < 0) R14 = (R0 - R4) | 0;
    st.R7 = slope(R14, R9); if (((R4 - R0) | 0) < 0) st.R7 = -st.R7 | 0;
    // part 8
    R9 = (R1 - R3) | 0;
    st.R4 = (R0 << 16) | 0x8000; st.R5 = st.R4;
    if (st.R6 > st.R7) { t = st.R6; st.R6 = st.R7; st.R7 = t; }
    clippedSpans(st, R9, R8);
    const X = R4, Y = R5;
    R9 = (R3 - Y) | 0;
    if (R9 === 0) return;
    R14 = (X - R2) | 0; if (R14 < 0) R14 = (R2 - X) | 0;
    R12 = slope(R14, R9); if (((X - R2) | 0) < 0) R12 = -R12 | 0;
    // part 9
    R9 = (R3 - Y) | 0;
    R14 = (R2 - (st.R4 >> 16)) | 0;
    R10 = R14 !== 0 ? (R2 - (st.R5 >> 16)) | 0 : 0;
    if (R14 !== 0 && R10 !== 0) {
      if (R10 < 0) R10 = -R10 | 0;
      if (R14 < 0) R14 = -R14 | 0;
      if (u(R14) >= u(R10)) st.R6 = R12; else st.R7 = R12;
    } else if (R2 === (st.R4 >> 16)) { st.R6 = R12; st.R4 = (st.R4 & ~0xFFFF) | 0x8000; }
    else { st.R7 = R12; st.R5 = (st.R5 & ~0xFFFF) | 0x8000; }
    clippedSpans(st, R9, R8);
  }
  /** trin45: R9 lines from line st.R11 upwards, each clipped to the screen */
  function clippedSpans(st, R9, R8) {
    if (u(R9) >= 256) return;
    const R12 = screenAddr;
    do {
      stats.rows++;
      st.R4 = (st.R4 + st.R6) | 0; st.R5 = (st.R5 + st.R7) | 0;
      if (st.R11 < 0) return;
      if (u(st.R11) < 239) {
        let R11 = R12 + st.R11 * 320;
        const R4 = st.R4, R5 = st.R5;
        if (((R4 - 0x01400000) | 0) < 0 && R5 >= 0) {
          let R0;
          if (R4 >= 0) { R0 = R4 >>> 16; R11 += R4 >>> 16; } else R0 = 0;
          const R10 = u(R5) < 0x01400000 ? ((R5 >>> 16) - R0) | 0 : (320 - R0) | 0;
          if (R10 >= 0) drawHorizontalLine(R11, R10, R8);
        }
      }
      st.R11 = (st.R11 - 1) | 0;
      R9 = (R9 - 1) | 0;
    } while (R9 !== 0);
  }

  // ---------------------------------------------------------------- score bar and screen banks
  function printCurrentScore() {
    const R0 = rd(currentScore);
    if (u(R0) >= 1024) wr(gravity, 0x50000);
    if (u(R0) >= 1488) wr(gravity, 0x70000);
    const n = binaryToDecimal(R0, stringBuffer);
    vdu(30, 10);
    for (let i = 0; i < n; i++) os.writeC(B[stringBuffer + i]);
    vdu(32, 32);
  }
  function printScoreInBothBanks(R0, col, row) {
    const n = binaryToDecimal(R0, stringBuffer);
    vdu(31, col, row);
    os.osByte(112, 1, 0);
    for (let i = 0; i < n; i++) os.writeC(B[stringBuffer + i]);
    os.osByte(112, 2, 0);
    vdu(31, col, row);
    for (let i = 0; i < n; i++) os.writeC(B[stringBuffer + i]);
  }
  function drawFuelLevel() {
    let R1 = (rd(fuelLevel) - rdB(fuelBurnRate)) | 0;
    if (R1 < 0) R1 = 0;
    wr(fuelLevel, R1);
    for (let row = 1; row <= 3; row++) drawHorizontalLine(screenAddr + row * 320, R1 >>> 4, fuelBarColour);
  }
  async function switchScreenBank() {
    screenBankNumber ^= 1;
    screenAddr = screenBankNumber ? screenBank2Addr : screenBank1Addr;
    const bank = screenBankNumber === 0 ? 1 : 2;
    os.osByte(113, bank, 0);
    os.osByte(112, bank, 0);
    await os.vsync();
    scr = os.screen();
    scr.fill(0, screenAddr, screenAddr + 0x12C00);
  }

  // ---------------------------------------------------------------- the player
  function moveAndDrawPlayer() {
    const ms = os.mouse();
    let R0 = ms.x | 0, R1 = ms.y | 0;
    wrB(fuelBurnRate, ms.buttons & 0xFF);
    if (rd(fuelLevel) === 0) wrB(fuelBurnRate, 0);
    if (u(R0) >= 1024) R0 = 1023;
    R0 = (R0 - 512) | 0;
    R1 = (((1024 - R1) | 0) - 512) | 0;
    R0 = R0 << 22; R1 = R1 << 22;
    let [dist, angle] = getMouseInPolarCoordinates(R0, R1);
    if (u(dist) >= 0x40000000) dist = 0x3FFFFFFF;
    dist = dist << 1;
    const R2 = rd(shipPitch), R3 = rd(shipDirection);
    let R4 = (R3 - angle) | 0;
    if (R4 < 0) { if (cmnLO(R4, 0x30000000)) R4 = ~0x30000000; } else if (u(R4) >= 0x30000000) R4 = 0x30000000;
    let R5 = (R2 - dist) | 0;
    if (R2 <= dist) { if (cmnLO(R5, 0x30000000)) R5 = ~0x30000000; } else if (u(R5) >= 0x30000000) R5 = 0x30000000;
    const pitch = (R2 - (R5 >> 1)) | 0, dir = (R3 - (R4 >> 1)) | 0;
    wr(shipPitch, pitch); wr(shipDirection, dir);
    calculateRotationMatrix(pitch, dir);
    // part 2: thrust, friction and gravity
    let x = rd(xPlayer), y = rd(yPlayer), z = rd(zPlayer), vx = rd(xVelocity), vy = rd(yVelocity), vz = rd(zVelocity);
    if (((y + HIGHEST_ALTITUDE) | 0) < 0 !== (((y ^ ~HIGHEST_ALTITUDE) & (y ^ ((y + HIGHEST_ALTITUDE) | 0))) < 0)) wrB(fuelBurnRate, rdB(fuelBurnRate) & ~6);
    const R6 = rd(xRoofV), R7 = rd(yRoofV), R8 = rd(zRoofV);
    const burn = rdB(fuelBurnRate);
    vx = (vx - (vx >> 6)) | 0; if (burn & 4) vx = (vx - (R6 >> 11)) | 0; x = (x + vx) | 0;
    vy = (vy - (vy >> 6)) | 0; if (burn & 4) vy = (vy - (R7 >> 11)) | 0; y = (y + vy) | 0;
    vz = (vz - (vz >> 6)) | 0; if (burn & 4) vz = (vz - (R8 >> 11)) | 0; z = (z + vz) | 0;
    if (burn & 2) { vx = (vx - (R6 >> 13)) | 0; vy = (vy - (R7 >> 13)) | 0; vz = (vz - (R8 >> 13)) | 0; }
    vy = (vy + rd(gravity)) | 0;
    wr(xPlayer, x); wr(yPlayer, y); wr(zPlayer, z); wr(xVelocity, vx); wr(yVelocity, vy); wr(zVelocity, vz);
    wr(xExhaust, R6); wr(xExhaust + 4, R7); wr(xExhaust + 8, R8);
    // part 3: the camera, collisions with objects and the ground, and drawing the ship
    let yc = y >= 0 ? 0 : y;
    wr(xCamera, x); wr(yCamera, yc); wr(zCamera, (z + CAMERA_PLAYER_Z) | 0);
    const gx = x, gz = z;
    let ground = (getLandscapeAltitude(gx, gz) - UNDERCARRIAGE_Y) | 0;
    let yp = rd(yPlayer);
    const h = (ground - yp) | 0;
    if (u(h) < SAFE_HEIGHT) {
      const t = rdB(objectMap + (gx >>> 24) + ((gz & 0xFF000000) >>> 16));
      if (t !== 0 && t < 12) throw LOSE_LIFE;
    }
    if (yp > ground) yp = landOnLaunchpad(yp);
    if (yp < 0) yp = 0;
    curObject = objectPlayer;
    drawObject(0, yp, LANDSCAPE_Z_MID, rotationMatrix);
    if (rdB(crashedFlag) !== 0) throw LOSE_LIFE;
    // part 4: exhaust
    const R10 = rdB(fuelBurnRate);
    if (R10 & 6) {
      const evx = rd(xVelocity), evy = rd(yVelocity), evz = rd(zVelocity);
      const ex = rd(xExhaust), ey = rd(xExhaust + 4), ez = rd(xExhaust + 8);
      const a3 = ((evx + (ex >> 7)) | 0) >> 1, a4 = ((evy + (ey >> 7)) | 0) >> 1, a5 = ((evz + (ez >> 7)) | 0) >> 1;
      const px = ((((rd(xPlayer) - a3) | 0) + (ex >> 7)) | 0), py = ((((rd(yPlayer) - a4) | 0) + (ey >> 7)) | 0), pz = ((((rd(zPlayer) - a5) | 0) + (ez >> 7)) | 0);
      const n = (R10 & 4) ? 8 : 2;
      for (let i = 0; i < n; i++) addExhaustParticleToBuffer(px, py, pz, a3, a4, a5, 8, 0x001D0000, 10, 29);
    }
    // part 5: firing
    if (R10 & 1) {
      wr(currentScore, (rd(currentScore) - 1) | 0);
      const nx = rd(xNoseV), ny = rd(yNoseV), nz = rd(zNoseV);
      const b3 = (rd(xVelocity) + (nx >> 8)) | 0, b4 = (rd(yVelocity) + (ny >> 8)) | 0, b5 = (rd(zVelocity) + (nz >> 8)) | 0;
      const bx = (((rd(xPlayer) - b3) | 0) + (nx >> 7)) | 0, by = (((rd(yPlayer) - b4) | 0) + (ny >> 7)) | 0, bz = (((rd(zPlayer) - b5) | 0) + (nz >> 7)) | 0;
      addBulletParticleToBuffer(bx, by, bz, b3, b4, b5, 20, 0x01BC00FF);
    }
  }

  /** LandOnLaunchpad: returns the ship's y; throws LOSE_LIFE if it hit the ground off the launchpad */
  function landOnLaunchpad(yp) {
    const x = rd(xPlayer), z = rd(zPlayer);
    if (!(u(x) < LAUNCHPAD_SIZE && u(z) < LAUNCHPAD_SIZE)) throw LOSE_LIFE;
    const ab = (v) => (v < 0 ? -v | 0 : v);
    const speed = (ab(rd(xVelocity)) + ab(rd(yVelocity)) + ab(rd(zVelocity))) | 0;
    if (u(speed) >= LANDING_SPEED) return yp;
    const f = (rd(fuelLevel) + 0x20) | 0;
    if (u(f) < 0x1400) wr(fuelLevel, f);
    wr(xVelocity, 0); wr(yVelocity, 0); wr(zVelocity, 0);
    wr(yPlayer, LAUNCHPAD_Y);
    return LAUNCHPAD_Y;
  }

  // ---------------------------------------------------------------- the main loop
  function placeObjectsOnMap() {
    B.fill(0xFF, objectMap, objectMap + 0x10000);
    for (let R5 = 2048; R5 >= 0; R5--) {
      const [R0] = getRandomNumbers();
      const R8 = R0, R9 = R0 << 8;
      const alt = getLandscapeAltitude(R8, R9);
      if (alt === SEA_LEVEL || alt === LAUNCHPAD_ALTITUDE) continue;
      B[objectMap + (R8 >>> 24) + ((R9 & 0xFF000000) >>> 16)] = (R0 & 7) + 1;
    }
    B[objectMap + 0x0107] = LAUNCHPAD_OBJECT;
    B[objectMap + 0x0307] = LAUNCHPAD_OBJECT;
    B[objectMap + 0x0507] = LAUNCHPAD_OBJECT;
  }
  function placePlayerOnLaunchpad() {
    printScoreInBothBanks(rd(remainingLives), 30, 1);
    wr(playingGame, -1);
    wr(xCamera, 0); wr(zCamera, 0); wr(shipDirection, 0); wr(shipPitch, 1);
    wr(xPlayer, LAUNCHPAD_SIZE / 2); wr(yPlayer, LAUNCHPAD_Y); wr(zPlayer, LAUNCHPAD_SIZE / 2);
    wr(xVelocity, 0); wr(yVelocity, 0); wr(zVelocity, 0);
    os.mouseTo(511, 511);                          // ResetMousePosition (OS_Word 21,3)
  }
  function drawWorld() {
    drawObjects();
    addTerminatorsToBuffers();
    drawLandscapeAndBuffers();
  }
  /** one pass of the main loop; false when Escape was pressed */
  async function mainLoopFrame() {
    if (os.escape()) return false;
    moveAndDrawPlayer();
    const c = rd(mainLoopCount) << 24;
    calculateRotationMatrix(c, c << 1);
    dropRocksFromTheSky();
    moveAndDrawParticles();
    drawWorld();
    printCurrentScore();
    drawFuelLevel();
    await switchScreenBank();
    wr(mainLoopCount, (rd(mainLoopCount) + 1) | 0);
    return true;
  }
  /** LoseLife: the crash animation; true if there are lives left */
  async function loseLife() {
    wr(playingGame, 0);
    wr(crashLoopCount, 30);
    addExplosionToBuffer(rd(xPlayer), (rd(yPlayer) - CRASH_CLOUD_Y) | 0, rd(zPlayer), 81);
    for (;;) {
      const c = rd(mainLoopCount) << 24;
      calculateRotationMatrix(c, c << 1);
      moveAndDrawParticles();
      drawWorld();
      printCurrentScore();
      await switchScreenBank();
      wr(mainLoopCount, (rd(mainLoopCount) + 1) | 0);
      const n = (rd(crashLoopCount) - 1) | 0;
      wr(crashLoopCount, n);
      if (n < 0) break;
    }
    const lives = (rd(remainingLives) - 1) | 0;
    wr(remainingLives, lives);
    return lives !== 0;
  }
  async function gameOver() {
    const msg = 'GAME OVER - press a key to start again';
    os.osByte(112, 1, 0); vdu(31, 1, 16); writeS(msg);
    os.osByte(112, 2, 0); vdu(31, 1, 16); writeS(msg);
    await os.readC();
  }

  async function run() {
    // Entry
    vdu(22, 15);
    os.osByte(4, 1, 0);
    initialiseParticleData();
    vdu(22, 13);
    writeS('Lander Demo/Practice (C) D.J.Braben 1987');
    await switchScreenBank();
    vdu(22, 128 + 13);
    vdu(23, 1, 0, 0, 0, 0, 0, 0, 0, 0);
    writeS('Lander Demo/Practice (C) D.J.Braben 1987');
    wr(currentScore, initialScore);
    wr(highScore, initialHighScore);
    for (;;) {
      // StartNewGame
      let hs = rd(highScore);
      const cs = rd(currentScore);
      if (cs >= hs) { hs = cs; wr(highScore, hs); }
      printScoreInBothBanks(hs, 35, 1);
      wr(currentScore, initialScore);
      wr(fuelLevel, initialFuelLevel);
      wr(gravity, 0x30000);
      wr(remainingLives, 3);
      placeObjectsOnMap();
      for (;;) {
        placePlayerOnLaunchpad();
        let crashed = false;
        try {
          for (;;) {
            if (!(await mainLoopFrame())) {
              // EndGame
              os.osByte(126, 0, 0);
              vdu(22, 0);
              os.osByte(4, 0, 0);
              return;
            }
          }
        } catch (e) {
          if (e !== LOSE_LIFE) throw e;
          crashed = true;
        }
        if (crashed && !(await loseLife())) break;
      }
      await gameOver();
    }
  }

  return { run, stats, workspace: W, get screenAddr() { return screenAddr; } };
}
