import fs from "node:fs/promises";
import path from "node:path";
import { codexHome } from "./automation.js";
import { fail } from "./errors.js";

export const CONFIG_NAME = "config.json";

export function configDir(env = process.env) {
  return path.join(codexHome(env), "codex-automations");
}

export function legacyConfigDir(env = process.env) {
  return path.join(codexHome(env), "codex-automation");
}

export function configPath(env = process.env) {
  return path.join(configDir(env), CONFIG_NAME);
}

export async function readConfig(env = process.env) {
  const file = configPath(env);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return normalizeConfig(parsed);
  } catch (error) {
    if (error.code === "ENOENT") {
      const legacyFile = path.join(legacyConfigDir(env), CONFIG_NAME);
      return fs.readFile(legacyFile, "utf8")
        .then((text) => normalizeConfig(JSON.parse(text)))
        .catch((legacyError) => {
          if (legacyError.code === "ENOENT") return normalizeConfig({});
          throw legacyError;
        });
    }
    throw error;
  }
}

export async function writeConfig(config, env = process.env) {
  const normalized = normalizeConfig(config);
  await fs.mkdir(configDir(env), { recursive: true });
  await fs.writeFile(configPath(env), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export async function upsertCollection(name, collection, options = {}, env = process.env) {
  assertCollectionName(name);
  const config = await readConfig(env);
  const normalized = normalizeCollection(collection);
  config.collections[name] = normalized;
  if (options.makeDefault || !config.defaultCollection) {
    config.defaultCollection = name;
  }
  await writeConfig(config, env);
  return { name, ...normalized, default: config.defaultCollection === name };
}

export async function setDefaultCollection(name, env = process.env) {
  const config = await readConfig(env);
  if (!config.collections[name]) fail("collection_not_found", `Collection not found: ${name}`);
  config.defaultCollection = name;
  await writeConfig(config, env);
  return { name, ...config.collections[name], default: true };
}

export async function removeCollection(name, env = process.env) {
  const config = await readConfig(env);
  if (!config.collections[name]) fail("collection_not_found", `Collection not found: ${name}`);
  delete config.collections[name];
  if (config.defaultCollection === name) {
    config.defaultCollection = Object.keys(config.collections).sort()[0];
  }
  await writeConfig(config, env);
  return { name, removed: true, defaultCollection: config.defaultCollection };
}

export function listCollections(config) {
  return Object.entries(normalizeConfig(config).collections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, collection]) => ({
      name,
      ...collection,
      default: normalizeConfig(config).defaultCollection === name
    }));
}

export async function resolveCollection(name, env = process.env) {
  const config = await readConfig(env);
  const selectedName = name || config.defaultCollection;
  if (!selectedName) return undefined;
  const collection = config.collections[selectedName];
  if (!collection) fail("collection_not_found", `Collection not found: ${selectedName}`);
  return { name: selectedName, ...collection, default: config.defaultCollection === selectedName };
}

function normalizeConfig(config) {
  return {
    version: 1,
    defaultCollection: config.defaultCollection,
    collections: config.collections || {}
  };
}

function normalizeCollection(collection) {
  if (!collection.repo) fail("missing_collection_repo", "Collection repo is required");
  assertOwnerRepo(collection.repo);
  return {
    repo: collection.repo,
    path: stripSlashes(collection.path || "automations"),
    branch: collection.branch || "main",
    publishMode: collection.publishMode || "push"
  };
}

function assertCollectionName(name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(String(name || ""))) {
    fail("invalid_collection_name", `Invalid collection name: ${name}`);
  }
}

function assertOwnerRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    fail("invalid_repo", `Expected repo as owner/name, got: ${value}`);
  }
}

function stripSlashes(value) {
  return String(value).replace(/^\/|\/$/g, "");
}
