# codex-automation

Share and install Codex App automations from local folders or GitHub URLs.

`codex-automation` is a tiny CLI for making Codex automations portable. It keeps Codex's native `automation.toml` as the runtime format, then adds just enough package metadata to make automations easy to publish, inspect, validate, and install on another machine.

It is inspired by the ergonomics of tools like `npx skills add owner/repo`, but for Codex automations.

## Why

Codex automations live locally under:

```text
$CODEX_HOME/automations/<id>/automation.toml
```

That works well for one machine, but it is awkward to share:

- `cwds` often point to local absolute paths.
- `memory.md` contains runtime history that should not be copied by default.
- Prompts can reference connectors, user-scoped skills, or local paths.
- Installing by hand makes it easy to overwrite an existing automation or activate something before reviewing it.

`codex-automation` wraps those local files in a portable package and installs them safely.

## Install

```bash
npm install -g codex-automation
```

Or run from this repository while developing:

```bash
node bin/codex-automation.js --help
```

Requires Node.js 20 or newer.

## Quickstart

List automations already installed in Codex:

```bash
codex-automation list
```

Install from a GitHub repository:

```bash
codex-automation add owner/repo --list
codex-automation add owner/repo --automation morning-pr-radar --cwd ~/Projects/vlad --dry-run
codex-automation add owner/repo --automation morning-pr-radar --cwd ~/Projects/vlad
```

Share one of your local automations to a GitHub collection:

```bash
codex-automation share morning-pr-radar --repo vltansky/codex-automations --dry-run
codex-automation share morning-pr-radar --repo vltansky/codex-automations
```

Install from a direct GitHub path:

```bash
codex-automation add https://github.com/owner/repo/tree/main/automations/morning-pr-radar --cwd ~/Projects/vlad
```

Export one of your local automations:

```bash
codex-automation export morning-pr-radar --output ./morning-pr-radar.codex-automation
```

Inspect and install a local package:

```bash
codex-automation inspect ./morning-pr-radar.codex-automation
codex-automation install ./morning-pr-radar.codex-automation --cwd ~/Projects/vlad --dry-run
codex-automation install ./morning-pr-radar.codex-automation --cwd ~/Projects/vlad --id morning-pr-radar-copy
```

## Commands

```text
codex-automation list [--json]
codex-automation show <id> [--json]
codex-automation share <id> [--repo <owner/repo>] [--path <dir>] [--dry-run] [--yes] [--json]
codex-automation add <source> [--list] [--automation <id>] [--cwd <path>] [--id <id>] [--dry-run] [--replace] [--activate] [--json]
codex-automation export <id> [--output <dir>] [--json]
codex-automation inspect <dir> [--json]
codex-automation validate <dir> [--json]
codex-automation install <dir> --cwd <path> [--id <id>] [--dry-run] [--replace] [--activate] [--json]
codex-automation diff <id> <dir>
codex-automation uninstall <id> [--keep-memory] [--json]
```

## Source Formats

`add` can install from local paths or GitHub sources:

```bash
# GitHub shorthand
codex-automation add owner/repo

# Full GitHub repository URL
codex-automation add https://github.com/owner/repo

# Direct path to a package or collection inside a repo
codex-automation add https://github.com/owner/repo/tree/main/automations/my-automation

# Local package or local collection
codex-automation add ./my-automation.codex-automation
codex-automation add ./automations
```

Use `--list` to see packages in a source without installing:

```bash
codex-automation add owner/repo --list
```

If a source contains multiple automations, choose one with `--automation`:

```bash
codex-automation add owner/repo --automation morning-pr-radar --cwd ~/Projects/vlad
```

## Sharing Automations

`share` publishes one of your installed Codex automations into a GitHub collection repository.

```bash
codex-automation share morning-pr-radar
```

By default, it uses your `gh` login and targets:

```text
<github-user>/codex-automations
```

For example:

```bash
codex-automation share morning-pr-radar --repo vltansky/codex-automations
```

If the target repo does not exist, `share` can create it as a public GitHub repository. It then exports the automation into:

```text
automations/<id>/
  codex-automation.json
  automation.toml
  README.md
```

It also updates the collection README so others can install with:

```bash
codex-automation add vltansky/codex-automations --list
codex-automation add vltansky/codex-automations --automation morning-pr-radar --cwd <workspace>
```

Use `--dry-run` to preview without creating a repo, committing, or pushing:

```bash
codex-automation share morning-pr-radar --repo vltansky/codex-automations --dry-run --json
```

Use `--yes` for non-interactive sharing:

```bash
codex-automation share morning-pr-radar --repo vltansky/codex-automations --yes
```

## Package Format

A portable automation package is a directory:

```text
my-automation.codex-automation/
  codex-automation.json
  automation.toml
  README.md
```

`automation.toml` is the native Codex automation file. `codex-automation.json` describes the portable package:

```json
{
  "schemaVersion": 1,
  "name": "local/morning-pr-radar",
  "version": "0.1.0",
  "title": "Morning PR Radar",
  "description": "Portable Codex automation package for Morning PR Radar.",
  "codex": {
    "automationKinds": ["cron"]
  },
  "inputs": [
    {
      "name": "workspace",
      "type": "path",
      "mapsTo": "cwds[0]",
      "required": true,
      "defaultHint": "/Users/example/Projects/vlad"
    }
  ],
  "install": {
    "suggestedId": "morning-pr-radar",
    "includeMemory": false,
    "defaultStatus": "PAUSED"
  }
}
```

Repositories can contain one package or many packages:

```text
codex-automations/
  automations/
    morning-pr-radar/
      codex-automation.json
      automation.toml
      README.md
    weekly-release-notes/
      codex-automation.json
      automation.toml
      README.md
```

`codex-automation add owner/repo --list` scans collections and shows the available automations.

## Safety Model

Installs write only:

```text
$CODEX_HOME/automations/<id>/automation.toml
```

By default, the CLI:

- Installs automations as `PAUSED`.
- Refuses to overwrite existing automations unless `--replace` is passed.
- Excludes `memory.md`.
- Excludes OAuth state, connector state, previous runs, and sessions.
- Strips `created_at` and `updated_at` on export.
- Converts exported local `cwds` into `${workspace}`.
- Requires `--cwd` when installing a package that needs a workspace path.
- Warns about local absolute paths, connector references, and secret-looking prompt text.

Activate explicitly after reviewing:

```bash
codex-automation add owner/repo --automation morning-pr-radar --cwd ~/Projects/vlad --activate
```

## JSON Output

Most commands support `--json` for agent and script usage:

```bash
codex-automation add owner/repo --list --json
codex-automation install ./morning-pr-radar.codex-automation --cwd ~/Projects/vlad --dry-run --json
```

Errors are emitted as structured JSON with a stable `code` where possible.

## Development

```bash
npm test
npm run lint
npm run build
```

`npm run build` currently performs an npm pack dry-run against the public npm registry.

## Current Limitations

- GitHub support uses shallow `git clone`; it does not use the GitHub API.
- GitHub tree URL parsing currently supports simple branch names such as `main`.
- Packages are directories; archive formats are not implemented yet.
- TOML parsing is intentionally narrow and focused on current Codex automation files.
- Heartbeat automations are recognized but not deeply modeled because they are thread-bound.

## License

MIT
