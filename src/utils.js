import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cancel, isCancel, text } from "@clack/prompts";
import { fail } from "./errors.js";

export const execFileAsync = promisify(execFile);

export function expandHome(value) {
  if (typeof value === "string" && value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function assertOwnerRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    fail("invalid_repo", `Expected repo as owner/name, got: ${value}`);
  }
}

export function stripSlashes(value) {
  return String(value).replace(/^\/|\/$/g, "");
}

export function ensureNotCancelled(value, message = "Operation cancelled") {
  if (isCancel(value)) {
    cancel(message);
    fail("operation_cancelled", message);
  }
  return value;
}

export async function promptWithDefault(label, defaultValue, io, options = {}) {
  if (options.dryRun || options.yes) return defaultValue;
  if (!io.ask) {
    const answer = await text({
      message: label,
      defaultValue,
      placeholder: defaultValue
    });
    return String(ensureNotCancelled(answer)).trim() || defaultValue;
  }
  const answer = await ask(`${label} [${defaultValue}]`, io);
  return answer.trim() || defaultValue;
}

export async function ask(question, io) {
  if (io.ask) return io.ask(question);
  fail("confirmation_required", "Run in an interactive terminal");
}

export async function fileExists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}
