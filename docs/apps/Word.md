# !Word and WimpLib

Code: `tools/moreapps/` — `!Word/` (the application, JSScript modules with no extension) and `!WimpLib/` (the
library of shared plain modules), put on the disc as `ADFS::HardDisc4.$.MoreApps.!Word` by
`node tools/disc-moreapps.mjs` and as the system library `ADFS::HardDisc4.$.!Boot.Resources.!WimpLib` by
`node tools/disc-wimplib.mjs` (both run by `tools/build.mjs`, after `disc.mjs`: the library first). User guide:
`$.Docs.Word` (`tools/docs/Word`); the app's own `!Help` is `tools/moreapps/!Word/!Help`, the library's
`tools/moreapps/!WimpLib/!Help`. Not part of RISC OS 3.71.

The first step of a word processor for Microsoft Word files. Today `!Word` is a **stub**: it opens a `.docx` read-only
in a window (info band, formatted paragraphs, grey boxes for what it does not show) and saves a faithful copy. What
is built to last is underneath: a document model with operations and undo, a reader and a writer for `.docx` that keep
everything they do not understand, and `WimpLib`. Later sub-projects add editing, layout and pagination, styles and
lists, printing, tables and images, headers/footers/footnotes, RTF/PDF export and spell check.

**Fidelity:** content round-trip (text, formatting, every other part) is checked on 600+ real documents (below).
Page layout and pagination are not implemented and, when they are, will only approximate Word. Real Microsoft Word
could not be run during development; the written files follow the schema's element order and are validated with
`xmllint` against the ECMA-376 schema, but "Word opens it without a repair prompt" is only checked by hand
(the hand-off check, below).

## Layout of the source

```
tools/moreapps/
  !WimpLib/       the library: shared, pure modules (import 'wimplib/<Name>')
                  and its !Boot, !Run, !Help
  !Word/          the application
    Fonts/        20 TrueType files (no extension) + Licences
  icon.mjs        the sprites of both (iconFiles, libIconFiles)
  package.json    the package 'wimplib', so Node resolves 'wimplib/<Name>'
  .cache/         git-ignored: font archives, the wml.xsd schema files
tools/disc-wimplib.mjs    builds $.!Boot.Resources.!WimpLib, --check
tools/disc-moreapps.mjs   builds $.MoreApps.!Word, boot lines, --check
tools/moreapps-fonts.mjs  fetches the fonts (pinned, SHA-256 checked)
tools/moreapps-corpus.mjs fetches the sample corpus (optional)
tools/moreapps-xsdorder.mjs  prints the schema's child orders (Order's tables)
tests/moreapps/   everything below under Testing
```

All files on the disc are Latin-1 text, no tabs, **at most 72 columns**, extensionless, and import each other with
exact-name relative specifiers (`'./Ops'`), which Node 22.7+ also resolves natively (so the unit tests import the
disc files as they are). The pure modules never import `'riscos'`; only `!RunImage` and `AppWin` do (`Info`'s
`infoWindow` is handed the task, so `Info` stays pure).

## WimpLib

Plain JavaScript, no desktop services, runs the same in the browser and in Node.

### A system library: where it lives and how it is found

WimpLib is a library application among the system resources, `$.!Boot.Resources.!WimpLib` (disc encoding
`HardDisc4/=21Boot/Resources/=21WimpLib`), like `!System` or `!Scrap`; it is not part of `$.MoreApps`. It holds:

| file | type | what |
|---|---|---|
| `!Boot` | Obey &FEB | `IconSprites <Obey$Dir>.!Sprites`; `If "<WimpLib$Dir>" = "" Then Set WimpLib$Dir <Obey$Dir>`; `If "<WimpLib$Path>" = "" Then Set WimpLib$Path <WimpLib$Dir>.`; `Set WimpLib$Version 1.00` |
| `!Run` | Obey &FEB | a double-click: `Obey <Obey$Dir>.!Boot`, then `Filer_Run <Obey$Dir>.!Help` (it is a library, not a program; like `!System`'s `!Run` it makes the library known again) |
| `!Help` | Text &FFF | for users: what it is, the variables, how programs refer to it, overriding, the module list |
| `!Sprites` | Sprite &FF9 | `!wimplib` 34 x 34 and `sm!wimplib` 18 x 18 (books on a shelf), drawn by `icon.mjs` `libIconFiles()` |
| the modules | JSScript &F81 | the table below |

**Variables.** `WimpLib$Dir` is the library's directory (`ADFS::HardDisc4.$.!Boot.Resources.!WimpLib`);
`WimpLib$Path` is a RISC OS path list (directories ending in `.` or `:`, commas between), normally
`<WimpLib$Dir>.`; `WimpLib$Version` is `1.00`. `!Boot` sets the first two **only if they are not set**, as
`!System`'s `!Boot` does with `System$Dir`. This desktop runs no user boot file before `!Boot.Resources` is booted
(`src/main.js` runs `Filer_Boot` on it first; PreDesktop/Desktop files are not executed), so a user sets them
**after** start-up with `*Set`. `Set WimpLib$Path` stores the value expanded, so changing `WimpLib$Dir` afterwards
has no effect unless `WimpLib$Path` is set again.

**Start-up.** `src/main.js` runs `Repeat Filer_Boot <BootResources$Dir> -Applications -Tasks`, which boots every
application in `!Boot.Resources` (the Filer runs each `!Boot` in safe mode: `Set`, `If` and `IconSprites` run,
`Run` and `/` do not), and only then the `$.MoreApps` line. So the variables are set from a cold boot, before any
MoreApps application boots and without a Filer window being opened (`tests/moreapps/boot.mjs` checks both, with a
probe application in `$.MoreApps` whose `!Boot` records `<WimpLib$Dir>`). No `main.js` code is specific to the library.

**Resolution of `'wimplib/<Name>'`** (`resolveWimpLib` in `src/core/jsrun.js`; `docs/CORE_API.md` 11a):

1. The specifier must be `wimplib/` (any case) followed by segments matching `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`,
   `/` between them (the rule below); `Dir/Name` becomes `Dir.Name`.
2. Each directory of `WimpLib$Path` is tried in order, with `Name` then `Name/js` (a directory of that name is not
   a module); the first file found wins. Prefixes are used as written, so `<Var>` and other path variables
   (`Boot:`) in them work as in any `<Name>$Path`.
3. Then `WimpLib$Dir`, unless it is already one of the path's directories (so with `WimpLib$Path` unset,
   `WimpLib$Dir` alone is used).
4. Not found: `Can't find 'wimplib/Nope' (not in WimpLib$Path: RAM::RamDisc0.$.MyLib,
   ADFS::HardDisc4.$.!Boot.Resources.!WimpLib)` (each directory by its full name; `...; nor in WimpLib$Dir: ...`
   when that was searched too). Neither variable set: `Can't find 'wimplib/Zip' (WimpLib is not installed:
   WimpLib$Dir is not set)`.

Every application, `!Word` included, imports the library by that one specifier (`import {readZip} from
'wimplib/Zip'`), never by a relative path to the library's directory. Relative imports (`'./Ops'`) are unaffected.
Obey files, BASIC and the command line name the files `<WimpLib$Dir>.Zip` (or `WimpLib:Zip`, through the path).

**Override.** To try a changed module, put it in a directory of your own and put that first in the path, e.g.
`Set WimpLib$Path RAM::RamDisc0.$.MyLib.,<WimpLib$Dir>.`: programs started afterwards find `MyLib.Hello` first and
everything else in the system library. Set it after start-up (see above). Copy a module **with the files it
imports**: `Zip` and `Xml` re-export through relative imports, so a lone copy of `Zip` fails with `Can't find
'./ZipError'`; and library-internal imports are relative, so overriding an inner module (`ZipRead`) does not affect
the other library modules, only programs that import it by `wimplib/` name. An entry with no final `.`/`:` that is a
directory is searched as that directory (`MyLib` = `MyLib.`); a `WimpLib$Dir` with a final `.` is accepted.
Unsetting `WimpLib$Path` and setting `WimpLib$Dir` replaces the whole library.
`tests/moreapps/jsrun-wimplib.mjs` checks these, the error texts and the specifier rules.

**In Node** (the unit tests) there are no system variables: `tools/moreapps/package.json` names the package
`wimplib` with `"exports": {"./*": "./!WimpLib/*"}` (and `"type": "module"`, as `tools/package.json`), so a module
**under `tools/moreapps/`** that imports `'wimplib/Zip'` gets `tools/moreapps/!WimpLib/Zip` through Node's package
self-reference (the extensionless file and the `!` in the directory name resolve as they are). The disc sources keep
one specifier for both. On the disc the prefix matches in any case; Node's package self-reference accepts only
lowercase `wimplib/` and has no `Name/js` fallback. Tests under `tests/` are outside the package and import the library by relative path
(`'../../tools/moreapps/!WimpLib/Zip'`); `harness.test.mjs` checks the self-reference resolves to the same URL.

| module | what | API |
|---|---|---|
| `Zip` | re-exports the three below | `readZip`, `writeZip`, `ZipError` |
| `ZipRead` | zip reader: central directory trusted, stored/deflate only, limits checked from declared sizes before inflating | `await readZip(bytes, {maxTotal = 256 MB, maxRatio = 1000}) -> Map<name, Uint8Array>` (directory order, folders left out) |
| `ZipWrite` | zip writer: each entry stored or deflated, whichever is smaller; UTF-8 names | `await writeZip(parts: Map \| [[name, bytes]], {date}) -> Uint8Array` (same input and date, same bytes) |
| `ZipError` | error class | `err.code`: `truncated bad-crc zip64 encrypted too-big bad-method not-zip` |
| `ZipNames` | which entry names are safe (plain relative path; no `..`, drive letter, control character) | `checkName(name)` |
| `Crc32` | CRC-32 | `crc32(bytes, seed = 0) -> number` |
| `Xml` | re-exports | everything below |
| `XmlParse` | parser: one pass, no regexes, no recursion, **no DTD** (`XmlError` `dtd`), no custom entities, depth <= 256 | `parseXml(text) -> {decl, before, root, after}` (`before`/`after`: `{comment}` / `{pi}` outside the root), `MAX_DEPTH` |
| `XmlWrite` | serializer and builders | `serialize(node, {decl, before, after}) -> string`, `el(name, attrs, ...children)`, `text(node)`, `find(node, name)`, `findAll(node, name)`, `attr(node, name)` |
| `XmlText` | character helpers | `XmlError` (`code` `malformed dtd depth entity`, `line`), `esc`, `escAttr`, plus helpers for the parser |

A node is `{name, attrs: [[name, value]...], children}`; children are nodes, strings, `{comment}` or `{pi}`. Prefixes and
attribute order are kept as written. `serialize` throws `XmlError('malformed')` for anything that is not valid XML
(bad names, `--` in a comment, `?>` in a PI, characters XML forbids), so a tree can never be written broken.

### Adding a WimpLib module

1. Put it in `tools/moreapps/!WimpLib/<Name>`: no extension, Latin-1, no tabs, <= 72 columns, at most 250 lines, a
   header comment saying what it does and its API, the word `riscos` nowhere (`disc-wimplib --check` enforces all
   of these). A subdirectory is fine (`wimplib/<Dir>/<Name>`). Add it to the module list in `!WimpLib/!Help`.
2. Import siblings with exact, extensionless relative specifiers (`'./ZipError'`); never the `Name/js` form or a name
   with a dot (Node would not resolve them). Do **not** import `'riscos'` in a module Node must be able to load: keep
   desktop code in the application.
3. Add `tests/moreapps/<name>.test.mjs` (Node test runner, imports the module from `tools/moreapps/!WimpLib/...`).
4. `node tools/disc-wimplib.mjs` (copies it to `$.!Boot.Resources.!WimpLib` as JSScript) and `--check`.
5. Use it from any disc program: `import {x} from 'wimplib/<Name>';` (and from `!Word`'s sources the same way: Node
   resolves it through `package.json`). `src/core/jsrun.js` finds it through `WimpLib$Path`, then `WimpLib$Dir`
   (above). The prefix matches in any case (`WimpLib/Zip`); every segment after it must match
   `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`, so `..`, `^`, `$`, `@`, `<Var>`, `:`, dots (`Zip.js`), wildcards, spaces and
   empty segments (`wimplib//Zip`, `wimplib/Zip/`) are refused with "Can't find '<spec>' (a WimpLib module name is
   letters, digits, _ and -, with / between directories)": the import cannot leave the directories searched.

Imports are found by a regular expression over the source, so an `import ... from '...'` inside a comment is resolved
too (pre-existing in `jsrun.js`); circular imports hang the loader. Keep module graphs acyclic.

## The application modules (`!Word/`)

Model and operations

| module | what |
|---|---|
| `Model` | factories and the data model (header comment): `newPara(text, opts)`, `newSection()`, `emptyDoc()`, `nextId()`, `reserveIds(doc)`, `clone`, `props`; re-exports `OBJ deepEqual sameFmt checkPara checkBlock normRuns` |
| `ModelCheck` | the invariants: `checkPara`, `checkBlock`, `checkInlines`, `checkProps`, `checkPos`, `checkContent`, `normRuns`, `deepEqual`, `fail` (throws `RangeError`) |
| `Ops` | `apply(doc, op) -> inverse`, `applyOwn`; insertBlock, removeBlock, restoreBlock, compound |
| `OpsText` | replaceText, spliceText, splitBlock, mergeBlock |
| `OpsProps` | setProps, `mergeProps(base, patch)` |
| `OpsUtil` | `locate paraAt sectionAt idUsed cut join checkRange` |
| `DocEvents` | tiny emitter; one failing listener does not stop the others |
| `Document` | `new Document(doc)`: `apply(op)`, `undo()`, `redo()`, `group(fn)`, `groupStart/End`, `on('change', fn)`, `canUndo`, `canRedo`, `onListenerError` |
| `Styles` | `newStyleTable()`, `styleOf`, `resolvePara`, `resolveRun`, `addStyle`, `setDefault`, `ensureBuiltins` |
| `StylesBuiltin`, `StylesMerge` | the built-in styles of a new document; property merging without aliasing |
| `PropNames` | which property fields exist and the WML element each is read from / written as; `withoutRaw` |

Reading and writing `.docx`

| module | what |
|---|---|
| `DocxRead` | `await readDocx(bytes, opts) -> Doc`; `DocxError`; opts `maxTotal maxRatio maxXmlBytes maxElements maxParagraphs` |
| `DocxWrite` | `await writeDocx(doc, {date}) -> Uint8Array`; `newDoc` |
| `NewDoc` | `newDoc({paper: 'a4'\|'letter', date}) -> Doc` (what Word starts a blank document with) |
| `DocxError` | `code`: `not-docx no-document bad-xml unsupported bad-model`; `part`, `cause`, `kind: 'ole2'` |
| `Package` | `openPackage(bytes, opts)`: zip, content types, relationships, main part, which parts the reader consumes |
| `Rels` | `parseRels relKind firstOfKind resolvePart relsNameFor findPart` (Transitional and Strict relationship types) |
| `PartXml` | `parsePart(bytes, name, limits)`: size/element/paragraph gates before parsing; UTF-8 or BOM UTF-16 |
| `Ns`, `NsMap`, `Wml` | namespace scopes (elements are recognised by URI and local name, never by the `w:` prefix); Strict <-> Transitional URI mapping (`mapNamespaces`, `mapNamespacesCopy`); constants |
| `ReadBody ReadPara ReadProps ReadSect ReadStyles ReadNumbering` | the XML -> model readers |
| `WriteBody WritePara WriteProps WriteStyles WriteParts` | the model -> XML writers; `WriteParts`: content types (`contentTypes(ct, names, known, fix)`), rels, zip order, XML declaration |
| `PartTypes` | `typeForRel(type)` (the content type a part reached by that relationship type must have: Transitional, Strict and Office 2010+ kinds), `repairs(ct, sources, has)` (the parts to retype, see below) |
| `Order`, `OrderP OrderR OrderTbl OrderSect` | child order of pPr, rPr, tblPr, tcPr, trPr, sectPr (tables checked against `wml.xsd`); `sortChildren(parent, children)` |

The application

| module | what |
|---|---|
| `!RunImage` | start-up (single instance), icon bar icon and menu, opening files, DataOpen/Quit messages, the `task.word` test hook |
| `Open` | `openDocx(vfs, path)` (refuses more than `MAX_PARAGRAPHS` = 200,000 paragraphs), `describe(err, leaf)` (the plain-words error text) |
| `AppWin` | `DocWindow`: window, scrolling keys, menu (Save copy / Info / Close), cached Save and Info boxes |
| `Layout`, `Render`, `Fmt` | screen layout: `Layout` (whole document, binary search for painting), `layoutPara` (greedy line breaking), `runFmt`/`paraFmt` from the resolved properties |
| `Kinds` | `UNSEEN` (the inline elements drawn as nothing and not counted: `proofErr`, `bookmarkStart/End`, `commentRangeStart/End`, `permStart/End`, `lastRenderedPageBreak`, `instrText`, `delText`, `fldChar`), `localName(node)` |
| `Info` | `facts(doc)`, `summary(doc)`, `kindOf(node)`, `infoWindow` |
| `FontMap`, `FontLoad` | `substitute(name) -> {family, css}`, `fontFiles()`, `fontFile(family, bold, italic)`, `bundledFamilies()`, `fontsToLoad(families)`; `loadFonts(vfs, dir, doc, families, FontFaceCtor)` |

## The data model

Header of `!Word/Model` is the reference. In short:

```
Doc     {sections, styles, numbering, parts, rels, meta, rawSettings}
Section {props: {pgSz?, pgMar?, cols?, titlePg?, extra}, blocks, raw}
Para    {type:'p', id, text, runs, inlines, pPr, pStyle?, extraP}
Run     {start, end, rPr, rStyle?}
Inline  {kind:'raw'|'br'|'tab', level:'p'|'r', node?, text?, brType?}
Opaque  {type:'opaque', node}
```

* **Units:** Word's. Twips (1/1440 inch) for indents, spacing and page sizes; half-points for `sz`; colours are hex
  strings; booleans are real booleans. **Offsets are UTF-16 code units** and never fall inside a surrogate pair.
* **Text and runs:** `text` is the paragraph's text. `runs` are sorted, non-empty, contiguous and cover
  `[0, text.length)`; adjacent runs never have equal formatting (`normRuns`). A tab is `\t`, a plain line break `\n`.
* **Non-text items** (a drawing, a field character, a footnote reference, a hyperlink, a bookmark, a tracked-change
  wrapper...) are one U+FFFC (`OBJ`) each in `text`, described by `inlines[index]` (the key is the index as a decimal
  string). `Inline.level` says where the node belongs when written: `'r'` inside the `w:r` with that run's
  formatting (`w:drawing`, `w:fldChar`, `w:br`...), `'p'` directly in the `w:p` (`w:hyperlink`, `w:ins`,
  bookmarks, a whole `w:r` that cannot be taken apart). `level` is required for `raw` and `br`; `tab` is always `'r'`.
  `Inline.text` is for display only; the writer uses `level` and `node`. A `raw` inline must have its `node`
  (`ModelCheck` refuses one without: it could not be written); a `br` needs its `node` or a string `brType` (written
  as `<w:br w:type="..."/>`); a `tab` needs neither (`<w:tab/>`).
* **Blocks:** a `Para`, or an `Opaque` holding the original XML node of everything else at body level (tables,
  content controls, custom XML, an `mc:AlternateContent`, a `sectPr` that is not last...), in place.
* **Ids:** paragraph ids come from one counter for the whole program (`nextId`), unique within a Doc; `reserveIds(doc)`
  moves the counter past a Doc's ids (the `Document` constructor does it). A reader must create paragraphs through
  `newPara`.
* **Sections and `sectPr`:** a paragraph whose `w:pPr` holds a `w:sectPr` ends a section (it is the section's last
  block); the body's last `w:sectPr` describes the last section. `Section.raw` is the original `w:sectPr` node.
  The writer puts a section's `sectPr` in the `pPr` of its last paragraph (adding an empty paragraph if the section
  does not end in one), and the last section's at the end of `w:body` when the file had it there (`meta.bodySectPr`)
  or when it has page properties; each is written exactly once.
* **`meta`:** `contentTypes`, `packageRels`, `mainPart`, `zipOrder`, `stylesPart/numberingPart/settingsPart`,
  `prolog` (a `Map` part -> `{decl, before, after}`), `documentRoot`, `bodyName`, `bodyAttrs`, `beforeBody`,
  `afterBody`, `bodySectPr`, `conformance` (`'strict'` or `'transitional'`), `stylesGenerated`.
* **`parts`:** a `Map` name -> bytes of every zip entry the reader does not interpret (headers, footers, footnotes,
  comments, media, docProps, other `.rels`, custom XML...). They are written back byte-identical.
* **`styles`:** a `StyleTable` (`docDefaults`, `styles: Map`, `defaults`, `latent`, and from a file `rootName`,
  `rootAttrs`, `docDefaultsRaw`, `extraStyles`). Each `Style` read from a file keeps its original element in `raw`.
  **The writer emits `raw` verbatim: edits to the fields of a style that has `raw` are not written yet** (a style
  editor must drop `raw` for the style it changes). Styles without `raw` (the built-ins of `newDoc`) are built from
  their fields. `resolvePara`/`resolveRun` return new objects.
* **`numbering`:** `{raw, nums}` (the original root kept whole; `nums` is a summary for display, `lvlOverride` is not
  applied). `rawSettings` is the root of `settings.xml`, kept whole.

### The lossless property rule (`ReadProps`)

A child of `rPr`, `pPr` or `sectPr` becomes a model field only when it is understood **completely**: every attribute
is a known WML attribute with a value of the expected form, the element has no unexpected content and is the only
child of its name. Anything else — unknown elements, `w14:*` extensions, repeated elements, theme fonts or
`w:color` with `w:themeColor`, `w:spacing` with `w:beforeAutospacing` — is kept as the original XML node in the
object's `extra` array, in document order. Property objects are built from fixed whitelists of field names;
names found in a file are only ever `Map` keys, so an element called `__proto__` is inert (**prototype-pollution
rule: never copy keys from a file into a property object**).

Other rules of the same kind: a `w:pPr` carrying attributes makes its paragraph an `Opaque` block; the attributes of
`w:p` (rsids, `w14:paraId`) go to `extraP`; run rsid attributes are dropped (the one deliberate loss); a `w:r` with
unknown attributes, or text directly in it, is a whole `level: 'p'` inline; a tab, newline or U+FFFC inside a `w:t`
is kept as a `level: 'r'` raw inline so text never gains a meaning the file did not give.

### Child order and the extension slot (`Order.sortChildren`)

Word reports "unreadable content" when the children of `pPr`, `rPr`, `tblPr`, `tcPr`, `trPr` or `sectPr` come in
the wrong order (they are `xsd:sequence`s). `sortChildren(parent, children)` puts them in schema order: known
`w:` names by their position in the table (stable); an unknown `w:` name stays right after the known element that
preceded it in the input; and **children in other namespaces (`w14:*`, `w15:*`, ...) have one fixed slot: after all
base elements and before the `*Change` element** (`rPrChange`, `pPrChange`, `sectPrChange`...). Callers must pass
names normalised to the `w:` prefix (the writer orders by namespace and local name using the part's scope, so raw
nodes with another prefix for WML are ordered correctly). The tables are checked against the real `wml.xsd` by
`order.test.mjs` when the schema is in `tools/moreapps/.cache`.

### Strict documents

A document whose main part is in the Strict namespace is read with every parsed part mapped to the Transitional URIs
(`NsMap`, a one-to-one table of PURL pairs; `graphicData@uri` and the URIs in `w:dataBinding` `prefixMappings` too),
gets `meta.conformance = 'strict'`, and is written back Strict (`mapNamespacesCopy(..., 'toStrict')`).
Relationship types and the bytes in `doc.parts` stay as they were. Strict vocabulary differences stay raw/extra.
A file mixing Strict and Transitional URIs does not round-trip exactly (deferred). Output Strict is not
schema-validated (only the Transitional schema is used).

### Content types of known parts (`PartTypes`)

Word does not accept a package whose index (`[Content_Types].xml`) types a part it knows only generically. Checked
in Word: `docProps/core.xml` typed `application/xml` fails hard ("Word experienced an error trying to open the
file"); `word/footnotes.xml` typed so gives only the milder "unreadable content ... recover?" prompt.
So the writer **repairs** the index: for every internal relationship of the package (`_rels/.rels`) and of the main
part whose type is a known kind (`officeDocument styles numbering settings fontTable webSettings footnotes endnotes
comments header footer glossaryDocument theme extended-/custom-properties customXmlProps`, core properties (also the lower-case legacy spelling
`http://schemas.openxmlformats.org/officedocument/2006/relationships/metadata/core-properties`, found in 7 corpus
files; the Strict-style spelling is not known to exist and is not accepted),
`commentsExtended commentsIds commentsExtensible people stylesWithEffects`) and whose target is written, when the
part's effective type (its Override, else the Default of its extension) is missing, `application/xml` or `text/xml`,
it gets its own type: the existing Override is changed in place, else an Override is added. **A different specific
type is never changed** (it may be meant; the linter reports it as `ct-wrong`). Everything else in the index is
written as it was, in its order, so a valid file's content types do not change at all (`docx-package.test.mjs`
checks this on every reader fixture, the corpus test on every corpus file). Images, relationships of other parts (a header's
own picture...) and external targets are not looked at.

Decided with evidence and **not** done: the writer adds no `settings.xml` (with `w:footnotePr` naming the separator
notes) and no `docProps/app.xml` to a file that lacks them. Every Word-made file with footnotes in the corpus (157)
and on the development machine (20) has both separators and a `footnotePr`, but nothing shows their absence breaks
Word (10 corpus files and several real ones have no `app.xml`); the round-2 hand-off file `2k` tests the settings
question in real Word. A literal TAB inside `w:t` (round 1's file 2 had one, from the test fixture's text) is source
content kept by the lossless rule, not a writer bug: the writer writes a model `\t` as `<w:tab/>`.

## Operations and undo

`apply(doc, op) -> inverse`; `apply(doc, apply(doc, op))` restores the Doc exactly (ids included). Positions are
`[sectionIndex, blockIndex]`; offsets are UTF-16. An op that is refused throws `RangeError` and changes nothing.

| op | fields |
|---|---|
| `replaceText` | `{block, at, del, ins, rPr?, rStyle?, inlines?}`; becomes `spliceText` internally |
| `spliceText` | `{block, at, del, content: {text, runs, inlines}}` (what undo uses, so history costs about the size of the edit) |
| `setProps` | `{block, pPr?, pStyle?, range?, rPr?, rStyle?}`; deep merge, `null` deletes a key; setting or deleting a field removes same-named raw elements from `extra` (the edit replaces the element wholesale: attributes the model did not understand are lost) |
| `splitBlock` / `mergeBlock` | `{block, at}` / `{block}`; `extraP` stays with the first paragraph |
| `insertBlock` / `removeBlock` | `{at, block}` / `{at}` |
| `restoreBlock` | `{block, snapshot}` |
| `compound` | `{ops: [...]}`, all or nothing |

Formatting of inserted text: the format of the character before `at`; at offset 0 the first run's; **typing over a
selection (`del > 0`) takes the format of the first selected character** (Word's rule); in an empty paragraph none.
`op.rPr` replaces the rPr exactly.

`Document`: `apply(op)`, `undo()`, `redo()`, `group(fn)` (one undo step and one `'change'` event; groups nest; it ends the
group even when `fn` throws — prefer it to `groupStart/End`; **`fn` must be synchronous**: the group ends when `fn`
returns, so ops an async `fn` applies after its first `await` fall outside it). An op that throws changes nothing, not even inside a
group. `undo`/`redo` inside a group throw. `on('change', fn)` receives `{kind: 'apply'|'undo'|'redo', ops}`; a
listener that throws neither undoes the change nor stops the others: the error goes to `onListenerError(err)`
(by default rethrown from a microtask).

### Never change a model object in place

The live Doc shares blocks, runs, `rPr`/`pPr` objects, inlines and XML nodes with its undo history (copy on write: an
op builds new objects for the part it changes). So: **change a Doc only through `Ops`/`Document`; never mutate a
Doc object, an op you applied, or an event payload.** `apply()` deep-copies the op it is given once, at the boundary,
so a caller's objects never enter the Doc; `applyOwn()` (used by `Document` for undo/redo) does not copy. For event
payloads this means: for `'undo'` and `'redo'` events, `ops` is `[the op applied]` and **that op is shared with the
history and is READ-ONLY** (a listener that mutates it corrupts redo); it may be a `spliceText` or `compound`, not
only the public kinds. For `'apply'`, `ops` are the ops as given. Nothing enforces this (nothing is frozen).
The same holds for style tables of a live Doc.

## Limits and security

* **Zip:** unpacked total <= 256 MB, ratio <= 1000, declared sizes checked before inflating; zip64, encryption,
  split archives and methods other than stored/deflate are refused; unsafe names, duplicate names, a wrong comment
  length, non-`Uint8Array` input are `ZipError('not-zip')`; corrupt deflate data is a `ZipError`, never a raw TypeError.
* **XML parts:** at most 64 MB each (`maxXmlBytes`), 4,000,000 elements (`maxElements`, counted from the bytes before
  parsing), depth 256; **DTDs are refused** (`XmlError` `dtd`) and there are no custom entities.
* **Paragraphs:** `readDocx` accepts at most 1,000,000 in the body by default (`maxParagraphs`; start tags with local
  name `p` are counted before parsing, so a 45 KB zip of five million `<w:p/>` is refused in well under a second);
  `!Word` (`Open.openDocx`) passes **200,000**, as the window lays out every paragraph (200,001 is refused as "too
  big" in well under a second). Memory is about **1.1 GB per 200,000 paragraphs** when read. UTF-16 parts bypass the byte gate on `<w:p` (bounded, but slower).
* **Trust model of `WimpLib$Dir`/`WimpLib$Path`:** only programs that run JavaScript read them, and they are changed
  only by `*Set` (the command line, an Obey file, or an application's `!Boot`). Viewing a directory in the Filer
  runs the `!Boot` of every application in it in safe mode, and `Set` is allowed there, so an untrusted application
  directory (downloaded, or on a HostFS drive) could redirect `WimpLib$Path` and hijack later `wimplib/...`
  imports. This is the same trust class as any application that sets `Alias$@RunType_xxx`: treat untrusted
  application directories like running them. A `.docx` is never executed; `?cmd`/`?run` work only on localhost.
* **Nothing is ever fetched:** external relationships are data only. A document never runs code (fields are kept,
  not evaluated; macros are not read).
* Older `.doc` and password-protected files are OLE2 containers: `DocxError` with `kind: 'ole2'`; `Open.describe`
  says so in words. Other files give `not-docx`, `no-document`, `bad-xml` (naming the part) or `unsupported`.
* `__proto__`/`constructor` as a font name, style id, property or part name are inert (Maps and `Object.hasOwn`).

## Fonts

`!Word/Fonts/` holds 20 unmodified TrueType files named without an extension (`Carlito-Regular`, ...) and `Licences`
(Latin-1 text, exempt from the tab/72-column checks; it has two verbatim tabs). Carlito = Calibri, Caladea = Cambria,
Liberation Sans/Serif/Mono = Arial/Times New Roman/Courier New, all **SIL Open Font License 1.1** (Caladea checked from
its own LICENSE file: it is OFL, not Apache). They are metric-compatible: same advance widths, so lines break where
they do in Word. `tools/moreapps-fonts.mjs` re-fetches them from pinned commits and checks SHA-256 and licence text
(`node tools/moreapps-fonts.mjs`); the output is the same bytes every time. The OFL requires the licence to travel
with the fonts and forbids selling them alone or using the Reserved Font Names for modified versions, which is why
they are not converted. The fonts are committed in both `tools/moreapps/!Word/Fonts` and the generated
`assets/disc` copy: the two copies are the same git objects, so the packed repository grows by about **3.7 MiB**; a
checkout's working tree by about 14 MB. `FontMap.substitute` never throws; its `css` is for CSS only (an unknown font
is `"Name", "Liberation Sans", sans-serif`: the computer's own font if it has it, else Liberation Sans).
`FontLoad` adds each face to the page once, however often `!Word` is started: it reuses a face `document.fonts`
already has (same family, weight and style, `loaded` or `loading`), and calls in flight share a job map kept on
`globalThis[Symbol.for('word.fontjobs')]` (keyed by `document.fonts`), which outlives a run's module instances. The
faces stay with the page after Quit, for the next run. `!RunImage` loads `fontsToLoad(facts(doc).fonts)`: the
bundled families used, plus the bundled fallback (Liberation Sans for an unknown font) of every other one. The stub
shows a document once its fonts are loaded, waiting at most 2.5 s, and lays it out again if they arrive later.

## The stub application

* `!RunImage` — single instance: a second start sends `DataOpen` to the running task and quits. Documents are opened
  by double-click (the type &A7E, `MSWordX`, is bound by `!Boot`: `Alias$@RunType_A7E` runs `!Run`), by a drop on
  the icon bar icon or a document window, and by `DataOpen`. The icon (`!word`) opens an information box on Select
  ("cannot make new documents yet"); its menu is Info, Quit.
* `AppWin` — one `DocWindow` per document (key = canonical path, lower-cased). Painting is a canvas: `Layout` lays out
  every paragraph (words measured once, cached) but only paints what is in view. Menu: *Save copy as .docx*
  (`saveAs` with `writeDocx`; the Save and Info boxes are created once per window and deleted with it — a menu asks
  for a submenu on every hover), *Info*, *Close*. Keys: Page Up/Down, up/down, Home, Copy (End), Ctrl-up/down.
* Test hooks: `task.word.docs` (`{path, doc, text, summary, win, saveBytes()}`) and `task.word.open(path)`.
* `Render` draws inlines so: a `w:hyperlink` with text in blue, underlined (the only link style); any other
  paragraph-level wrapper with text (`w:ins`, `w:fldSimple`, `w:sdt`, `w:smartTag`, `w:customXml`, a `w:r` kept
  whole) as plain text in the format at that position; nothing for `Kinds.UNSEEN`, `w:del`, `w:moveFrom` and
  `w:softHyphen`; `-` for `w:noBreakHyphen`; a grey `[...]` box for the rest (drawings, pictures, objects, footnote,
  endnote and comment references, `w:sym`...). `Info` counts the same way: the `UNSEEN` kinds are not preserved
  items, so a field made of `fldChar`s is not counted (its result is shown as text).
* Not shown yet: bullets/numbering, superscript, highlight, justification, table contents, tabs never wrap, a word
  longer than the line runs over.

## Build and disc pipeline

`node tools/disc-wimplib.mjs` writes `!Boot/Resources/!WimpLib` (type `app`; `!Boot`/`!Run` Obey &FEB, `!Help` text
&FFF, `!Sprites` &FF9 from `icon.mjs` `libIconFiles()`, every other file JSScript &F81, subdirectories as
directories). It replaces only that subtree and its manifest node: the node is replaced in place, or inserted at its
sorted position among the other `Resources` entries, which are not re-sorted or touched; the manifest's `files` and
`totalBytes` are recounted. `--check` verifies the sources (Latin-1, no tabs, no CR, <= 72 columns, <= 250 lines,
`riscos` only in an `import ... from 'riscos'`). It runs after `disc.mjs` (which rewrites `!Boot`) and before
`disc-moreapps.mjs`.

`node tools/disc-moreapps.mjs` writes `MoreApps/!Word` (sources as JSScript &F81; `!Run`/`!Boot` as Obey &FEB; `!Help`
text &FFF; `Fonts/*` Data &FFD; `Fonts/Licences` text; `!Sprites` generated by `icon.mjs`, including the icons of
.docx &A7E and .doc &AE6), inserts `MoreApps` in the manifest at its sorted place, and patches the boot files. It
rewrites only its own subtree, and removes the library's old home `MoreApps/WimpLib` (directory and manifest node)
when it is there, so a disc built before the move is cleaned up. `--check` verifies every text source (Latin-1, no
tabs, no CR, <= 72 columns; the font binaries are exempt, `Fonts/Licences` is checked for Latin-1 and CR only)
without writing.

Both scripts hold the same lock (`.moreapps-lock` in the disc root: both rewrite `manifest.json`) and share
`MOREAPPS_SRC` (the source tree holding `!Word` and `!WimpLib`) and `MOREAPPS_DISC` (the disc root), used by
`disc.test.mjs`. `disc-moreapps` must run after `disc.mjs`, which rewrites the boot files (`tools/build.mjs` runs
`disc.mjs`, ..., `disc-wimplib.mjs`, `disc-moreapps.mjs`). `node tools/disc-docs.mjs` puts the guide on the disc.

**Boot wiring.** `disc-moreapps` adds one line to each of four boot files (`!Boot` and `Utilities.!ResetBoot`'s
`Choices.Boot.Desktop` and `PreDesktop`): `Filer_Boot` of `Boot:^.MoreApps` and `AddApp Boot:^.MoreApps.!*`, as
real RISC OS would have them. **This desktop runs neither of those files** (`src/main.js` runs only `Repeat Filer_Boot
<BootResources$Dir> -Applications -Tasks`) and `*AddApp` does nothing, so `src/main.js` runs the equivalent for
`ADFS::HardDisc4.$.MoreApps` right after it (when the directory exists; errors are only logged). That is what makes
`!Word`'s sprites and the file type &A7E known from a cold boot, without opening the MoreApps folder.
The patched boot files are kept because they document intent. `!Word` is not in the icon bar Apps viewer (ROM apps
only; `!Journal` neither); it is reached through the Filer or by double-clicking a .docx. `src/main.js` hard-codes the
`HardDisc4` path, as the `BootResources` line does. See `docs/CORE_API.md` 11a and 14 and `docs/CHANGES_NEEDED.md`.

## Testing

Node >= 22.7 (extensionless imports; the suite was run on Node 26).

```sh
node --test tests/moreapps                    # unit tests (no browser)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps   # the same under a 1 GB heap
node --test tests/moreapps/index.mjs          # browser suite: disc --check, the wimplib import, cold boot, !Word
node tools/disc-moreapps.mjs --check          # sources: Latin-1, 72 columns
node tools/disc-wimplib.mjs --check           # the library's sources: the same, <= 250 lines, no 'riscos'
node tools/moreapps-corpus.mjs                # fetch the optional sample corpus (needs the GitHub CLI, `gh auth status`)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/corpus.test.mjs   # ~25 s, up to ~1.9 GB RSS
node tools/moreapps-fonts.mjs                 # re-fetch the fonts (pinned, checked)
node tests/moreapps/validate.mjs              # xmllint schema validation of what the writer writes
node tests/moreapps/lint-package.mjs FILE.docx|DIR...   # package linter (exit 1 if any file has an error)
VALIDATE_DIR=tests/moreapps/corpus VALIDATE_MAX=150 node tests/moreapps/validate.mjs   # original vs written errors
```

* Unit tests (`*.test.mjs`): `zip`, `xml`, `order` (against `wml.xsd` if cached), `model` (including two property
  tests of 500 seeded op sequences that check every op's inverse), `model-perf` (typing 0.3 ms/key in a 20k-character,
  2000-run paragraph; undo-all of 1500 keys grows the heap by about 1 MB), `styles`, `docx-read`, `docx-write`,
  `docx-edit` (extension elements, edits replacing raw properties), `docx-roundtrip` (read -> write -> read equal;
  textutil output; real files on the machine only with `MOREAPPS_REAL_DOCX=1`, see below), `docx-corpus-fixes` (regressions the corpus found),
  `docx-compare` (the `assertSameDoc` helper), `docx-package` (content-type repair; valid fixtures' types
  unchanged; the linter on `newDoc` output and on its own cases), `fontmap`, `fontload`, `fontfiles`, `word-view` (Info, Fmt, Render),
  `disc` (the build script against a temporary disc), `harness` (pins Node's native handling of the disc layout).
* Browser tests (`index.mjs`, Playwright with the Chromium used by the other suites; `tests/lib/suite.mjs`): `disc
  --check`, `jsrun-wimplib.mjs` (the `wimplib/` import), `boot.mjs` (cold boot: `File$Type_A7E` set and a `.docx` runs
  !Word), `word.mjs` (open, text, formatting, save copy equals the original, 5000 paragraphs opens in ~150 ms,
  the menu does not leak windows), `word-life.mjs` (three runs of !Word add each font face to the page once; no fonts, close, Quit leave nothing
  behind).
  Screenshots: `KEEP_SHOTS=1` writes them to `tests/screens/`.
* **The corpus** (`tests/moreapps/corpus/`, git-ignored, never committed): `tools/moreapps-corpus.mjs` fetches sample
  `.docx` files pinned to commits (python-docx MIT, Apache POI Apache-2.0, Open XML SDK MIT, a few LibreOffice test
  documents), each checked against its git blob hash; `SOURCES.txt` records URL, commit, licence and SHA-256 (the
  licences are repository-level: local testing only). Without an authenticated `gh` every source is skipped with a
  warning and the script still exits 0. `corpus.test.mjs` reads every file, requires `checkBlock` on every block,
  write -> read equal, a byte-stable second generation, unparsed parts byte-identical, every XML part well-formed, and the
  **written child order** of 33,973 property elements; files that are expected to fail are listed in
  `corpus-expected.json` (21, all genuine: old `.doc`, encrypted, not zips...). Result: 633 files, 612 read and
  written, 21 expected refusals, 0 failures; `xmllint` finds no schema error the writer adds (1,824 parts).
* **The package linter** (`tests/moreapps/lint-package.mjs`, `lintPackage(zipParts) -> {problems, facts}`; also a
  CLI) checks what schema validation of single parts cannot: level `error` = `no-content-types`, `ct-none` (a part
  with no type), `ct-dup`, `ct-orphan` (an Override for a missing part), `rel-id-dup`, `rel-missing` (an internal
  relationship of a known kind to a missing part), `ct-generic` / `ct-wrong` (a known part not typed as its
  relationship kind requires), `rid-unresolved` (an `r:id`/`r:embed`... in the main part, headers, footers, notes or
  comments with no relationship), `note-ref-missing`, `note-separators`; level `word` (Word always writes it, its
  absence is not known to matter) = `docpr-dup` (Word opened round 1's Strict file with duplicate `wp:docPr` ids;
  10 Word-made corpus files have them), `drawing-shape` (`wp:inline`/`anchor` without `wp:effectExtent` or
  `wp:cNvGraphicFramePr`), `notepr-missing`, `no-settings`, `no-app`. On the corpus: 8 of 615 originals have errors,
  all deliberately broken test files (`InvalidDocProps*`, a missing `[Content_Types].xml`, orphan Overrides, a PDF
  as an image, an untyped extra entry); **no file has `ct-generic`** (582 are Word-made). The corpus test requires
  that the written file has no package error its original did not have.
* **Real files on this machine** are off by default (the corpus and the fixtures cover real documents, and a plain
  `node --test tests/moreapps` must not read private files). `MOREAPPS_REAL_DOCX=1` round-trips up to 80 `.docx`
  found under `/Applications`, `/System/Library`, `/Library` and `/usr/share` (never the home folder) and the
  folders in `MOREAPPS_REAL_DOCX_DIRS` (colon-separated), e.g.
  `MOREAPPS_REAL_DOCX=1 MOREAPPS_REAL_DOCX_DIRS=~/Documents node --test tests/moreapps/docx-roundtrip.test.mjs`. The
  list of the default folders is kept for a day in the system temporary directory (`moreapps-real-docx.txt`), never
  in the repository.
* **Mutation-test the tests** when you change the writer: break the order (reverse `pPr` children), the placement of a
  `w14` element, the Override for a part, then check a test fails (the corpus test caught pPr reversal in 158 files,
  rPr 167, sectPr 605, `w14` insertion 174).
* **The real-Word hand-off** (`tests/moreapps/corpus/handoff/`, local only): a script can write new documents with
  `newDoc` + `Document` and the round trips of the rich fixture and of corpus documents, for opening in real
  Microsoft Word: there must be no repair prompt and no Compatibility Mode. Round 1: everything opened except the
  rich fixture of `word.mjs` (generic content types, above; `build-docx.mjs` now types notes, headers, footers and
  docProps parts as Word does). Round 2 adds a bisect set (`2-bisect/2a`...`2k`: one feature per file, Word-like
  packages, plus controls with one part typed `application/xml` each) to confirm the cause in Word.

### Verified in real Word

The owner opened round 2's bisect controls in real Microsoft Word:

* `2j-wrong-types-only-core.docx` (only `docProps/core.xml` typed `application/xml`): Word's hard failure, "Word
  experienced an error trying to open the file", the same failure as the original broken file.
* `2i-wrong-types-only-footnotes.docx` (only `word/footnotes.xml` typed `application/xml`): the milder "Word found
  unreadable content ... Do you want to recover the contents?" prompt.
* `2k-footnote-no-settings.docx` (footnotes and their separator notes, but no `word/settings.xml`): opens without
  a message. The writer therefore does not add a settings part.

So a generic core-properties type alone breaks the file and a generic footnotes type alone makes Word repair it.
The writer repairs the generic content types of known parts (`tools/moreapps/!Word/PartTypes`, above), and the
package linter (`tests/moreapps/lint-package.mjs`) reports a known part typed generically (`ct-generic`) or wrongly
(`ct-wrong`), core properties and footnotes, endnotes and comments included, at level `error`, its most severe
class (the other level, `word`, is for things whose absence is not known to matter).

## Known limitations and deferred items

Reader / writer

* Older sysvars code makes `SetMacro WimpLib$Path <WimpLib$Path>` (self-reference) fail with "Maximum call stack
  size exceeded"; the desktop survives it. Not changed here.

* Run `rsid` attributes are dropped (the only deliberate loss). Empty `w:pPr` and `w:rPr` are not written.
* Whitespace without `xml:space="preserve"` is trimmed as Word trims; the writer adds `xml:space` when a text starts or
  ends with white space.
* Level-`'p'` inlines inside formatted text lose their paragraph-level formatting when edited, and a `w:tab` read from
  a document comes back as `\t` text (editor sub-project).
* Header/footer references are not regrouped and `styles.extraStyles` are written after the other styles (valid, but not
  in their original place); `proofErr`, bookmarks and `lastRenderedPageBreak` are U+FFFC inlines (`Render` draws
  nothing for them; an editor must still step over them).
* The writer repairs only the package index of the package and main-part relationships; it does not add missing
  parts (real Word does not need `settings.xml` for footnotes: see "Verified in real Word").
* Mixed Strict/Transitional URIs in one document do not round-trip; UTF-16 prolog parts are written as UTF-8 with a
  correct declaration; zip directory entries are dropped; new Override part names are not percent-encoded.
* An edit replaces a raw same-named property element wholesale (untouched attributes of it are lost).
* Style edits are not written when `Style.raw` is present.
* `NsMap` leaves out the pairs with no resolvable Strict URI (drawingml compatibility, customXmlDataProps).
* Written-order check in the corpus test covers direct body paragraphs and runs, not those inside hyperlinks,
  `w:ins`, `w:sdt` or tables (table paragraphs are kept verbatim).

Desktop

* Circular imports hang `jsrun`; `import` text inside comments is resolved.
* The stub: long words clip or run over, tabs never wrap, the layout is redone for every `moved` event (50 ms per step
  at 5000 paragraphs), `lineRule` exact/at-least is ignored, theme fonts are taken to be Calibri, the extent is clamped
  per paragraph (not per document), "Save copy" overwrites a file of the same name as any Save does.
* No `.doc` handler (the icon for &AE6 exists, nothing runs it).

Other

* The 7 MB of fonts (and the generated copy, the same git objects) add about 3.7 MiB to the packed repository and
  about 14 MB to a checkout's working tree.
* `ZipWrite` has no entry-count or 4 GB checks; the zip reader's duplicate-name test is case-sensitive (RISC OS
  is case-insensitive: check again when unpacking to a disc).
* Corpus: the 20-second guard is only after the fact; the `gh` CLI is required to fetch it.
