import { useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';

export interface CommandBarHandle {
  focus(): void;
}

interface CommandBarProps {
  ref?: Ref<CommandBarHandle>;
  busy: boolean;
  onSubmit(line: string): void;
}

export function CommandBar({ ref, busy, onSubmit }: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  // Index into history while browsing with the arrow keys; null when editing a new line.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      const line = value.trim();
      if (!line || busy) return;
      setHistory((h) => (h[h.length - 1] === line ? h : [...h, line]));
      setHistoryIndex(null);
      setValue('');
      onSubmit(line);
    } else if (event.key === 'ArrowUp' && history.length > 0) {
      event.preventDefault();
      const index = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setValue(history[index] ?? '');
    } else if (event.key === 'ArrowDown' && historyIndex !== null) {
      event.preventDefault();
      const index = historyIndex + 1;
      if (index >= history.length) {
        setHistoryIndex(null);
        setValue('');
      } else {
        setHistoryIndex(index);
        setValue(history[index] ?? '');
      }
    }
  };

  return (
    <div className="command-bar">
      <span className="prompt" aria-hidden>
        &gt;
      </span>
      <input
        ref={inputRef}
        className="command-input"
        aria-label="Command"
        placeholder={
          busy ? 'Running… keystrokes go to the terminal' : 'Type a Git command, e.g. git status'
        }
        value={value}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        autoFocus
        onChange={(event) => {
          setValue(event.target.value);
          setHistoryIndex(null);
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
