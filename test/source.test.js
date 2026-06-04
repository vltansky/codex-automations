import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportAutomation } from "../src/automation.js";
import { main } from "../src/cli.js";
import { discoverPackages, parseSource, selectPackage, selectPackages } from "../src/source.js";
import { makeTempEnv, writeInstalledSample } from "./helpers.js";

test("parses GitHub-like add sources", () => {
  assert.deepEqual(parseSource("vercel-labs/skills"), {
    type: "github",
    owner: "vercel-labs",
    repo: "skills",
    url: "https://github.com/vercel-labs/skills.git",
    ref: undefined,
    pull: undefined,
    subpath: ""
  });
  const tree = parseSource("https://github.com/vltansky/codex-automations/tree/main/automations/radar");
  assert.equal(tree.type, "github");
  assert.equal(tree.ref, "main");
  assert.equal(tree.subpath, "automations/radar");
  assert.deepEqual(tree.treeParts, ["main", "automations", "radar"]);

  const pull = parseSource("https://github.com/vltansky/codex-automations/pull/123");
  assert.equal(pull.type, "github");
  assert.equal(pull.pull, 123);
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
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "repo", "automations", "morning-pr-radar");
  await exportAutomation("morning-pr-radar", packageDir, env);

  const packages = await discoverPackages(path.join(temp, "repo"));
  assert.deepEqual(packages.map((pkg) => pkg.id), ["morning-pr-radar"]);
  assert.equal(selectPackage(packages, "morning-pr-radar").path, packageDir);
});

test("selectPackage rejects ambiguous collections until automation is specified", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env, "morning-pr-radar", "Morning PR Radar");
  await writeInstalledSample(env, "weekly-release-notes", "Weekly Release Notes");

  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);
  await exportAutomation("weekly-release-notes", path.join(temp, "repo", "automations", "weekly-release-notes"), env);

  const packages = await discoverPackages(path.join(temp, "repo"));
  assert.deepEqual(packages.map((pkg) => pkg.id), ["morning-pr-radar", "weekly-release-notes"]);
  assert.throws(() => selectPackage(packages), /Multiple packages found/);
  assert.equal(selectPackage(packages, "Weekly Release Notes").id, "weekly-release-notes");
  assert.deepEqual(selectPackages(packages, { requested: ["morning-pr-radar", "weekly-release-notes"] }).map((pkg) => pkg.id), ["morning-pr-radar", "weekly-release-notes"]);
  assert.deepEqual(selectPackages(packages, { all: true }).map((pkg) => pkg.id), ["morning-pr-radar", "weekly-release-notes"]);
  assert.throws(() => selectPackage(packages, "missing"), /Automation not found/);
});

test("add fails for multiple packages in non-interactive mode", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env, "morning-pr-radar", "Morning PR Radar");
  await writeInstalledSample(env, "weekly-release-notes", "Weekly Release Notes");
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);
  await exportAutomation("weekly-release-notes", path.join(temp, "repo", "automations", "weekly-release-notes"), env);

  await assert.rejects(
    () => main(["add", path.join(temp, "repo")]),
    /Source contains multiple automations/
  );
});
