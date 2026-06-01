import path from "node:path";
import { cancel, confirm, isCancel, select } from "@clack/prompts";
import {
  installPackage,
  listAutomations,
  resolveInstalledAutomation,
  readPackage,
  uninstallAutomation
} from "./automation.js";
import { fail } from "./errors.js";
import { shareAutomation } from "./share.js";
import { discoverPackages, resolveSource } from "./source.js";

export async function main(argv) {
  const { command, args, flags } = parseArgs(argv);
  const json = Boolean(flags.json);

  if (flags.help) return help();

  switch (command) {
    case "list":
      return listCommand(json);
    case "share":
      return shareCommand(args[0], flags, json);
    case "add":
      return addCommand(required(args[0], "source"), flags, json);
    case "remove":
      return removeCommand(args[0], flags, json);
    case "help":
    case undefined:
      return help();
    default:
      fail("unknown_command", `Unknown command: ${command}`);
  }
}

async function shareCommand(id, flags, json) {
  if (flags.pr && flags.push) fail("conflicting_publish_mode", "Pass either --pr or --push, not both");
  const result = await shareAutomation(id, {
    repo: flags.repo,
    publishMode: flags.pr ? "pr" : flags.push ? "push" : undefined,
    dryRun: Boolean(flags["dry-run"])
  });
  return print(result, json);
}

async function listCommand(json) {
  const automations = await listAutomations();
  return print(automations, json);
}

async function addCommand(source, flags, json) {
  const resolved = await resolveSource(source);
  try {
    const packages = await discoverPackages(resolved.root);
    const selected = await choosePackage(packages, json);
    const pkg = await readPackage(selected.path);
    const result = await installPackage(pkg, {
      name: flags.name,
      cwd: flags.cwd,
      force: Boolean(flags.force),
      dryRun: Boolean(flags["dry-run"]),
      activate: Boolean(flags.activate),
      source: sourceMetadata(source, resolved, selected)
    });
    if (!result.ok) process.exitCode = 1;
    return json ? print({ ...result, source, selected: selected.id }, json) : printInstallResult({ ...result, source, selected: selected.id });
  } finally {
    await resolved.cleanup();
  }
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  const booleanFlags = new Set(["json", "dry-run", "activate", "force", "help", "pr", "push"]);
  const valueFlags = new Set(["name", "cwd", "repo"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args.push(item);
      continue;
    }
    const key = item.slice(2);
    if (booleanFlags.has(key)) {
      flags[key] = true;
    } else if (valueFlags.has(key)) {
      flags[key] = required(argv[index + 1], key);
      index += 1;
    } else {
      fail("unknown_flag", `Unknown flag: --${key}`);
    }
  }
  return { command: args.shift(), args, flags };
}

function required(value, label) {
  if (!value) fail("missing_argument", `Missing required argument: ${label}`);
  return value;
}

async function choosePackage(packages, json) {
  if (packages.length === 0) fail("no_packages_found", "No codex-automations packages found in source");
  if (packages.length === 1) return packages[0];
  if (json || !isInteractiveTerminal()) {
    fail("multiple_packages_found", "Source contains multiple automations; pass a direct package path instead");
  }
  const answer = await select({
    message: "Automation to install",
    options: packages.map((pkg) => ({
      value: pkg.id,
      label: pkg.title || pkg.id,
      hint: pkg.id
    }))
  });
  const selected = ensureNotCancelled(answer, "Install cancelled");
  return packages.find((pkg) => pkg.id === selected);
}

async function removeCommand(name, flags, json) {
  const resolved = await resolveInstalledAutomation(name);
  const automation = resolved.automation || await chooseInstalledAutomation(resolved.automations, json, "Automation to remove");
  if (!flags.force && !json && isInteractiveTerminal()) {
    const answer = await confirm({
      message: `Remove ${automation.name || automation.id}?`,
      initialValue: false
    });
    if (!ensureNotCancelled(answer, "Remove cancelled")) fail("remove_cancelled", "Remove cancelled");
  } else if (!flags.force && !json) {
    fail("confirmation_required", "Run in an interactive terminal, or pass --force");
  }
  return print(await uninstallAutomation(automation.id), json);
}

async function chooseInstalledAutomation(automations, json, message) {
  if (automations.length === 0) fail("no_installed_automations", "No installed Codex automations found");
  if (json || !isInteractiveTerminal()) fail("missing_argument", "Missing required argument: name");
  const answer = await select({
    message,
    options: automations.map((automation) => ({
      value: automation.id,
      label: automation.name || automation.id,
      hint: automation.id
    }))
  });
  const selected = ensureNotCancelled(answer, "Operation cancelled");
  return automations.find((automation) => automation.id === selected);
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function ensureNotCancelled(value, message) {
  if (isCancel(value)) {
    cancel(message);
    fail("operation_cancelled", message);
  }
  return value;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    for (const row of value) {
      if ("status" in row || "kind" in row) console.log(formatAutomationRow(row));
      else if ("title" in row) console.log(`${row.id}\t${row.title}\t${row.path || ""}`);
      else if ("repo" in row) console.log(`${row.default ? "*" : " "}\t${row.name}\t${row.repo}\t${row.path}\t${row.publishMode}`);
      else console.log(JSON.stringify(row));
    }
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function printInstallResult(value) {
  const results = Array.isArray(value) ? value : [value];
  for (const result of results) {
    if (!result.ok) {
      console.log(`Could not install ${result.selected || result.automation?.id || "automation"}.`);
      printValidationMessages("Errors", result.errors);
      printValidationMessages("Warnings", result.warnings);
      continue;
    }

    const id = result.automation?.id || result.selected || "automation";
    const name = result.automation?.name;
    const label = name && name !== id ? `${name} (${id})` : id;
    const action = result.dryRun ? `Would ${result.action || "install"}` : result.installed ? "Installed" : titleCase(result.action || "Prepared");
    console.log(`${action}: ${label}`);
    if (result.source) console.log(`Source: ${result.source}`);
    if (result.target) console.log(`Target: ${result.target}`);
    if (result.automation?.status) console.log(`Status: ${result.automation.status}`);
    if (Array.isArray(result.automation?.cwds) && result.automation.cwds.length > 0) {
      console.log(`Workspace: ${result.automation.cwds.join(", ")}`);
    }
    printValidationMessages("Warnings", result.warnings);
    if (result.dryRun) {
      console.log("");
      console.log("No files were written.");
    }
    if (result.preview?.automationToml) {
      console.log("");
      console.log("automation.toml preview:");
      console.log("```toml");
      console.log(result.preview.automationToml.trimEnd());
      console.log("```");
    }
  }
}

function formatAutomationRow(row) {
  const label = row.name && row.name !== row.id ? `${row.name} (${row.id})` : row.id;
  const bits = [label, row.status].filter(Boolean);
  if (row.rrule) bits.push(row.rrule);
  return bits.join("\t");
}

function printValidationMessages(label, messages = []) {
  if (!messages.length) return;
  console.log(`${label}:`);
  for (const item of messages) {
    console.log(`- ${item.code ? `${item.code}: ` : ""}${item.message || item}`);
  }
}

function titleCase(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function sourceMetadata(source, resolved, selected) {
  const parsed = resolved.source;
  const marketplacePath = path.relative(resolved.root, selected.path) || ".";
  const metadata = {
    input: source,
    packageId: selected.id,
    marketplacePath,
    collectionPath: marketplacePath
  };
  if (parsed?.type === "github") {
    return {
      ...metadata,
      type: "github",
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref,
      pull: parsed.pull,
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
  console.log(`codex-automations

Usage:
  npx -y codex-automations add <source> [--name <name>] [--cwd <path>] [--activate] [--force] [--dry-run] [--json]
  npx -y codex-automations share [name] [--repo <owner/repo>] [--pr|--push] [--dry-run] [--json]
  npx -y codex-automations list [--json]
  npx -y codex-automations remove [name] [--force] [--json]

Sources:
  owner/repo
  https://github.com/owner/repo
  https://github.com/owner/repo/tree/main/path/to/package-or-marketplace
  https://github.com/owner/repo/pull/123
  ./local-package-or-marketplace

Environment:
  CODEX_HOME defaults to ${path.join("~", ".codex")}
`);
}
