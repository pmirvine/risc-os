# Working on this repository

## Documentation for users: `$.Docs`

`$.Docs` on the hard disc is where new users explore what this desktop adds to RISC OS 3.71. Every significant
feature or change must be covered there, as part of the same piece of work (not left for later):

* **A new feature** (an application, a filing system, a tool, a way of working) gets a guide of its own in
  `tools/docs/<Name>`, or a section in an existing guide if it belongs there.
* **A change to existing behaviour** (what an icon or menu does, where something lives, new options) updates every
  guide that describes it. Search `tools/docs/` for the old behaviour.
* **`tools/docs/Contents`** lists every guide with a line saying what it covers; add new guides to it.
* Guides are plain text read in !Edit: Latin-1 only, no tabs, lines at most 72 characters, written for users (what
  to click, what happens), in the style of the existing guides. Put them on the disc with `node tools/disc-docs.mjs`
  and commit both `tools/docs/` and `assets/disc/`.
* Alongside the guide, keep the rest in step: the application's own `!Help`, the README (features, how to run it,
  the pointer to `$.Docs`), `docs/apps/<App>.md` for developers, and `docs/CORE_API.md` /
  `docs/CHANGES_NEEDED.md` for changes to shared code.

Before reporting a feature as done, check its guide exists and is current.
