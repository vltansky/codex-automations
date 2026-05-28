import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fail } from "./errors.js";
import { parseAutomationToml, stringifyAutomationToml } from "./toml.js";

export const MANIFEST_NAME = "codex-automation.json";
export const AUTOMATION_NAME = "automation.toml";

export function codexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function automationRoot(env = process.env) {
  return path.join(codexHome(env), "automations");
}

export function automationPath(id, env = process.env) {
  return path.join(automationRoot(env), id, AUTOMATION_NAME);
}

export async function listAutomations(env = process.env) {
  const root = automationRoot(env);
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, AUTOMATION_NAME);
    try {
      const automation = parseAutomationToml(await fs.readFile(file, "utf8"));
      rows.push({
        id: automation.id || entry.name,
        name: automation.name || "",
        kind: automation.kind || "",
        status: automation.status || "",
        path: file
      });
    } catch {
      rows.push({ id: entry.name, name: "", kind: "", status: "invalid", path: file });
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readInstalled(id, env = process.env) {
  const file = automationPath(id, env);
  return { path: file, automation: parseAutomationToml(await fs.readFile(file, "utf8")) };
}

export async function readPackage(packagePath) {
  const stat = await fs.stat(packagePath).catch(() => fail("package_not_found", `Package not found: ${packagePath}`));
  if (!stat.isDirectory()) fail("unsupported_package", "Only directory packages are supported in this version");

  const manifestPath = path.join(packagePath, MANIFEST_NAME);
  const automationFile = path.join(packagePath, AUTOMATION_NAME);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const automation = parseAutomationToml(await fs.readFile(automationFile, "utf8"));
  return { packagePath, manifestPath, automationPath: automationFile, manifest, automation };
}

export function validateAutomation(automation, { portable = false } = {}) {
  const errors = [];
  const warnings = [];

  for (const key of ["version", "id", "kind", "name", "prompt", "status", "rrule"]) {
    if (!(key in automation)) errors.push({ code: "missing_field", message: `Missing required field: ${key}` });
  }
  if (automation.kind && !["cron", "heartbeat"].includes(automation.kind)) {
    errors.push({ code: "unsupported_kind", message: `Unsupported kind: ${automation.kind}` });
  }
  if (automation.kind === "heartbeat") {
    warnings.push({ code: "heartbeat_template_only", message: "Heartbeat automations are thread-bound; install with care." });
  }
  if (automation.rrule && !/(^RRULE:|^FREQ=)/.test(automation.rrule)) {
    errors.push({ code: "invalid_rrule", message: "rrule must start with RRULE: or FREQ=" });
  }
  if (automation.execution_environment && !["local", "worktree"].includes(automation.execution_environment)) {
    errors.push({ code: "unsupported_execution_environment", message: `Unsupported execution_environment: ${automation.execution_environment}` });
  }
  if (automation.cwds !== undefined && !Array.isArray(automation.cwds)) {
    errors.push({ code: "invalid_cwds", message: "cwds must be an array" });
  }
  if (!portable && Array.isArray(automation.cwds)) {
    for (const cwd of automation.cwds) {
      if (typeof cwd !== "string" || !path.isAbsolute(expandHome(cwd))) {
        errors.push({ code: "cwd_not_absolute", message: `Installed cwds must be absolute: ${cwd}` });
      }
    }
  }

  const joined = [automation.prompt, automation.name, automation.id].filter(Boolean).join("\n");
  if (/(api[_-]?key|secret|token|cookie)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{12,}/i.test(joined)) {
    warnings.push({ code: "secret_like_prompt", message: "Prompt appears to contain secret-like material." });
  }
  if (/\[(?:@|\$)[^\]]+\]\((?:app|plugin):\/\//.test(String(automation.prompt || ""))) {
    warnings.push({ code: "connector_reference", message: "Prompt references connectors/plugins that may not exist on another machine." });
  }
  if (/\/Users\/[^/\s]+/.test(String(automation.prompt || ""))) {
    warnings.push({ code: "local_path_reference", message: "Prompt references an absolute local path." });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push({ code: "unsupported_schema", message: "schemaVersion must be 1" });
  if (!manifest.name) errors.push({ code: "missing_manifest_name", message: "Manifest name is required" });
  if (!manifest.version) errors.push({ code: "missing_manifest_version", message: "Manifest version is required" });
  return { ok: errors.length === 0, errors, warnings: [] };
}

export async function exportAutomation(id, outputDir, env = process.env) {
  const { automation } = await readInstalled(id, env);
  const portable = { ...automation };
  delete portable.created_at;
  delete portable.updated_at;

  const inputs = [];
  if (Array.isArray(portable.cwds) && portable.cwds.length > 0) {
    inputs.push({
      name: "workspace",
      type: "path",
      mapsTo: "cwds[0]",
      required: true,
      defaultHint: portable.cwds[0]
    });
    portable.cwds = ["${workspace}"];
  }

  const manifest = {
    schemaVersion: 1,
    name: `local/${portable.id}`,
    version: "0.1.0",
    title: portable.name || portable.id,
    description: `Portable Codex automation package for ${portable.name || portable.id}.`,
    codex: { automationKinds: [portable.kind] },
    inputs,
    install: {
      suggestedId: portable.id,
      includeMemory: false,
      defaultStatus: "PAUSED"
    }
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, AUTOMATION_NAME), stringifyAutomationToml(portable));
  await fs.writeFile(path.join(outputDir, "README.md"), `# ${manifest.title}\n\n${manifest.description}\n\nInstall with:\n\n\`\`\`bash\nnpx -y codex-automation install ${path.basename(outputDir)} --cwd /absolute/workspace\n\`\`\`\n`);
  return { outputDir, manifest, automation: portable };
}

export function prepareInstall(pkg, options = {}, env = process.env) {
  const manifestValidation = validateManifest(pkg.manifest);
  const automationValidation = validateAutomation(pkg.automation, { portable: true });
  const errors = [...manifestValidation.errors, ...automationValidation.errors];
  if (errors.length) return { ok: false, errors, warnings: [...manifestValidation.warnings, ...automationValidation.warnings] };

  const id = options.id || pkg.manifest.install?.suggestedId || pkg.automation.id;
  const target = automationPath(id, env);
  const automation = { ...pkg.automation, id, status: options.activate ? (pkg.automation.status || "ACTIVE") : "PAUSED" };
  const warnings = [...manifestValidation.warnings, ...automationValidation.warnings];

  if (Array.isArray(automation.cwds)) {
    automation.cwds = automation.cwds.map((cwd) => {
      if (cwd === "${workspace}") {
        if (!options.cwd) fail("requires_mapping", "Package requires --cwd for ${workspace}");
        return path.resolve(expandHome(options.cwd));
      }
      return cwd;
    });
  }

  const installedValidation = validateAutomation(automation, { portable: false });
  return {
    ok: installedValidation.ok,
    target,
    automation,
    errors: installedValidation.errors,
    warnings: [...warnings, ...installedValidation.warnings]
  };
}

export async function installPackage(pkg, options = {}, env = process.env) {
  const plan = prepareInstall(pkg, options, env);
  if (!plan.ok) return plan;

  const exists = await fs.access(plan.target).then(() => true, () => false);
  if (exists && !options.replace) fail("id_conflict", `Automation already exists at ${plan.target}`);
  if (options.dryRun) return { ...plan, dryRun: true };

  await fs.mkdir(path.dirname(plan.target), { recursive: true });
  await fs.writeFile(plan.target, stringifyAutomationToml(plan.automation));
  return { ...plan, installed: true };
}

export async function uninstallAutomation(id, { keepMemory = false } = {}, env = process.env) {
  const dir = path.dirname(automationPath(id, env));
  if (keepMemory) {
    await fs.rm(path.join(dir, AUTOMATION_NAME), { force: true });
  } else {
    await fs.rm(dir, { recursive: true, force: true });
  }
  return { id, removed: true, keepMemory };
}

export function diffAutomation(left, right) {
  const a = stringifyAutomationToml(left).split("\n");
  const b = stringifyAutomationToml(right).split("\n");
  const max = Math.max(a.length, b.length);
  const changes = [];
  for (let index = 0; index < max; index += 1) {
    if (a[index] !== b[index]) {
      if (a[index] !== undefined) changes.push(`- ${a[index]}`);
      if (b[index] !== undefined) changes.push(`+ ${b[index]}`);
    }
  }
  return changes.join("\n");
}

function expandHome(value) {
  if (typeof value === "string" && value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
