import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcLimits, type AppInfo, type RunGitResult } from '@shared/ipc';
import { buildGitArgs, buildGitEnv, gitExecutable } from './git/git-env';
import { startPtyRun, type PtyRun } from './pty/pty-run';

interface ActiveRun {
  id: number;
  run: PtyRun;
}

export function registerIpcHandlers(win: BrowserWindow): void {
  let nextRunId = 1;
  let active: ActiveRun | null = null;
  let size = { cols: 80, rows: 24 };

  /** Only accept messages from our own window's top-level frame. */
  const fromMainWindow = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;

  const send = (channel: string, ...args: unknown[]): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  ipcMain.handle(IpcChannel.AppInfo, (event): AppInfo => {
    if (!fromMainWindow(event)) throw new Error('Rejected IPC sender');
    return {
      platform: process.platform,
      cwd: process.cwd(),
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
    };
  });

  ipcMain.handle(IpcChannel.RunGit, (event, args: unknown): RunGitResult => {
    if (!fromMainWindow(event)) return { ok: false, error: 'Rejected IPC sender' };
    if (!isValidArgs(args)) return { ok: false, error: 'Invalid arguments' };
    if (active) return { ok: false, error: 'A command is already running' };

    const id = nextRunId++;
    try {
      const run = startPtyRun(
        {
          file: gitExecutable(),
          args: buildGitArgs(args),
          cwd: process.cwd(),
          env: buildGitEnv(process.env),
          ...size,
        },
        {
          onData: (data) => send(IpcChannel.PtyData, id, data),
          onExit: (exitCode) => {
            if (active?.id === id) active = null;
            send(IpcChannel.PtyExit, id, exitCode);
          },
        },
      );
      active = { id, run };
      return { ok: true, runId: id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.on(IpcChannel.PtyInput, (event, runId: unknown, data: unknown) => {
    if (!fromMainWindow(event)) return;
    if (typeof data !== 'string' || data.length > IpcLimits.maxInputLength) return;
    if (active && active.id === runId) active.run.write(data);
  });

  ipcMain.on(IpcChannel.PtyResize, (event, cols: unknown, rows: unknown) => {
    if (!fromMainWindow(event)) return;
    if (!isIntInRange(cols, IpcLimits.minCols, IpcLimits.maxCols)) return;
    if (!isIntInRange(rows, IpcLimits.minRows, IpcLimits.maxRows)) return;
    size = { cols, rows };
    active?.run.resize(cols, rows);
  });

  win.on('closed', () => {
    active?.run.kill();
    active = null;
  });
}

function isValidArgs(args: unknown): args is string[] {
  return (
    Array.isArray(args) &&
    args.length <= IpcLimits.maxArgs &&
    args.every((a) => typeof a === 'string' && a.length <= IpcLimits.maxArgLength)
  );
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
