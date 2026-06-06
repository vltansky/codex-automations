import fs from "node:fs/promises";
import path from "node:path";
import { confirm } from "@clack/prompts";
import { upsertCollection } from "./config.js";
import { fail } from "./errors.js";
import { ask, ensureNotCancelled, promptWithDefault } from "./utils.js";
import { discoverPackages } from "./source.js";

export const README_BLOCK_START = "<!-- codex-automations:start -->";
export const README_BLOCK_END = "<!-- codex-automations:end -->";

export async function writeCollectionReadme(repoDir, ownerRepo = "owner/codex-automations", options = {}) {
  const branch = options.branch || "main";
  const packages = await discoverPackages(repoDir);
  const rows = packages.map((pkg) => {
    const rel = path.relative(repoDir, pkg.path);
    const description = pkg.manifest.description || "";
    return `| \`${pkg.id}\` | ${escapeCell(pkg.title)} | ${escapeCell(description)} | \`npx -y codex-automations add https://github.com/${ownerRepo}/tree/${branch}/${rel}\` | [${rel}](./${rel}) |`;
  });

  const readmePath = path.join(repoDir, "README.md");
  const existing = await fs.readFile(readmePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  await fs.writeFile(readmePath, upsertGeneratedReadmeBlock(existing, renderGeneratedReadmeBlock(ownerRepo, rows)));
}

function renderDefaultReadme(block) {
  return `# Codex Automations

Shared Codex automation packages.

${block}
`;
}

function renderGeneratedReadmeBlock(ownerRepo, rows) {
  return `${README_BLOCK_START}
## Install

\`\`\`bash
npx -y codex-automations add ${ownerRepo}
npx -y codex-automations add https://github.com/${ownerRepo}/pull/<number>
\`\`\`

## Automations

| ID | Title | Description | Install | Source |
|---|---|---|---|---|
${rows.join("\n")}
${README_BLOCK_END}`;
}

function upsertGeneratedReadmeBlock(existing, block) {
  if (!existing) return renderDefaultReadme(block);

  const start = existing.indexOf(README_BLOCK_START);
  const end = existing.indexOf(README_BLOCK_END);
  if (start >= 0 && end >= start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + README_BLOCK_END.length).trimStart();
    return [before, block, after].filter(Boolean).join("\n\n") + "\n";
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
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

export async function initConnectedCollection(options = {}, env = process.env, io = {}) {
  const name = options.name || await promptWithDefault("Marketplace name", "personal", io, options);
  const repo = options.repo || await promptWithDefault("GitHub repo", "owner/codex-automations", io, options);
  const collectionPath = options.path || await promptWithDefault("Marketplace path", "automations", io, options);
  const publishMode = options.publishMode || await promptWithDefault("Publish mode (push/pr)", "push", io, options);
  if (!["push", "pr"].includes(publishMode)) fail("invalid_publish_mode", "Publish mode must be push or pr");
  const branch = options.branch || "main";
  const makeDefault = options.makeDefault ?? options.default ?? await promptBoolean("Make this the default marketplace?", true, io, options);

  const collection = await upsertCollection(name, {
    repo,
    path: collectionPath,
    branch,
    publishMode
  }, { makeDefault }, env);

  return {
    ok: true,
    marketplace: collection,
    collection,
    defaultMarketplace: makeDefault ? name : undefined,
    defaultCollection: makeDefault ? name : undefined
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
      - name: Validate packages
        run: |
          find automations -mindepth 1 -maxdepth 1 -type d -print0 | while IFS= read -r -d '' package; do
            npx -y codex-automations add "$package" --dry-run --json
          done
`);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function promptBoolean(label, defaultValue, io, options) {
  if (options.yes) return defaultValue;
  if (!io.ask) {
    const answer = await confirm({
      message: label,
      initialValue: defaultValue
    });
    return Boolean(ensureNotCancelled(answer));
  }
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await ask(`${label} [${suffix}]`, io)).trim();
  if (!answer) return defaultValue;
  return /^y(es)?$/i.test(answer);
}
