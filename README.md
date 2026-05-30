# codex-automations

Share, install, and review Codex App automations from GitHub marketplaces.

```bash
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
npx -y codex-automations share
```

`codex-automations` makes Codex automations portable without replacing Codex's native runtime format. It keeps `automation.toml` as the source of truth, then adds just enough package metadata to publish, inspect, validate, and install automations safely on another machine.

Inspired by tools like `npx skills add owner/repo`, but built for Codex automations.

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

Use it with `npx`:

```bash
npx -y codex-automations --help
```

Requires Node.js 20 or newer.

## Quickstart: Install

List automations in a marketplace:

```bash
npx -y codex-automations add vltansky/automations --list
```

Preview before installing:

```bash
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run --view
```

Install:

```bash
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
```

Install a renamed copy:

```bash
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --name "Daily PR Radar"
```

`--name` sets the visible automation name and derives the installed id from that name. For example, `"Daily PR Radar"` installs as `daily-pr-radar`. Use the advanced `--id <id>` override only when you need a precise slug.

## Quickstart: Share

Connect your personal marketplace:

```bash
npx -y codex-automations init personal --repo vltansky/automations --publish-mode push --default --yes
```

Share one installed automation:

```bash
npx -y codex-automations share
npx -y codex-automations share morning-pr-radar --dry-run
npx -y codex-automations share morning-pr-radar
```

Use a PR-based marketplace for team review:

```bash
npx -y codex-automations init team --repo org/codex-automations --publish-mode pr --default --yes
npx -y codex-automations share morning-pr-radar --marketplace team
```

## What It Looks Like

The interactive `share` flow uses select, text, and confirm prompts:

```text
$ npx -y codex-automations share

? Automation to share
> morning-pr-radar (Morning PR Radar)
  pr-approvals
  weekly-release-notes

? GitHub marketplace repo
> vltansky/automations

? Marketplace path
> automations

Share summary
Automation: morning-pr-radar
Repository: vltansky/automations
Package: automations/morning-pr-radar
Publish mode: push
Install: npx -y codex-automations add vltansky/automations --automation morning-pr-radar

? Publish this automation?
> Yes
```

## Marketplace Model

A marketplace is just a GitHub repository with one or more automation packages:

```text
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

The generated marketplace README is a catalog with `npx -y codex-automations add ...` install commands. `share` regenerates the same catalog whenever it publishes an automation.

Example public marketplace:

```bash
npx -y codex-automations add vltansky/automations --list
npx -y codex-automations add vltansky/automations --automation morning-pr-radar --dry-run
npx -y codex-automations add vltansky/automations --automation morning-pr-radar
```

The example repository is [vltansky/automations](https://github.com/vltansky/automations).

## Safe By Default

By default, the CLI:

- Installs automations as `PAUSED`.
- Refuses to overwrite existing automations unless `--replace` is passed.
- Excludes `memory.md`.
- Excludes OAuth state, connector state, previous runs, and sessions.
- Strips `created_at` and `updated_at` on export.
- Restores install-time timestamps when writing into Codex.
- Converts exported local `cwds` into `${workspace}`.
- Maps `${workspace}` to the current directory by default.
- Supports `--cwd` when you want a different execution directory.
- Warns about local absolute paths, connector references, and secret-looking prompt text.

Activate explicitly after reviewing:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar --activate
```

## Common Recipes

Install from a direct GitHub path:

```bash
npx -y codex-automations add https://github.com/owner/repo/tree/main/automations/morning-pr-radar
```

Install multiple automations from one marketplace:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar --automation weekly-github-standup
```

Install everything in a marketplace:

```bash
npx -y codex-automations add owner/repo --all
```

Install into a specific workspace:

```bash
npx -y codex-automations add owner/repo --automation morning-pr-radar --cwd ~/Projects/my-workspace
```

Inspect and install a local package:

```bash
npx -y codex-automations inspect ./morning-pr-radar.codex-automation
npx -y codex-automations install ./morning-pr-radar.codex-automation --dry-run
npx -y codex-automations install ./morning-pr-radar.codex-automation --name "Morning PR Radar Copy"
```

Export one of your local automations:

```bash
npx -y codex-automations export morning-pr-radar --output ./morning-pr-radar.codex-automation
```

Share to a specific marketplace:

```bash
npx -y codex-automations share morning-pr-radar --marketplace team
```

Share without prompts:

```bash
npx -y codex-automations share morning-pr-radar --repo vltansky/automations --yes
```

## Source Formats

`add` can install from local paths or GitHub sources:

```bash
# GitHub shorthand
npx -y codex-automations add owner/repo

# Full GitHub repository URL
npx -y codex-automations add https://github.com/owner/repo

# Direct path to a package or marketplace inside a repo
npx -y codex-automations add https://github.com/owner/repo/tree/main/automations/my-automation

# Local package or local marketplace
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

## Marketplace Config

Marketplaces are stored in:

```text
$CODEX_HOME/codex-automations/config.json
```

A config can contain multiple marketplaces and one default:

```json
{
  "version": 1,
  "defaultMarketplace": "team",
  "marketplaces": {
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

Manage marketplaces with:

```bash
npx -y codex-automations marketplace
npx -y codex-automations marketplace add team --repo org/codex-automations --publish-mode pr --default
npx -y codex-automations marketplace default personal
npx -y codex-automations marketplace remove team
```

Legacy aliases remain supported: `collections` is accepted for `marketplace`, and `--collection` is accepted for `--marketplace`.

## Local Marketplace Scaffold

Use `--local` when you only want to scaffold marketplace files into a local directory:

```bash
npx -y codex-automations init --local ./codex-automations --repo owner/codex-automations
```

The local scaffold creates:

```text
README.md
automations/.gitkeep
.github/workflows/validate.yml
```

## Sharing Details

`share` publishes one of your installed Codex automations into a GitHub marketplace repository. If a default marketplace exists, `share` uses it automatically.

Without a configured marketplace, it uses your `gh` login and targets:

```text
<github-user>/codex-automations
```

If the target repo does not exist, `share` can create it as a public GitHub repository. It then exports the automation into:

```text
automations/<id>/
  codex-automation.json
  automation.toml
  README.md
```

Use `--dry-run` to preview without creating a repo, committing, or pushing:

```bash
npx -y codex-automations share morning-pr-radar --repo vltansky/automations --dry-run --json
```

Before publishing, `share` scans the automation for things that are easy to leak by accident: local paths, email addresses, connector references, and secret-like values. When the Codex CLI is available, the default `auto` mode also asks Codex to review the automation and propose fixes.

```bash
npx -y codex-automations share morning-pr-radar --privacy-review codex --dry-run --json
```

Secret-like findings block publishing. Use `--force` only after reviewing the findings. Use `--privacy-review rules` for local pattern checks only, or `--privacy-review off` / `--no-privacy-scan` when you intentionally want to skip this guard.

Use `--publish-mode pr` for shared repositories where changes should go through pull requests:

```bash
npx -y codex-automations share morning-pr-radar --marketplace team --publish-mode pr
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

## Installed Files

Installs write only automation files and source metadata:

```text
$CODEX_HOME/automations/<id>/
  automation.toml
  codex-automation-source.json
```

The source sidecar records where the automation came from, which makes future update/remove flows possible without changing Codex's native TOML format.

## JSON Output

Most commands support `--json` for agent and script usage:

```bash
npx -y codex-automations add owner/repo --list --json
npx -y codex-automations install ./morning-pr-radar.codex-automation --dry-run --json
```

Errors are emitted as structured JSON with a stable `code` where possible.

## Command Reference

```text
npx -y codex-automations list [--json]
npx -y codex-automations show <id> [--json]
npx -y codex-automations share [id] [--marketplace <name>] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--privacy-review <auto|rules|codex|off>] [--no-privacy-scan] [--force] [--dry-run] [--yes] [--json]
npx -y codex-automations add <source> [--list] [--automation <id>] [--all] [--cwd <path>] [--name <name>] [--id <id>] [--dry-run] [--view] [--replace] [--activate] [--json]
npx -y codex-automations init [name] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--default] [--yes] [--json]
npx -y codex-automations init --local [dir] [--repo <owner/repo>] [--json]
npx -y codex-automations marketplace [list] [--json]
npx -y codex-automations marketplace add <name> --repo <owner/repo> [--path <dir>] [--publish-mode <push|pr>] [--default] [--json]
npx -y codex-automations marketplace default <name> [--json]
npx -y codex-automations marketplace remove <name> [--json]
npx -y codex-automations export <id> [--output <dir>] [--json]
npx -y codex-automations inspect <dir> [--json]
npx -y codex-automations validate <dir> [--json]
npx -y codex-automations install <dir> [--cwd <path>] [--name <name>] [--id <id>] [--dry-run] [--view] [--replace] [--activate] [--json]
npx -y codex-automations diff <id> <dir>
npx -y codex-automations uninstall <id> [--keep-memory] [--json]
```

## Read Next

- [Quickstart: Install](#quickstart-install)
- [Quickstart: Share](#quickstart-share)
- [Marketplace Model](#marketplace-model)
- [Safe By Default](#safe-by-default)
- [Common Recipes](#common-recipes)
- [Package Format](#package-format)
- [Command Reference](#command-reference)

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
