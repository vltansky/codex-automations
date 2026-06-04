import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  listCollections,
  readConfig,
  removeCollection,
  setDefaultCollection,
  upsertCollection
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
