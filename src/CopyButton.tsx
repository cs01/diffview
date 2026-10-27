import { useEffect, useState } from "react";

export function CopyButton({ text, label, abs }: { text: string; label: string; abs?: boolean }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <button
      className={`copy${done ? " done" : ""}`}
      title={done ? "Copied" : label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(text).then(() => setDone(true), () => {});
      }}
    >
      {done ? (
        <span className="copied">copied</span>
      ) : (
        <>
          {abs && <span className="slash">/</span>}
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" strokeLinecap="round" />
        </svg>
        </>
      )}
    </button>
  );
}
