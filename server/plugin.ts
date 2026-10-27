import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import type { DiffPayload, Section } from "../src/types.ts";
import { parseDiff } from "./parse.ts";

const exec = promisify(execFile);

interface SectionSpec {
  title: string;
  dir: string;
  args: string;
}

/** Quiet period after the last file event before diffs are recomputed. */
const DEBOUNCE_MS = 5000;

function specs(): SectionSpec[] {
  return JSON.parse(process.env.DIFFVIEW_SECTIONS ?? "[]");
}

/** Split a shell-ish argument string, honouring simple quotes. */
function splitArgs(s: string): string[] {
  return [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

async function runSection(spec: SectionSpec): Promise<{ section: Section; raw: string }> {
  const args = ["diff", ...splitArgs(spec.args)];
  const cmd = `git ${args.join(" ")}`;
  try {
    const { stdout } = await exec("git", args, {
      cwd: spec.dir,
      maxBuffer: 1024 * 1024 * 1024,
    });
    return { section: { title: spec.title, dir: spec.dir, cmd, files: parseDiff(stdout, spec.dir) }, raw: stdout };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { section: { title: spec.title, dir: spec.dir, cmd, files: [], error: msg }, raw: `error:${msg}` };
  }
}

async function compute(): Promise<DiffPayload> {
  const results = await Promise.all(specs().map(runSection));
  const hash = createHash("sha1");
  for (const r of results) hash.update(r.raw);
  return { version: hash.digest("hex"), sections: results.map((r) => r.section) };
}

// Build trees and VCS internals churn constantly during a build; none of it
// can change `git diff` output except the git state files we watch explicitly.
function ignored(rel: string, inGitDir: boolean): boolean {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (/\.lock$|\.sw[a-p]$|~$|^\.#|^#.*#$|^\.DS_Store$|^4913$/.test(base)) return true;
  if (inGitDir) return parts[0] === "objects" || parts[0] === "logs";
  const first = parts[0];
  if (first.startsWith("build") || first.endsWith(".noindex")) return true;
  if (first === ".git") return parts[1] === "objects" || parts[1] === "logs";
  return false;
}

async function gitDirs(dir: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--absolute-git-dir", "--path-format=absolute", "--git-common-dir"], { cwd: dir });
    return [...new Set(stdout.trim().split("\n"))];
  } catch {
    return [];
  }
}

export function diffviewPlugin(): Plugin {
  return {
    name: "diffview",
    configureServer(server) {
      let current: Promise<DiffPayload> = compute();
      let lastVersion = "";
      current.then((p) => (lastVersion = p.version));

      server.middlewares.use("/api/diff", async (_req, res) => {
        const p = await current;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(p));
      });
      server.middlewares.use("/api/version", async (_req, res) => {
        res.setHeader("content-type", "text/plain");
        res.end((await current).version);
      });

      // The client cannot observe the socket opening before its listeners attach, so it asks.
      server.ws.on("diffview:hello", (_data, client) => client.send("diffview:hello", {}));

      let timer: NodeJS.Timeout | undefined;
      let running = false;
      let again = false;
      const refresh = async () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        try {
          current = compute();
          const p = await current;
          if (p.version !== lastVersion) {
            lastVersion = p.version;
            server.ws.send({ type: "custom", event: "diffview:update", data: p });
          }
        } finally {
          running = false;
          if (again) {
            again = false;
            schedule();
          }
        }
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, DEBOUNCE_MS);
      };

      const watchers: FSWatcher[] = [];
      const add = (root: string, inGitDir: boolean) => {
        try {
          watchers.push(
            watch(root, { recursive: true }, (_ev, name) => {
              if (name && !ignored(name.split("\\").join("/"), inGitDir)) schedule();
            }),
          );
        } catch (e) {
          console.warn(`diffview: cannot watch ${root}: ${e}`);
        }
      };
      void (async () => {
        const seen = new Set<string>();
        for (const s of specs()) {
          if (!seen.has(s.dir)) {
            seen.add(s.dir);
            add(s.dir, false);
          }
          for (const gd of await gitDirs(s.dir)) {
            // Worktrees keep HEAD/index in one gitdir and branch refs in the common one.
            if (!gd.startsWith(s.dir + "/") && !seen.has(gd)) {
              seen.add(gd);
              add(gd, true);
            }
          }
        }
      })();
      server.httpServer?.on("close", () => watchers.forEach((w) => w.close()));
    },
  };
}
