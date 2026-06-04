import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { exportAutomation } from "../src/automation.js";

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(testDir, "..");

export const sampleToml = `version = 1
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

export async function makeTempEnv() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-"));
  return { temp, env: { CODEX_HOME: path.join(temp, "codex-home") } };
}

export async function writeInstalledSample(env, id = "morning-pr-radar", name = "Morning PR Radar") {
  const sourceDir = path.join(env.CODEX_HOME, "automations", id);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "automation.toml"), sampleToml
    .replace('id = "morning-pr-radar"', `id = "${id}"`)
    .replace('name = "Morning PR Radar"', `name = "${name}"`));
}

export async function exportSamplePackage(temp, env, id = "morning-pr-radar", packagePath = path.join("repo", "automations", id)) {
  await writeInstalledSample(env, id, titleFromId(id));
  const packageDir = path.join(temp, packagePath);
  await exportAutomation(id, packageDir, env);
  return packageDir;
}

export function binArgs(args) {
  return [path.join(repoRoot, "bin", "codex-automation.js"), ...args];
}

export function execBin(args, options = {}) {
  return execFileAsync(process.execPath, binArgs(args), {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    maxBuffer: 10 * 1024 * 1024
  });
}

function titleFromId(id) {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
