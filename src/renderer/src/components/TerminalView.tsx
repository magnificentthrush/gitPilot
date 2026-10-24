import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalHandle {
  writeln(text: string): void;
  focus(): void;
}

interface TerminalViewProps {
  ref?: Ref<TerminalHandle>;
  /** While a command runs, keystrokes in the terminal go to its PTY. */
  activeRunId: number | null;
}

export function TerminalView({ ref, activeRunId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const activeRunIdRef = useRef(activeRunId);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: false,
      scrollback: 5000,
      theme: { background: '#14161a', foreground: '#d8dbe2' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;

    const fitAndReport = (): void => {
      fit.fit();
      window.gitpilot.resize(term.cols, term.rows);
    };
    fitAndReport();
    const observer = new ResizeObserver(fitAndReport);
    observer.observe(container);

    // Only one command runs at a time, so all PTY output belongs on screen. Not
    // filtering by run id avoids dropping output that arrives before the
    // renderer has learned the new run's id.
    const offData = window.gitpilot.onPtyData((_runId, data) => term.write(data));
    const inputSub = term.onData((data) => {
      const runId = activeRunIdRef.current;
      if (runId !== null) window.gitpilot.writeInput(runId, data);
    });

    return () => {
      observer.disconnect();
      offData();
      inputSub.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    writeln: (text) => termRef.current?.writeln(text),
    focus: () => termRef.current?.focus(),
  }));

  return <div className="terminal-view" ref={containerRef} />;
}
