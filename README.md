# diffview

A local, live git diff reviewer. Point it at one or more repos and it shows
their diffs side by side in the browser, updating in place a few seconds after
files change.

- Side-by-side or unified view, word-level change highlights, syntax
  highlighting (shiki)
- Several diffs on one page, each its own section in the sidebar
- Live: a file watcher (FSEvents on macOS) on the repos and their git dirs
  pushes updates over a websocket; no polling, no page reloads
- "Viewed" checkboxes that persist, `j`/`k` to move between files, `v` to mark
  one viewed

## Usage

Requires [bun](https://bun.sh).

```sh
git clone https://github.com/cs01/diffview && cd diffview && bun install
ln -s "$PWD/bin/diffview" ~/.local/bin/diffview   # or anywhere on PATH

diffview                     # uncommitted changes in the current repo
diffview "my branch|~/src/app|main...HEAD" "wip|~/src/app|"
diffview --port 9000 ...
```

Each argument is `title|repo dir|git diff args`; the page shows one section
per argument at http://127.0.0.1:8765. Untracked files only appear once git
knows about them (`git add -N <path>`).

Useful URL options: `#<path>` scrolls to a file on load, `?only=<path suffix>`
shows a single file.

## Watching an agent work

diffview is handy for following a coding agent: start it on the agent's repo
or worktree and leave the tab open; edits show up as the agent makes them.
Build output directories (`build*`, `*.noindex`) are ignored by the watcher.
