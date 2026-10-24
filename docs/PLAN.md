# GitPilot — Project Plan

GitPilot is a desktop app for learning Git by using it. Students type real Git commands, see what those commands did to their repository, and get guidance based on the repository's actual state. GitPilot never takes control away from them.

**MVP promise:** a student can run Git commands in GitPilot, understand the resulting repository state, recover from mistakes, and get relevant next steps, without GitPilot ever running a consequential command on its own.

---

## 1. Product decisions (locked)

| #   | Decision             | Resolution                                                                                                                                                                                                        |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Platform             | **Electron desktop app** with a real terminal (xterm.js + node-pty) next to state and guidance panels. Integrating with the student's own shell is a possible future feature.                                     |
| 2   | Non-Git commands     | A small allowlist of **built-in file commands**, implemented in Node so they behave the same on Windows/macOS/Linux. Students edit files in their own editor, and GitPilot watches for changes. No general shell. |
| 3   | Interactive commands | Git runs inside a **PTY**. The pager is disabled. `GIT_EDITOR` points to a GitPilot shim that opens an in-app message editor.                                                                                     |
| 4   | Safety               | Commands are classified by **subcommand plus arguments**. Destructive commands need confirmation and get an **automatic undo snapshot** first.                                                                    |
| 5   | Practice             | **Sandbox repositories** are a core feature from day one: temporary repos generated from scenario scripts.                                                                                                        |
| 6   | Assistance           | **Rule-based** in v1, with all facts coming from Git. AI comes later as an optional explanation layer, off by default, using the student's own key.                                                               |
| 7   | Command entry        | GitPilot owns the prompt (a command bar). Shell integration may come later.                                                                                                                                       |
| 8   | Learning model       | Free-form companion first. Guided exercises come later and reuse the same sandbox and state engine.                                                                                                               |

**Guiding principles**

1. **Git is the source of truth.** Branch names, file lists, hashes and conflict status always come from Git, never from a guess or a model.
2. **State over text.** Work out what happened by comparing repository state before and after a command, not by parsing human-readable output.
3. **The student executes.** GitPilot can suggest, prepare and explain commands, but only the student runs them.
4. **Quiet by default, deep on demand.** Show a short summary first, with "Explain" available for more detail.
5. **Teach the true model.** Commits aren't deleted by reset, branches are pointers, and `HEAD` points to a branch. Diagrams must be accurate.

---

## 2. Target users (working assumption)

- **Primary:** beginners meeting Git for the first time, such as CS students or self-taught developers, learning on their own.
- **Not in v1:** instructor dashboards, classroom management, accounts.
- **Open question:** whether instructor-authored exercises matter. This affects the later exercise format (§9).

---

## 3. User experience

### Layout

```
┌──────────────────────────────────────────────┬─────────────────────────┐
│ TERMINAL OUTPUT (xterm.js)                   │ REPOSITORY STATE        │
│                                              │ Branch: feature/login   │
│ $ git add login.py                           │ HEAD → feature/login    │
│ $ git commit -m "Add login page"             │                         │
│ [feature/login a1b2c3d] Add login page       │ Working tree            │
│  1 file changed, 12 insertions(+)            │   modified: app.py      │
│                                              │ Staging area            │
│                                              │   (empty)               │
│                                              │ Commits                 │
│                                              │   a1b2c3d Add login…    │
│                                              │ Remote: none            │
├──────────────────────────────────────────────┼─────────────────────────┤
│ > git sw▌                                    │ GUIDANCE                │
│   git switch   Switch to another branch      │ ✓ Commit created on     │
│   git show     Show a commit's details       │   feature/login.        │
│                                              │ Next: …   [Explain]     │
└──────────────────────────────────────────────┴─────────────────────────┘
          [ State ]  [ Graph ]  [ Progress ]     Sandbox: merge-conflict ▾
```

- **Command bar** (an HTML input, not raw terminal input). It handles completion, history and suggestions with descriptions. Pressing Enter sends the line to the command pipeline.
- **Terminal output** (xterm.js) shows real Git output with colours. While an interactive process is running, keystrokes go straight to the PTY.
- **State panel** always shows the four areas: working tree, staging area, commits, and remote.
- **Guidance panel** shows what happened, what to do next, and "Explain" for each one.
- **Graph tab** draws the commit graph from real refs.
- **Assistance level** setting: _Quiet_ (completion only), _Standard_ (default), or _Detailed_.

### Core loop

1. The student types a command. Completion suggests subcommands and options with one-line explanations.
2. GitPilot parses and classifies the command. Read-only and state-changing commands run on Enter. Destructive ones open a confirmation dialog that explains the consequences, with **Execute / Explain / Cancel**.
3. The command runs in a PTY, and its output streams to the terminal.
4. GitPilot inspects the repository again, compares it with the "before" snapshot, and identifies what happened.
5. The guidance panel shows a short summary of what happened plus suggested next steps based on the current state.
6. If the command failed, the error interpreter explains why and suggests fixes that fit the current state.

---

## 4. Architecture

```
┌──────────────────────── Renderer (UI) ────────────────────────┐
│ CommandBar   TerminalView   StatePanel   GuidancePanel  Graph │
└───────────────▲───────────────────────────────▲───────────────┘
                │ typed IPC (preload, contextIsolation on)
┌───────────────┴──────────── Main process ─────┴───────────────┐
│                                                               │
│  CommandPipeline                                              │
│    ├─ Parser          tokenize, reject pipes/redirects/&&     │
│    ├─ Classifier      read / change / destructive / blocked   │
│    ├─ SafetyGuard     confirm + UndoSnapshot                  │
│    ├─ Executor        node-pty (git) | Builtins (file cmds)   │
│    └─ EditorBridge    GIT_EDITOR shim ⇄ in-app editor         │
│                                                               │
│  RepoInspector  → RepoState snapshots (plumbing commands)     │
│  RepoWatcher    → file system watcher, debounced refresh      │
│  EventDetector  → diff(before, after, command, exit) → Event  │
│  Guidance                                                     │
│    ├─ NextStepRules      (state, event) → Suggestion[]        │
│    ├─ ErrorInterpreter   (stderr, exit, state) → Diagnosis    │
│    └─ ContentStore       concept & command explanations       │
│  Completion      static Git command spec + live refs/files    │
│  Sandbox         scenario scripts → temp repos                │
│  Progress        concepts encountered (local JSON)            │
│  (later) AIExplainer   optional, behind an interface          │
└───────────────────────────────────────────────────────────────┘
```

All Git and file-system access happens in the main process. The renderer only sends intents and receives state and events. Use `contextIsolation: true`, `nodeIntegration: false`, and a narrow preload API.

### 4.1 Command pipeline

**Parser.** Shell-like tokenizer (quotes and escapes), with no shell expansion. It rejects `|`, `>`, `<`, `&&`, `;`, backticks and `$()`, and explains the rejection ("GitPilot runs one command at a time"). The only exception is the built-in `echo "text" > file` / `>> file` form.

**Accepted commands**

| Kind                   | Commands                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git                    | `git <subcommand> …`, checked against the classifier                                                                                                |
| Built-in file commands | `ls`, `cat`, `pwd`, `cd` (only inside the current repo or sandbox), `mkdir`, `touch`, `echo … > / >> file`, `edit <file>` (opens the system editor) |
| GitPilot commands      | `help`, `explain <command or concept>`, `undo`, `clear`, `sandbox <scenario>`, `open <path>`                                                        |

Built-ins are written in Node, so `touch` and `ls` work the same on Windows.

**Classifier.** A rule table keyed by subcommand and argument patterns:

| Tier           | Examples                                                                                                                                                                                                | Behaviour                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `read`         | `status`, `log`, `diff`, `show`, `branch` (list), `remote -v`                                                                                                                                           | Runs immediately             |
| `change`       | `add`, `commit`, `switch`, `merge`, `branch <new>`, `stash push`, `fetch`                                                                                                                               | Runs on Enter                |
| `destructive`  | `reset --hard`, `restore <path>`, `checkout -- <path>`, `checkout .`, `clean -f`, `branch -D`, `stash drop/clear`, `rebase`, `commit --amend` (when the commit has already been pushed), `push --force` | Confirmation + undo snapshot |
| `blocked` (v1) | `filter-branch`, `gc --prune=now`, `reflog expire`, `update-ref -d` on non-GitPilot refs, `config --global`                                                                                             | Explanation shown; not run   |

Unknown subcommands or flags fall back to `change`, with a note saying GitPilot doesn't know this command well.

**Executor.** Spawns `git` directly (not through a shell) in a node-pty with this environment:

- `GIT_PAGER=cat`, plus `-c core.pager=cat`
- `GIT_EDITOR` = the GitPilot editor shim
- `-c color.ui=always`
- `LC_ALL=C` / `LANG=C` for stable English messages, which the error interpreter relies on (v1 is English only)

**EditorBridge.** The shim is a tiny Node script run with `ELECTRON_RUN_AS_NODE=1` using Electron's own binary. It connects to the app over a local named pipe or socket, sends the file path, and waits. The app shows a modal text editor (for commit messages, merge messages, `tag -a`, and later rebase todo lists), writes the file, and signals the shim to exit. One mechanism covers every Git command that opens an editor. If the student cancels, the shim exits non-zero and Git aborts cleanly.

### 4.2 Repository inspector

`RepoInspector.snapshot(dir): RepoState` uses machine-readable plumbing commands, all run with `--no-optional-locks` so they never fight the student's commands over `index.lock`:

| Data                                        | Source                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Branch, upstream, ahead/behind, file states | `git status --porcelain=v2 --branch -z --untracked-files=all`                                                                  |
| HEAD and detached state                     | `git symbolic-ref -q HEAD`, `git rev-parse HEAD`                                                                               |
| Branches/tags with tips                     | `git for-each-ref --format=…`                                                                                                  |
| Recent commits + graph                      | `git log --all --format=%H%x00%P%x00%D%x00%s -n N`                                                                             |
| In-progress operation                       | presence of `MERGE_HEAD`, `rebase-merge/`, `rebase-apply/`, `CHERRY_PICK_HEAD`, `REVERT_HEAD` (via `git rev-parse --git-path`) |
| Conflicted files                            | porcelain v2 `u` entries                                                                                                       |
| Stashes                                     | `git stash list --format=…`                                                                                                    |
| Last ref action                             | `git reflog -1 --format=%gs` (e.g. `merge feature: Fast-forward`)                                                              |
| Remotes                                     | `git remote -v`                                                                                                                |
| Environment                                 | `git --version`, `init.defaultBranch`, `user.name` / `user.email` set?                                                         |

```ts
interface RepoState {
  isRepo: boolean;
  head: { kind: 'branch'; name: string; oid: string | null } | { kind: 'detached'; oid: string };
  upstream?: { name: string; ahead: number; behind: number };
  files: FileEntry[]; // path, index status, worktree status, untracked, conflicted
  branches: Ref[];
  tags: Ref[];
  remotes: Remote[];
  commits: CommitNode[]; // for the graph (bounded)
  operation: 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert';
  stashes: Stash[];
  lastReflog?: string;
  env: { gitVersion: string; defaultBranch: string; identityConfigured: boolean };
}
```

**RepoWatcher** watches the work tree and `.git/` (HEAD, refs, index) with a debounced refresh, so edits made in VS Code show up straight away.

### 4.3 Event detector

`detect(before, after, command, exitCode): GitEvent[]` is a pure function. Examples:

- `REPO_INITIALIZED`, `FILES_STAGED`, `FILES_UNSTAGED`
- `COMMIT_CREATED` (on which branch, parent, files)
- `BRANCH_CREATED`, `BRANCH_SWITCHED`, `HEAD_DETACHED`
- `MERGE_FAST_FORWARD` / `MERGE_COMMIT_CREATED` / `MERGE_CONFLICT_STARTED` / `MERGE_CONCLUDED` / `MERGE_ABORTED`
- `BRANCH_MOVED_BACK` (reset) with mode info: `soft` / `mixed` / `hard` (taken from the parsed command)
- `CHANGES_DISCARDED`, `STASH_PUSHED` / `STASH_POPPED`
- `NO_OP` (command succeeded but nothing changed)

Fast-forward vs. merge commit is decided from refs and parents, using the reflog message as a cross-check. It never depends on parsing stdout.

### 4.4 Guidance

**NextStepRules** are plain TypeScript objects:

```ts
interface Rule {
  id: string;
  when: (s: RepoState, e: GitEvent[]) => boolean;
  suggest: (s: RepoState, e: GitEvent[]) => Suggestion[]; // command + why + conceptId
  priority: number;
}
```

Suggestions only use real names from the state (branches, files). They are offered, never run automatically, and clicking one fills the command bar. Example: after `git init` with no files, suggest creating a file (`touch README.md` or `edit README.md`) rather than "stage your changes".

**ErrorInterpreter.** Takes stderr, exit code and state, matches against error patterns, and returns a diagnosis with steps tailored to the current state. Diagnoses come in three levels the student can reveal one at a time: **Hint → Guidance → Solution**. The first set covers the top ~20 beginner errors:

- `no changes added to commit` vs. `nothing to commit, working tree clean`
- `Please tell me who you are` (identity not set)
- `not a git repository`
- `pathspec '…' did not match any file(s)`
- Switching blocked by local changes (`Your local changes … would be overwritten`)
- Merge conflict (`CONFLICT (content)`, `Automatic merge failed`)
- `fatal: refusing to merge unrelated histories`
- Branch already exists / not found; `invalid reference`
- Detached HEAD warning
- `src refspec main does not match any` (push before first commit, or main vs. master)
- Push rejected: non-fast-forward
- `LF will be replaced by CRLF` (Windows line-ending warning)
- `'…' is not a git command`, with a "did you mean" suggestion

**ContentStore** holds explanations as Markdown files with front-matter, organised by concept (`concepts/staging-area.md`, `concepts/head.md`, `commands/reset.md`). Each explanation has a short summary, a detailed version, before/after diagrams where useful, and related concepts. Keeping content separate from code makes it easy to review for accuracy and edit without touching code.

### 4.5 Safety and undo

Before any `destructive` command runs, GitPilot creates an **undo snapshot**:

1. Records `HEAD` (symbolic ref + oid) and the current branch tip.
2. Saves the index: `git write-tree`, giving the index tree.
3. Saves the working tree, including untracked files that aren't ignored: use a temporary index (`GIT_INDEX_FILE=<tmp>`), `git add -A`, `git write-tree`, then `git commit-tree` with `HEAD` as parent.
4. Stores it under `refs/gitpilot/undo/<timestamp>`, with metadata in `.git/gitpilot/undo.json`.

The `undo` command restores the branch tip, the index and the working tree from the latest snapshot. It's also shown as a button after a destructive command.

The confirmation dialog explains exactly what _this_ command will do in _this_ state. For example, "2 modified files and 1 untracked file will be lost" means the files are listed by name.

**Limitations shown to students:**

- Ignored files (`clean -x`) aren't saved.
- Remote effects (`push --force`) can't be undone locally.
- Snapshots are local to this machine.

Old undo refs are pruned after N snapshots (default 20).

### 4.6 Completion

- A static command spec in data (`completion/git-spec.json`) lists subcommands, common flags and argument types (`branch`, `path`, `commit`, `remote`), each with a one-line description and a link to an explanation.
- Values are filled in live from `RepoState`: branch names for `switch`, changed files for `add` / `restore`.
- Suggestions are ranked by what fits the current state. In the middle of a merge, `git merge --abort` and `git add <conflicted>` rise to the top.
- Similar commands are explained side by side, such as `checkout` vs. `switch`, `reset` vs. `revert`, and `restore` vs. `checkout --`.

### 4.7 Sandbox

Scenarios are TypeScript scripts that build a repo in `app.getPath('userData')/sandboxes/<id>` using Git commands. Each one sets a local `user.name` / `user.email` and `init.defaultBranch=main` so it never depends on the student's global config.

v1 scenarios:

1. `empty`: a freshly initialised repo.
2. `first-commits`: a few commits on main.
3. `feature-branch`: a feature branch ahead of main, ready to fast-forward.
4. `diverged`: both branches have new commits, so the merge creates a merge commit.
5. `merge-conflict`: the same lines edited on both branches.
6. `detached-head`: HEAD checked out at an old commit.
7. `oops-reset`: a branch reset back, so the student can practise recovering with the reflog.

The UI shows a clear indicator of which repo is open: **Sandbox** or **Your project**. Opening a real project works too. GitPilot's safety features apply there as well, but the default suggestion for a first session is a sandbox.

### 4.8 Progress

A list of concepts the student has encountered and used (for example "created a branch", "resolved a conflict"), saved as local JSON in `userData`. There are no accounts.

### 4.9 AI layer (post-MVP)

An `Explainer` interface with a rule/content implementation (v1) and an optional LLM implementation (later):

- Off by default. The student enters their own API key, stored with Electron `safeStorage`.
- It sends only the command, the error text and the summarised state. File contents are never sent unless the student explicitly agrees.
- It is grounded in `RepoState`: the prompt contains real names, and the output is checked so that it never presents branches, files or hashes that don't exist.
- It's used for free-form "why did this happen?" questions and rephrasing explanations, never for deciding facts or running commands.

---

## 5. Technology

| Area          | Choice                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language      | TypeScript (strict) everywhere                                                                                                                                                             |
| App shell     | Electron (already in the repo), using the electron-vite or Electron Forge + Vite template                                                                                                  |
| UI            | React in the renderer                                                                                                                                                                      |
| Terminal      | `@xterm/xterm` + `@xterm/addon-fit`                                                                                                                                                        |
| PTY           | `node-pty`, rebuilt for Electron with `@electron/rebuild`                                                                                                                                  |
| File watching | `chokidar`                                                                                                                                                                                 |
| Tests         | Vitest (unit), plus integration tests against real temporary Git repos                                                                                                                     |
| Lint/format   | ESLint + Prettier                                                                                                                                                                          |
| Packaging     | Electron Forge makers, starting with a Windows installer                                                                                                                                   |
| Requirements  | Git installed by the user. GitPilot detects it at startup and explains how to install it if it's missing. Minimum Git **2.23** (for `switch`/`restore`), with a recommended version shown. |

---

## 6. Repository layout

```
src/
  main/
    index.ts                 app lifecycle, window
    ipc.ts                   typed IPC handlers
    pipeline/  parser.ts  classifier.ts  executor.ts  builtins.ts  editor-bridge.ts  safety.ts  undo.ts
    git/       inspector.ts  watcher.ts  events.ts  git-env.ts
    guidance/  rules/  errors/  content-store.ts
    completion/ engine.ts
    sandbox/   scenarios/  sandbox.ts
    progress/  progress.ts
  preload/     index.ts      narrow, typed API
  renderer/    App.tsx  components/ (CommandBar, TerminalView, StatePanel, GuidancePanel, GraphView, ConfirmDialog, MessageEditor)
  shared/      types.ts      RepoState, GitEvent, Suggestion, IPC contracts
content/       concepts/*.md  commands/*.md  errors/*.md
completion/    git-spec.json
tools/         editor-shim.js
tests/         unit/  integration/  fixtures/
docs/          PLAN.md
```

---

## 7. Milestones

Each milestone ends with something you can demo.

| #      | Milestone                  | Done when                                                                                                                                                            |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | Foundation                 | TypeScript + Vite + React build, lint, Vitest, CI, secure preload, empty 3-panel layout                                                                              |
| **M1** | Command execution          | Command bar → parser → executor. Git runs in a PTY with colours. Pager off. Editor shim works for `git commit` without `-m`. Built-in file commands work on Windows. |
| **M2** | Repository state           | `RepoInspector` + state panel. Watcher picks up outside edits. Git presence and version checks. Identity-missing banner.                                             |
| **M3** | What happened + next steps | Event detector and ~25 rules covering init → add → commit → branch → switch → merge (ff / merge commit / conflict). Content for the core concepts.                   |
| **M4** | Error interpreter          | The top ~20 errors with Hint/Guidance/Solution levels                                                                                                                |
| **M5** | Safety                     | Classifier tiers, a confirmation dialog listing the affected files, undo snapshots + `undo`                                                                          |
| **M6** | Completion                 | Spec-driven completion with live refs/paths and side-by-side comparisons of similar commands                                                                         |
| **M7** | Sandbox + graph            | 7 scenarios, sandbox switcher, accurate commit graph view (including unreachable commits after a reset, via reflog)                                                  |
| **M8** | MVP release                | Progress panel, assistance levels, Windows installer, first-run onboarding                                                                                           |

**MVP acceptance test:** a new student starts the `empty` sandbox, makes commits, creates a feature branch, merges it, resolves a conflict in `merge-conflict`, and recovers from a `reset --hard` using `undo` and the reflog. They do all of this without leaving GitPilot except to edit files, and without hitting an unexplained error.

**After the MVP (roughly in order):** guided exercises with goal checks against `RepoState`, remotes (a local bare repo in the sandbox first, then GitHub), rebase and interactive rebase through the editor bridge, the optional AI explainer, more languages, and shell integration.

---

## 8. Testing strategy

- **Inspector, events, undo:** integration tests that build real temporary repos with scripted Git commands (no mocked Git output). Run in CI on Windows and Linux.
- **Rules, classifier, parser, error matcher:** pure unit tests using table-driven cases.
- **Error patterns:** golden stderr samples recorded from at least two Git versions (the minimum supported and the latest).
- **Content accuracy:** each concept file is reviewed by checking it against Git's behaviour. Every diagram must match what the inspector reports for the matching sandbox scenario.

---

## 9. Risks and open questions

| Risk / question                                                    | Mitigation / next step                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| node-pty native build problems on Windows                          | Resolved in M0, see §10. node-pty uses N-API prebuilds, so no rebuild for Electron is needed. |
| Git messages vary between versions and locales                     | Use state, not text, wherever possible. Force `LC_ALL=C`. Keep golden tests across versions.  |
| Students run destructive commands on real projects                 | Undo snapshots, clear sandbox/project indicator, sandbox suggested by default                 |
| Too much guidance becomes noise                                    | Assistance levels, short summaries first, "don't show this again" per rule                    |
| Credential prompts on push (Git Credential Manager GUI on Windows) | They work through the PTY. Handled in the remotes milestone, after the MVP.                   |
| **Open:** are instructors a target audience?                       | Decide before designing the exercise format                                                   |
| **Open:** product name                                             | "GitPilot" is a working title. Check for name conflicts before release.                       |

---

## 10. M0 spike findings (node-pty on Windows)

Tested with node-pty 1.1.0, Electron 43 and Git 2.50 on Windows 11.

- **Loads in Electron without a rebuild.** node-pty 1.1.0 ships N-API prebuilds for win32/darwin, so `@electron/rebuild` isn't needed. Linux compiles it with node-gyp at install time.
- **Needs `git.exe`, not `git`.** On Windows, node-pty doesn't search PATH for a bare name and fails with "File not found". See `gitExecutable()`.
- **Leaks without extra cleanup.** After the child exits, node-pty keeps the ConPTY input pipe and a worker thread open, leaving one `conhost.exe` per run. Its public `kill()` doesn't fix this, and it forks a helper that fails and may later kill a reused PID. `startPtyRun()` closes the two internal handles instead. Because those are private fields, node-pty is pinned to an exact version, and an integration test fails if `conhost.exe` processes are left behind.
- **Raw PTY output isn't parseable text.** ConPTY inserts control sequences in the middle of output (it sets the window title after the first character). This confirms "state over text": the error interpreter should match stderr from a separate non-PTY capture or from state, never raw PTY output.
- **Ctrl+C reports exit code 0.** Interrupting `git cat-file --batch-check` with `\x03` ends it, but the exit code is 0. The pipeline must track interruptions itself rather than infer them from exit codes. Real failures do report non-zero codes.
- **Typed input works.** Keystrokes written to the PTY reach Git, so interactive commands are feasible in M1.
