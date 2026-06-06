import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { exportAutomation } from "../src/automation.js";
import { main } from "../src/cli.js";
import { parseAutomationToml } from "../src/toml.js";
import { execBin, makeTempEnv, repoRoot, writeInstalledSample } from "./helpers.js";

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
  assert.match(lines[0], /codex-automations/);
  assert.match(lines[0], /Usage:/);
});

test("bin prints human errors by default and JSON errors with --json", async () => {
  await assert.rejects(
    () => execBin(["nope"]),
    (error) => {
      assert.match(error.stderr, /^Error: Unknown command: nope/m);
      assert.doesNotMatch(error.stderr, /"ok": false/);
      return true;
    }
  );

  await assert.rejects(
    () => execBin(["nope", "--json"]),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.deepEqual(payload, {
        ok: false,
        code: "unknown_command",
        message: "Unknown command: nope"
      });
      return true;
    }
  );
});

test("old marketplace command is no longer public", async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (message) => lines.push(message);
  try {
    await assert.rejects(() => main(["marketplace"]), /Unknown command: marketplace/);
    await main(["--help"]);
  } finally {
    console.log = originalLog;
  }

  assert.doesNotMatch(lines.join("\n"), /codex-automations marketplace/);
});

test("add dry-run prints a human install summary unless json is requested", async () => {
  const { temp, env } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  const originalLog = console.log;
  const lines = [];
  await writeInstalledSample(env);
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);

  process.env.CODEX_HOME = path.join(temp, "install-home");
  console.log = (message) => lines.push(message);
  try {
    await main(["add", path.join(temp, "repo", "automations", "morning-pr-radar"), "--dry-run", "--cwd", path.join(temp, "workspace")]);
  } finally {
    console.log = originalLog;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }

  const output = lines.join("\n");
  assert.match(output, /^Would install: Morning PR Radar \(morning-pr-radar\)/m);
  assert.match(output, /Status: PAUSED/);
  assert.match(output, /No files were written\./);
  assert.doesNotMatch(output, /automation\.toml preview:/);
  assert.doesNotMatch(output, /^\{/);
});

test("add installs the selected automation as paused by default", async () => {
  const { temp, env } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  const originalLog = console.log;
  await writeInstalledSample(env);
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);

  process.env.CODEX_HOME = path.join(temp, "install-home");
  console.log = () => {};
  try {
    await main(["add", path.join(temp, "repo", "automations", "morning-pr-radar"), "--cwd", path.join(temp, "workspace")]);
  } finally {
    console.log = originalLog;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }

  const installedToml = await fs.readFile(path.join(temp, "install-home", "automations", "morning-pr-radar", "automation.toml"), "utf8");
  assert.equal(parseAutomationToml(installedToml).status, "PAUSED");
});

test("add --activate installs the selected automation as active", async () => {
  const { temp, env } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  const originalLog = console.log;
  await writeInstalledSample(env);
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);

  process.env.CODEX_HOME = path.join(temp, "install-home");
  console.log = () => {};
  try {
    await main(["add", path.join(temp, "repo", "automations", "morning-pr-radar"), "--activate", "--cwd", path.join(temp, "workspace")]);
  } finally {
    console.log = originalLog;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }

  const installedToml = await fs.readFile(path.join(temp, "install-home", "automations", "morning-pr-radar", "automation.toml"), "utf8");
  assert.equal(parseAutomationToml(installedToml).status, "ACTIVE");
});

test("add --force replaces an existing automation", async () => {
  const { temp, env } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  const originalLog = console.log;
  await writeInstalledSample(env);
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);

  process.env.CODEX_HOME = env.CODEX_HOME;
  console.log = () => {};
  try {
    await main(["add", path.join(temp, "repo", "automations", "morning-pr-radar"), "--force"]);
  } finally {
    console.log = originalLog;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }

  const installedToml = await fs.readFile(path.join(env.CODEX_HOME, "automations", "morning-pr-radar", "automation.toml"), "utf8");
  assert.equal(parseAutomationToml(installedToml).status, "PAUSED");
});

test("remove deletes an automation by display name", async () => {
  const { temp } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  const originalLog = console.log;
  process.env.CODEX_HOME = path.join(temp, "codex-home");
  await writeInstalledSample(process.env, "morning-pr-radar", "Morning PR Radar");

  console.log = () => {};
  try {
    await main(["remove", "Morning PR Radar", "--force"]);
  } finally {
    console.log = originalLog;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }

  await assert.rejects(
    () => fs.access(path.join(temp, "codex-home", "automations", "morning-pr-radar", "automation.toml")),
    /ENOENT/
  );
});

test("remove rejects ambiguous names in non-interactive mode", async () => {
  const { temp } = await makeTempEnv();
  const originalCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(temp, "codex-home");
  await writeInstalledSample(process.env, "morning-pr-radar", "Morning PR Radar");
  await writeInstalledSample(process.env, "weekly-pr-radar", "Weekly PR Radar");

  try {
    await assert.rejects(() => main(["remove", "Radar", "--force"]), /Automation name is ambiguous/);
  } finally {
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }
});

test("binary add and list run end-to-end with an isolated CODEX_HOME", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "repo", "automations", "morning-pr-radar");
  await exportAutomation("morning-pr-radar", packageDir, env);
  const installHome = path.join(temp, "install-home");

  const add = await execBin(["add", packageDir, "--cwd", path.join(temp, "workspace")], {
    env: { CODEX_HOME: installHome }
  });
  assert.match(add.stdout, /Installed: Morning PR Radar \(morning-pr-radar\)/);

  const list = await execBin(["list"], {
    env: { CODEX_HOME: installHome }
  });
  assert.match(list.stdout, /Morning PR Radar \(morning-pr-radar\)\tPAUSED/);
});

test("binary share dry-run prints an install command without network", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);

  const result = await execBin(["share", "Morning PR Radar", "--repo", "vltansky/codex-automations", "--pr", "--dry-run"], {
    env
  });

  assert.match(result.stdout, /Would share: automations\/morning-pr-radar/);
  assert.match(result.stdout, /Install: npx -y codex-automations add https:\/\/github.com\/vltansky\/codex-automations\/tree\/add\/morning-pr-radar\/automations\/morning-pr-radar/);
});

test("binary reports stable package read errors in JSON and human output", async () => {
  const { temp, env } = await makeTempEnv();
  const badPackage = path.join(temp, "bad-package");
  await fs.mkdir(badPackage, { recursive: true });
  await fs.writeFile(path.join(badPackage, "automation.toml"), "version = 1\n");

  await assert.rejects(
    () => execBin(["add", badPackage, "--json"], { env }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.code, "package_manifest_missing");
      return true;
    }
  );

  await assert.rejects(
    () => execBin(["add", badPackage], { env }),
    (error) => {
      assert.match(error.stderr, /^Error: Package manifest not found:/);
      return true;
    }
  );

  assert.equal(repoRoot.endsWith("codex-automations"), true);
});
