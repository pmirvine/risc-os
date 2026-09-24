# Task windows (owner: TASKWINDOW agent)

RISC OS 3.71 task windows = the TaskWindow module (`Sources/OS_Core/Desktop/TaskWindow`) running a
child task, shown in an Edit text by Edit's `c.message` (Task menu). Code: `src/apps/TaskWindow/`.

| file | contents |
|---|---|
| `app.js` | hidden descriptor; `boot()` sets `os.hooks.taskWindow(tail)` (Ctrl-F12, Task Manager "Task window ^F12", `*TaskWindow`) |
| `main.js` | `openTaskWindow(tail)`: `*TaskWindow` option parsing, the Edit window (via `src/apps/Edit/api.js` `install`), key routing, the Task menu, close query; `taskWindows` (live sessions, for tests) |
| `shell.js` | `TaskShell`: the child task — ShellCLI-style `*` prompt (OS_ReadLine echo, Delete, Ctrl-U, Escape), commands via `os.cli.run(line, {out, tw: shell})`, and `runBasic()` = BBC BASIC in text mode (no VDU) |

## Behaviour

* Entry points: Ctrl-F12 and the Task Manager icon bar menu "Task window" (both = `TaskWindow -display`),
  `*TaskWindow [<command>] [[-wimpslot] <n>K] [[-name] <taskname>] [-ctrl] [-display] [-quit]`.
  (Edit 3.71 has no "Create ▸ Task window": it was removed in 1991, `c/edit` `#if FALSE`.)
* The child is a Wimp task in the Task Manager: "TaskWindow" (module title; `-name` overrides), 640K
  (`-wimpslot`). Task Manager Quit / Kill end it. Without `-display` the window opens on the first output.
  With a command: run it; with `-quit`, or if no window was opened, the task then ends; otherwise it
  continues at the `*` prompt.
* Window: "Task window" (`Task window n` with several views). Output appended at the end (BS/DEL delete,
  control characters dropped while Ignore Ctl is ticked — a global option as in `message.c`), caret
  follows the end while Linked, without stealing the input focus. Keys go to the task (which echoes) while
  linked, alive and not suspended; F10–F12 still go to Edit; non-character keys are sent as 0, code.
  Otherwise the text is a normal Edit text.
* Task menu (ME3/ME4, help HELPT0–8): Kill, Reconnect (restart the same command after Kill), Suspend
  (input and output held, BASIC paused between slices), Resume, Unlink, Link, TaskInput (send the global Edit
  selection as typed input), Ignore Ctl, Edit ▸ (Edit's own window menu). Shading as `message_menumaker`.
* Close with a live task: "Task active in this window" (Edit's quit dbox: Discard / Cancel); Discard kills.
  Closing never asks to save the text.
* `*BASIC` (and running BASIC files, `Alias$@RunType_FFB`) in a task window: the `basicwimp` hook calls
  `ctx.tw.runBasic(argv)`; BASIC runs without a VDU, its output bytes go to the window, `>` prompt and
  `INPUT` read keys from the window, Escape stops, QUIT returns to `*`. VDU control sequences are not
  interpreted (as with the real module + Edit).

## Tests

`PLAYWRIGHT_MODULE=…/playwright/index.mjs node tests/tw/tw.mjs` (server on 8371 or `URL=`): Ctrl-F12,
`*cat`, BASIC (`PRINT 2^10`, a program, QUIT), Task menu, Task Manager, Escape, Suspend/Resume,
Kill/Reconnect, `*TaskWindow "…" -quit`, close query. Screens: `tests/screens/tw-*.png`.

## Known gaps

* Commands implemented in JS keep running while suspended (their output is held); Escape interrupts BASIC
  and the prompt, not long-running core commands.
* No TaskWindow_* messages/SWIs (other applications can't act as task-window servers).
