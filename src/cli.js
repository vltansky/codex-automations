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
import { initCollection, initConnectedCollection } from "./collection.js";
import {
  listCollections,
  readConfig,
  removeCollection,
  setDefaultCollection,
  upsertCollection
} from "./config.js";
import { fail } from "./errors.js";
import { shareAutomation } from "./share.js";
import { discoverPackages, resolveSource, selectPackages } from "./source.js";

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
    case "init":
      return initCommand(args, flags, json);
    case "collections":
      return collectionsCommand(args, flags, json);
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
    collection: flags.collection,
    path: flags.path,
    publishMode: flags["publish-mode"],
    message: flags.message,
    yes: Boolean(flags.yes),
    dryRun: Boolean(flags["dry-run"])
  });
  return print(result, json);
}

async function initCommand(args, flags, json) {
  if (flags.local) {
    return print(await initCollection(args[0] || ".", { repo: flags.repo }), json);
  }
  return print(await initConnectedCollection({
    name: flags.name || args[0],
    repo: flags.repo,
    path: flags.path,
    branch: flags.branch,
    publishMode: flags["publish-mode"],
    makeDefault: flags.default ? true : undefined,
    yes: Boolean(flags.yes)
  }), json);
}

async function collectionsCommand(args, flags, json) {
  const subcommand = args[0] || "list";
  switch (subcommand) {
    case "list":
    case "ls":
      return print(listCollections(await readConfig()), json);
    case "add":
      return print(await upsertCollection(required(args[1], "name"), {
        repo: required(flags.repo, "repo"),
        path: flags.path,
        branch: flags.branch,
        publishMode: flags["publish-mode"]
      }, { makeDefault: Boolean(flags.default) }), json);
    case "default":
      return print(await setDefaultCollection(required(args[1], "name")), json);
    case "remove":
    case "rm":
      return print(await removeCollection(required(args[1], "name")), json);
    default:
      fail("unknown_subcommand", `Unknown collections command: ${subcommand}`);
  }
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

    const selected = selectPackages(packages, { requested: flags.automation, all: Boolean(flags.all) });
    if (flags.id && selected.length > 1) fail("id_with_multiple_automations", "--id can only be used when installing one automation");

    const results = [];
    for (const item of selected) {
      const pkg = await readPackage(item.path);
      const result = await installPackage(pkg, {
        id: flags.id,
        cwd: flags.cwd,
        replace: Boolean(flags.replace),
        dryRun: Boolean(flags["dry-run"]),
        diff: Boolean(flags.diff),
        view: Boolean(flags.view),
        activate: Boolean(flags.activate),
        source: sourceMetadata(source, resolved, item)
      });
      if (!result.ok) process.exitCode = 1;
      results.push({ ...result, source, selected: item.id });
    }
    return print(results.length === 1 ? results[0] : results, json);
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
    diff: Boolean(flags.diff),
    view: Boolean(flags.view),
    activate: Boolean(flags.activate),
    source: {
      type: "local",
      input: packagePath,
      path: path.resolve(packagePath),
      packageId: pkg.manifest.install?.suggestedId || pkg.automation.id
    }
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
    if (["json", "dry-run", "replace", "activate", "keep-memory", "list", "yes", "help", "all", "diff", "view", "local", "default"].includes(key)) {
      flags[key] = true;
    } else if (key === "automation") {
      const value = required(argv[index + 1], key);
      flags[key] = flags[key] ? [...asArray(flags[key]), value] : value;
      index += 1;
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
    for (const row of value) {
      if ("status" in row || "kind" in row) console.log(`${row.id}\t${row.status}\t${row.kind}\t${row.name}`);
      else if ("title" in row) console.log(`${row.id}\t${row.title}\t${row.path || ""}`);
      else if ("repo" in row) console.log(`${row.default ? "*" : " "}\t${row.name}\t${row.repo}\t${row.path}\t${row.publishMode}`);
      else console.log(JSON.stringify(row));
    }
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function sourceMetadata(source, resolved, selected) {
  const parsed = resolved.source;
  const collectionPath = path.relative(resolved.root, selected.path) || ".";
  const metadata = {
    input: source,
    packageId: selected.id,
    collectionPath
  };
  if (parsed?.type === "github") {
    return {
      ...metadata,
      type: "github",
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref,
      subpath: parsed.subpath
    };
  }
  if (parsed?.type === "local") {
    return {
      ...metadata,
      type: "local",
      path: path.resolve(parsed.path)
    };
  }
  return metadata;
}

function help() {
  console.log(`codex-automation

Usage:
  npx -y codex-automation list [--json]
  npx -y codex-automation show <id> [--json]
  npx -y codex-automation share [id] [--collection <name>] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--dry-run] [--yes] [--json]
  npx -y codex-automation add <source> [--list] [--automation <id>] [--all] [--cwd <path>] [--id <id>] [--dry-run] [--diff] [--view] [--replace] [--activate] [--json]
  npx -y codex-automation init [name] [--repo <owner/repo>] [--path <dir>] [--publish-mode <push|pr>] [--default] [--yes] [--json]
  npx -y codex-automation init --local [dir] [--repo <owner/repo>] [--json]
  npx -y codex-automation collections [list] [--json]
  npx -y codex-automation collections add <name> --repo <owner/repo> [--path <dir>] [--publish-mode <push|pr>] [--default] [--json]
  npx -y codex-automation collections default <name> [--json]
  npx -y codex-automation collections remove <name> [--json]
  npx -y codex-automation export <id> [--output <dir>] [--json]
  npx -y codex-automation inspect <dir> [--json]
  npx -y codex-automation validate <dir> [--json]
  npx -y codex-automation install <dir> [--cwd <path>] [--id <id>] [--dry-run] [--diff] [--view] [--replace] [--activate] [--json]
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
