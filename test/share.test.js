import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { formatShareResult } from "../src/cli.js";
import { upsertCollection } from "../src/config.js";
import { shareAutomation } from "../src/share.js";
import { makeTempEnv, writeInstalledSample } from "./helpers.js";

test("share --repo --pr creates a pull request", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "wix-playground/codex-automations",
    publishMode: "pr",
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"wix-playground/codex-automations"}', stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
        await fs.mkdir(args[3], { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  automations/morning-pr-radar/automation.toml\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.repo, "wix-playground/codex-automations");
  assert.equal(result.publishMode, "pr");
  assert.equal(result.installCommand, "npx -y codex-automations add https://github.com/wix-playground/codex-automations/tree/add/morning-pr-radar/automations/morning-pr-radar");
  assert.equal(result.changed, true);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "checkout" && args[1] === "-b"), true);
  assert.equal(calls.some(([command, args]) => command === "gh" && args[0] === "pr" && args[1] === "create"), true);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "push" && args.includes("main")), false);
});

test("share result formats human PR output", () => {
  const output = formatShareResult({
    ok: true,
    repo: "wix-playground/codex-automations",
    prUrl: "https://github.com/wix-playground/codex-automations/pull/7",
    packagePath: "automations/morning-pr-radar",
    changed: true,
    installCommand: "npx -y codex-automations add https://github.com/wix-playground/codex-automations/tree/add/morning-pr-radar/automations/morning-pr-radar",
    publishMode: "pr",
    destination: "team"
  });

  assert.equal(output, [
    "Shared: automations/morning-pr-radar",
    "Repository: wix-playground/codex-automations",
    "Pull request: https://github.com/wix-playground/codex-automations/pull/7",
    "Install: npx -y codex-automations add https://github.com/wix-playground/codex-automations/tree/add/morning-pr-radar/automations/morning-pr-radar",
    "Destination: team"
  ].join("\n"));
});

test("share honors saved destination path and branch for matching repo", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  await upsertCollection("team", {
    repo: "wix-playground/codex-automations",
    path: "team/automations",
    branch: "trunk",
    publishMode: "pr"
  }, { makeDefault: true }, env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "wix-playground/codex-automations",
    publishMode: "pr",
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"wix-playground/codex-automations"}', stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
        await fs.mkdir(args[3], { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  team/automations/morning-pr-radar/automation.toml\n", stderr: "" };
      if (command === "gh" && args[0] === "pr") return { stdout: "https://github.com/wix-playground/codex-automations/pull/9\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.destination, "team");
  assert.equal(result.packagePath, "team/automations/morning-pr-radar");
  assert.equal(result.installCommand, "npx -y codex-automations add https://github.com/wix-playground/codex-automations/tree/add/morning-pr-radar/team/automations/morning-pr-radar");
  assert.equal(calls.some(([command, args]) => command === "gh" && args[0] === "pr" && args.includes("--base") && args.includes("trunk")), true);
  assert.equal(calls.some(([command, args]) => command === "git" && args[0] === "add" && args.includes("team/automations/morning-pr-radar")), true);
});

test("share explicit repo does not inherit default marketplace publish mode", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  await upsertCollection("team", {
    repo: "wix-playground/codex-automations",
    path: "team-automations",
    branch: "main",
    publishMode: "pr"
  }, { makeDefault: true }, env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    publishMode: "push",
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (command === "gh" && args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"vltansky/codex-automations"}', stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
        await fs.mkdir(args[3], { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  automations/morning-pr-radar/automation.toml\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.repo, "vltansky/codex-automations");
  assert.equal(result.publishMode, "push");
  assert.equal(result.packagePath, "automations/morning-pr-radar");
  assert.equal(calls.some(([command, args]) => command === "gh" && args[0] === "pr"), false);
});

test("explicit share dry-run does not call gh or git", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    publishMode: "pr",
    dryRun: true,
    exec: async (command, args) => {
      calls.push([command, args]);
      return { stdout: "", stderr: "" };
    }
  }, env);

  assert.equal(result.dryRun, true);
  assert.equal(result.repo, "vltansky/codex-automations");
  assert.equal(result.packagePath, "automations/morning-pr-radar");
  assert.equal(result.installCommand, "npx -y codex-automations add https://github.com/vltansky/codex-automations/tree/add/morning-pr-radar/automations/morning-pr-radar");
  assert.equal("repoExists" in result, false);
  assert.equal("wouldCreateRepo" in result, false);
  assert.deepEqual(calls, []);
});

test("share commits and pushes into an existing marketplace repo", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const calls = [];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    publishMode: "push",
    exec: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
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
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const calls = [];
  const questions = [];
  const answers = ["1", "", "n", "y", "n"];
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
  assert.equal(questions[1], "GitHub repo [vltansky/codex-automations]");
  assert.equal(questions[2], "Open a pull request? [Y/n]");
  assert.equal(questions[3], "Publish this automation? [y/N]");
  assert.equal(questions[4], "Save this destination for next time? [y/N]");
  assert.equal(output.join("").includes("Share summary:"), true);
  assert.equal(calls.some(([command, args]) => command === "gh" && args.includes("create")), true);
});

test("share can save a user-named destination", async () => {
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const answers = ["y", "y", "team"];

  const result = await shareAutomation("morning-pr-radar", {
    repo: "vltansky/codex-automations",
    publishMode: "pr",
    exec: async (command, args, options = {}) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"vltansky/codex-automations"}', stderr: "" };
      if (command === "gh" && args[0] === "repo" && args[1] === "clone") {
        await fs.mkdir(args[3], { recursive: true });
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args[0] === "status") return { stdout: "A  automations/morning-pr-radar/automation.toml\n", stderr: "" };
      if (command === "gh" && args[0] === "pr") return { stdout: "https://github.com/vltansky/codex-automations/pull/7\n", stderr: "" };
      return { stdout: "", stderr: "" };
    }
  }, env, {
    ask: async () => answers.shift(),
    write: () => {}
  });

  assert.equal(result.destination, "team");
  assert.equal(result.prUrl, "https://github.com/vltansky/codex-automations/pull/7");
});

test("share interactive flow rejects invalid automation selection", async () => {
  const { env } = await makeTempEnv();
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
  const { env } = await makeTempEnv();
  await writeInstalledSample(env);
  const calls = [];

  await assert.rejects(
    () => shareAutomation("morning-pr-radar", {
      repo: "vltansky/codex-automations",
      publishMode: "push",
      exec: async (command, args) => {
        calls.push([command, args]);
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
