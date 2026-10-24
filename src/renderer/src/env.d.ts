import type { GitPilotApi } from '@shared/ipc';

declare global {
  interface Window {
    gitpilot: GitPilotApi;
  }
}

export {};
