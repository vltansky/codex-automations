# codex-automations

Share and install Codex App automations from local folders or GitHub URLs.

`codex-automations` is a tiny CLI for making Codex automations portable. It keeps Codex's native `automation.toml` as the runtime format, then adds just enough package metadata to make automations easy to publish, inspect, validate, and install on another machine.

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

`codex-automations` wraps those local files in a portable package and installs them safely.

## Install

```bash
npx -y codex-automations --help
```

Requires Node.js 20 or newer.

## Quickstart

List automations already installed in Codex:

```bash
npx -y codex-automations list
```

Install from a GitHub repository:

```bash
npx -y codex-automations add vltansky/automations --list
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
```

Share one of your local automations to a GitHub collection:

```bash
npx -y codex-automations init personal --repo vltansky/automations --publish-mode push --default --yes
npx -y codex-automations share
npx -y codex-automations share morning-pr-radar --dry-run
npx -y codex-automations share morning-pr-radar
```

Install from a direct GitHub path:

```bash
npx -y codex-automations add https://github.com/owner/repo/tree/main/automations/morning-pr-radar
```

Connect a shared collection that publishes through pull requests:

```bash
npx -y codex-automations init team --repo org/codex-automations --publish-mode pr --default --yes
```

Export one of your local automations:

```bash
npx -y codex-automations export morning-pr-radar --output ./morning-pr-radar.codex-automation
```

Inspect and install a local package:

```bash
npx -y codex-automations inspect ./morning-pr-radar.codex-automation
npx -y codex-automations install ./morning-pr-radar.codex-automation --dry-run
npx -y codex-automations install ./morning-pr-radar.codex-automation --name "Morning PR Radar Copy"
```

`--name` installs a renamed copy. The CLI derives the installed automation id from that name unless you also pass the advanced `--id <id>` override.

## Commands

```text
npx -y codex-automations list [--json]
npx -y codex-automations show <id> [--json]
npx -y codex-automations share [id] [--collection <name>] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--dry-run] [--yes] [--json]
npx -y codex-automations add <source> [--list] [--automation <id>] [--all] [--cwd <path>] [--name <name>] [--id <id>] [--dry-run] [--view] [--replace] [--activate] [--json]
npx -y codex-automations init [name] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--default] [--yes] [--json]
npx -y codex-automations init --local [dir] [--repo <owner/repo>] [--json]
npx -y codex-automations collections [list] [--json]
npx -y codex-automations collections add <name> --repo <owner/repo> [--path <dir>] [--publish-mode <push|pr>] [--default] [--json]
npx -y codex-automations collections default <name> [--json]
npx -y codex-automations collections remove <name> [--json]
npx -y codex-automations export <id> [--output <dir>] [--json]
npx -y codex-automations inspect <dir> [--json]
npx -y codex-automations validate <dir> [--json]
npx -y codex-automations install <dir> [--cwd <path>] [--name <name>] [--id <id>] [--dry-run] [--view] [--replace] [--activate] [--json]
npx -y codex-automations diff <id> <dir>
npx -y codex-automations uninstall <id> [--keep-memory] [--json]
```

## Source Formats

`add` can install from local paths or GitHub sources:

```bash
# GitHub shorthand
npx -y codex-automations add owner/repo

# Full GitHub repository URL
npx -y codex-automations add https://github.com/owner/repo

# Direct path to a package or collection inside a repo
npx -y codex-automations add https://github.com/owner/repo/tree/main/automations/my-automation

# Local package or local collection
npx -y codex-automations add ./my-automation.codex-automation
npx -y codex-automations add ./automations
```

Use `--list` to see packages in a source without installing:

```bash
npx -y codex-automations add owner/repo --list
```

If a source contains multiple automations, choose one with `--automation`:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar
```

You can install more than one automation by repeating `--automation`, or install the whole collection with `--all`:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar --automation weekly-github-standup
npx -y codex-automations add owner/repo --all
```

Preview what will be written before installing:

```bash
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run --view
```

When an automation is installed from `add` or `install`, the CLI stores source metadata next to `automation.toml`:

```text
$CODEX_HOME/automations/<id>/
  automation.toml
  codex-automation-source.json
```

That sidecar records where the automation came from, which makes future update/remove flows possible without changing Codex's native TOML format.

## Collections

Example public collection:

```bash
npx -y codex-automations add vltansky/automations --list
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
```

The example repository is [vltansky/automations](https://github.com/vltansky/automations).

Use `init` to connect the GitHub repository you share automations to:

```bash
npx -y codex-automations init personal --repo vltansky/automations --publish-mode push --default --yes
npx -y codex-automations init team --repo org/codex-automations --publish-mode pr --default --yes
```

Collections are stored in:

```text
$CODEX_HOME/codex-automations/config.json
```

A config can contain multiple collections and one default:

```json
{
  "version": 1,
  "defaultCollection": "team",
  "collections": {
    "personal": {
      "repo": "vltansky/automations",
      "path": "automations",
      "branch": "main",
      "publishMode": "push"
    },
    "team": {
      "repo": "org/codex-automations",
      "path": "automations",
      "branch": "main",
      "publishMode": "pr"
    }
  }
}
```

Manage collections with:

```bash
npx -y codex-automations collections
npx -y codex-automations collections add team --repo org/codex-automations --publish-mode pr --default
npx -y codex-automations collections default personal
npx -y codex-automations collections remove team
```

Use `--local` when you only want to scaffold collection files into a local directory:

```bash
npx -y codex-automations init --local ./codex-automations --repo owner/codex-automations
```

The local scaffold creates:

```text
README.md
automations/.gitkeep
.github/workflows/validate.yml
```

The generated README is a catalog with `npx -y codex-automations add ...` install commands. `share` regenerates the same catalog whenever it publishes an automation.

## Sharing Automations

`share` publishes one of your installed Codex automations into a GitHub collection repository. If a default collection exists, `share` uses it automatically. Run it with no arguments for the guided flow:

```bash
npx -y codex-automations share
```

Interactive prompts use a select/text/confirm flow for choosing the automation, filling missing collection details, and confirming the publish.

The interactive flow:

1. Lists installed automations.
2. Asks which automation to share.
3. Uses the default collection when configured, or suggests `<github-user>/codex-automations`.
4. Shows the destination, publish mode, and install command.
5. Confirms before creating a repo, committing, pushing, or opening a PR.

Without a configured collection, it uses your `gh` login and targets:

```text
<github-user>/codex-automations
```

For example:

```bash
npx -y codex-automations share morning-pr-radar
npx -y codex-automations share morning-pr-radar --collection team
npx -y codex-automations share morning-pr-radar --repo vltansky/automations
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
npx -y codex-automations add vltansky/automations --list
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
```

Use `--dry-run` to preview without creating a repo, committing, or pushing:

```bash
npx -y codex-automations share morning-pr-radar --repo vltansky/automations --dry-run --json
```

Use `--publish-mode pr` for shared repositories where changes should go through pull requests:

```bash
npx -y codex-automations share morning-pr-radar --collection team --publish-mode pr
```

Use `--yes` for non-interactive sharing:

```bash
npx -y codex-automations share morning-pr-radar --repo vltansky/automations --yes
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

`npx -y codex-automations add owner/repo --list` scans collections and shows the available automations.

## Safety Model

Installs write only automation files and source metadata:

```text
$CODEX_HOME/automations/<id>/
  automation.toml
  codex-automation-source.json
```

By default, the CLI:

- Installs automations as `PAUSED`.
- Refuses to overwrite existing automations unless `--replace` is passed.
- Excludes `memory.md`.
- Excludes OAuth state, connector state, previous runs, and sessions.
- Strips `created_at` and `updated_at` on export.
- Converts exported local `cwds` into `${workspace}`.
- Maps `${workspace}` to the current directory by default.
- Supports `--cwd` when you want to use a different execution directory.
- Warns about local absolute paths, connector references, and secret-looking prompt text.

Activate explicitly after reviewing:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar --activate
```

## JSON Output

Most commands support `--json` for agent and script usage:

```bash
npx -y codex-automations add owner/repo --list --json
npx -y codex-automations install ./morning-pr-radar.codex-automation --dry-run --json
```

Errors are emitted as structured JSON with a stable `code` where possible.

## Development

```bash
npm test
npm run lint
npm run build
```

`npm run build` currently performs an npm pack dry-run against the public npm registry.

## Publishing

Publishing is handled by GitHub Actions so you do not need to publish from your local machine.

One-time setup:

1. Create an npm automation token with publish access.
2. Add it to the GitHub repository as `NPM_TOKEN`.
3. Run the `Publish to npm` workflow from the Actions tab.

You can run a dry-run first by choosing `dry_run: true`.

To publish from a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The publish workflow runs `npm ci`, `npm test`, `npm run lint`, and `npm run build` before `npm publish --access public --provenance`.

## Current Limitations

- GitHub support uses shallow `git clone`; it does not use the GitHub API.
- GitHub tree URL parsing currently supports simple branch names such as `main`.
- Packages are directories; archive formats are not implemented yet.
- TOML parsing is intentionally narrow and focused on current Codex automation files.
- Heartbeat automations are recognized but not deeply modeled because they are thread-bound.

## License

MIT
