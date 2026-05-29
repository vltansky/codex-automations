import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { AUTOMATION_NAME, MANIFEST_NAME, readPackage } from "./automation.js";
import { fail } from "./errors.js";

const execFileAsync = promisify(execFile);

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
  const ref = treeIndex >= 0 ? parts[treeIndex + 1] : undefined;
  const subpath = treeIndex >= 0 ? parts.slice(treeIndex + 2).join("/") : "";

  return {
    type: "github",
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}.git`,
    ref,
    subpath
  };
}

export async function resolveSource(source) {
  const parsed = parseSource(source);
  if (parsed.type === "local") return { root: path.resolve(parsed.path), cleanup: async () => {}, source: parsed };

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-source-"));
  const cloneDir = path.join(temp, "repo");
  const args = ["clone", "--depth", "1"];
  if (parsed.ref) args.push("--branch", parsed.ref);
  args.push(parsed.url, cloneDir);

  try {
    await execFileAsync("git", args, { maxBuffer: 10 * 1024 * 1024 });
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
  const stat = await fs.stat(root).catch(() => fail("source_not_found", `Source path not found: ${root}`));
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
    fail("multiple_packages_found", "Multiple packages found; pass --automation <id>", {
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

function normalizeRequested(requested) {
  if (!requested) return [];
  return Array.isArray(requested) ? requested : [requested];
}

async function collectCandidates(root, current, candidates, depth) {
  const manifest = path.join(current, MANIFEST_NAME);
  const automation = path.join(current, AUTOMATION_NAME);
  const hasPackage = await Promise.all([exists(manifest), exists(automation)]).then(([a, b]) => a && b);
  if (hasPackage) {
    candidates.push(current);
    return;
  }
  if (depth >= 4) return;

  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    await collectCandidates(root, path.join(current, entry.name), candidates, depth + 1);
  }
}

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

function expandHome(value) {
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
