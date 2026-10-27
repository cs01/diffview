import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewMode } from "./DiffTable";
import { CopyButton } from "./CopyButton";
import { Counts, FileCard, splitPath, STATUS_LABEL } from "./FileCard";
import { load, save } from "./storage";
import type { DiffPayload } from "./types";

const TOPBAR = 48;
const fileId = (si: number, fi: number) => `f-${si}-${fi}`;
const keyOf = (title: string, path: string) => `${title}\u0000${path}`;

function useDiff() {
  const [data, setData] = useState<DiffPayload | null>(null);
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const version = useRef("");

  const apply = useCallback((p: DiffPayload) => {
    if (p.version === version.current) return;
    version.current = p.version;
    setData(p);
    setUpdated(new Date());
  }, []);

  useEffect(() => {
    const fetchAll = () =>
      fetch("/api/diff")
        .then((r) => r.json() as Promise<DiffPayload>)
        .then(apply)
        .catch(() => {});
    fetchAll();
    const hot = import.meta.hot;
    if (!hot) return;
    // A reconnect may have missed pushes, so resync once.
    const up = () => {
      hot.send("diffview:hello", {});
      fetchAll();
    };
    const down = () => setLive(false);
    const hello = () => setLive(true);
    hot.send("diffview:hello", {});
    hot.on("diffview:hello", hello);
    hot.on("vite:ws:connect", up);
    hot.on("vite:ws:disconnect", down);
    hot.on("diffview:update", apply);
    return () => {
      hot.off("vite:ws:connect", up);
      hot.off("vite:ws:disconnect", down);
      hot.off("diffview:update", apply);
      hot.off("diffview:hello", hello);
    };
  }, [apply]);

  return { data, live, updated };
}

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour12: false });

export function App() {
  const { data, live, updated } = useDiff();
  const [mode, setMode] = useState<ViewMode>(() => (load<string>("diffview:mode", "split") === "unified" ? "unified" : "split"));
  const [viewed, setViewed] = useState<Set<string>>(() => new Set(load<string[]>("diffview:viewed", [])));
  // Explicit collapse choices; files without one follow their viewed state.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [current, setCurrent] = useState<string>("");

  useEffect(() => save("diffview:mode", mode), [mode]);
  useEffect(() => save("diffview:viewed", [...viewed]), [viewed]);

  const files = useMemo(
    () =>
      (data?.sections ?? []).flatMap((s, si) =>
        s.files.map((f, fi) => ({ id: fileId(si, fi), key: keyOf(s.title, f.path), file: f })),
      ),
    [data],
  );
  const isCollapsed = (key: string) => overrides.get(key) ?? viewed.has(key);

  const toggleViewed = useCallback((key: string) => {
    const on = !viewed.has(key);
    setViewed((v) => {
      const n = new Set(v);
      on ? n.add(key) : n.delete(key);
      return n;
    });
    setOverrides((o) => new Map(o).set(key, on));
  }, [viewed]);

  const toggleCollapse = useCallback((key: string, now: boolean) => setOverrides((o) => new Map(o).set(key, !now)), []);

  const cards = () => files.map((f) => ({ f, top: document.getElementById(f.id)?.getBoundingClientRect().top ?? Infinity }));
  const currentFile = () => {
    const cs = cards();
    return [...cs].reverse().find((c) => c.top <= TOPBAR + 2)?.f ?? cs[0]?.f;
  };

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCurrent(currentFile()?.id ?? ""));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  });

  const jump = (id: string, smooth = true) =>
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "instant" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") return;
      if (e.key === "j" || e.key === "k") {
        const cs = cards();
        const target =
          e.key === "j"
            ? cs.find((c) => c.top > TOPBAR + 2)
            : [...cs].reverse().find((c) => c.top < TOPBAR - 2);
        if (target) jump(target.f.id);
      } else if (e.key === "v") {
        const c = currentFile();
        if (c) toggleViewed(c.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Deep link for screenshots and sharing: #path/suffix scrolls to that file once.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !files.length || !location.hash) return;
    jumped.current = true;
    const want = decodeURIComponent(location.hash.slice(1));
    const hit = files.find((f) => f.file.path === want) ?? files.find((f) => f.file.path.endsWith(want));
    if (hit) requestAnimationFrame(() => jump(hit.id, false));
  }, [files]);

  // ?only=<path suffix> renders a single file (handy for screenshots).
  const only = useMemo(() => new URLSearchParams(location.search).get("only"), []);
  const shown = (path: string) => !only || path.endsWith(only);

  const totals = files.reduce((t, f) => ({ a: t.a + f.file.additions, d: t.d + f.file.deletions }), { a: 0, d: 0 });

  return (
    <>
      <div className="topbar">
        <h1>diffview</h1>
        <span className="stat">{files.length} files</span>
        <Counts a={totals.a} d={totals.d} />
        <span className="spacer" />
        <span className={`live ${live ? "on" : "off"}`} title={live ? "Watching for changes" : "Disconnected"}>
          <i />
          {live ? "live" : "offline"}
          {updated && <span className="time">updated {fmtTime(updated)}</span>}
        </span>
        <div className="seg" role="group" aria-label="Diff view">
          {(["split", "unified"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "split" ? "Side by side" : "Unified"}
            </button>
          ))}
        </div>
      </div>
      <div className="layout">
        <nav className="sidebar">
          {data?.sections.map((s, si) => (
            <div key={si} className="side-section">
              <div className="side-title" title={`${s.dir}\n${s.cmd}`}>
                {s.title}
                <span className="n">{s.files.length}</span>
              </div>
              {s.files.map((f, fi) => {
                const id = fileId(si, fi);
                const { dir, name } = splitPath(f.path);
                const key = keyOf(s.title, f.path);
                return (
                  <div
                    key={f.path}
                    className={`side-file${current === id ? " cur" : ""}${viewed.has(key) ? " done" : ""}`}
                    title={f.path}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(id);
                    }}
                  >
                    <span className={`dot ${f.status}`} title={STATUS_LABEL[f.status]} />
                    <span className="side-path">
                      <span className="name">{name}</span>
                      {dir && <span className="dir">{dir}</span>}
                    </span>
                    <span className="copies">
                      <CopyButton text={f.path} label="Copy relative path" />
                      <CopyButton text={f.absPath} label="Copy absolute path" abs />
                    </span>
                    <Counts a={f.additions} d={f.deletions} />
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <main className="main">
          {!data && <p className="empty">Loading…</p>}
          {data?.sections.map((s, si) => (
            <section key={si} className="section">
              <div className="section-head">
                <h2>{s.title}</h2>
                <code>
                  {s.dir.replace(/^\/Users\/[^/]+/, "~")} $ {s.cmd}
                </code>
              </div>
              {s.error && <pre className="error">{s.error}</pre>}
              {!s.error && !s.files.length && <p className="empty">No changes.</p>}
              {s.files.map((f, fi) => {
                if (!shown(f.path)) return null;
                const key = keyOf(s.title, f.path);
                const collapsed = isCollapsed(key);
                return (
                  <FileCard
                    key={f.path}
                    id={fileId(si, fi)}
                    file={f}
                    mode={mode}
                    collapsed={collapsed}
                    viewed={viewed.has(key)}
                    onToggleCollapse={() => toggleCollapse(key, collapsed)}
                    onToggleViewed={() => toggleViewed(key)}
                  />
                );
              })}
            </section>
          ))}
        </main>
      </div>
    </>
  );
}
