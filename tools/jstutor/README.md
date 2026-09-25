# Programming in JavaScript — the tutorial's sources

The book `$.Manuals.JSTutor` (read with !Bookworm) and its example programs `$.Examples.JS` are built from here
by `node tools/disc-jstutor.mjs` (part of `tools/build.mjs`). The programs run with `*JSRun`
(`src/core/jsrun.js`): double-click a JSScript file (&F81).

```
book.json          the pages in order: file, num ("1", "A"), title; the cover and contents are generated/wrapped
book/<Page>.htm    each page's body (no <HTML>/<BODY>, navigation, <H1> or footer: the build adds them)
examples/          the programs, exactly as they go on the disc (no extension = JSScript; !Run, !Boot = Obey;
                   !Help, ReadMe = Text; <Name>.sprites.json = a sprite file <Name>, {"spritename": [rows]}
                   drawn with tools/lib/spritewrite.mjs letters)
examplefiles.mjs   reads examples/ (file types, sprite files) for the build and the harness
runs/<Page>.json   how to run each program for the tests and screenshots, one file per chapter (harness.mjs)
pics/<Name>.png    screenshots, made by shots.mjs from the runs with a "shot"
harness.mjs        copies examples/ into the desktop's $.Examples.JS and runs them (tests/jstutor, shots.mjs)
```

Workflow: edit a page or program, then

```sh
node serve.mjs &                        # (if not running)
node tools/jstutor/shots.mjs [Name…]    # screenshots for runs with a "shot" (uses examples/ directly)
node tools/disc-jstutor.mjs --check     # listings exist, lines <= 70, pictures exist, links resolve, Latin-1
node tests/jstutor/examples.mjs         # every example runs cleanly and prints what it should
node tools/disc-jstutor.mjs             # put the book and examples on the disc
node --test tests/jstutor               # all of the tutorial's tests
```

## Directives in page bodies

* `<!--#listing Hello-->` — the program `examples/Hello` as a `<PRE>` listing (`<!--#listing Hello 3-9-->`:
  lines 3–9). Every full program in the book comes from `examples/`, so what readers see is what runs.
* `<!--#pic Hello-->` — `pics/Hello.png`, centred, with its size (`<!--#pic Cover 50%-->` scales it).
* `<H2>` headings get anchors `S1`, `S2`… and appear in the generated Contents page. Link to a section with
  `<A HREF="Chap3.htm#S2">`.

## Style guide

**Readers** have written a little code before — they know what a variable, a loop or an `if` is — but haven't
programmed much. Explain each new idea once, with a small example, before using it. Prefer a concrete program
to an abstract rule. Don't assume they know the web, HTML, Node or the DOM; the book never mentions them except
where JavaScript's origins or the browser's limits need a sentence.

**Voice**: plain, friendly and direct, second person ("you"), like the RISC OS 3.7 User Guide. UK spelling
(colour, centre, initialise, programme only for TV). Short paragraphs. No jokes that date, no exclamation marks
in every paragraph.

**RISC OS conventions** (as the User Guide): the mouse buttons are Select, Menu and Adjust; "click Menu on …";
menu routes as *Menu > Misc > Set type*; keys as Return, Escape, Ctrl-F12, F3; file paths as
`HardDisc4.$.Examples.JS`; "directory" (not folder), "application", "icon bar", "Filer window",
"directory display".

**Each chapter**:

1. One or two sentences on what the chapter covers and what you'll have made by the end.
2. Sections (`<H2>`), each introducing one idea, with `<H3>` subsections where useful. Show a program, show
   what it does (a picture for anything with windows), then explain it — step by step for new ideas.
3. Numbered steps for things to do, as the User Guide writes them (`OL` doesn't number in !Bookworm):
   ```html
   <DL>
   <DT><DD>1  Click Menu on the Edit icon.<P>
   <DT><DD>2  Type <CODE>JSScript</CODE> and press Return.<P>
   </DL>
   ```
4. `<H2>Summary</H2>`: a bulleted list of what was learnt.
5. `<H2>Exercises</H2>`: three to five, easy to harder, numbered by hand in a `DL`; then
   `<H2>Answers</H2>` with short answers or hints (code fragments in `<PRE>`). Longer answers can be extra
   example files (name them `<Program>Ans<n>`, e.g. `GuessAns1`) listed in the chapter's runs without a shot.

**HTML** (what !Bookworm understands; it's HTML 2 with a little 3.2): `P` (as a separator), `BR`, `B`, `I`
(shown upright), `CODE`/`TT`/`KBD`, `H2`–`H4`, `UL`/`LI`, `DL`/`DT`/`DD`, `PRE`, `HR`, `CENTER`, `BLOCKQUOTE`,
`A HREF`/`NAME`, `IMG`. No tables (lay out tables in `<PRE>`), no `OL` numbering, no `FONT`, CSS, scripts or
non-`file:` links. Escape `<`, `>` and `&` as `&lt;` `&gt;` `&amp;`. Latin-1 only: plain `'` and `"`, `-` for
dashes, `...` for an ellipsis. Upper-case tag names, as in the User Guide.

A note or warning:

```html
<P><B>Note</B>: in Edit, Tab lines up with the next word on the line above.<P>
```

**Code**:

* Two-space indent, semicolons, single-quoted strings (template strings with `${…}` once introduced),
  `const` by default and `let` when the value changes; never `var`.
* Lines at most 70 characters (the build checks; !Bookworm doesn't wrap `<PRE>`).
* Programs start with a comment saying what they are: `// Hello - my first program`.
* Plain function declarations until chapter 4 introduces arrow functions; after that use arrows for short
  callbacks (`w.on('click', (ev) => { … })`).
* Scripts (no `import`/`export`) until chapter 11, which introduces modules; chapter 13's game is a module-based
  application directory.
* Only what the book has taught: if a program needs something new, the text explains it.

**What a script has ready to use** (`src/core/jsrun.js`): `task`, `ctx` (`args`, `argv`, `file`, `dir`), `os`,
`wimp`, `vfs`, `print(…)`, `await input(prompt)`, `await sleep(ms)`, `Menu`, `colourMenu`, `wimpColour(n)`,
`beep()`, `sound(channel, amplitude, pitch, duration)`, `saveAs({…})`, `query({…})`, `infoBox(task, info)`.
Modules import the same names from `'riscos'`. The desktop API is in `docs/CORE_API.md`; the book teaches a
subset of it (appendix B lists what).

**Coordinates**: the API's windows use desktop pixels with y increasing *downwards* from the top-left of the
work area (real RISC OS uses OS units with y upwards). Say so once, in chapter 6, and in appendix B.
