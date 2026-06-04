import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { exportAutomation } from "../src/automation.js";
import { initCollection, initConnectedCollection, README_BLOCK_END, README_BLOCK_START, writeCollectionReadme } from "../src/collection.js";
import { readConfig } from "../src/config.js";
import { makeTempEnv, writeInstalledSample } from "./helpers.js";

test("collection init scaffolds readme and validation workflow", async () => {
  const { temp } = await makeTempEnv();
  const result = await initCollection(path.join(temp, "collection"), { repo: "vltansky/codex-automations" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.files, ["README.md", "automations/.gitkeep", ".github/workflows/validate.yml"]);
  assert.match(await fs.readFile(path.join(result.path, "README.md"), "utf8"), /npx -y codex-automations add vltansky\/codex-automations/);
  const workflow = await fs.readFile(path.join(result.path, ".github", "workflows", "validate.yml"), "utf8");
  assert.match(workflow, /find automations -mindepth 1 -maxdepth 1 -type d/);
  assert.match(workflow, /npx -y codex-automations add "\$package" --dry-run --json/);
});

test("collection README generator lists automation packages with npx commands", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const packageDir = path.join(temp, "repo", "automations", "morning-pr-radar");
  await exportAutomation("morning-pr-radar", packageDir, env);

  await writeCollectionReadme(path.join(temp, "repo"), "vltansky/codex-automations");
  const readme = await fs.readFile(path.join(temp, "repo", "README.md"), "utf8");
  assert.match(readme, /\| `morning-pr-radar` \| Morning PR Radar \|/);
  assert.match(readme, /npx -y codex-automations add https:\/\/github.com\/vltansky\/codex-automations\/tree\/main\/automations\/morning-pr-radar/);
  assert.match(readme, new RegExp(README_BLOCK_START));
  assert.match(readme, new RegExp(README_BLOCK_END));
});

test("collection README generator uses configured branch in install commands", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  await exportAutomation("morning-pr-radar", path.join(temp, "repo", "automations", "morning-pr-radar"), env);

  await writeCollectionReadme(path.join(temp, "repo"), "vltansky/codex-automations", { branch: "add/morning-pr-radar" });
  const readme = await fs.readFile(path.join(temp, "repo", "README.md"), "utf8");
  assert.match(readme, /tree\/add\/morning-pr-radar\/automations\/morning-pr-radar/);
});

test("collection README generator preserves custom content around generated block", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const repo = path.join(temp, "repo");
  await exportAutomation("morning-pr-radar", path.join(repo, "automations", "morning-pr-radar"), env);
  await fs.writeFile(path.join(repo, "README.md"), `# Custom

Keep me before.

${README_BLOCK_START}
old generated content
${README_BLOCK_END}

Keep me after.
`);

  await writeCollectionReadme(repo, "vltansky/codex-automations");
  const readme = await fs.readFile(path.join(repo, "README.md"), "utf8");
  assert.match(readme, /Keep me before\./);
  assert.match(readme, /Keep me after\./);
  assert.doesNotMatch(readme, /old generated content/);
  assert.match(readme, /\| `morning-pr-radar` \| Morning PR Radar \|/);
});

test("collection README generator appends block when existing readme has no markers", async () => {
  const { temp, env } = await makeTempEnv();
  await writeInstalledSample(env);
  const repo = path.join(temp, "repo");
  await exportAutomation("morning-pr-radar", path.join(repo, "automations", "morning-pr-radar"), env);
  await fs.writeFile(path.join(repo, "README.md"), "# Custom\n\nExisting words.\n");

  await writeCollectionReadme(repo, "vltansky/codex-automations");
  const readme = await fs.readFile(path.join(repo, "README.md"), "utf8");
  assert.match(readme, /^# Custom/);
  assert.match(readme, /Existing words\./);
  assert.match(readme, new RegExp(README_BLOCK_START));
});

test("connected init stores a default marketplace", async () => {
  const { env } = await makeTempEnv();

  const result = await initConnectedCollection({
    name: "team",
    repo: "wix-playground/codex-automations",
    path: "automations",
    publishMode: "pr",
    makeDefault: true
  }, env);

  assert.equal(result.marketplace.name, "team");
  assert.equal(result.marketplace.repo, "wix-playground/codex-automations");
  assert.equal(result.marketplace.publishMode, "pr");
  assert.equal((await readConfig(env)).defaultMarketplace, "team");
});
