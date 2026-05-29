import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { exportAutomation, listAutomations, readPackage } from "./automation.js";
import { discoverPackages } from "./source.js";
import { fail } from "./errors.js";

const execFileAsync = promisify(execFile);

export async function shareAutomation(id, options = {}, env = process.env, io = {}) {
  const exec = options.exec || run;
  const login = await getGithubLogin(exec);
  const selectedId = id || await promptForAutomation(env, io);
  const defaultRepo = `${login}/codex-automations`;
  const ownerRepo = options.repo || await promptWithDefault("GitHub collection repo", defaultRepo, io, options);
  assertOwnerRepo(ownerRepo);

  const collectionPath = options.path || await promptWithDefault("Collection path", "automations", io, options);
  const packagePath = `${collectionPath.replace(/^\/|\/$/g, "")}/${selectedId}`;
  const repoExists = await githubRepoExists(exec, ownerRepo);
  const repoUrl = `https://github.com/${ownerRepo}`;
  const installCommand = `npx -y codex-automation add ${ownerRepo} --automation ${selectedId}`;

  const confirmed = options.yes || options.dryRun || await confirmShare({
    id: selectedId,
    ownerRepo,
    packagePath,
    repoExists,
    installCommand,
    io
  });
  if (!confirmed) fail("share_cancelled", "Share cancelled");

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-share-"));
  const repoDir = path.join(temp, "repo");
  try {
    if (repoExists) {
      await exec("gh", ["repo", "clone", ownerRepo, repoDir]);
    } else {
      await fs.mkdir(repoDir, { recursive: true });
      await exec("git", ["init"], { cwd: repoDir });
      await exec("git", ["branch", "-m", "main"], { cwd: repoDir });
      await exec("git", ["remote", "add", "origin", `${repoUrl}.git`], { cwd: repoDir });
    }

    const targetDir = path.join(repoDir, packagePath);
    await exportAutomation(selectedId, targetDir, env);
    await stampSharedManifest(targetDir, ownerRepo, packagePath, repoUrl);
    await writeCollectionReadme(repoDir, ownerRepo);

    if (options.dryRun) {
      return {
        ok: true,
        dryRun: true,
        repo: ownerRepo,
        repoExists,
        wouldCreateRepo: !repoExists,
        packagePath,
        repoUrl,
        installCommand
      };
    }

    if (!repoExists) {
      await exec("gh", [
        "repo",
        "create",
        ownerRepo,
        "--public",
        "--description",
        "Shared Codex automation packages",
        "--clone=false"
      ]);
    }

    await exec("git", ["add", "README.md", packagePath], { cwd: repoDir });
    const status = (await exec("git", ["status", "--porcelain"], { cwd: repoDir })).stdout.trim();
    if (!status) {
      return { ok: true, repo: ownerRepo, repoUrl, packagePath, changed: false, installCommand };
    }

    const message = options.message || `Add ${selectedId} Codex automation`;
    await exec("git", ["commit", "-m", message], { cwd: repoDir });
    await exec("git", ["push", "-u", "origin", "main"], { cwd: repoDir });

    return {
      ok: true,
      repo: ownerRepo,
      repoUrl,
      packagePath,
      changed: true,
      installCommand
    };
  } finally {
    if (!options.keepTemp) await fs.rm(temp, { recursive: true, force: true });
  }
}

async function stampSharedManifest(targetDir, ownerRepo, packagePath, repoUrl) {
  const pkg = await readPackage(targetDir);
  const manifest = {
    ...pkg.manifest,
    name: `${ownerRepo}/${pkg.automation.id}`,
    source: {
      type: "git",
      url: repoUrl,
      path: packagePath
    }
  };
  await fs.writeFile(path.join(targetDir, "codex-automation.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeCollectionReadme(repoDir, ownerRepo) {
  const packages = await discoverPackages(repoDir);
  const rows = packages.map((pkg) => {
    const rel = path.relative(repoDir, pkg.path);
    return `| \`${pkg.id}\` | ${pkg.title} | \`npx -y codex-automation add ${ownerRepo} --automation ${pkg.id}\` | [${rel}](./${rel}) |`;
  });

  await fs.writeFile(path.join(repoDir, "README.md"), `# Codex Automations

Shared Codex automation packages.

## Install

\`\`\`bash
npx -y codex-automation add ${ownerRepo} --list
npx -y codex-automation add ${ownerRepo} --automation <id>
\`\`\`

## Automations

| ID | Title | Install | Source |
|---|---|---|---|
${rows.join("\n")}
`);
}

async function getGithubLogin(exec) {
  const { stdout } = await exec("gh", ["api", "user", "--jq", ".login"]);
  const login = stdout.trim();
  if (!login) fail("github_login_missing", "Could not resolve GitHub login from gh");
  return login;
}

async function githubRepoExists(exec, ownerRepo) {
  try {
    await exec("gh", ["repo", "view", ownerRepo, "--json", "nameWithOwner"]);
    return true;
  } catch {
    return false;
  }
}

async function promptForAutomation(env, io) {
  const automations = await listAutomations(env);
  const valid = automations.filter((automation) => automation.status !== "invalid");
  if (valid.length === 0) fail("no_installed_automations", "No installed Codex automations found");

  write(io, "Installed automations:\n");
  valid.forEach((automation, index) => {
    write(io, `  ${index + 1}. ${automation.id}${automation.name ? ` - ${automation.name}` : ""}\n`);
  });

  const answer = await ask(`Automation to share [1-${valid.length}]`, io);
  const trimmed = answer.trim();
  const index = trimmed === "" ? 0 : Number(trimmed) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= valid.length) {
    fail("invalid_selection", `Invalid automation selection: ${answer}`);
  }
  return valid[index].id;
}

async function promptWithDefault(label, defaultValue, io, options) {
  if (options.yes || options.dryRun) return defaultValue;
  const answer = await ask(`${label} [${defaultValue}]`, io);
  return answer.trim() || defaultValue;
}

async function confirmShare({ id, ownerRepo, packagePath, repoExists, installCommand, io }) {
  write(io, "\nShare summary:\n");
  write(io, `  Automation: ${id}\n`);
  write(io, `  Repository: ${ownerRepo}${repoExists ? "" : " (will be created public)"}\n`);
  write(io, `  Package: ${packagePath}\n`);
  write(io, `  Install: ${installCommand}\n\n`);

  const answer = await ask("Publish this automation? [y/N]", io);
  return /^y(es)?$/i.test(answer.trim());
}

async function ask(question, io) {
  if (io.ask) return io.ask(question);
  if (!process.stdin.isTTY) fail("confirmation_required", "Pass --yes for non-interactive usage");
  const rl = createInterface({
    input: io.input || process.stdin,
    output: io.output || process.stdout
  });
  try {
    return await rl.question(`${question} `);
  } finally {
    rl.close();
  }
}

function write(io, message) {
  if (io.write) {
    io.write(message);
    return;
  }
  process.stdout.write(message);
}

function assertOwnerRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    fail("invalid_repo", `Expected repo as owner/name, got: ${value}`);
  }
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { ...options, maxBuffer: 10 * 1024 * 1024 });
}
