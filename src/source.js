import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AUTOMATION_NAME, MANIFEST_NAME, readPackage } from "./automation.js";
import { fail } from "./errors.js";
import { execFileAsync, expandHome, fileExists } from "./utils.js";

export function parseSource(source) {
  if (source.startsWith(".") || source.startsWith("/") || source.startsWith("~")) {
    return { type: "local", path: expandHome(source) };
  }

  const shorthand = source.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) {
    return {
      type: "github",
      owner: shorthand[1],
      repo: shorthand[2],
      url: `https://github.com/${shorthand[1]}/${shorthand[2]}.git`,
      ref: undefined,
      pull: undefined,
      subpath: ""
    };
  }

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    fail("unsupported_source", `Unsupported source: ${source}`);
  }

  if (parsed.hostname !== "github.com") {
    fail("unsupported_source", "Only local paths and GitHub sources are supported in this version");
  }

  const parts = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
  if (parts.length < 2) fail("unsupported_source", `Invalid GitHub source: ${source}`);
  const [owner, repoWithSuffix] = parts;
  const repo = repoWithSuffix.replace(/\.git$/, "");
  const treeIndex = parts.indexOf("tree");
  const pullIndex = parts.indexOf("pull");
  const treeParts = treeIndex >= 0 ? parts.slice(treeIndex + 1) : [];
  const ref = treeParts[0];
  const subpath = treeIndex >= 0 ? treeParts.slice(1).join("/") : "";
  const pull = pullIndex >= 0 ? Number(parts[pullIndex + 1]) : undefined;
  if (pullIndex >= 0 && (!Number.isInteger(pull) || pull <= 0)) {
    fail("unsupported_source", `Invalid GitHub pull request source: ${source}`);
  }

  return {
    type: "github",
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}.git`,
    ref,
    pull,
    treeParts,
    subpath
  };
}

export async function resolveSource(source) {
  const parsed = parseSource(source);
  if (parsed.type === "local") return { root: path.resolve(parsed.path), cleanup: async () => {}, source: parsed };

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-source-"));
  const cloneDir = path.join(temp, "repo");
  const resolvedTree = parsed.treeParts?.length ? await resolveTree(parsed.url, parsed.treeParts) : undefined;
  if (resolvedTree) {
    parsed.ref = resolvedTree.ref;
    parsed.subpath = resolvedTree.subpath;
  }

  const args = ["clone", "--depth", "1"];
  if (parsed.ref && !parsed.pull) args.push("--branch", parsed.ref);
  args.push(parsed.url, cloneDir);

  try {
    await execFileAsync("git", args, { maxBuffer: 10 * 1024 * 1024 });
    if (parsed.pull) {
      await execFileAsync("git", ["fetch", "--depth", "1", "origin", `pull/${parsed.pull}/head`], { cwd: cloneDir, maxBuffer: 10 * 1024 * 1024 });
      await execFileAsync("git", ["checkout", "FETCH_HEAD"], { cwd: cloneDir, maxBuffer: 10 * 1024 * 1024 });
    }
  } catch (error) {
    fail("git_clone_failed", `Failed to clone ${source}: ${error.stderr || error.message}`);
  }

  const root = path.join(cloneDir, parsed.subpath || "");
  return {
    root,
    cleanup: () => fs.rm(temp, { recursive: true, force: true }),
    source: parsed
  };
}

export async function discoverPackages(root) {
  const stat = await fs.stat(root).catch((error) => {
    if (error.code === "ENOENT") fail("source_not_found", `Source path not found: ${root}`);
    fail("source_read_error", `Cannot read source path ${root}: ${error.message}`);
  });
  if (!stat.isDirectory()) fail("source_not_directory", `Source path is not a directory: ${root}`);

  const candidates = [];
  await collectCandidates(root, root, candidates, 0);

  const packages = [];
  for (const candidate of candidates) {
    const pkg = await readPackage(candidate);
    packages.push({
      id: pkg.manifest.install?.suggestedId || pkg.automation.id || path.basename(candidate),
      title: pkg.manifest.title || pkg.automation.name || pkg.automation.id || path.basename(candidate),
      name: pkg.manifest.name,
      path: candidate,
      manifest: pkg.manifest,
      automation: pkg.automation
    });
  }

  return packages.sort((a, b) => a.id.localeCompare(b.id));
}

export function selectPackage(packages, requested) {
  return selectPackages(packages, { requested })[0];
}

export function selectPackages(packages, { requested, all = false } = {}) {
  if (packages.length === 0) fail("no_packages_found", "No codex-automations packages found in source");
  if (all) return packages;

  const requestedList = normalizeRequested(requested);
  if (requestedList.length === 0 && packages.length === 1) return [packages[0]];
  if (requestedList.length === 0) {
    fail("multiple_packages_found", "Multiple packages found; use a direct package path", {
      automations: packages.map((pkg) => pkg.id)
    });
  }

  return requestedList.map((item) => {
    const selected = packages.find((pkg) => {
      return pkg.id === item || pkg.name === item || pkg.title === item || path.basename(pkg.path) === item;
    });
    if (!selected) fail("package_not_found", `Automation not found in source: ${item}`);
    return selected;
  });
}

async function resolveTree(url, treeParts) {
  const heads = await execFileAsync("git", ["ls-remote", "--heads", url], { maxBuffer: 10 * 1024 * 1024 })
    .then(({ stdout }) => stdout
      .split("\n")
      .map((line) => line.match(/refs\/heads\/(.+)$/)?.[1])
      .filter(Boolean))
    .catch((error) => {
      process.emitWarning(`Failed to list remote refs for ${url}: ${error.message}`);
      return [];
    });

  for (let count = treeParts.length; count > 0; count -= 1) {
    const candidate = treeParts.slice(0, count).join("/");
    if (heads.includes(candidate) || count === 1) {
      return {
        ref: candidate,
        subpath: treeParts.slice(count).join("/")
      };
    }
  }
  return undefined;
}

function normalizeRequested(requested) {
  if (!requested) return [];
  return Array.isArray(requested) ? requested : [requested];
}

async function collectCandidates(root, current, candidates, depth) {
  const manifest = path.join(current, MANIFEST_NAME);
  const automation = path.join(current, AUTOMATION_NAME);
  const hasPackageFile = await Promise.all([fileExists(manifest), fileExists(automation)]).then(([a, b]) => a || b);
  if (hasPackageFile) {
    candidates.push(current);
    return;
  }
  if (depth >= 4) return;

  const entries = await fs.readdir(current, { withFileTypes: true }).catch((error) => {
    if (error.code !== "ENOENT") {
      process.emitWarning(`Cannot read directory ${current}: ${error.message}`);
    }
    return [];
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    await collectCandidates(root, path.join(current, entry.name), candidates, depth + 1);
  }
}
