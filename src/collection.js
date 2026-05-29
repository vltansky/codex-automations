import fs from "node:fs/promises";
import path from "node:path";
import { cancel, confirm, isCancel, text } from "@clack/prompts";
import { upsertCollection } from "./config.js";
import { fail } from "./errors.js";
import { discoverPackages } from "./source.js";

export async function writeCollectionReadme(repoDir, ownerRepo = "owner/codex-automations") {
  const packages = await discoverPackages(repoDir);
  const rows = packages.map((pkg) => {
    const rel = path.relative(repoDir, pkg.path);
    const description = pkg.manifest.description || "";
    return `| \`${pkg.id}\` | ${escapeCell(pkg.title)} | ${escapeCell(description)} | \`npx -y codex-automations add ${ownerRepo} --automation ${pkg.id}\` | [${rel}](./${rel}) |`;
  });

  await fs.writeFile(path.join(repoDir, "README.md"), `# Codex Automations

Shared Codex automation packages.

## Install

\`\`\`bash
npx -y codex-automations add ${ownerRepo} --list
npx -y codex-automations add ${ownerRepo} --automation <id> --dry-run
npx -y codex-automations add ${ownerRepo} --automation <id>
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

export async function initConnectedCollection(options = {}, env = process.env, io = {}) {
  const name = options.name || await promptWithDefault("Collection name", "personal", io, options);
  const repo = options.repo || await promptWithDefault("GitHub repo", "owner/codex-automations", io, options);
  const collectionPath = options.path || await promptWithDefault("Collection path", "automations", io, options);
  const publishMode = options.publishMode || await promptWithDefault("Publish mode (push/pr)", "push", io, options);
  if (!["push", "pr"].includes(publishMode)) fail("invalid_publish_mode", "Publish mode must be push or pr");
  const branch = options.branch || "main";
  const makeDefault = options.makeDefault ?? options.default ?? await promptBoolean("Make this the default collection?", true, io, options);

  const collection = await upsertCollection(name, {
    repo,
    path: collectionPath,
    branch,
    publishMode
  }, { makeDefault }, env);

  return {
    ok: true,
    collection,
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
      - run: npx -y codex-automations add . --list --json
`);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function promptWithDefault(label, defaultValue, io, options) {
  if (options.yes) return defaultValue;
  if (!io.ask) {
    const answer = await text({
      message: label,
      defaultValue,
      placeholder: defaultValue
    });
    return String(ensureNotCancelled(answer)).trim() || defaultValue;
  }
  const answer = await ask(`${label} [${defaultValue}]`, io);
  return answer.trim() || defaultValue;
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

async function ask(question, io) {
  if (io.ask) return io.ask(question);
  fail("confirmation_required", "Pass --yes for non-interactive usage");
}

function ensureNotCancelled(value) {
  if (isCancel(value)) {
    cancel("Cancelled");
    fail("operation_cancelled", "Operation cancelled");
  }
  return value;
}
