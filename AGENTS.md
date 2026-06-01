# Repository Instructions

## Product Contract

- This package is a consumer-facing CLI for sharing and installing Codex App automations.
- Keep the public API small and centered on these commands:
  - `codex-automations add <source> [--name <name>] [--cwd <path>] [--activate] [--force] [--dry-run] [--json]`
  - `codex-automations share [name] [--repo <owner/repo>] [--pr|--push] [--dry-run] [--json]`
  - `codex-automations list [--json]`
  - `codex-automations remove [name] [--force] [--json]`
- Do not reintroduce the old public command/flag surface unless explicitly requested. Removed public surfaces include `show`, `install`, `export`, `inspect`, `validate`, `diff`, `init`, `marketplace`, `collections`, `uninstall`, `--automation`, `--all`, `--id`, `--view`, `--replace`, `--yes`, `-y`, `--marketplace`, `--collection`, `--publish-mode`, `--path`, `--message`, `--local`, and `--default`.
- Internal helpers may keep old names when they are implementation details, but help text, README examples, generated marketplace docs, and CLI hints should teach only the current public API.
- Installs are paused by default. `--activate` is the only public flag that installs active.
- `--force` is the public overwrite/remove-without-confirmation flag.
- `share --pr` should print an install command that points at the pushed PR branch content so reviewers can install unmerged automation changes.
- Generated marketplace validation must work for repositories with multiple automation packages.

## Documentation

- `README.md` is for consumers: product positioning, quickstart, usage examples, safety defaults, source formats, and the compact command reference.
- Do not turn the README into maintainer/runbook documentation unless explicitly requested. Keep release/publish process details here in `AGENTS.md`.
- Keep README examples aligned with the current CLI. Do not document removed flags or commands.

## Validation

- Before committing CLI behavior changes, run:
  - `npm test`
  - `npm run lint`
  - `npm run build`
- `npm run build` is an npm pack dry-run against the public npm registry.
- Use `git diff --check` before finalizing changes.

## Release And Publish

- Do not publish this package locally with `npm publish` by default.
- The repository has a GitHub Actions publish workflow at `.github/workflows/publish.yml`.
- To publish a normal patch release:
  1. Make sure `main` is clean and up to date with `origin/main`.
  2. Run validation locally:
     - `npm test`
     - `npm run lint`
     - `npm run build`
  3. Bump the version with `npm version patch -m "chore: release %s"`.
  4. Push the release commit and tag:
     - `git push origin main`
     - `git push origin vX.Y.Z`
  5. Watch the publish workflow:
     - `gh run list --workflow=publish.yml --limit=5`
     - `gh run watch <run-id> --exit-status`
  6. Verify the package on the public npm registry:
     - `npm view codex-automations@<version> version --registry=https://registry.npmjs.org/`

The publish workflow runs install, test, lint, pack dry-run, and then publishes to `https://registry.npmjs.org/` with provenance when a `v*.*.*` tag is pushed.

## Npm Registry Caveat

This machine may default to the Wix npm registry (`https://npm.dev.wixpress.com`), so do not trust unqualified npm version checks for this package. Use the public registry explicitly:

- `npm view codex-automations version --registry=https://registry.npmjs.org/`
- `npm view codex-automations@<version> version --registry=https://registry.npmjs.org/`

If local `npm view` reports stale data immediately after a successful publish, check the GitHub Actions publish log first. In the `0.1.11` release, the action log confirmed `+ codex-automations@0.1.11` while local `npm view` briefly returned stale `0.1.10` because npm hit `EBADF` and used stale cache data. In the `0.1.12` release, explicit public-registry verification returned `0.1.12`.

## Branch Notes

- The active release branch is `main`, tracking `origin/main`. If a user says "master", verify the actual branch before pushing.
