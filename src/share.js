import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cancel, confirm, isCancel, note, select, text } from "@clack/prompts";
import { exportAutomation, listAutomations, readPackage, resolveInstalledAutomation } from "./automation.js";
import { writeCollectionReadme } from "./collection.js";
import { readConfig, upsertCollection } from "./config.js";
import { fail } from "./errors.js";

const execFileAsync = promisify(execFile);

export async function shareAutomation(id, options = {}, env = process.env, io = {}) {
  const exec = options.exec || run;
  const login = await getGithubLogin(exec);
  const selectedId = id ? (await resolveInstalledAutomation(id, env)).automation.id : await promptForAutomation(env, io);
  const saved = await defaultDestination(env);
  const defaultRepo = `${login}/codex-automations`;
  const ownerRepo = options.repo || await promptWithDefault("GitHub repo", saved?.repo || defaultRepo, io, options);
  assertOwnerRepo(ownerRepo);

  const collectionPath = "automations";
  const branch = saved?.repo === ownerRepo ? saved.branch : "main";
  const publishMode = options.publishMode || await promptPublishMode(saved?.repo === ownerRepo ? saved.publishMode : undefined, io, options);
  if (!["push", "pr"].includes(publishMode)) fail("invalid_publish_mode", "Publish mode must be push or pr");
  const packagePath = `${collectionPath.replace(/^\/|\/$/g, "")}/${selectedId}`;
  const repoExists = await githubRepoExists(exec, ownerRepo);
  const repoUrl = `https://github.com/${ownerRepo}`;
  const publishBranch = publishMode === "pr" ? `add/${selectedId}` : branch;
  const installCommand = `npx -y codex-automations add ${repoUrl}/tree/${publishBranch}/${packagePath}`;

  const confirmed = options.dryRun || nonInteractiveExplicitShare(options, io) || await confirmShare({
    id: selectedId,
    ownerRepo,
    packagePath,
    repoExists,
    publishMode,
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
    await writeCollectionReadme(repoDir, ownerRepo, { branch });

    if (options.dryRun) {
      return {
        ok: true,
        dryRun: true,
        repo: ownerRepo,
        repoExists,
        wouldCreateRepo: !repoExists,
        packagePath,
        repoUrl,
        installCommand,
        publishMode,
        destination: saved?.repo === ownerRepo ? saved.name : undefined
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

    if (publishMode === "pr") {
      await exec("git", ["checkout", "-b", publishBranch], { cwd: repoDir });
    }

    await exec("git", ["add", "README.md", packagePath], { cwd: repoDir });
    const status = (await exec("git", ["status", "--porcelain"], { cwd: repoDir })).stdout.trim();
    if (!status) {
      return { ok: true, repo: ownerRepo, repoUrl, packagePath, changed: false, installCommand, publishMode, destination: saved?.repo === ownerRepo ? saved.name : undefined };
    }

    const message = options.message || `Add ${selectedId} Codex automation`;
    let prUrl;
    await exec("git", ["commit", "-m", message], { cwd: repoDir });
    if (publishMode === "pr") {
      await exec("git", ["push", "-u", "origin", publishBranch], { cwd: repoDir });
      const pr = await exec("gh", [
        "pr",
        "create",
        "--repo",
        ownerRepo,
        "--base",
        branch,
        "--head",
        publishBranch,
        "--title",
        message,
        "--body",
        `Install with:\n\n\`\`\`bash\n${installCommand}\n\`\`\``
      ], { cwd: repoDir });
      prUrl = pr.stdout?.trim();
    } else {
      await exec("git", ["push", "-u", "origin", branch], { cwd: repoDir });
    }

    const destination = await maybeSaveDestination({
      ownerRepo,
      collectionPath,
      branch,
      publishMode,
      env,
      io,
      options,
      existing: saved?.repo === ownerRepo ? saved.name : undefined
    });

    return {
      ok: true,
      repo: ownerRepo,
      repoUrl,
      prUrl,
      packagePath,
      changed: true,
      installCommand,
      publishMode,
      destination
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
  } catch (error) {
    const message = `${error.stderr || ""}\n${error.message || ""}`;
    if (/not found|could not resolve to a repository|repository not found/i.test(message)) return false;
    fail("github_repo_check_failed", `Could not check GitHub repo ${ownerRepo}: ${error.stderr || error.message}`);
  }
}

async function defaultDestination(env) {
  const config = await readConfig(env);
  const name = config.defaultMarketplace;
  if (!name || !config.marketplaces[name]) return undefined;
  return { name, ...config.marketplaces[name] };
}

function nonInteractiveExplicitShare(options, io) {
  return Boolean(options.repo && options.publishMode && !io.ask && !io.write && !process.stdin.isTTY);
}

async function promptForAutomation(env, io) {
  const automations = await listAutomations(env);
  const valid = automations.filter((automation) => automation.status !== "invalid");
  if (valid.length === 0) fail("no_installed_automations", "No installed Codex automations found");

  if (!io.ask) {
    const selected = await select({
      message: "Automation to share",
      options: valid.map((automation) => ({
        value: automation.id,
        label: automation.id,
        hint: automation.name || undefined
      }))
    });
    return ensureNotCancelled(selected);
  }

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
  if (options.dryRun) return defaultValue;
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

async function promptPublishMode(defaultValue, io, options) {
  if (options.dryRun) return defaultValue || "pr";
  if (!io.ask) {
    const answer = await select({
      message: "Publish",
      options: [
        { value: "pr", label: "Open a pull request" },
        { value: "push", label: "Push directly" }
      ],
      initialValue: defaultValue || "pr"
    });
    return ensureNotCancelled(answer);
  }
  const answer = (await ask(`Open a pull request? [Y/n]`, io)).trim();
  if (!answer) return "pr";
  return /^n(o)?$/i.test(answer) ? "push" : "pr";
}

async function maybeSaveDestination({ ownerRepo, collectionPath, branch, publishMode, env, io, options, existing }) {
  if (existing || options.dryRun) return existing;
  if (!io.ask && !io.write && !process.stdin.isTTY) return undefined;
  let shouldSave;
  if (!io.ask && !io.write) {
    const answer = await confirm({
      message: "Save this destination for next time?",
      initialValue: false
    });
    shouldSave = Boolean(ensureNotCancelled(answer));
  } else {
    const answer = (await ask("Save this destination for next time? [y/N]", io)).trim();
    shouldSave = /^y(es)?$/i.test(answer);
  }
  if (!shouldSave) return undefined;
  const fallbackName = ownerRepo.split("/").at(-1);
  const name = await promptWithDefault("Destination name", fallbackName, io, {});
  const saved = await upsertCollection(name, {
    repo: ownerRepo,
    path: collectionPath,
    branch,
    publishMode
  }, { makeDefault: true }, env);
  return saved.name;
}

async function confirmShare({ id, ownerRepo, packagePath, repoExists, publishMode, installCommand, io }) {
  if (!io.ask && !io.write) {
    note([
      `Automation: ${id}`,
      `Repository: ${ownerRepo}${repoExists ? "" : " (will be created public)"}`,
      `Package: ${packagePath}`,
      `Publish mode: ${publishMode}`,
      `Install: ${installCommand}`
    ].join("\n"), "Share summary");
    const answer = await confirm({
      message: "Publish this automation?",
      initialValue: false
    });
    return Boolean(ensureNotCancelled(answer));
  }

  write(io, "\nShare summary:\n");
  write(io, `  Automation: ${id}\n`);
  write(io, `  Repository: ${ownerRepo}${repoExists ? "" : " (will be created public)"}\n`);
  write(io, `  Package: ${packagePath}\n`);
  write(io, `  Publish mode: ${publishMode}\n`);
  write(io, `  Install: ${installCommand}\n\n`);

  const answer = await ask("Publish this automation? [y/N]", io);
  return /^y(es)?$/i.test(answer.trim());
}

async function ask(question, io) {
  if (io.ask) return io.ask(question);
  fail("confirmation_required", "Run in an interactive terminal");
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

function ensureNotCancelled(value) {
  if (isCancel(value)) {
    cancel("Cancelled");
    fail("operation_cancelled", "Operation cancelled");
  }
  return value;
}
