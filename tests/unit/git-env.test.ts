import { describe, expect, it } from 'vitest';
import {
  GIT_CONFIG_OVERRIDES,
  buildGitArgs,
  buildGitEnv,
  gitExecutable,
} from '../../src/main/git/git-env';

describe('gitExecutable', () => {
  it('uses git.exe on Windows, where node-pty does not resolve a bare name', () => {
    expect(gitExecutable('win32')).toBe('git.exe');
  });

  it('uses git elsewhere', () => {
    expect(gitExecutable('linux')).toBe('git');
    expect(gitExecutable('darwin')).toBe('git');
  });
});

describe('buildGitArgs', () => {
  it('puts config overrides before the student arguments', () => {
    expect(buildGitArgs(['log', '--oneline'])).toEqual([
      ...GIT_CONFIG_OVERRIDES,
      'log',
      '--oneline',
    ]);
  });

  it('disables the pager', () => {
    expect(buildGitArgs([]).join(' ')).toContain('core.pager=cat');
  });
});

describe('buildGitEnv', () => {
  it('disables pagers and forces the C locale', () => {
    const env = buildGitEnv({ PATH: '/usr/bin', LANG: 'de_DE.UTF-8' });
    expect(env).toMatchObject({ GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C', LANG: 'C' });
  });

  it('keeps the rest of the environment and drops undefined values', () => {
    const env = buildGitEnv({ PATH: '/usr/bin', EMPTY: undefined });
    expect(env.PATH).toBe('/usr/bin');
    expect('EMPTY' in env).toBe(false);
  });

  it('sets TERM only when it is missing', () => {
    expect(buildGitEnv({}).TERM).toBe('xterm-256color');
    expect(buildGitEnv({ TERM: 'dumb' }).TERM).toBe('dumb');
  });
});
