import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  exportAutomation,
  installPackage,
  listAutomations,
  prepareInstall,
  readInstalled,
  readPackage,
  validateAutomation
} from "../src/automation.js";
import { shareAutomation } from "../src/share.js";
import { discoverPackages, parseSource, selectPackage } from "../src/source.js";
import { parseAutomationToml, stringifyAutomationToml } from "../src/toml.js";
import { main } from "../src/cli.js";

const sampleToml = `version = 1
id = "morning-pr-radar"
kind = "cron"
name = "Morning PR Radar"
prompt = """Line one
Line two"""
status = "ACTIVE"
rrule = "RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0"
model = "gpt-5.4"
reasoning_effort = "medium"
execution_environment = "local"
cwds = ["/Users/example/Projects/vlad"]
created_at = 1776126444083
updated_at = 1777937023315
`;

test("parses and stringifies Codex automation TOML", () => {
  const parsed = parseAutomationToml(sampleToml);
  assert.equal(parsed.id, "morning-pr-radar");
  assert.equal(parsed.prompt, "Line one\nLine two");
  assert.deepEqual(parsed.cwds, ["/Users/example/Projects/vlad"]);

  const roundTrip = parseAutomationToml(stringifyAutomationToml(parsed));
  assert.deepEqual(roundTrip, parsed);
});

test("global --help prints help instead of requiring a value", async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (message) => lines.push(message);
  try {
    await main(["--help"]);
  } finally {
    console.log = originalLog;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /codex-automation/);
  assert.match(lines[0], /Usage:/);
});

test("validates installed automation shape", () => {
  const validation = validateAutomation(parseAutomationToml(sampleToml));
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("export creates portable package and install defaults to paused", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  const sourceDir = path.join(env.CODEX_HOME, "automations", "morning-pr-radar");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml);
  await fs.writeFile(path.join(sourceDir, "memory.md"), "private runtime memory");

  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  const exported = await exportAutomation("morning-pr-radar", packageDir, env);
  assert.equal(exported.automation.created_at, undefined);
  assert.deepEqual(exported.automation.cwds, ["${workspace}"]);

  const pkg = await readPackage(packageDir);
  const plan = prepareInstall(pkg, { id: "radar-copy", cwd: path.join(temp, "workspace"), dryRun: true }, env);
  assert.equal(plan.ok, true);
  assert.equal(plan.automation.status, "PAUSED");
  assert.deepEqual(plan.automation.cwds, [path.join(temp, "workspace")]);

  const result = await installPackage(pkg, { id: "radar-copy", cwd: path.join(temp, "workspace") }, env);
  assert.equal(result.installed, true);

  const installed = await readInstalled("radar-copy", env);
  assert.equal(installed.automation.id, "radar-copy");
  assert.equal(installed.automation.status, "PAUSED");
  assert.deepEqual(installed.automation.cwds, [path.join(temp, "workspace")]);

  const listed = await listAutomations(env);
  assert.deepEqual(listed.map((row) => row.id), ["morning-pr-radar", "radar-copy"]);
});

test("install defaults workspace mapping to current directory", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  const sourceDir = path.join(env.CODEX_HOME, "automations", "morning-pr-radar");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml);

  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  const plan = prepareInstall(pkg, {}, env);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.automation.cwds, [process.cwd()]);
});

test("dry-run install still detects id conflicts", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  const sourceDir = path.join(env.CODEX_HOME, "automations", "morning-pr-radar");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml);

  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  await assert.rejects(
    () => installPackage(pkg, { id: "morning-pr-radar", cwd: temp, dryRun: true }, env),
    /Automation already exists/
  );
});

test("parses GitHub-like add sources", () => {
  assert.deepEqual(parseSource("vercel-labs/skills"), {
    type: "github",
    owner: "vercel-labs",
    repo: "skills",
    url: "https://github.com/vercel-labs/skills.git",
    ref: undefined,
    subpath: ""
  });
  assert.deepEqual(parseSource("https://github.com/vltansky/codex-automations/tree/main/automations/radar"), {
    type: "github",
    owner: "vltansky",
    repo: "codex-automations",
    url: "https://github.com/vltansky/codex-automations.git",
    ref: "main",
    subpath: "automations/radar"
  });
});

test("parses local add sources with home expansion", () => {
  assert.deepEqual(parseSource("./automations"), {
    type: "local",
    path: "./automations"
  });
  assert.equal(parseSource("~/codex-automations").type, "local");
  assert.equal(parseSource("~/codex-automations").path, path.join(os.homedir(), "codex-automations"));
});

test("discovers and selects packages from a collection source", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  const sourceDir = path.join(env.CODEX_HOME, "automations", "morning-pr-radar");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml);

  const packageDir = path.join(temp, "repo", "automations", "morning-pr-radar");
  await exportAutomation("morning-pr-radar", packageDir, env);

  const packages = await discoverPackages(path.join(temp, "repo"));
  assert.deepEqual(packages.map((pkg) => pkg.id), ["morning-pr-radar"]);
  assert.equal(selectPackage(packages, "morning-pr-radar").path, packageDir);
});

test("selectPackage rejects ambiguous collections until automation is specified", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env, "morning-pr-radar", "Morning PR Radar");
  await writeInstalledSample(env, "weekly-release-notes", "Weekly Release Notes");

  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);
  await exportAutomation("weekly-release-notes", path.join(temp, "repo", "automations", "weekly-release-notes"), env);

  const packages = await discoverPackages(path.join(temp, "repo"));
  assert.deepEqual(packages.map((pkg) => pkg.id), ["morning-pr-radar", "weekly-release-notes"]);
  assert.throws(() => selectPackage(packages), /Multiple packages found/);
  assert.equal(selectPackage(packages, "Weekly Release Notes").id, "weekly-release-notes");
  assert.throws(() => selectPackage(packages, "missing"), /Automation not found/);
});

test("share dry-run plans a public collection repo without pushing", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    dryRun: true,
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "api") return { stdout: "vltansky\n", stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "view") throw new Error("not found");
      if (command === "git" && args[0] === "init") {
        await fs.mkdir(options.cwd, { recursive: true });
        return { stdout: "", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.dryRun, true);
  assert.equal(result.wouldCreateRepo, true);
  assert.equal(result.packagePath, "automations/morning-pr-radar");
  assert.equal(result.installCommand, "npx -y codex-automation add vltansky/codex-automations --automation morning-pr-radar");
  assert.equal(calls.some(([command, args]) => command === "gh" && args.includes("create")), false);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "push"), false);
});

test("share commits and pushes into an existing collection repo", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    yes: true,
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "api") return { stdout: "vltansky\n", stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"vltansky/codex-automations"}', stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
        await fs.mkdir(args[3], { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  automations/morning-pr-radar/automation.toml\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.changed, true);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "commit"), true);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "push"), true);
});

test("share can run as a guided interactive flow", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env);
  const calls = [];
  const questions = [];
  const answers = ["1", "", "", "y"];
  const output = [];

  const result = await shareAutomation(undefined, {
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "api") return { stdout: "vltansky\n", stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "view") throw new Error("not found");
      if (command === "git" && args[0] === "init") {
        await fs.mkdir(options.cwd, { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  automations/morning-pr-radar/automation.toml\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env, {
    ask: async (question) => {
      questions.push(question);
      return answers.shift();
    },
    write: (message) => output.push(message)
  });

  assert.equal(result.repo, "vltansky/codex-automations");
  assert.equal(result.packagePath, "automations/morning-pr-radar");
  assert.equal(questions[0], "Automation to share [1-1]");
  assert.equal(questions[1], "GitHub collection repo [vltansky/codex-automations]");
  assert.equal(questions[2], "Collection path [automations]");
  assert.equal(questions[3], "Publish this automation? [y/N]");
  assert.equal(output.join("").includes("Share summary:"), true);
  assert.equal(calls.some(([command, args]) => command === "gh" && args.includes("create")), true);
});

test("share interactive flow rejects invalid automation selection", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env);

  await assert.rejects(
    () => shareAutomation(undefined, {
      exec: async (command, args) => {
        if (command === "gh" && args[0] === "api") return { stdout: "vltansky\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }
    }, env, {
      ask: async () => "99",
      write: () => {}
    }),
    /Invalid automation selection/
  );
});

test("share cancellation stops before export and remote writes", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  await writeInstalledSample(env);
  const calls = [];

  await assert.rejects(
    () => shareAutomation("morning-pr-radar", {
      repo: "vltansky/codex-automations",
      exec: async (command, args) => {
        calls.push([command, args]);
        if (command === "gh" && args[0] === "api") return { stdout: "vltansky\n", stderr: "" };
        if (command === "gh" && args[0] === "repo" && args[1] === "view") throw new Error("not found");
        return { stdout: "", stderr: "" };
      }
    }, env, {
      ask: async () => "n",
      write: () => {}
    }),
    /Share cancelled/
  );

  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "init"), false);
  assert.equal(calls.some(([command, args]) => command === "gh" && args.includes("create")), false);
});

async function writeInstalledSample(env, id = "morning-pr-radar", name = "Morning PR Radar") {
  const sourceDir = path.join(env.CODEX_HOME, "automations", id);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml.replace('id = "morning-pr-radar"', `id = "${id}"`).replace('name = "Morning PR Radar"', `name = "${name}"`));
}
