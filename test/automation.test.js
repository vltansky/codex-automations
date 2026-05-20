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
import { discoverPackages, parseSource, selectPackage } from "../src/source.js";
import { parseAutomationToml, stringifyAutomationToml } from "../src/toml.js";

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

test("install requires workspace mapping for portable cwds", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  const env = { CODEX_HOME: path.join(temp, "codex-home") };
  const sourceDir = path.join(env.CODEX_HOME, "automations", "morning-pr-radar");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml);

  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  assert.throws(() => prepareInstall(pkg, {}, env), /Package requires --cwd/);
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
