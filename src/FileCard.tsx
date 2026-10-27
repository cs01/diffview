import { memo, useEffect, useRef, useState } from "react";
import { DiffTable, type ViewMode } from "./DiffTable";
import { highlightHunks, type Tok } from "./highlight";
import type { DiffLine, FileDiff } from "./types";

export const STATUS_LABEL = { added: "added", deleted: "deleted", modified: "modified", renamed: "renamed", binary: "binary" } as const;

export function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

export const Counts = ({ a, d }: { a: number; d: number }) => (
  <span className="counts">
    {a > 0 && <span className="plus">+{a}</span>}
    {d > 0 && <span className="minus">{"−"}{d}</span>}
  </span>
);

interface Props {
  id: string;
  file: FileDiff;
  mode: ViewMode;
  collapsed: boolean;
  viewed: boolean;
  onToggleCollapse: () => void;
  onToggleViewed: () => void;
}

export const FileCard = memo(function FileCard({ id, file, mode, collapsed, viewed, onToggleCollapse, onToggleViewed }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [tokens, setTokens] = useState<Map<DiffLine, Tok[]> | null>(null);

  // Highlight only once a card has come near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || collapsed) return;
    let live = true;
    highlightHunks(file.path, file.hunks).then((t) => live && setTokens(t), (e) => console.error("highlight failed", e));
    return () => {
      live = false;
    };
  }, [near, collapsed, file.path, file.hunks]);

  const { dir, name } = splitPath(file.path);
  const renamedFrom = file.status === "renamed" ? file.oldPath : null;

  return (
    <article className={`card${collapsed ? " collapsed" : ""}`} id={id} ref={ref}>
      <header className="card-head">
        <button className="chev" onClick={onToggleCollapse} aria-label={collapsed ? "Expand" : "Collapse"} aria-expanded={!collapsed}>
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="path" onClick={onToggleCollapse}>
          <span className="dir">{dir}</span>
          <span className="name">{name}</span>
          {renamedFrom && <span className="from">{"←"} {renamedFrom}</span>}
        </span>
        <span className={`badge ${file.status}`}>{STATUS_LABEL[file.status]}</span>
        <Counts a={file.additions} d={file.deletions} />
        <label className="viewed">
          <input type="checkbox" checked={viewed} onChange={onToggleViewed} />
          Viewed
        </label>
      </header>
      {!collapsed &&
        (file.hunks.length ? (
          <div className="card-body">
            <DiffTable file={file} mode={mode} tokens={tokens} />
          </div>
        ) : (
          <div className="card-body note">
            {file.status === "binary" ? "Binary file not shown" : "No content changes"}
          </div>
        ))}
    </article>
  );
});
