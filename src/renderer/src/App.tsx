import { useEffect, useRef, useState } from 'react';
import type { AppInfo } from '@shared/ipc';
import { CommandBar, type CommandBarHandle } from './components/CommandBar';
import { GuidancePanel } from './components/GuidancePanel';
import { StatePanel } from './components/StatePanel';
import { TerminalView, type TerminalHandle } from './components/TerminalView';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function App() {
  const terminalRef = useRef<TerminalHandle>(null);
  const commandBarRef = useRef<CommandBarHandle>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // A fast command can exit before `runGit` resolves; remember those ids so the
  // run is never marked active after it has already finished.
  const exitedRunIds = useRef(new Set<number>());

  useEffect(() => {
    void window.gitpilot.getAppInfo().then(setInfo);
    return window.gitpilot.onPtyExit((runId, exitCode) => {
      exitedRunIds.current.add(runId);
      if (exitCode !== 0) terminalRef.current?.writeln(`${DIM}[exit code ${exitCode}]${RESET}`);
      setActiveRunId((current) => (current === runId ? null : current));
    });
  }, []);

  const busy = starting || activeRunId !== null;

  useEffect(() => {
    if (busy) terminalRef.current?.focus();
    else commandBarRef.current?.focus();
  }, [busy]);

  const handleSubmit = async (line: string): Promise<void> => {
    const terminal = terminalRef.current;
    terminal?.writeln(`${BOLD}$ ${line}${RESET}`);

    const [command, ...args] = line.split(/\s+/);
    if (command !== 'git') {
      terminal?.writeln(`${DIM}Only git commands run in this early build.${RESET}`);
      return;
    }

    setStarting(true);
    const result = await window.gitpilot.runGit(args);
    setStarting(false);
    if (!result.ok) {
      terminal?.writeln(`${DIM}Could not run the command: ${result.error}${RESET}`);
    } else if (!exitedRunIds.current.has(result.runId)) {
      setActiveRunId(result.runId);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>GitPilot</h1>
        <span className="muted" title="Working directory">
          {info?.cwd ?? '…'}
        </span>
        <span className="badge">M0 preview</span>
      </header>
      <main className="terminal-pane">
        <TerminalView ref={terminalRef} activeRunId={activeRunId} />
      </main>
      <aside className="side-top">
        <StatePanel />
      </aside>
      <footer className="command-pane">
        <CommandBar ref={commandBarRef} busy={busy} onSubmit={(line) => void handleSubmit(line)} />
        <p className="hint muted">
          Arguments are split on spaces for now. Quoted arguments arrive with the command parser in
          M1.
        </p>
      </footer>
      <aside className="side-bottom">
        <GuidancePanel />
      </aside>
    </div>
  );
}
