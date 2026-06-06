import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  automationPath,
  automationRoot,
  codexHome,
  diffAutomation,
  exportAutomation,
  installPackage,
  listAutomations,
  prepareInstall,
  readInstalled,
  readPackage,
  resolveInstalledAutomation,
  sourceMetadataPath,
  uninstallAutomation,
  validateAutomation,
  validateManifest
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

test("codexHome uses CODEX_HOME env or defaults to ~/.codex", () => {
  assert.equal(codexHome({ CODEX_HOME: "/custom" }), "/custom");
  const defaultHome = codexHome({});
  assert.match(defaultHome, /\.codex$/);
});

test("automationRoot returns automations dir under codexHome", () => {
  const root = automationRoot({ CODEX_HOME: "/custom" });
  assert.equal(root, path.join("/custom", "automations"));
});

test("automationPath returns automation.toml path for given id", () => {
  const p = automationPath("test-id", { CODEX_HOME: "/custom" });
  assert.equal(p, path.join("/custom", "automations", "test-id", "automation.toml"));
});

test("sourceMetadataPath returns source JSON path for given id", () => {
  const p = sourceMetadataPath("test-id", { CODEX_HOME: "/custom" });
  assert.equal(p, path.join("/custom", "automations", "test-id", "codex-automation-source.json"));
});

test("listAutomations returns empty array when automations dir does not exist", async () => {
  const { env } = await makeTempEnv();
  const result = await listAutomations(env);
  assert.deepEqual(result, []);
});

test("listAutomations skips non-directory entries and marks invalid automations", async () => {
  const { env } = await makeTempEnv();
  const root = automationRoot(env);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "not-a-dir.txt"), "file");

  const invalidDir = path.join(root, "broken-automation");
  await fs.mkdir(invalidDir, { recursive: true });
  await fs.writeFile(path.join(invalidDir, "automation.toml"), "not valid toml at all $$$");

  const result = await listAutomations(env);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "broken-automation");
  assert.equal(result[0].status, "invalid");
});

test("validateAutomation reports missing required fields", () => {
  const result = validateAutomation({});
  assert.equal(result.ok, false);
  const codes = result.errors.map((e) => e.code);
  assert.ok(codes.includes("missing_field"));
});

test("validateAutomation reports unsupported kind", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.kind = "webhook";
  const result = validateAutomation(automation);
  assert.ok(result.errors.some((e) => e.code === "unsupported_kind"));
});

test("validateAutomation warns on heartbeat kind", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.kind = "heartbeat";
  const result = validateAutomation(automation);
  assert.ok(result.warnings.some((w) => w.code === "heartbeat_template_only"));
});

test("validateAutomation reports invalid rrule", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.rrule = "INVALID_RRULE";
  const result = validateAutomation(automation);
  assert.ok(result.errors.some((e) => e.code === "invalid_rrule"));
});

test("validateAutomation reports unsupported execution_environment", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.execution_environment = "cloud";
  const result = validateAutomation(automation);
  assert.ok(result.errors.some((e) => e.code === "unsupported_execution_environment"));
});

test("validateAutomation reports invalid cwds type", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.cwds = "not-an-array";
  const result = validateAutomation(automation);
  assert.ok(result.errors.some((e) => e.code === "invalid_cwds"));
});

test("validateAutomation reports non-absolute cwd in installed mode", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.cwds = ["relative/path"];
  const result = validateAutomation(automation, { portable: false });
  assert.ok(result.errors.some((e) => e.code === "cwd_not_absolute"));
});

test("validateAutomation skips cwd check in portable mode", () => {
  const automation = parseAutomationToml(sampleToml);
  delete automation.created_at;
  delete automation.updated_at;
  automation.cwds = ["${workspace}"];
  const result = validateAutomation(automation, { portable: true });
  assert.ok(!result.errors.some((e) => e.code === "cwd_not_absolute"));
});

test("validateAutomation reports missing timestamps for installed", () => {
  const automation = parseAutomationToml(sampleToml);
  delete automation.created_at;
  delete automation.updated_at;
  const result = validateAutomation(automation, { portable: false });
  assert.ok(result.errors.some((e) => e.code === "missing_timestamp"));
});

test("validateAutomation warns on secret-like prompt content", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.prompt = "Use api_key=ABCDEFGHIJKLMNOP to authenticate";
  const result = validateAutomation(automation);
  assert.ok(result.warnings.some((w) => w.code === "secret_like_prompt"));
});

test("validateAutomation warns on connector references", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.prompt = "Use [$slack](app://connector/slack) to post";
  const result = validateAutomation(automation);
  assert.ok(result.warnings.some((w) => w.code === "connector_reference"));
});

test("validateAutomation warns on local path references", () => {
  const automation = parseAutomationToml(sampleToml);
  automation.prompt = "Read /Users/john/Documents/file.txt";
  const result = validateAutomation(automation);
  assert.ok(result.warnings.some((w) => w.code === "local_path_reference"));
});

test("validateManifest requires schemaVersion 1, name, and version", () => {
  const valid = validateManifest({ schemaVersion: 1, name: "test", version: "0.1.0" });
  assert.equal(valid.ok, true);

  const badSchema = validateManifest({ schemaVersion: 2, name: "test", version: "0.1.0" });
  assert.ok(badSchema.errors.some((e) => e.code === "unsupported_schema"));

  const noName = validateManifest({ schemaVersion: 1, version: "0.1.0" });
  assert.ok(noName.errors.some((e) => e.code === "missing_manifest_name"));

  const noVersion = validateManifest({ schemaVersion: 1, name: "test" });
  assert.ok(noVersion.errors.some((e) => e.code === "missing_manifest_version"));
});

test("diffAutomation shows line-by-line differences", () => {
  const left = parseAutomationToml(sampleToml);
  const right = { ...left, name: "Changed Name" };
  const diff = diffAutomation(left, right);
  assert.match(diff, /- name = "Morning PR Radar"/);
  assert.match(diff, /\+ name = "Changed Name"/);
});

test("diffAutomation returns empty string for identical automations", () => {
  const left = parseAutomationToml(sampleToml);
  const diff = diffAutomation(left, left);
  assert.equal(diff, "");
});

test("resolveInstalledAutomation finds by exact name", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "radar-1", "Morning PR Radar");
  const result = await resolveInstalledAutomation("Morning PR Radar", env);
  assert.equal(result.automation.id, "radar-1");
});

test("resolveInstalledAutomation finds by exact id", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "radar-1", "Morning PR Radar");
  const result = await resolveInstalledAutomation("radar-1", env);
  assert.equal(result.automation.id, "radar-1");
});

test("resolveInstalledAutomation finds by case-insensitive name", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "radar-1", "Morning PR Radar");
  const result = await resolveInstalledAutomation("morning pr radar", env);
  assert.equal(result.automation.id, "radar-1");
});

test("resolveInstalledAutomation finds by partial match", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "unique-radar", "Unique Automation");
  const result = await resolveInstalledAutomation("unique", env);
  assert.equal(result.automation.id, "unique-radar");
});

test("resolveInstalledAutomation throws for ambiguous name", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "morning-pr-radar", "Morning PR Radar");
  await writeInstalledSample(env, "weekly-pr-radar", "Weekly PR Radar");
  await assert.rejects(
    () => resolveInstalledAutomation("Radar", env),
    { code: "ambiguous_automation" }
  );
});

test("resolveInstalledAutomation throws for not found", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  await assert.rejects(
    () => resolveInstalledAutomation("nonexistent", env),
    { code: "automation_not_found" }
  );
});

test("resolveInstalledAutomation returns all automations when name is undefined", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env, "radar-1", "Radar One");
  const result = await resolveInstalledAutomation(undefined, env);
  assert.ok(Array.isArray(result.automations));
  assert.equal(result.automation, undefined);
});

test("uninstallAutomation with keepMemory removes only the toml file", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const dir = path.dirname(automationPath("morning-pr-radar", env));
  await fs.writeFile(path.join(dir, "memory.md"), "session memory");

  const result = await uninstallAutomation("morning-pr-radar", { keepMemory: true }, env);
  assert.equal(result.removed, true);
  assert.equal(result.keepMemory, true);

  await assert.rejects(() => fs.access(path.join(dir, "automation.toml")), /ENOENT/);
  const memory = await fs.readFile(path.join(dir, "memory.md"), "utf8");
  assert.equal(memory, "session memory");
});

test("uninstallAutomation without keepMemory removes entire directory", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const dir = path.dirname(automationPath("morning-pr-radar", env));

  const result = await uninstallAutomation("morning-pr-radar", {}, env);
  assert.equal(result.removed, true);
  assert.equal(result.keepMemory, false);
  await assert.rejects(() => fs.access(dir), /ENOENT/);
});

test("prepareInstall with activate flag keeps original status", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "morning-pr-radar.codex-automation");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const pkg = await readPackage(packageDir);

  const plan = prepareInstall(pkg, { activate: true, cwd: temp }, env);
  assert.equal(plan.ok, true);
  assert.equal(plan.automation.status, "ACTIVE");
});

test("readInstalled returns undefined source when sidecar is missing", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const installed = await readInstalled("morning-pr-radar", env);
  assert.equal(installed.source, undefined);
  assert.ok(installed.automation.id);
});

test("readPackage rejects non-directory packages", async () => {
  const { temp } = await makeTempEnv();
  const filePath = path.join(temp, "not-a-dir.txt");
  await fs.writeFile(filePath, "content");
  await assert.rejects(() => readPackage(filePath), { code: "unsupported_package" });
});

test("readPackage rejects nonexistent path", async () => {
  await assert.rejects(() => readPackage("/nonexistent/path"), { code: "package_not_found" });
});
