import path from "node:path";
import {
  diffAutomation,
  exportAutomation,
  installPackage,
  listAutomations,
  prepareInstall,
  readInstalled,
  readPackage,
  uninstallAutomation,
  validateAutomation,
  validateManifest
} from "./automation.js";
import { fail } from "./errors.js";
import { shareAutomation } from "./share.js";
import { discoverPackages, resolveSource, selectPackage } from "./source.js";

export async function main(argv) {
  const { command, args, flags } = parseArgs(argv);
  const json = Boolean(flags.json);

  if (flags.help) return help();

  switch (command) {
    case "list":
      return print(await listAutomations(), json);
    case "show":
      return print(await readInstalled(required(args[0], "id")).then((x) => x.automation), json);
    case "export":
      return print(await exportAutomation(required(args[0], "id"), flags.output || `${args[0]}.codex-automation`), json);
    case "share":
      return shareCommand(args[0], flags, json);
    case "add":
      return addCommand(required(args[0], "source"), flags, json);
    case "inspect":
      return inspectCommand(required(args[0], "package"), json);
    case "install":
      return installCommand(required(args[0], "package"), flags, json);
    case "validate":
      return validateCommand(required(args[0], "package"), json);
    case "diff":
      return diffCommand(required(args[0], "id"), required(args[1], "package"));
    case "uninstall":
      return print(await uninstallAutomation(required(args[0], "id"), { keepMemory: Boolean(flags["keep-memory"]) }), json);
    case "help":
    case undefined:
      return help();
    default:
      fail("unknown_command", `Unknown command: ${command}`);
  }
}

async function shareCommand(id, flags, json) {
  const result = await shareAutomation(id, {
    repo: flags.repo,
    path: flags.path,
    message: flags.message,
    yes: Boolean(flags.yes),
    dryRun: Boolean(flags["dry-run"])
  });
  return print(result, json);
}

async function addCommand(source, flags, json) {
  const resolved = await resolveSource(source);
  try {
    const packages = await discoverPackages(resolved.root);
    if (flags.list) {
      return print(packages.map((pkg) => ({
        id: pkg.id,
        title: pkg.title,
        name: pkg.name,
        path: pkg.path
      })), json);
    }

    const selected = selectPackage(packages, flags.automation);
    const pkg = await readPackage(selected.path);
    const result = await installPackage(pkg, {
      id: flags.id,
      cwd: flags.cwd,
      replace: Boolean(flags.replace),
      dryRun: Boolean(flags["dry-run"]),
      activate: Boolean(flags.activate)
    });
    if (!result.ok) process.exitCode = 1;
    return print({ ...result, source, selected: selected.id }, json);
  } finally {
    await resolved.cleanup();
  }
}

async function inspectCommand(packagePath, json) {
  const pkg = await readPackage(packagePath);
  const result = {
    manifest: pkg.manifest,
    automation: pkg.automation,
    validation: {
      manifest: validateManifest(pkg.manifest),
      automation: validateAutomation(pkg.automation, { portable: true })
    }
  };
  return print(result, json);
}

async function validateCommand(packagePath, json) {
  const pkg = await readPackage(packagePath);
  const result = {
    ok: true,
    manifest: validateManifest(pkg.manifest),
    automation: validateAutomation(pkg.automation, { portable: true })
  };
  result.ok = result.manifest.ok && result.automation.ok;
  if (!json && !result.ok) process.exitCode = 1;
  return print(result, json);
}

async function installCommand(packagePath, flags, json) {
  const pkg = await readPackage(packagePath);
  const options = {
    id: flags.id,
    cwd: flags.cwd,
    replace: Boolean(flags.replace),
    dryRun: Boolean(flags["dry-run"]),
    activate: Boolean(flags.activate)
  };
  const result = await installPackage(pkg, options);
  if (!result.ok) process.exitCode = 1;
  return print(result, json);
}

async function diffCommand(id, packagePath) {
  const installed = await readInstalled(id);
  const pkg = await readPackage(packagePath);
  console.log(diffAutomation(installed.automation, pkg.automation) || "No differences");
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args.push(item);
      continue;
    }
    const key = item.slice(2);
    if (["json", "dry-run", "replace", "activate", "keep-memory", "list", "yes", "help"].includes(key)) {
      flags[key] = true;
    } else {
      flags[key] = required(argv[index + 1], key);
      index += 1;
    }
  }
  return { command: args.shift(), args, flags };
}

function required(value, label) {
  if (!value) fail("missing_argument", `Missing required argument: ${label}`);
  return value;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    for (const row of value) console.log(`${row.id}\t${row.status}\t${row.kind}\t${row.name}`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function help() {
  console.log(`codex-automation

Usage:
  npx -y codex-automation list [--json]
  npx -y codex-automation show <id> [--json]
  npx -y codex-automation share [id] [--repo <owner/repo>] [--path <dir>] [--dry-run] [--yes] [--json]
  npx -y codex-automation add <source> [--list] [--automation <id>] [--cwd <path>] [--id <id>] [--dry-run] [--replace] [--activate] [--json]
  npx -y codex-automation export <id> [--output <dir>] [--json]
  npx -y codex-automation inspect <dir> [--json]
  npx -y codex-automation validate <dir> [--json]
  npx -y codex-automation install <dir> [--cwd <path>] [--id <id>] [--dry-run] [--replace] [--activate] [--json]
  npx -y codex-automation diff <id> <dir>
  npx -y codex-automation uninstall <id> [--keep-memory] [--json]

Sources:
  owner/repo
  https://github.com/owner/repo
  https://github.com/owner/repo/tree/main/path/to/package-or-collection
  ./local-package-or-collection

Environment:
  CODEX_HOME defaults to ${path.join("~", ".codex")}
`);
}
