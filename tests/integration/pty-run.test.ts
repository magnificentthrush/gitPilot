import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGitArgs, buildGitEnv, gitExecutable } from '../../src/main/git/git-env';
import { startPtyRun } from '../../src/main/pty/pty-run';

// ConPTY interleaves control sequences with the text, so strip OSC and CSI sequences.
const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex -- matching escape sequences is the point
  s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function runGit(args: string[], cwd: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    startPtyRun(
      {
        file: gitExecutable(),
        args: buildGitArgs(args),
        cwd,
        env: buildGitEnv(process.env),
        cols: 120,
        rows: 30,
      },
      {
        onData: (data) => (output += data),
        onExit: (exitCode) => resolve({ exitCode, output: stripAnsi(output) }),
      },
    );
  });
}

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'gitpilot-pty-'));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'GitPilot Test');
  git('config', 'user.email', 'test@example.invalid');
  // Enough commits that `git log` output would exceed one screen and trigger a pager.
  for (let i = 1; i <= 40; i++) {
    writeFileSync(join(repo, 'file.txt'), `line ${i}\n`);
    git('add', 'file.txt');
    git('commit', '-q', '-m', `Commit ${i}`);
  }
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('startPtyRun', () => {
  it('runs git in a PTY and reports success', async () => {
    const { exitCode, output } = await runGit(['--version'], repo);
    expect(exitCode).toBe(0);
    expect(output).toMatch(/git version \d+\.\d+/);
  });

  it('reports a non-zero exit code when git fails', async () => {
    const { exitCode, output } = await runGit(['not-a-real-command'], repo);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("'not-a-real-command' is not a git command");
  });

  it('never opens a pager, even for long output', async () => {
    const { exitCode, output } = await runGit(['log', '--oneline'], repo);
    expect(exitCode).toBe(0);
    expect(output).toContain('Commit 40');
    expect(output).toContain('Commit 1');
  });

  it.runIf(process.platform === 'win32')(
    'leaves no conhost.exe processes behind after runs finish',
    async () => {
      for (let i = 0; i < 5; i++) await runGit(['--version'], repo);
      await new Promise((r) => setTimeout(r, 1500));

      const children = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid}" | ForEach-Object { $_.Name }`,
        ],
        { encoding: 'utf8' },
      )
        .split(/\r?\n/)
        .map((name) => name.trim().toLowerCase());
      expect(children).not.toContain('conhost.exe');
    },
  );
});
