import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { exportAutomation, readPackage } from "./automation.js";
import { discoverPackages } from "./source.js";
import { fail } from "./errors.js";

const execFileAsync = promisify(execFile);

export async function shareAutomation(id, options = {}, env = process.env, io = {}) {
  const exec = options.exec || run;
  const ownerRepo = options.repo || `${await getGithubLogin(exec)}/codex-automations`;
  assertOwnerRepo(ownerRepo);

  const collectionPath = options.path || "automations";
  const packagePath = `${collectionPath.replace(/^\/|\/$/g, "")}/${id}`;
  const repoExists = await githubRepoExists(exec, ownerRepo);
  const repoUrl = `https://github.com/${ownerRepo}`;
  const installCommand = `codex-automation add ${ownerRepo} --automation ${id} --cwd <workspace>`;

  const confirmed = options.yes || options.dryRun || await confirmShare({
    id,
    ownerRepo,
    packagePath,
    repoExists,
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
    await exportAutomation(id, targetDir, env);
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

    const message = options.message || `Add ${id} Codex automation`;
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
    return `| \`${pkg.id}\` | ${pkg.title} | \`codex-automation add ${ownerRepo} --automation ${pkg.id} --cwd <workspace>\` | [${rel}](./${rel}) |`;
  });

  await fs.writeFile(path.join(repoDir, "README.md"), `# Codex Automations

Shared Codex automation packages.

## Install

\`\`\`bash
codex-automation add ${ownerRepo} --list
codex-automation add ${ownerRepo} --automation <id> --cwd <workspace>
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

async function confirmShare({ id, ownerRepo, packagePath, repoExists, io }) {
  if (!process.stdin.isTTY) fail("confirmation_required", "Pass --yes to share non-interactively");
  const rl = createInterface({
    input: io.input || process.stdin,
    output: io.output || process.stdout
  });
  try {
    const answer = await rl.question(`Share '${id}' to ${ownerRepo}/${packagePath}${repoExists ? "" : " and create the public repo"}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function assertOwnerRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    fail("invalid_repo", `Expected repo as owner/name, got: ${value}`);
  }
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { ...options, maxBuffer: 10 * 1024 * 1024 });
}
