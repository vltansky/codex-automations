# Repository Instructions

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

The publish workflow runs install, test, lint, pack dry-run, and then publishes to `https://registry.npmjs.org/` with provenance when a `v*.*.*` tag is pushed.

## Npm Registry Caveat

This machine may default to the Wix npm registry (`https://npm.dev.wixpress.com`), so do not trust unqualified npm version checks for this package. Use the public registry explicitly:

- `npm view codex-automations version --registry=https://registry.npmjs.org/`
- `npm view codex-automations@<version> version --registry=https://registry.npmjs.org/`

If local `npm view` reports stale data immediately after a successful publish, check the GitHub Actions publish log first. In the `0.1.11` release, the action log confirmed `+ codex-automations@0.1.11` while local `npm view` briefly returned stale `0.1.10` because npm hit `EBADF` and used stale cache data.
