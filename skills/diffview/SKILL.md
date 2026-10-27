---
name: diffview
description: Show code changes in a live, side-by-side diff page in the browser. Use when the person wants to see, review, scroll through or watch changes (yours or theirs), e.g. "show me the diff", "let me review this", "I want to watch your edits".
---

# diffview

diffview serves one page with one or more git diffs, side by side, and updates
it in place about 5 seconds after files change. It needs `bun`.

Start it in the background (it keeps running) and open the page:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/diffview" [--port N] ["<title>|<repo dir>|<git diff args>" ...]
open http://127.0.0.1:8765   # xdg-open on Linux
```

- No arguments: uncommitted changes (vs `HEAD`) in the current directory's repo.
- Each argument is one section in the sidebar: a title, the repo or worktree
  directory, and the arguments for `git diff` there, e.g.
  `"feature|~/src/app|main...HEAD"` or `"wip|~/src/app|"`.
- Use several sections to show related work together, e.g. committed work on a
  branch and uncommitted work in a second worktree.
- Untracked files only show once git knows them: `git add -N <path>`.
- `#<path>` in the URL scrolls to a file; `?only=<path suffix>` shows one file.

If port 8765 is taken by an older diffview, stop it first (`lsof -tiTCP:8765
-sTCP:LISTEN | xargs kill`), or pass `--port`. Leave the server running while
you work so the person can watch edits land; tell them the URL.
