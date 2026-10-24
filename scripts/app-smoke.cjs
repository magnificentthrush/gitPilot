// End-to-end smoke test for the built app (run `npm run smoke`).
//
// Starts the real main process from out/, waits for the window, then from inside
// the renderer checks that:
//   1. the page rendered and has no Node access (context isolation + sandbox)
//   2. `git --version` runs through IPC -> node-pty -> git and exits 0
//   3. keystrokes reach a running process, and Ctrl+C interrupts it
const path = require('node:path');
const { app } = require('electron');

const TIMEOUT_MS = 30_000;

// ConPTY interleaves control sequences with the text (it sets the window title
// right after the first character), so strip OSC and CSI sequences before matching.
const stripAnsi = (s) =>
  // eslint-disable-next-line no-control-regex -- matching escape sequences is the point
  s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function finish(ok, message) {
  console[ok ? 'log' : 'error'](`SMOKE ${ok ? 'PASS' : 'FAIL'}: ${message}`);
  app.exit(ok ? 0 : 1);
}

setTimeout(() => finish(false, 'timed out'), TIMEOUT_MS).unref();

const rendererCheck = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !document.querySelector('.terminal-view .xterm'); i++) await sleep(100);

  const api = window.gitpilot;
  const run = (args, onStart) => new Promise((resolve, reject) => {
    let data = '';
    const offData = api.onPtyData((_id, d) => { data += d; });
    const offExit = api.onPtyExit((_id, code) => { offData(); offExit(); resolve({ code, data }); });
    api.runGit(args).then((r) => (r.ok ? onStart && onStart(r.runId) : reject(new Error(r.error))));
  });

  const version = await run(['--version']);
  const interactive = await run(['cat-file', '--batch-check'], async (runId) => {
    await sleep(500);
    api.writeInput(runId, 'HEAD\\r');
    await sleep(1000);
    api.writeInput(runId, '\\x03');
  });

  return {
    rendered: !!document.querySelector('.terminal-view .xterm'),
    isolated: typeof require === 'undefined' && typeof process === 'undefined',
    version,
    interactive,
  };
})()`;

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const r = await win.webContents.executeJavaScript(rendererCheck);
      if (!r.rendered) return finish(false, 'terminal did not render');
      if (!r.isolated) return finish(false, 'renderer has Node access');
      const versionText = stripAnsi(r.version.data);
      if (r.version.code !== 0 || !versionText.includes('git version')) {
        return finish(false, `git --version failed: ${JSON.stringify(r.version)}`);
      }
      if (!/[0-9a-f]{40} commit \d+/.test(stripAnsi(r.interactive.data))) {
        return finish(false, `PTY input did not reach git: ${JSON.stringify(r.interactive)}`);
      }
      finish(
        true,
        `git ran in a PTY (${versionText.match(/git version \S+/)[0]}); ` +
          `input reached it; Ctrl+C ended it with exit code ${r.interactive.code}`,
      );
    } catch (error) {
      finish(false, error instanceof Error ? error.message : String(error));
    }
  });
});

require(path.join(__dirname, '../out/main/index.js'));
