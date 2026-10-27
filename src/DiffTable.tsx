import { memo, useMemo } from "react";
import { plainRows, splitRows, unifiedRows, type Cell, type Row } from "./diff";
import type { Tok } from "./highlight";
import type { DiffLine, FileDiff } from "./types";

export type ViewMode = "split" | "unified";
type Tokens = Map<DiffLine, Tok[]> | null;

function Code({ cell, tokens }: { cell: Cell; tokens: Tokens }) {
  const { text } = cell.line;
  if (!text) return <>{"​"}</>;
  let toks = tokens?.get(cell.line);
  if (toks && toks.map((t) => t.text).join("") !== text) toks = undefined;
  const pieces = toks ?? [{ text } as Tok];
  const ranges = cell.ranges;
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const t of pieces) {
    const end = pos + t.text.length;
    // Cut the token at every range boundary that falls inside it.
    const cuts = new Set<number>([pos, end]);
    for (const [s, e] of ranges) {
      if (s > pos && s < end) cuts.add(s);
      if (e > pos && e < end) cuts.add(e);
    }
    const pts = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const piece = text.slice(a, pts[i + 1]);
      const changed = ranges.some(([s, e]) => a >= s && a < e);
      out.push(
        <span key={a} style={t.color ? { color: t.color } : undefined} className={changed ? "w" : undefined}>
          {piece}
        </span>,
      );
    }
    pos = end;
  }
  return (
    <>
      {out}
      {cell.line.noEol && <span className="noeol" title="No newline at end of file">no newline</span>}
    </>
  );
}

function HunkRow({ cols, row }: { cols: number; row: Extract<Row, { type: "hunk" }> }) {
  const m = /^(@@ .*? @@)/.exec(row.hunk.header);
  return (
    <tr className="hunk">
      <td colSpan={cols}>
        <span className="hunk-range">{m ? m[1] : row.hunk.header}</span>
        {row.hunk.context && <span className="hunk-ctx">{row.hunk.context}</span>}
      </td>
    </tr>
  );
}

const MARK = { add: "+", del: "−", context: "" } as const;

function SplitTable({ rows, tokens }: { rows: Row[]; tokens: Tokens }) {
  return (
    <table className="diff split">
      <colgroup>
        <col className="c-num" />
        <col />
        <col className="c-num" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((r, i) => {
          if (r.type === "hunk") return <HunkRow key={i} cols={4} row={r} />;
          if (r.type !== "split") return null;
          const l = r.left;
          const rt = r.right;
          const lk = l ? l.line.kind : "empty";
          const rk = rt ? rt.line.kind : "empty";
          return (
            <tr key={i}>
              <td className={`num ${lk}`} data-n={l?.line.oldNo ?? ""} />
              <td className={`code ${lk}`}>{l && <Code cell={l} tokens={tokens} />}</td>
              <td className={`num mid ${rk}`} data-n={rt?.line.newNo ?? ""} />
              <td className={`code ${rk}`}>{rt && <Code cell={rt} tokens={tokens} />}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function UnifiedTable({ rows, tokens }: { rows: Row[]; tokens: Tokens }) {
  return (
    <table className="diff unified">
      <colgroup>
        <col className="c-num" />
        <col className="c-num" />
        <col className="c-mark" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((r, i) => {
          if (r.type === "hunk") return <HunkRow key={i} cols={4} row={r} />;
          if (r.type !== "line") return null;
          const k = r.cell.line.kind;
          return (
            <tr key={i}>
              <td className={`num ${k}`} data-n={r.cell.line.oldNo ?? ""} />
              <td className={`num ${k}`} data-n={r.cell.line.newNo ?? ""} />
              <td className={`mark ${k}`} data-m={MARK[k]} />
              <td className={`code ${k}`}>
                <Code cell={r.cell} tokens={tokens} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PlainTable({ rows, tokens, deleted }: { rows: Row[]; tokens: Tokens; deleted: boolean }) {
  return (
    <table className="diff plain">
      <colgroup>
        <col className="c-num" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((r, i) => {
          if (r.type === "hunk") return <HunkRow key={i} cols={2} row={r} />;
          if (r.type !== "line") return null;
          const l = r.cell.line;
          return (
            <tr key={i}>
              <td className={`num ${l.kind}`} data-n={(deleted ? l.oldNo : l.newNo) ?? ""} />
              <td className={`code ${l.kind}`}>
                <Code cell={r.cell} tokens={tokens} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const DiffTable = memo(function DiffTable({
  file,
  mode,
  tokens,
}: {
  file: FileDiff;
  mode: ViewMode;
  tokens: Tokens;
}) {
  const single = file.status === "added" || file.status === "deleted";
  const rows = useMemo(
    () => (single ? plainRows(file.hunks) : mode === "split" ? splitRows(file.hunks) : unifiedRows(file.hunks)),
    [file.hunks, mode, single],
  );
  if (single) return <PlainTable rows={rows} tokens={tokens} deleted={file.status === "deleted"} />;
  return mode === "split" ? <SplitTable rows={rows} tokens={tokens} /> : <UnifiedTable rows={rows} tokens={tokens} />;
});

