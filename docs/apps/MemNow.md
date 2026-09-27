# !MemNow

`src/apps/MemNow/` — port of `Sources/Diversions/MemNow/bas/!RunImage` (0.02).

* Icon bar icon = a ridged (`R3`) filled text icon 130×64 OS units (flags &1700313D) showing the free pool in K
  (`os.memory.freeK`, the machine's memory model `src/core/memory.js`, the same figure as the Task Manager's Free
  and Wimp_SlotSize's r2), refreshed every 50 cs. Background reset when the value
  changes; flashes (bg colour bit toggled each poll) when below 16K.
* MENU: MemNow ▸ Info (template `info`), Quit.
* Uses the core addition `iconbar.add({raw: {flags, validation, w, h}})` (`docs/CHANGES_NEEDED.md`).
* Test: `tests/div/memnow.mjs` → `tests/screens/div-memnow.png`.
