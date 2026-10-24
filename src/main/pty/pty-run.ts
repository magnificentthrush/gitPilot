import * as pty from 'node-pty';

export interface PtyRunOptions {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

export interface PtyRunHandlers {
  onData(data: string): void;
  onExit(exitCode: number): void;
}

export interface PtyRun {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ends the process if it is still running. */
  kill(): void;
}

/** Runs one process in a pseudo-terminal, releasing all of its resources once it exits. */
export function startPtyRun(options: PtyRunOptions, handlers: PtyRunHandlers): PtyRun {
  const proc = pty.spawn(options.file, options.args, {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env,
  });

  let exited = false;
  proc.onData(handlers.onData);
  proc.onExit(({ exitCode }) => {
    exited = true;
    handlers.onExit(exitCode);
    if (process.platform === 'win32') releaseWindowsPty(proc);
  });

  return {
    pid: proc.pid,
    write(data) {
      if (!exited) proc.write(data);
    },
    resize(cols, rows) {
      if (!exited) proc.resize(cols, rows);
    },
    kill() {
      if (!exited) proc.kill();
    },
  };
}

interface WindowsPtyInternals {
  _agent?: {
    _inSocket?: { destroy(): void };
    _conoutSocketWorker?: { dispose(): void };
  };
}

/**
 * node-pty 1.1.0 on Windows keeps the ConPTY input pipe and its conout worker
 * thread open after the child exits. Each run would leak a conhost.exe process
 * and a worker thread. Its public `kill()` does not fix this either: it forks a
 * helper that fails with "AttachConsole failed" once the process is gone, then
 * kills the old PID after a timeout, which may by then belong to another process.
 *
 * Closing those two handles lets conhost.exe exit and stops the worker. These
 * are private fields, so node-pty is pinned to an exact version and
 * tests/integration/pty-run.test.ts checks for leftover conhost processes.
 */
function releaseWindowsPty(proc: pty.IPty): void {
  const agent = (proc as unknown as WindowsPtyInternals)._agent;
  agent?._inSocket?.destroy();
  agent?._conoutSocketWorker?.dispose();
}
