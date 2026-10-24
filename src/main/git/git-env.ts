/**
 * How GitPilot invokes Git: which executable, which config overrides, and which
 * environment. Kept free of Electron imports so it can be unit tested.
 */

/** Config passed with `-c` on every invocation, ahead of the student's own arguments. */
export const GIT_CONFIG_OVERRIDES: readonly string[] = [
  '-c',
  'core.pager=cat',
  '-c',
  'color.ui=always',
];

/**
 * node-pty on Windows does not search PATH for a bare `git`; it needs the
 * `.exe` name (or a full path) or it fails with "File not found".
 */
export function gitExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'git.exe' : 'git';
}

export function buildGitArgs(userArgs: readonly string[]): string[] {
  return [...GIT_CONFIG_OVERRIDES, ...userArgs];
}

/**
 * Environment for Git processes:
 * - no pager, so `git log` / `git diff` never block waiting for input
 * - C locale, so error messages are stable English text the error interpreter can match
 */
export function buildGitEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) env[key] = value;
  }
  env.GIT_PAGER = 'cat';
  env.PAGER = 'cat';
  env.LC_ALL = 'C';
  env.LANG = 'C';
  env.TERM ??= 'xterm-256color';
  return env;
}
