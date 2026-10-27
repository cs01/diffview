import { createHighlighter, type Highlighter } from "shiki";
import type { DiffLine, Hunk } from "./types";

export interface Tok {
  text: string;
  color?: string;
}

const THEME = "github-dark-default";

const EXT: Record<string, string> = {
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", h: "cpp", inc: "cpp", def: "cpp",
  c: "c",
  cmake: "cmake",
  ts: "typescript", mts: "typescript", cts: "typescript",
  tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  json: "json",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  td: "tablegen",
  yml: "yaml", yaml: "yaml",
  toml: "toml", css: "css", html: "html", go: "go",
};

export function langFor(path: string): string | null {
  const base = path.split("/").pop() ?? "";
  if (base === "CMakeLists.txt") return "cmake";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT[ext] ?? null;
}

let hl: Promise<Highlighter> | null = null;
const loaded = new Map<string, Promise<boolean>>();
const cache = new Map<string, Tok[][]>();

const highlighter = () => (hl ??= createHighlighter({ themes: [THEME], langs: [] }));

function ensureLang(h: Highlighter, lang: string): Promise<boolean> {
  let p = loaded.get(lang);
  if (!p) {
    p = h.loadLanguage(lang as never).then(
      () => true,
      (e) => {
        console.error("shiki: cannot load language", lang, e);
        return false;
      },
    );
    loaded.set(lang, p);
  }
  return p;
}

function tokenizeText(h: Highlighter, lang: string, code: string): Tok[][] {
  const key = lang + "\0" + code;
  let r = cache.get(key);
  if (!r) {
    const toks = h.codeToTokensBase(code, { lang: lang as never, theme: THEME, tokenizeMaxLineLength: 2000 });
    r = toks.map((l) => l.map((t) => ({ text: t.content, color: t.color })));
    cache.set(key, r);
  }
  return r;
}

/**
 * Tokenize each hunk's old and new side as separate snippets so multi-line
 * constructs inside a hunk highlight sensibly, then map tokens back to lines.
 */
export async function highlightHunks(path: string, hunks: Hunk[]): Promise<Map<DiffLine, Tok[]> | null> {
  const lang = langFor(path);
  if (!lang) return null;
  const h = await highlighter();
  if (!(await ensureLang(h, lang))) return null;
  const out = new Map<DiffLine, Tok[]>();
  for (const hunk of hunks) {
    for (const side of ["old", "new"] as const) {
      const ls = hunk.lines.filter((l) => (side === "old" ? l.kind !== "add" : l.kind !== "del"));
      if (!ls.length) continue;
      const toks = tokenizeText(h, lang, ls.map((l) => l.text).join("\n"));
      ls.forEach((l, i) => {
        if (l.kind === "context" && side === "old") return; // context takes the new side's tokens
        out.set(l, toks[i] ?? []);
      });
    }
  }
  return out;
}
