# codex-automations

Share and install Codex App automations with a small, memorable CLI.

```bash
npx -y codex-automations add <source>
npx -y codex-automations share
npx -y codex-automations list
npx -y codex-automations remove
```

`codex-automations` keeps Codex's native `automation.toml` format as the source of truth, then wraps automations in portable packages that can be shared through GitHub.

Requires Node.js 20 or newer.

## Quickstart: Add

Install from a GitHub repository:

```bash
npx -y codex-automations add owner/repo
```

Install from a specific package path:

```bash
npx -y codex-automations add https://github.com/owner/repo/tree/main/automations/morning-pr-radar
```

Install from a pull request while reviewing someone else's automation:

```bash
npx -y codex-automations add https://github.com/owner/repo/pull/123
```

Install from a local package or local marketplace:

```bash
npx -y codex-automations add ./morning-pr-radar.codex-automation
npx -y codex-automations add ./automations
```

If a source has one automation, it installs directly. If it has multiple automations, the CLI asks which one to install.

Installed automations are paused by default. Activate explicitly when you are ready:

```bash
npx -y codex-automations add owner/repo --activate
```

Use a local workspace path when the automation should run somewhere specific:

```bash
npx -y codex-automations add owner/repo --cwd ~/Projects/my-workspace
```

Install with a custom display name:

```bash
npx -y codex-automations add owner/repo --name "Morning PR Radar Copy"
```

Preview without writing files:

```bash
npx -y codex-automations add owner/repo --dry-run
```

Overwrite an existing installed automation:

```bash
npx -y codex-automations add owner/repo --force
```

## Quickstart: Share

Share one of your installed automations:

```bash
npx -y codex-automations share
```

The interactive flow asks for only the decisions needed:

```text
? Automation to share
? GitHub repo
? Open a pull request?
? Publish this automation?
? Save this destination for next time?
? Destination name
```

No destination names are predefined. If you save a destination, you choose its name.

Share a specific installed automation:

```bash
npx -y codex-automations share "Morning PR Radar"
```

Share to a repo and open a pull request:

```bash
npx -y codex-automations share "Morning PR Radar" --repo owner/repo --pr
```

Share to a repo by pushing directly:

```bash
npx -y codex-automations share "Morning PR Radar" --repo owner/repo --push
```

Preview a share without creating a repo, committing, or pushing:

```bash
npx -y codex-automations share "Morning PR Radar" --repo owner/repo --pr --dry-run
```

`share` exports the automation into:

```text
automations/<slug>/
  codex-automation.json
  automation.toml
  README.md
```

It also updates the repository README with copy-paste install commands.

## Review Loop

The intended team workflow is:

```bash
npx -y codex-automations share "Morning PR Radar" --repo owner/repo --pr
```

Then the reviewer installs from the pull request URL:

```bash
npx -y codex-automations add https://github.com/owner/repo/pull/123
```

Pull request and branch installs are paused by default, like every other install.

## Manage Installed Automations

List installed automations:

```bash
npx -y codex-automations list
```

Remove by display name or slug:

```bash
npx -y codex-automations remove "Morning PR Radar"
npx -y codex-automations remove morning-pr-radar --force
```

If you omit the name, the CLI asks which automation to remove.

## Sources

`add` accepts:

```text
owner/repo
https://github.com/owner/repo
https://github.com/owner/repo/tree/<branch>
https://github.com/owner/repo/tree/<branch>/automations/<name>
https://github.com/owner/repo/pull/<number>
./local-package
./local-marketplace
```

## Command Reference

```bash
codex-automations add <source> [--name <name>] [--cwd <path>] [--activate] [--force] [--dry-run] [--json]
codex-automations share [name] [--repo <owner/repo>] [--pr|--push] [--dry-run] [--json]
codex-automations list [--json]
codex-automations remove [name] [--force] [--json]
```

## Safety Defaults

- Installs are paused unless `--activate` is passed.
- Existing automations are not overwritten unless `--force` is passed.
- `memory.md`, OAuth state, connector state, previous runs, and sessions are not copied.
- Export strips install-time timestamps and restores fresh timestamps on install.
- Exported `${workspace}` paths map to the current directory unless `--cwd` is passed.
- The CLI warns about local absolute paths, connector references, and secret-looking prompt text.

## Package Format

A portable automation package is a directory:

```text
my-automation.codex-automation/
  codex-automation.json
  automation.toml
  README.md
```

`automation.toml` is the native Codex automation file. `codex-automation.json` adds portable package metadata:

```json
{
  "schemaVersion": 1,
  "name": "owner/repo/morning-pr-radar",
  "title": "Morning PR Radar",
  "description": "Summarizes pull requests every morning.",
  "install": {
    "suggestedId": "morning-pr-radar"
  }
}
```
