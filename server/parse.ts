import type { DiffLine, FileDiff, Hunk } from "../src/types.ts";

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

export function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // "diff --git a/X b/Y": paths may contain spaces, so split on the
      // midpoint when both halves match; fall back to the first " b/".
      const rest = line.slice("diff --git ".length);
      let a = rest, b = rest;
      const mid = rest.indexOf(" b/");
      if (mid >= 0) {
        a = rest.slice(0, mid);
        b = rest.slice(mid + 1);
      }
      const strip = (p: string) => p.replace(/^"?[ab]\//, "").replace(/"$/, "");
      file = {
        path: strip(b),
        oldPath: strip(a),
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (line.startsWith("new file mode")) file.status = "added";
      else if (line.startsWith("deleted file mode")) file.status = "deleted";
      else if (line.startsWith("rename from ")) {
        file.status = "renamed";
        file.oldPath = line.slice(12);
      } else if (line.startsWith("rename to ")) file.path = line.slice(10);
      else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) file.status = "binary";
    }

    const m = HUNK_RE.exec(line);
    if (m) {
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      hunk = { header: line, context: m[3], lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    const c = line[0];
    let dl: DiffLine | null = null;
    if (c === "+") {
      dl = { kind: "add", oldNo: null, newNo: newNo++, text: line.slice(1) };
      file.additions++;
    } else if (c === "-") {
      dl = { kind: "del", oldNo: oldNo++, newNo: null, text: line.slice(1) };
      file.deletions++;
    } else if (c === " ") {
      dl = { kind: "context", oldNo: oldNo++, newNo: newNo++, text: line.slice(1) };
    } else if (c === "\\") {
      const prev = hunk.lines[hunk.lines.length - 1];
      if (prev) prev.noEol = true;
    }
    if (dl) hunk.lines.push(dl);
  }
  return files;
}
