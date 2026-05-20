# codex-automation

Small CLI for exporting, inspecting, validating, and installing portable Codex automation packages.

`codex-automation` keeps Codex's native `automation.toml` as the execution format. The package manifest adds only the distribution details Codex's local files do not have: package identity, version, required local path mappings, and install policy.

## Install

```bash
npm install -g codex-automation
```

## Usage

```bash
codex-automation list
codex-automation add vltansky/codex-automations --list
codex-automation add https://github.com/vltansky/codex-automations/tree/main/automations/morning-pr-radar --cwd ~/Projects/vlad --dry-run
codex-automation add vltansky/codex-automations --automation morning-pr-radar --cwd ~/Projects/vlad
codex-automation export morning-pr-radar --output ./morning-pr-radar.codex-automation
codex-automation inspect ./morning-pr-radar.codex-automation
codex-automation install ./morning-pr-radar.codex-automation --cwd ~/Projects/vlad --dry-run
codex-automation install ./morning-pr-radar.codex-automation --cwd ~/Projects/vlad --id morning-pr-radar-copy
```

## Source formats

`add` follows the same broad shape as tools like `npx skills add`:

```bash
# GitHub shorthand
codex-automation add owner/repo

# Full GitHub URL
codex-automation add https://github.com/owner/repo

# Direct path in a repo
codex-automation add https://github.com/owner/repo/tree/main/automations/my-automation

# Local path
codex-automation add ./my-automation.codex-automation
```

Use `--list` to inspect available automations in a source without installing.

## Package format

```text
my-automation.codex-automation/
  codex-automation.json
  automation.toml
  README.md
```

Installs write only `$CODEX_HOME/automations/<id>/automation.toml`. Runtime memory, OAuth state, connector state, and previous sessions are intentionally not copied.

## Safety defaults

- Installs default to `PAUSED`.
- Existing automations are not overwritten unless `--replace` is passed.
- Export strips `created_at` and `updated_at`.
- Export excludes `memory.md`.
- Packages with `${workspace}` require `--cwd` during install.
- Validation warns about local paths, connector references, and secret-like prompt content.
