# BBC BASIC V (src/basic/)

A faithful ARM BBC BASIC V **1.16** (RISC OS 3.71) interpreter in plain ES modules, with a RISC OS
VDU driver, an inline ARM assembler and an ARM2/ARM3 emulator. It is host-agnostic: it runs in the
browser on a canvas, headless in node (tests), or inside the desktop (TaskWindow / single tasking).
Reference sources: `vendor/ro371/Sources/Programmer/BASIC` (token tables, errors, semantics),
`Sources/OS_Core/Kernel/s/vdu` (VDU), `Sources/OS_Core/Internat/Messages/UK/Resources/BASIC` (texts).

Standalone page: `src/basic/demo.html` (serve with `node serve.mjs`, open
`http://localhost:8371/src/basic/demo.html`, `?run=mandel.bas` runs an example, `?mode=12` start mode).

## Modules

| file | contents |
|---|---|
| `machine.js` | `BasicMachine` – the host-facing API, OS emulation (OS_Byte/Word, * commands, files, keyboard, time), prompt loop, commands (LIST, SAVE…) |
| `interp.js` | runtime: program store, variables, stack frames, control flow, errors, DATA, PROC/FN |
| `expr.js` / `stmt.js` | compiler: tokenised line → closures (expressions) / micro-ops (statements) |
| `ops.js` | host-facing ops (GET, INKEY, INPUT, SYS, CALL/USR, OPENxx, LIBRARY, OVERLAY) |
| `tokens.js` | token tables, tokeniser (MATCH), detokeniser (LIST/LISTO), program images, RENUMBER |
| `numfmt.js` | number formatting (`@%`, STR$) and reading (VAL, literals) |
| `errors.js` | error numbers/messages (`ErrorMsgs`) |
| `memory.js` | flat little-endian memory (4MB) with `? ! $ |` helpers, 5-byte reals |
| `files.js` | open file handles over the host filing system |
| `swis.js` / `swinames.js` | SWI table (724 names from swis.h) + core OS/ColourTrans/Sound SWIs |
| `assembler.js` / `arm.js` | inline assembler `[ … ]`; ARMv2a (26-bit) CPU for CALL/USR |
| `vdu.js` (+ `vdu-*.js`) | VDU driver (modes 0–49, all PLOT codes, text/graphics windows, teletext) |
| `font8x8.js` / `help.js` | system font (VduFontL1) / HELP texts |
| `sound.js` | `Sound`: the sound statements and Sound_* SWIs on the emulated RISC OS sound system (`src/core/sound/`, docs/SOUND.md) |
| `keymap.js` / `memfs.js` | browser key mapping / small in-memory filing system (demo & tests) |

## Host interface

This is the contract used by `src/core/basichost.js` (*BASIC) and `src/core/basicwimp/` (Wimp bridge).
It is stable: additions only. Anything not listed here is internal and may change.

```js
import { BasicMachine } from './src/basic/machine.js';
import { VDU } from './src/basic/vdu.js';
import { Sound } from './src/basic/sound.js';
import { BasicError } from './src/basic/errors.js';

const vdu = new VDU({
  canvas,              // HTMLCanvasElement/OffscreenCanvas, optional (headless if omitted)
  mode: 28,            // initial mode (default 12)
  onBell: () => sound.bell(),   // VDU 7
  onError: (e) => {},  // {errnum, errmess} for VDU-level errors (e.g. Bad MODE from VDU 22)
  screenMemory,        // bytes of "VRAM" (default 1MB): number of screen banks = max(2, mem / mode size)
  autoRender,          // true: render itself on requestAnimationFrame
});
const m = new BasicMachine({
  vdu,                 // VDU instance; omit for text-only (use onOutput)
  fs,                  // filing system (see below)
  sound,               // Sound instance or null
  oscli,               // async (cmd, machine) => true if the host handled the * command (called first)
  swiHandlers,         // { 'Wimp_Poll': fn, 0x400C7: fn, ... } extra SWIs (see SWIs)
  onExit,              // (codeOrError) => void on QUIT / OS_Exit (code) or ERROR EXT (the BasicError)
  onOutput,            // (byte) => void, every byte written to the VDU stream (TaskWindow, tests)
  onEdit,              // async (programText) => newText|null  for EDIT / TWIN
  onMouseOn, onMouseTo,// MOUSE ON n / MOUSE TO x,y (pointer shape / position requests)
  sysvars,             // Map-like {get,set,has,delete} of system variables shared with the host
  page, himem,         // defaults &8F00 / &A8000 (640K wimpslot -> 651516 bytes free)
  memSize,             // default 4MB (0..&3FFFFF)
  seed, sliceMs,       // RND seed (tests); time slice before yielding (default 12ms)
  opsPerSecond,        // speed limit in BASIC micro-ops/s (0 = unlimited; ~1.5M = ARM7 RiscPC)
});
```

| call | |
|---|---|
| `await m.start({banner, chain})` | interactive: banner + `>` prompt loop; resolves after QUIT. `chain`: file to CHAIN first |
| `await m.load(src)` | tokenised image (Uint8Array) or text (with or without line numbers); clears variables |
| `await m.run()` | RUN; resolves with how it stopped: `{reason:'end'}`, `{reason:'error', error:{number,message,erl}}` (unhandled error, already reported on screen), `{reason:'quit', code}` (QUIT / OS_Exit; `onExit` also called), `{reason:'ext', error}` (ERROR EXT; given to `onExit` instead of being reported), `{reason:'killed'}` |
| `await m.immediate(line)` | one line as typed at `>` (numbered lines are inserted) |
| `m.escape()` / `m.stop()` | Escape condition (trappable by ON ERROR, like the real key) |
| `m.kill()` | stop unconditionally (task killed); pending GET/INPUT/INKEY waits are cancelled. If the program is waiting on a SWI Promise, the host must settle it for `run()` to return |
| `m.keyPress(code)` | a character (RISC OS code: 13 Return, 127 Delete, &88-&8B cursors, &87 Copy, &80+ F keys expand `*KEY`) |
| `m.keyDown(n)` / `m.keyUp(n)` | physical key state for INKEY(-n-1) (RISC OS internal key numbers; 9/10/11 = mouse buttons) |
| `m.setMouse(x, y, buttons)` | OS units; buttons 4 Select, 2 Menu, 1 Adjust |
| `m.registerSwi(key, fn, name?)` | add/override a SWI; `key` = name from swis.h or number; `name` names a number not in swis.h |
| `m.callSwi(num, regs)` / `m.callSwiByName(name, regs)` | call a SWI from JS: `{r, flags}` or a Promise of it |
| `m.writeC(b)`, `m.writeStr(s)`, `m.newLine()`, `m.vduBytes([...])` | write to the VDU stream |
| `m.mem` | flat memory: `rd8/wr8/rd16/wr16/rd32/wr32/rdStr0/wrStr0/rdStrCR/wrStrCR/rdStrCtrl/rdBytes/wrBytes` |
| `m.sysAlloc(n)` / `m.sysString(s)` | OS-owned memory (RMA, &300000-&3EFFFF) / short-lived string in scratch space |
| `m.cmdLine` | string returned by OS_GetEnv (set it to e.g. `BASIC -quit "file" args` before `run()`) |
| `m.busy`, `m.exited`, `m.lastResult`, `m.fx4` | running now; QUIT seen; last `run()` result; OS_Byte 4 cursor-key mode (for `keymap.keyCode`) |
| `m.interp` | the interpreter (`lines`, variables, `escape`, …) - debugging only |

The machine never blocks: it runs the program in slices (≈12ms) and yields (MessageChannel /
setImmediate), also while a program is stuck erroring inside its own error handler. GET, INKEY(n),
INPUT, WAIT, SOUND with a full queue, file operations and any SWI that returns a Promise suspend the
program until they settle. `keymap.js` shows how browser key events map to `keyPress`/`keyDown`
(`keyCode(e, machine.fx4)`, `internalKey(e)`; `keyCode` < -1 means "cursor edit": pass to `vdu.cursorEdit`).

Errors thrown by host code (SWI handlers, `oscli`): throw `new BasicError(number, message)`; a plain
`Error` with a numeric `errnum` (or `number`), or with `riscos: true`, is converted the same way.
Anything else is reported as "Internal error".

### VDU (`vdu.js`)

Rendering is the host's job: call `vdu.render()` each animation frame (cheap when nothing changed).

| member | |
|---|---|
| `render()`, `attachCanvas(canvas)` | paint dirty rows; switch output canvas (null = headless) |
| `writeC(b)`, `write(bytes)`, `plot(k, x, y)` | VDU stream / OS_Plot directly (normally go through the machine) |
| `mode`, `modeVar(n)`, `vduVar(n)` | current mode number; OS_ReadModeVariable / OS_ReadVduVariables values |
| `width`/`W`, `height`/`H` | framebuffer size in pixels |
| `displayWidth`, `displayHeight` | aspect-correct CSS size of the mode (e.g. MODE 12 = 640x512) |
| `xEig`, `yEig`, `orgX`, `orgY`, `gwl/gwb/gwr/gwt` | eigen factors, graphics origin (OS units), graphics window (pixels, internal coords) |
| `fb` | the VDU driver's framebuffer: `Uint8Array(W*H)`, one byte per pixel (colour number 0..NColour or 0..255), row 0 = top. After writing it directly call `invalidate(y0, y1)` (or no args for all) |
| `banks`, `driverBank`, `displayBank`, `maxBanks` | screen banks (OS_Byte 112/113); `fb === banks[driverBank]` |
| `getPixel(px, py)`, `getPixelRGB(px, py)`, `readPoint(x, y)` | displayed pixel / POINT at OS coords |
| `readPalette(l)`, `setPalette(l, r, g, b)` | OS_ReadPalette / VDU 19 |
| `textLines()`, `pos`, `vpos`, `readCharAtCursor()` | screen text (tests, TaskWindow), text cursor |
| `cursorEdit(code)` | copy-key editing (&87 Copy, &88-&8B cursors) |
| `screenStart`, `displayStart`, `totalScreenSize`, `screenIO` | logical screen memory (ends at &2000000); `screenIO` is installed as `m.mem.io` |

Screen memory is mapped: `SYS "OS_ReadVduVariables"` 148/149 give the screen address, and BASIC `?`/`!`,
SWI parameter blocks and ARM code read and write pixels there (packed by the mode's bits per pixel).

### Filing system (`fs`)

All methods may be async; paths are passed through after GSTrans (`<Obey$Dir>`, `<SciCalc$Dir>` …),
e.g. `ADFS::HardDisc4.$.Apps.!SciCalc.Messages`. Only `readFile`/`writeFile` are required.

```js
readFile(path)  -> {data: Uint8Array, type: filetype} | null
writeFile(path, data, filetype)
stat?(path)     -> {type:'file'|'dir', filetype, length, load?, exec?} | null   (OS_File 5/17/23; filetype -1 or load/exec for untyped)
list?(dir)      -> [{name, type:'file'|'dir', filetype, length}]  (*CAT, OS_GBPB 9-12)
delete?(path) rename?(a,b) mkdir?(path) setDir?(path) setType?(path, filetype)   (*SetType, OS_File 18)
```
Open files (OPENIN/OPENUP) are read whole into memory; writes are flushed on CLOSE#.
`memfs.js` is a reference implementation (case-insensitive, optional localStorage).

### SWIs

`SYS` (by name or number, with `X` prefix), ARM `SWI` instructions and BASIC internals share one table.
A handler is `fn(r, machine, ctx)`: `r` is an array of R0–R9 (modify in place), `ctx.flags` holds the
returned NZCV (N=8 Z=4 C=2 V=1), `ctx.x` is true for the X form. Throw a `BasicError(number, message)`
to fail: for non-X SWIs it becomes a BASIC error, for X SWIs R0 → error block and V is set. Return a
Promise to suspend the program (this is how `Wimp_Poll` gives control back to the desktop).
String arguments to SYS are copied into memory and passed as pointers; string outputs (`TO a$`) are
read from the returned pointer. Parameter blocks live in `machine.mem`.

Implemented here: OS_WriteC/Write0/WriteN/NewLine/ReadC/ReadLine/CLI/Byte/Word/File/Find/Args/
BGet/BPut/GBPB/GetEnv/Exit/Mouse/ReadUnsigned/ReadVarVal/SetVarVal/GSTrans/BinaryToDecimal/
GenerateError/ReadEscapeState/ReadPalette/ReadVduVariables/ReadPoint/ReadModeVariable/
SWINumberTo/FromString/ReadMonotonicTime/Plot/ScreenMode/CheckModeValid/ReadSysInfo/SetColour/Heap/
Module/ReadArgs/Convert*/ConvertDateAndTime/PrettyPrint, OS_WriteI, ColourTrans_SetGCOL/
SetTextColour/ReturnGCOL/ReturnColourNumber…, Sound_* (incl. QTempo/QBeat), Hourglass_* (no-op),
Territory_Number. OS_Byte covers 0, 4, 9/10 (flash periods), 15/21, 19, 20/25 (reset font), 106,
112/113/250/251 (screen banks), 117, 124-126, 128-132, 134, 135, 138, 160-165, 200-202, 218, 229; OS_Word 0-2,
7-15, 21. Wimp_*, MessageTrans_*, Font_*, OS_SpriteOp etc. are for the host to register.

## What is implemented

* **Programs**: tokeniser identical to BASIC's MATCH (99.6% of the 173k lines in the 514 ,ffb files
  in vendor re-tokenise byte-identically; the rest are "crunched" programs whose keyword packing
  cannot be typed); images load/save byte-exactly. Immediate mode with `>` prompt, AUTO, DELETE,
  RENUMBER, LIST [range] [IF], LISTO 0-31, NEW, OLD, RUN, CHAIN, LOAD, SAVE, TEXTLOAD, TEXTSAVE[O],
  APPEND, INSTALL, LIBRARY, OVERLAY, LVAR, HELP (original texts), EDIT/TWIN (host hand-off), QUIT,
  TRACE ON/OFF/n/PROC/STEP/TO/CLOSE, CRUNCH n (CRUNCHROUTINE). `*` commands: FX, KEY (F-key
  expansion), SET/SETEVAL/SETMACRO/UNSET/SHOW, ECHO, EXEC, SPOOL[ON], CAT/EX/INFO, DIR/CDIR, DELETE,
  RENAME, COPY, SETTYPE, TYPE/LIST/DUMP, SAVE/LOAD (memory), RUN/CHAIN/`*file`, MODE/WIMPMODE, TIME,
  ERROR, QUIT; the host's `oscli` sees every command first.
* **Language**: integers (32-bit wrap, BASIC's int*int→real rule), reals (JS doubles, printed with
  the 5-byte-real formatting rules; overflow > 1.7E38 gives "Number too big"), strings ≤255,
  arrays (any dims, whole-array `=`, `+ - * /`, `.` matrix multiply, lists, SUM, SUMLEN, MOD, DIM()),
  all operators with BASIC V precedence (non-associative relations), `? ! $ |` indirection (unary and
  dyadic), LET/+=/-=, PRINT (`; , ' TAB SPC ~`, @% G/E/F formats, `@%="+G10.3"`), INPUT/INPUT LINE
  (with `?` rules), IF/THEN/ELSE, block IF/ELSE/ENDIF, CASE/WHEN/OTHERWISE, FOR/NEXT (multiple vars,
  pops inner loops), REPEAT/UNTIL, WHILE/ENDWHILE, GOTO/GOSUB/RETURN/ON…GOTO/GOSUB/PROC…ELSE,
  ON ERROR [LOCAL|OFF], LOCAL ERROR, RESTORE ERROR, ERROR [EXT], ERR/ERL/REPORT/REPORT$, DEF PROC/FN
  (value, RETURN and array parameters, LOCAL incl. arrays, recursion), DATA/READ/RESTORE [n|+n]/
  LOCAL DATA/RESTORE DATA, string functions (LEFT$ MID$ RIGHT$ incl. assignment forms, INSTR,
  STRING$, CHR$, ASC, STR$[~], VAL, EVAL, LEN, GET$[#], INKEY$), maths (all), RND (exact BASIC
  generator: RND, RND(1), RND(0), RND(n), RND(-n)), TIME, TIME$ ("Wed,23 Sep 2026.20:53:00"), POS,
  VPOS, COUNT, WIDTH, BGET/BPUT/OPENIN/OPENOUT/OPENUP/CLOSE/EOF/PTR/EXT/PRINT#/INPUT#, GET, INKEY
  (timeout, negative scan, -256 = &A7), SOUND/ENVELOPE/BEATS/TEMPO/VOICES/VOICE/STEREO, CLEAR, END,
  END=, STOP, SWAP, OSCLI and *commands, QUIT (no argument in 1.16), WAIT (no argument in 1.16), SYS … TO …;flags, CALL/USR (with parameter list) and
  BBC MOS emulation (CALL &FFEE etc.), MOUSE (and ON/OFF/TO/STEP/RECTANGLE/COLOUR), POINT(), TINT(),
  POINT TO, ADVAL, VDU (`,` `;` `|`), MODE (number or string), PAGE/LOMEM/HIMEM/TOP/END pseudo-vars.
* **Graphics statements**: MODE, CLS/CLG, COLOUR [n|l,p|l,r,g,b|r,g,b|n TINT t], GCOL [a,]c [TINT t] and
  GCOL [a,]r,g,b (ColourTrans), PLOT, MOVE/DRAW [BY], LINE, POINT [BY|TO], FILL [BY], CIRCLE/ELLIPSE
  [FILL], RECTANGLE [FILL] … [TO x,y] (copy / move), ORIGIN, OFF/ON. (COLOUR OF/ON, GCOL OF and
  RECTANGLE SWAP arrived in later BASICs and are syntax errors, as in 1.16.)
* **Errors**: exact messages and numbers; default handler prints `<msg> at line <n>` (or, in
  immediate mode, a blank line then the message) as BASICTrans does.
* **Assembler**: all BASIC V mnemonics/conditions/shifts, ADR, EQUB/W/D/S, DCB/W/D, `=`, `&`, ALIGN,
  OPT 0-15 (listing format as the original, errors, O% offset assembly, L% limit), labels, FN macros,
  forward references in pass 1. **ARM emulator**: ARM2/ARM3 user mode (26-bit PC/PSR, all data
  processing, MUL/MLA, LDR/STR, LDM/STM, SWP, B/BL, SWI through the SWI table, OS_WriteS).
* **VDU**: see the header of `vdu.js` (modes 0-49, all VDU codes and PLOT groups, ECFs, palettes,
  flashing colours and OS_Byte 9/10, VDU 5 text, copy-key editing, MODE 7 teletext, screen banks
  (OS_Byte 112/113, as many as fit in `screenMemory`), memory-mapped screen, OS_Byte 20/25 font reset).
* **Sound** (with a `Sound`, see docs/SOUND.md): the 3.71 sound system with the ROM voices
  (WaveSynth-Beep, StringLib, Percussion), as the ARM code behaves. SOUND is OS_Word 7, which is
  immediate: a SOUND replaces what its channel is playing, with no queue and no waiting.
  `SOUND …,beat` is Sound_QSchedule on the BEATS/TEMPO bar counter. Channel low nibble 1-8 (H/S
  ignored), `-15..0` and `&100+` log amplitudes, and BBC / 15-bit pitches are supported. ENVELOPE
  and envelope amplitudes do nothing, as OS_Word 8 is unused in 3.71. VOICES (Sound_Configure),
  VOICE (Sound_AttachNamedVoice), STEREO, BEATS/TEMPO/BEAT, SOUND ON/OFF (Sound_Enable), the bell
  (VDU 7) and every Sound_* SWI go to the sound system. *Voices, *ChannelVoice, *Volume, *Sound,
  *Tuning, *Stereo, *Tempo and *QSound work too. Escape silences the sound (OS_Byte 126). The
  scheduler follows the wall clock headless and before the browser allows audio. With
  `sound: null`, SOUND is ignored and BEATS/TEMPO/BEAT are simulated on the clock.

## Known gaps

* Reals are IEEE doubles, not 5-byte reals: results agree to the 9-10 printed digits, but a few
  edge cases (e.g. exact accumulated rounding in long FOR loops) may differ in the last place.
* Sprite plotting (PLOT &E8+) and OS_SpriteOp are left to the host. The screen memory mapping is
  byte-accurate but not an alias of a JS array: `$addr` strings and `CALL` code in screen memory abort.
* The program runs from JS line objects (edited via the prompt); a program that modifies its own
  tokenised text in memory at PAGE is not re-read (OLD is supported).
* TWIN/EDIT need a host editor (`onEdit`). Module * commands (RMLoad, Obey, IF…) are no-ops unless
  the host's `oscli` handles them.
* Hoisting of FN calls: FN/GET/INKEY/EVAL/USR/OPENxx run as separate micro-ops before the rest of
  their expression. Left operands of binary operators are captured before them (so `x+FNinc` and
  `A$=A$+FNread` are evaluated left to right as in BASIC), but earlier *arguments* of a function or
  array subscript are not: `LEFT$(a$,FNchange_a)` reads a$ after the FN ran.
* Coprocessor (FPA) instructions in ARM code give "Undefined instruction".

## Tests

`node --test tests/basic/` (tokeniser incl. all vendor ,ffb files, numbers/PRINT, language, errors,
assembler encodings, ARM execution, files, VDU and graphics pixels, demo programs, and `host.test.mjs`
for the host contract above: run() results, kill(), registerSwi, host errors, banks, screen memory).
`node tests/basic/screenshot.mjs mandel.bas circles.bas` (with `node serve.mjs` running) saves
Playwright screenshots of the demo page to `tests/screens/`.
Example programs live in `src/basic/demos/` (listed in `index.json` for the demo page's Examples menu and
`tools/disc-basicdemos.mjs`, which puts them on the seed disc as `$.Demos.BASIC`; see docs/BASIC_DEMOS.md).
`tests/basic/demos.test.mjs` runs every one headless.
