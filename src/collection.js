import fs from "node:fs/promises";
import path from "node:path";
import { discoverPackages } from "./source.js";

export async function writeCollectionReadme(repoDir, ownerRepo = "owner/codex-automations") {
  const packages = await discoverPackages(repoDir);
  const rows = packages.map((pkg) => {
    const rel = path.relative(repoDir, pkg.path);
    const description = pkg.manifest.description || "";
    return `| \`${pkg.id}\` | ${escapeCell(pkg.title)} | ${escapeCell(description)} | \`npx -y codex-automation add ${ownerRepo} --automation ${pkg.id}\` | [${rel}](./${rel}) |`;
  });

  await fs.writeFile(path.join(repoDir, "README.md"), `# Codex Automations

Shared Codex automation packages.

## Install

\`\`\`bash
npx -y codex-automation add ${ownerRepo} --list
npx -y codex-automation add ${ownerRepo} --automation <id> --dry-run --diff
npx -y codex-automation add ${ownerRepo} --automation <id>
\`\`\`

## Automations

| ID | Title | Description | Install | Source |
|---|---|---|---|---|
${rows.join("\n")}
`);
}

export async function initCollection(targetDir, options = {}) {
  const root = path.resolve(targetDir || ".");
  const ownerRepo = options.repo || "owner/codex-automations";
  await fs.mkdir(path.join(root, "automations"), { recursive: true });
  await fs.writeFile(path.join(root, "automations", ".gitkeep"), "");
  await writeCollectionReadme(root, ownerRepo);
  await writeValidateWorkflow(root);
  return {
    ok: true,
    path: root,
    repo: ownerRepo,
    files: [
      "README.md",
      "automations/.gitkeep",
      ".github/workflows/validate.yml"
    ]
  };
}

async function writeValidateWorkflow(root) {
  const workflowDir = path.join(root, ".github", "workflows");
  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(path.join(workflowDir, "validate.yml"), `name: Validate Codex automations

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx -y codex-automation add . --list --json
`);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
