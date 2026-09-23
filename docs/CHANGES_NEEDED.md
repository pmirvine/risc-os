
## wimp.processKey(code, char?) — added by ACCESSORIES agent (Chars)
`src/core/wimp.js`: new public method = Wimp_ProcessKey. Delivers a key code to the input-focus owner
(writable icon editing, then the caret window's `key` event, then hot-key windows). Additive only.
Please document in CORE_API.md §3.2.

## Writable icons pass on disallowed characters — DIVERSIONS agent (Blocks)
`src/core/wimp.js` `_editKey`: a character rejected by the icon's `A` validation now returns false, so it
reaches the window's `key` handler (Key_Pressed), as the real Wimp does. !Blocks' "Alter keys" dialogue uses
writable icons validated `a0~0` (nothing allowed) and reads every key via Key_Pressed.

## Icon bar: raw icons — DIVERSIONS agent (MemNow)
`src/core/iconbar.js`: `wimp.iconbar.add({ ..., text, raw: {flags, validation, w, h} })` creates an icon with the
given Wimp icon flags/validation and a fixed size in pixels (e.g. MemNow's ridged text icon showing free memory).
Additive only; please document in CORE_API.md §11.

## os.config extensions for !Configure — ACCESSORIES agent (Configure)
All additive / backwards compatible:
* `src/core/config.js`: new keys `doubleClickMove` (OS units, `*Configure WimpDoubleClickMove`), `beepLoud`,
  `speaker`, `volume` (0-7; together set `wimp.config.beepGain`), `mode` ({width,height}|null, applied once at
  boot via `wimp.setMode`, `modeGreys`). `wimpFont` may be any RISC OS font name (e.g. `Trinity.Medium`) as well as
  'homerton'/'system'. apply() now also sets `input.config.doubleClickMs/doubleClickMove/dragMove/dragDelayMs`,
  `wimp.config.solidDrags` (WimpFlags bit 0) and `wimp.config.errorBeep` (bit 4 clear = beep on errors).
  Unknown keys may be stored in `config.values` + `save()` (Configure keeps CMOS-only settings there).
* `src/core/fonts.js`: `fonts.weight` / `fonts.style` so the desktop font can be a bold/italic outline font.
* `src/core/dialogs.js`: error boxes beep only if `wimp.config.errorBeep !== false`.

## Menu sprite items + pointer hot spots — DRAW agent
Both additive / backwards compatible:
* `src/core/menu.js`: a menu item may have `sprite` (name or SpriteInfo, looked up in `spriteArea` (a Map) or the
  Wimp pool) drawn in the item's text area, and `spriteW` (px) as a width hint for measuring. Used by Draw's
  Style ▸ Line pattern menu (sprites `none`, `pat1`…`pat4`, like RISC_OSLib `menu_make_sprite`).
* `src/core/wimp.js` `setPointer`: a SpriteInfo may carry `hot: [x, y]` (CSS px) for its active point; used by
  Draw's crosshair pointer (active point 8,4 in the mode-12 sprite).
Please document in CORE_API.md §5 / §11.
