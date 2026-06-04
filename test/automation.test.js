import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
import { parseAutomationToml } from "../src/toml.js";
import { makeTempEnv, sampleToml, writeInstalledSample } from "./helpers.js";

test("validates installed automation shape", () => {
  const validation = validateAutomation(parseAutomationToml(sampleToml));
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("export creates portable package and install defaults to paused", async () => {
  const { temp, env } = await makeTempEnv();
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
  assert.equal(typeof plan.automation.created_at, "number");
  assert.equal(typeof plan.automation.updated_at, "number");
  assert.deepEqual(plan.automation.cwds, [path.join(temp, "workspace")]);

  const result = await installPackage(pkg, { id: "radar-copy", cwd: path.join(temp, "workspace") }, env);
  assert.equal(result.installed, true);

  const installed = await readInstalled("radar-copy", env);
  assert.equal(installed.automation.id, "radar-copy");
  assert.equal(installed.automation.status, "PAUSED");
  assert.equal(typeof installed.automation.created_at, "number");
  assert.equal(typeof installed.automation.updated_at, "number");
  assert.deepEqual(installed.automation.cwds, [path.join(temp, "workspace")]);

  const listed = await listAutomations(env);
  assert.deepEqual(listed.map((row) => row.id), ["morning-pr-radar", "radar-copy"]);
});

test("install defaults workspace mapping to current directory", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  const plan = prepareInstall(pkg, {}, env);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.automation.cwds, [process.cwd()]);
});

test("install name overrides display name and derives id", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  const plan = prepareInstall(pkg, { name: "Daily PR Radar", cwd: temp }, env);
  assert.equal(plan.automation.id, "daily-pr-radar");
  assert.equal(plan.automation.name, "Daily PR Radar");
  assert.equal(plan.target, path.join(env.CODEX_HOME, "automations", "daily-pr-radar", "automation.toml"));

  const explicit = prepareInstall(pkg, { id: "radar-copy", name: "Daily PR Radar", cwd: temp }, env);
  assert.equal(explicit.automation.id, "radar-copy");
  assert.equal(explicit.automation.name, "Daily PR Radar");
});

test("dry-run install still detects id conflicts", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  await assert.rejects(
    () => installPackage(pkg, { id: "morning-pr-radar", cwd: temp, dryRun: true }, env),
    /Automation already exists/
  );
});

test("install preview can include rendered automation output", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  const result = await installPackage(pkg, { id: "preview-radar", cwd: temp, dryRun: true, view: true }, env);
  assert.equal(result.preview.action, "install");
  assert.match(result.preview.automationToml, /id = "preview-radar"/);
  assert.equal("diff" in result.preview, false);
});

test("install writes source metadata sidecar", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  await installPackage(pkg, {
    id: "source-radar",
    cwd: temp,
    source: {
      type: "github",
      owner: "vltansky",
      repo: "codex-automations",
      packageId: "morning-pr-radar"
    }
  }, env);

  const installed = await readInstalled("source-radar", env);
  assert.equal(installed.source.type, "github");
  assert.equal(installed.source.owner, "vltansky");
  assert.equal(installed.source.packageId, "morning-pr-radar");
  assert.match(installed.source.installedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("readPackage returns stable errors for missing or malformed package files", async () => {
  const { temp } = await makeTempEnv();
  const packageDir = path.join(temp, "bad-package");
  await fs.mkdir(packageDir, { recursive: true });

  await assert.rejects(() => readPackage(packageDir), { code: "package_manifest_missing" });

  await fs.writeFile(path.join(packageDir, "codex-automation.json"), "{nope");
  await assert.rejects(() => readPackage(packageDir), { code: "package_automation_missing" });

  await fs.writeFile(path.join(packageDir, "automation.toml"), "version = 1\n");
  await assert.rejects(() => readPackage(packageDir), { code: "invalid_manifest_json" });

  await fs.writeFile(path.join(packageDir, "codex-automation.json"), JSON.stringify({ schemaVersion: 1, name: "bad", version: "0.1.0" }));
  await fs.writeFile(path.join(packageDir, "automation.toml"), "not toml");
  await assert.rejects(() => readPackage(packageDir), { code: "invalid_automation_toml" });
});
