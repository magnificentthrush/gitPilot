import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type GitPilotApi } from '@shared/ipc';

// Runs sandboxed: only `contextBridge` and `ipcRenderer` are used, and raw
// `ipcRenderer` is never handed to the page.
const api: GitPilotApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.AppInfo),
  runGit: (args) => ipcRenderer.invoke(IpcChannel.RunGit, args),
  writeInput: (runId, data) => ipcRenderer.send(IpcChannel.PtyInput, runId, data),
  resize: (cols, rows) => ipcRenderer.send(IpcChannel.PtyResize, cols, rows),
  onPtyData: (listener) => {
    const handler = (_event: IpcRendererEvent, runId: number, data: string): void =>
      listener(runId, data);
    ipcRenderer.on(IpcChannel.PtyData, handler);
    return () => ipcRenderer.removeListener(IpcChannel.PtyData, handler);
  },
  onPtyExit: (listener) => {
    const handler = (_event: IpcRendererEvent, runId: number, exitCode: number): void =>
      listener(runId, exitCode);
    ipcRenderer.on(IpcChannel.PtyExit, handler);
    return () => ipcRenderer.removeListener(IpcChannel.PtyExit, handler);
  },
};

contextBridge.exposeInMainWorld('gitpilot', api);
