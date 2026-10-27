export type LineKind = "context" | "add" | "del";
export interface DiffLine {
  kind: LineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
  /** line is followed by "\ No newline at end of file" */
  noEol?: boolean;
}
export interface Hunk {
  header: string;
  context: string;
  lines: DiffLine[];
}
export type FileStatus = "added" | "deleted" | "modified" | "renamed" | "binary";
export interface FileDiff {
  path: string;
  oldPath: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: Hunk[];
}
export interface Section {
  title: string;
  dir: string;
  cmd: string;
  files: FileDiff[];
  error?: string;
}
export interface DiffPayload {
  version: string;
  sections: Section[];
}
