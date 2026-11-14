# dsh-checkpoint

DSH Host plugin for workspace checkpoints. It registers:

- the user command **`/checkpoint`** — create / list / show / diff / baseline / restore;
- the model tool **`checkpoint_inspect`** — read-only `list` / `show` / `diff`;
- a `checkpoints` runtime skill and an always-on prompt policy section.

A checkpoint records the workspace state. In a git repository it stores the branch, HEAD,
dirty file list and — by default — commits all pending changes; outside git it stores a
bounded `size + sha256` fingerprint manifest (never file contents). The newest checkpoint
becomes the comparison baseline unless `--keep-baseline` (or `keepBaselineByDefault`) keeps
the old one. When the user references a checkpoint (`#cp-3`, `@cp-3`, 「检查点 cp-3」) the
agent uses it as the task baseline via `checkpoint_inspect`, and it never rolls back on its
own: restoration is the user-only `/checkpoint restore <cp-N> --yes` command, which first
creates a safety checkpoint.

## Commands

```
/checkpoint [--note=备注] [--no-commit] [--keep-baseline]
/checkpoint list
/checkpoint show <cp-N>
/checkpoint diff [<cp-A> [<cp-B>]]
/checkpoint baseline [<cp-N>]
/checkpoint restore <cp-N> --yes [--force]
```

- `--no-commit`: record only; do not commit git changes.
- `--keep-baseline`: do not advance the baseline to the new checkpoint.
- `diff` with one arg compares that checkpoint (or the baseline) with the current worktree;
  with two args compares the two checkpoints.
- `restore` requires `--yes`, refuses a dirty worktree unless `--force`, creates a safety
  checkpoint first, then `git reset --hard` to the target. Without git it reports that
  restore is unavailable.

## Storage

- git repository: `<repo>/.git/dsh-checkpoints/index.json` (worktrees resolve the real git dir)
- no git: `<workspace>/.dsh-checkpoints/index.json`
- The index is written atomically and serialized per directory. No file contents are stored.

## Configuration (`cordis.patch.yml`)

```yaml
- id: dsh-checkpoint
  name: '@local/dsh-checkpoint'
  config:
    autoCommit: true                 # default; --no-commit overrides per checkpoint
    commitMessage: 'checkpoint {id}: {note}'
    keepBaselineByDefault: false
    maxFingerprintFiles: 2000
    maxFingerprintBytes: 2097152
```

## Per-session setup wizard (P1.5)

A blank new session shows an M3 dock panel above the composer with per-session choices:
smart directions (inherit / on / off), auto-continue after a direction card, checkpoint
auto-commit, start-of-session checkpoint, and an optional "also save as global default".
Choices persist to `$DSH_HOME/checkpoint/session-setup.json` (atomic, globally overridable)
and are pushed to the Host through `/setup --json set …`.

- `/setup` shows the effective settings; `/setup --json` returns machine-readable status.
- `/setup set smartDirection=off checkpointAutoCommit=auto [--global]` edits session or global defaults.
- `/setup dismiss` hides the wizard for the current session; `/setup reset` clears its overrides.
- `dsh-smart-direction` consumes the provided `sessionSetup` service: a gated session gets no
  smart-direction prompt text, its card submissions are refused, and auto-continue follows the
  session preference.

## Design

Full specification, phases (Setup Wizard in P1.5, checkpoint rows/panel in P2/P3) and open
questions: [DESIGN.md](DESIGN.md).

## Limitations

- No-git workspaces: fingerprints only (no restore, no content diff).
- Restore is destructive and only available with git; a safety checkpoint is always created.
- Model access is read-only via `checkpoint_inspect`; creating/restoring stays a user action.
