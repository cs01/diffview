import type { DiffLine, Hunk } from "./types";

/** [start, end) character ranges that differ within a line. */
export type Range = [number, number];

const TOKEN_RE = /\w+|\s+|[^\w\s]/g;
const MAX_LINE = 1500;
const MAX_CELLS = 250_000;

function tokenize(s: string): { text: string; start: number }[] {
  return [...s.matchAll(TOKEN_RE)].map((m) => ({ text: m[0], start: m.index! }));
}

function merge(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** Token-level LCS diff; returns the changed ranges on each side. */
export function wordDiff(a: string, b: string): { a: Range[]; b: Range[] } {
  const none = { a: [], b: [] };
  if (a.length > MAX_LINE || b.length > MAX_LINE) return none;
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = ta.length;
  const m = tb.length;
  if (n * m > MAX_CELLS) return none;

  const w = m + 1;
  const t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      t[i * w + j] =
        ta[i].text === tb[j].text ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);

  const ra: Range[] = [];
  const rb: Range[] = [];
  const span = (tk: { text: string; start: number }): Range => [tk.start, tk.start + tk.text.length];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i].text === tb[j].text) {
      i++;
      j++;
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) ra.push(span(ta[i++]));
    else rb.push(span(tb[j++]));
  }
  while (i < n) ra.push(span(ta[i++]));
  while (j < m) rb.push(span(tb[j++]));

  // A near-total rewrite is noise as emphasis; leave the line plain.
  const covered = (rs: Range[]) => rs.reduce((s, r) => s + r[1] - r[0], 0);
  if (a.trim() && covered(ra) >= a.length * 0.85 && covered(rb) >= b.length * 0.85) return none;
  return { a: merge(ra), b: merge(rb) };
}

export interface Cell {
  line: DiffLine;
  ranges: Range[];
}
export type Row =
  | { type: "hunk"; hunk: Hunk }
  | { type: "split"; left: Cell | null; right: Cell | null }
  | { type: "line"; cell: Cell };

interface Pair {
  ctx?: DiffLine;
  del: Cell | null;
  add: Cell | null;
}

/** Walk a hunk, pairing runs of deletions with the additions that follow. */
function pairs(hunk: Hunk): Pair[] {
  const out: Pair[] = [];
  const ls = hunk.lines;
  for (let i = 0; i < ls.length; ) {
    if (ls[i].kind === "context") {
      out.push({ ctx: ls[i++], del: null, add: null });
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < ls.length && ls[i].kind === "del") dels.push(ls[i++]);
    while (i < ls.length && ls[i].kind === "add") adds.push(ls[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const d = dels[k];
      const a = adds[k];
      const wd = d && a ? wordDiff(d.text, a.text) : { a: [], b: [] };
      out.push({ del: d ? { line: d, ranges: wd.a } : null, add: a ? { line: a, ranges: wd.b } : null });
    }
  }
  return out;
}

export function splitRows(hunks: Hunk[]): Row[] {
  const rows: Row[] = [];
  for (const h of hunks) {
    rows.push({ type: "hunk", hunk: h });
    for (const p of pairs(h)) {
      if (p.ctx) {
        const c = { line: p.ctx, ranges: [] };
        rows.push({ type: "split", left: c, right: c });
      } else rows.push({ type: "split", left: p.del, right: p.add });
    }
  }
  return rows;
}

/** Unified rows list a change block's deletions first, then its additions. */
export function unifiedRows(hunks: Hunk[]): Row[] {
  const rows: Row[] = [];
  for (const h of hunks) {
    rows.push({ type: "hunk", hunk: h });
    const ps = pairs(h);
    for (let i = 0; i < ps.length; ) {
      if (ps[i].ctx) {
        rows.push({ type: "line", cell: { line: ps[i].ctx!, ranges: [] } });
        i++;
        continue;
      }
      let j = i;
      while (j < ps.length && !ps[j].ctx) j++;
      for (let k = i; k < j; k++) if (ps[k].del) rows.push({ type: "line", cell: ps[k].del! });
      for (let k = i; k < j; k++) if (ps[k].add) rows.push({ type: "line", cell: ps[k].add! });
      i = j;
    }
  }
  return rows;
}

/** Single-column rows for added/deleted files. */
export function plainRows(hunks: Hunk[]): Row[] {
  const rows: Row[] = [];
  for (const h of hunks) {
    rows.push({ type: "hunk", hunk: h });
    for (const l of h.lines) rows.push({ type: "line", cell: { line: l, ranges: [] } });
  }
  return rows;
}
