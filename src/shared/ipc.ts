/**
 * The IPC contract between the main process and the renderer.
 *
 * The renderer never touches Node, Git or the file system directly. It can only
 * use the narrow API that the preload script exposes on `window.gitpilot`.
 */

export const IpcChannel = {
  AppInfo: 'app:info',
  RunGit: 'git:run',
  PtyInput: 'pty:input',
  PtyResize: 'pty:resize',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
} as const;

export interface AppInfo {
  platform: string;
  cwd: string;
  versions: { electron: string; node: string; chrome: string };
}

export type RunGitResult = { ok: true; runId: number } | { ok: false; error: string };

export type Unsubscribe = () => void;

/** The API the preload script exposes to the renderer as `window.gitpilot`. */
export interface GitPilotApi {
  getAppInfo(): Promise<AppInfo>;
  /** M0 spike: runs `git <args>` in a PTY. M1 replaces this with the command pipeline. */
  runGit(args: string[]): Promise<RunGitResult>;
  writeInput(runId: number, data: string): void;
  resize(cols: number, rows: number): void;
  onPtyData(listener: (runId: number, data: string) => void): Unsubscribe;
  onPtyExit(listener: (runId: number, exitCode: number) => void): Unsubscribe;
}

/** Limits applied to anything arriving over IPC from the renderer. */
export const IpcLimits = {
  maxArgs: 64,
  maxArgLength: 4096,
  maxInputLength: 65536,
  minCols: 2,
  maxCols: 1000,
  minRows: 1,
  maxRows: 500,
} as const;
