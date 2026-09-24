# Notes for agents working on branch feature/apps-and-demos

Several agents work in this tree at the same time. Rules:

* **Branch:** stay on `feature/apps-and-demos` and don't push.
* **Committing:** commit only your own paths with `git add <paths>`, never `git add -A`. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
* **Shared files** (src/apps/index.js, src/main.js, src/core/*, src/basic/*, docs/CORE_API.md, tools/build.mjs,
  assets/disc/manifest.json): re-read immediately before a minimal Edit. Never rewrite them wholesale. Log
  core changes in docs/CHANGES_NEEDED.md.
* **Seed disc additions:** don't hand-edit assets/disc files. Write a small, idempotent script
  `tools/disc-<topic>.mjs`, modelled on tools/basicwimp-demo.mjs, that adds your subtree to
  assets/disc (files plus manifest entries) and does nothing to entries it doesn't own. Register it in
  tools/build.mjs after basicwimp-demo.mjs, then run it. Scripts must read-modify-write the manifest in one go
  (read, patch, write immediately) so concurrent runs don't clobber each other. Re-run your script at the end.
* **Tests:** node --test tests/<area>. See tests/lib/suite.mjs and each area's index.mjs. The server runs with
  `node serve.mjs` on :8371 (start it if curl fails). Playwright helper: tests/core/pw.mjs (launch), and
  tests/edit/ui.mjs (Filer/menu helpers).
