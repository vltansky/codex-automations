import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  configDir,
  configPath,
  legacyConfigDir,
  listCollections,
  readConfig,
  removeCollection,
  resolveCollection,
  setDefaultCollection,
  upsertCollection,
  writeConfig
} from "../src/config.js";
import { makeTempEnv } from "./helpers.js";

test("marketplace config supports multiple marketplaces and one default", async () => {
  const { temp, env } = await makeTempEnv();

  await upsertCollection("personal", {
    repo: "vltansky/codex-automations",
    path: "automations",
    branch: "main",
    publishMode: "push"
  }, { makeDefault: true }, env);
  await upsertCollection("team", {
    repo: "wix-playground/codex-automations",
    path: "automations",
    branch: "main",
    publishMode: "pr"
  }, {}, env);
  await setDefaultCollection("team", env);

  const config = await readConfig(env);
  assert.equal(config.defaultMarketplace, "team");
  assert.deepEqual(listCollections(config).map((collection) => collection.name), ["personal", "team"]);

  await removeCollection("personal", env);
  assert.deepEqual(Object.keys((await readConfig(env)).marketplaces), ["team"]);
  assert.equal(temp.includes("codex-automation-"), true);
});

test("legacy collection config is read as marketplace config", async () => {
  const { env } = await makeTempEnv();
  const configDir = path.join(env.CODEX_HOME, "codex-automations");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({
    version: 1,
    defaultCollection: "team",
    collections: {
      team: {
        repo: "wix-playground/codex-automations",
        path: "automations",
        branch: "main",
        publishMode: "pr"
      }
    }
  }));

  const config = await readConfig(env);
  assert.equal(config.defaultMarketplace, "team");
  assert.deepEqual(Object.keys(config.marketplaces), ["team"]);
});

test("configDir and configPath return expected paths", () => {
  const env = { CODEX_HOME: "/test-home" };
  assert.equal(configDir(env), path.join("/test-home", "codex-automations"));
  assert.equal(configPath(env), path.join("/test-home", "codex-automations", "config.json"));
});

test("legacyConfigDir returns legacy path", () => {
  const env = { CODEX_HOME: "/test-home" };
  assert.equal(legacyConfigDir(env), path.join("/test-home", "codex-automation"));
});

test("readConfig returns normalized empty config when no file exists", async () => {
  const { env } = await makeTempEnv();
  const config = await readConfig(env);
  assert.equal(config.version, 1);
  assert.deepEqual(config.marketplaces, {});
  assert.equal(config.defaultMarketplace, undefined);
});

test("readConfig falls back to legacy config directory", async () => {
  const { env } = await makeTempEnv();
  const legacyDir = legacyConfigDir(env);
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(path.join(legacyDir, "config.json"), JSON.stringify({
    version: 1,
    defaultCollection: "legacy",
    collections: {
      legacy: { repo: "owner/repo", path: "automations", branch: "main", publishMode: "push" }
    }
  }));

  const config = await readConfig(env);
  assert.equal(config.defaultMarketplace, "legacy");
  assert.ok(config.marketplaces.legacy);
});

test("writeConfig normalizes and persists config", async () => {
  const { env } = await makeTempEnv();
  await writeConfig({ collections: { test: { repo: "o/r", path: "a", branch: "main", publishMode: "push" } } }, env);
  const config = await readConfig(env);
  assert.equal(config.version, 1);
  assert.ok(config.marketplaces.test);
});

test("upsertCollection sets first marketplace as default", async () => {
  const { env } = await makeTempEnv();
  await upsertCollection("first", { repo: "o/r", path: "a", branch: "main", publishMode: "push" }, {}, env);
  const config = await readConfig(env);
  assert.equal(config.defaultMarketplace, "first");
});

test("removeCollection reassigns default after removal", async () => {
  const { env } = await makeTempEnv();
  await upsertCollection("alpha", { repo: "o/alpha", path: "a", branch: "main", publishMode: "push" }, { makeDefault: true }, env);
  await upsertCollection("beta", { repo: "o/beta", path: "b", branch: "main", publishMode: "pr" }, {}, env);
  await removeCollection("alpha", env);
  const config = await readConfig(env);
  assert.equal(config.defaultMarketplace, "beta");
  assert.equal(config.marketplaces.alpha, undefined);
});

test("removeCollection throws for nonexistent marketplace", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(() => removeCollection("ghost", env), { code: "marketplace_not_found" });
});

test("setDefaultCollection throws for nonexistent marketplace", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(() => setDefaultCollection("ghost", env), { code: "marketplace_not_found" });
});

test("resolveCollection returns the default marketplace when name is omitted", async () => {
  const { env } = await makeTempEnv();
  await upsertCollection("team", { repo: "o/r", path: "a", branch: "main", publishMode: "push" }, { makeDefault: true }, env);
  const result = await resolveCollection(undefined, env);
  assert.equal(result.name, "team");
  assert.equal(result.default, true);
});

test("resolveCollection returns named marketplace", async () => {
  const { env } = await makeTempEnv();
  await upsertCollection("team", { repo: "o/r", path: "a", branch: "main", publishMode: "push" }, { makeDefault: true }, env);
  await upsertCollection("other", { repo: "o/other", path: "b", branch: "dev", publishMode: "pr" }, {}, env);
  const result = await resolveCollection("other", env);
  assert.equal(result.name, "other");
  assert.equal(result.repo, "o/other");
  assert.equal(result.default, false);
});

test("resolveCollection returns undefined when no default and no name", async () => {
  const { env } = await makeTempEnv();
  const result = await resolveCollection(undefined, env);
  assert.equal(result, undefined);
});

test("resolveCollection throws for nonexistent named marketplace", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(() => resolveCollection("ghost", env), { code: "marketplace_not_found" });
});

test("upsertCollection rejects invalid marketplace name", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(
    () => upsertCollection("bad name!", { repo: "o/r" }, {}, env),
    { code: "invalid_marketplace_name" }
  );
});

test("upsertCollection rejects invalid repo format", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(
    () => upsertCollection("test", { repo: "no-slash" }, {}, env),
    { code: "invalid_repo" }
  );
});

test("upsertCollection rejects missing repo", async () => {
  const { env } = await makeTempEnv();
  await assert.rejects(
    () => upsertCollection("test", {}, {}, env),
    { code: "missing_marketplace_repo" }
  );
});

test("listCollections marks the default marketplace", () => {
  const config = {
    version: 1,
    defaultMarketplace: "beta",
    marketplaces: {
      alpha: { repo: "o/a", path: "a", branch: "main", publishMode: "push" },
      beta: { repo: "o/b", path: "b", branch: "main", publishMode: "pr" }
    }
  };
  const list = listCollections(config);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "alpha");
  assert.equal(list[0].default, false);
  assert.equal(list[1].name, "beta");
  assert.equal(list[1].default, true);
});
