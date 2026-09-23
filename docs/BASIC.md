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
| `sound.js` | SOUND/ENVELOPE via Web Audio |
| `keymap.js` / `memfs.js` | browser key mapping / small in-memory filing system (demo & tests) |

## Host interface

```js
import { BasicMachine } from './src/basic/machine.js';
import { VDU } from './src/basic/vdu.js';
import { Sound } from './src/basic/sound.js';

const vdu = new VDU({ canvas, mode: 28, onBell: () => sound.bell() });  // canvas optional (headless)
const m = new BasicMachine({
  vdu,                 // VDU instance; omit for text-only (use onOutput)
  fs,                  // filing system (see below)
  sound,               // Sound instance or null
  oscli,               // async (cmd, machine) => true if the host handled the * command
  swiHandlers,         // { 'Wimp_Poll': fn, 0x400C7: fn, ... } extra SWIs (see SWIs)
  onExit,              // (codeOrError) => void on QUIT / OS_Exit / ERROR EXT
  onOutput,            // (byte) => void, every byte written to the VDU stream (TaskWindow, tests)
  onEdit,              // async (programText) => newText|null  for EDIT / TWIN
  sysvars,             // Map of system variables shared with the host (e.g. 'SciCalc$Dir')
  page, himem,         // defaults &8F00 / &A8000 (640K wimpslot -> 651516 bytes free)
  memSize,             // default 4MB (0..&3FFFFF)
  seed, sliceMs,       // RND seed (tests); time slice before yielding (default 12ms)
});

await m.start();              // banner + ">" prompt loop (resolves after QUIT)
await m.load(bytesOrText);    // tokenised image (Uint8Array) or text (with/without line numbers)
await m.run();                // RUN; resolves when the program stops
await m.immediate('PRINT 2^8'); // one line as typed at ">" (numbered lines are inserted)
m.stop();                     // Escape
m.keyPress(code);             // a character (RISC OS code: 13 Return, 127 Delete, &88-&8B cursors, &87 Copy…)
m.keyDown(n); m.keyUp(n);     // physical key state for INKEY(-n-1) (RISC OS internal key numbers)
m.escape();                   // Escape condition
m.setMouse(x, y, buttons);    // OS units; buttons 4 Select, 2 Menu, 1 Adjust
m.registerSwi(nameOrNum, fn); // add/override a SWI
m.interp                      // the interpreter (lines, variables, …) for debugging
```

The machine never blocks: it runs the program in slices (≈12ms) and yields
(MessageChannel/setImmediate). GET, INKEY(n), INPUT, WAIT, SOUND queue-full, file opens and any SWI
that returns a Promise suspend the program until they resolve. `keyboard/keymap.js` shows how the
demo maps browser events (`keyCode(e, machine.fx4)`, `internalKey(e)`).

Rendering is the host's job: call `vdu.render()` each animation frame (cheap when nothing changed).
`vdu.displayWidth/Height` give the aspect-correct CSS size of the current mode.

### Filing system (`fs`)

All methods may be async; paths are passed through after GSTrans (`<Obey$Dir>`, `<SciCalc$Dir>` …),
e.g. `ADFS::HardDisc4.$.Apps.!SciCalc.Messages`. Only `readFile`/`writeFile` are required.

```js
readFile(path)  -> {data: Uint8Array, type: filetype} | null
writeFile(path, data, filetype)
stat?(path)     -> {type:'file'|'dir', filetype, length} | null   (OS_File 5)
list?(dir)      -> [{name, type:'file'|'dir', filetype, length}]  (*CAT, OS_GBPB 9-12)
delete?(path) rename?(a,b) mkdir?(path) setDir?(path)
```
Open files (OPENIN/OPENUP) are read whole into memory; writes are flushed on CLOSE#.
`memfs.js` is a reference implementation (case-insensitive, optional localStorage).

### SWIs

`SYS` (by name or number, with `X` prefix), ARM `SWI` instructions and BASIC internals share one table.
A handler is `fn(r, machine, ctx)`: `r` is an array of R0–R9 (modify in place), `ctx.flags` holds the
returned NZCV (N=8 Z=4 C=2 V=1). Throw a `BasicError(number, message)` (from `errors.js`) to fail: for
non-X SWIs it becomes a BASIC error, for X SWIs R0 → error block and V is set. Return a Promise to
suspend the program (this is how `Wimp_Poll` should give control back to the desktop).
String arguments to SYS are copied into memory and passed as pointers; string outputs (`TO a$`) are
read from the returned pointer. Parameter blocks live in the flat memory (`machine.mem`:
`rd8/rd32/wr8/wr32/rdStr0/wrStr0/rdStrCR/…`); use `machine.sysAlloc(n)` for OS-owned memory (RMA,
&300000–&3EFFFF) and `machine.sysString(s)` for short-lived strings.

Implemented: OS_WriteC/Write0/WriteN/NewLine/ReadC/ReadLine/CLI/Byte/Word/File/Find/Args/BGet/BPut/
GBPB/GetEnv/Exit/Mouse/ReadUnsigned/ReadVarVal/SetVarVal/GSTrans/BinaryToDecimal/GenerateError/
ReadEscapeState/ReadPalette/ReadVduVariables/ReadPoint/ReadModeVariable/SWINumberTo/FromString/
ReadMonotonicTime/Plot/ScreenMode/CheckModeValid/ReadSysInfo/SetColour/Heap/Module/ReadArgs/
Convert* /ConvertDateAndTime/PrettyPrint, OS_WriteI, ColourTrans_SetGCOL/SetTextColour/ReturnGCOL/
ReturnColourNumber…, Sound_*, Hourglass_* (no-op), Territory_Number. Wimp_*, MessageTrans_*,
Font_*, OS_SpriteOp etc. are for the host to register.

## What is implemented

* **Programs**: tokeniser identical to BASIC's MATCH (99.6% of the 173k lines in the 514 ,ffb files
  in vendor re-tokenise byte-identically; the rest are "crunched" programs whose keyword packing
  cannot be typed); images load/save byte-exactly. Immediate mode with `>` prompt, AUTO, DELETE,
  RENUMBER, LIST [range] [IF], LISTO 0-31, NEW, OLD, RUN, CHAIN, LOAD, SAVE, TEXTLOAD, TEXTSAVE[O],
  APPEND, INSTALL, LIBRARY, OVERLAY, LVAR, HELP (original texts), EDIT/TWIN (host hand-off), QUIT,
  TRACE ON/OFF/n/PROC/STEP/TO/CLOSE, CRUNCH (accepted, no-op).
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
  END=, STOP, SWAP, OSCLI and *commands, SYS … TO …;flags, CALL/USR (with parameter list) and
  BBC MOS emulation (CALL &FFEE etc.), MOUSE (and ON/OFF/TO/STEP/RECTANGLE/COLOUR), POINT(), TINT(),
  POINT TO, ADVAL, VDU (`,` `;` `|`), MODE (number or string), PAGE/LOMEM/HIMEM/TOP/END pseudo-vars.
* **Errors**: exact messages and numbers; default handler prints `<msg> at line <n>` (or, in
  immediate mode, a blank line then the message) as BASICTrans does.
* **Assembler**: all BASIC V mnemonics/conditions/shifts, ADR, EQUB/W/D/S, DCB/W/D, `=`, `&`, ALIGN,
  OPT 0-15 (listing format as the original, errors, O% offset assembly, L% limit), labels, FN macros,
  forward references in pass 1. **ARM emulator**: ARM2/ARM3 user mode (26-bit PC/PSR, all data
  processing, MUL/MLA, LDR/STR, LDM/STM, SWP, B/BL, SWI through the SWI table, OS_WriteS).
* **VDU**: see the header of `vdu.js` (modes 0-49, all VDU codes and PLOT groups, ECFs, palettes,
  flashing colours, VDU 5 text, copy-key editing, MODE 7 teletext).

## Known gaps

* Reals are IEEE doubles, not 5-byte reals: results agree to the 9-10 printed digits, but a few
  edge cases (e.g. exact accumulated rounding in long FOR loops) may differ in the last place.
* Screen memory is not mapped into the address space (programs poking screen memory directly draw
  nothing); sprite plotting (PLOT &E8+) and OS_SpriteOp are left to the host.
* The program runs from JS line objects (edited via the prompt); a program that modifies its own
  tokenised text in memory at PAGE is not re-read (OLD is supported).
* CRUNCH does nothing; TWIN/EDIT need a host editor (`onEdit`); `*KEY` expansion is not implemented.
* Hoisting of FN calls: FN/GET/INKEY/EVAL/USR/OPENxx are evaluated before the rest of their
  expression, so an FN with side effects on a variable used to its *left* in the same expression
  sees a different order than BASIC (vanishingly rare in practice).
* Coprocessor (FPA) instructions in ARM code give "Undefined instruction".

## Tests

`node --test tests/basic/` (tokeniser incl. all vendor ,ffb files, numbers/PRINT, language, errors,
assembler encodings, ARM execution, files, VDU and graphics pixels, demo programs).
`node tests/basic/screenshot.mjs mandel.bas circles.bas` (with `node serve.mjs` running) saves
Playwright screenshots of the demo page to `tests/screens/`.
Example programs live in `tests/basic/programs/` (listed in `index.json` for the demo page).
