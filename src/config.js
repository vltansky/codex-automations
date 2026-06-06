import fs from "node:fs/promises";
import path from "node:path";
import { codexHome } from "./automation.js";
import { fail } from "./errors.js";
import { assertOwnerRepo, stripSlashes } from "./utils.js";

export const CONFIG_NAME = "config.json";

/**
 * @typedef {object} MarketplaceConfigEntry
 * @property {string} repo
 * @property {string} path
 * @property {string} branch
 * @property {"push" | "pr"} publishMode
 *
 * @typedef {object} CodexAutomationsConfig
 * @property {number} version
 * @property {string=} defaultMarketplace
 * @property {Record<string, MarketplaceConfigEntry>} marketplaces
 */

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
    const parsed = safeJsonParse(await fs.readFile(file, "utf8"), file);
    return normalizeConfig(parsed);
  } catch (error) {
    if (error.code === "ENOENT") {
      const legacyFile = path.join(legacyConfigDir(env), CONFIG_NAME);
      return fs.readFile(legacyFile, "utf8")
        .then((text) => normalizeConfig(safeJsonParse(text, legacyFile)))
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
  config.marketplaces[name] = normalized;
  if (options.makeDefault || !config.defaultMarketplace) {
    config.defaultMarketplace = name;
  }
  await writeConfig(config, env);
  return { name, ...normalized, default: config.defaultMarketplace === name };
}

export async function setDefaultCollection(name, env = process.env) {
  const config = await readConfig(env);
  if (!config.marketplaces[name]) fail("marketplace_not_found", `Marketplace not found: ${name}`);
  config.defaultMarketplace = name;
  await writeConfig(config, env);
  return { name, ...config.marketplaces[name], default: true };
}

export async function removeCollection(name, env = process.env) {
  const config = await readConfig(env);
  if (!config.marketplaces[name]) fail("marketplace_not_found", `Marketplace not found: ${name}`);
  delete config.marketplaces[name];
  if (config.defaultMarketplace === name) {
    config.defaultMarketplace = Object.keys(config.marketplaces).sort()[0];
  }
  await writeConfig(config, env);
  return { name, removed: true, defaultMarketplace: config.defaultMarketplace };
}

export function listCollections(config) {
  const normalized = normalizeConfig(config);
  return Object.entries(normalized.marketplaces)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, collection]) => ({
      name,
      ...collection,
      default: normalized.defaultMarketplace === name
    }));
}

export async function resolveCollection(name, env = process.env) {
  const config = await readConfig(env);
  const selectedName = name || config.defaultMarketplace;
  if (!selectedName) return undefined;
  const collection = config.marketplaces[selectedName];
  if (!collection) fail("marketplace_not_found", `Marketplace not found: ${selectedName}`);
  return { name: selectedName, ...collection, default: config.defaultMarketplace === selectedName };
}

function normalizeConfig(config) {
  const marketplaces = config.marketplaces || config.collections || {};
  const defaultMarketplace = config.defaultMarketplace || config.defaultCollection;
  return {
    version: 1,
    defaultMarketplace,
    marketplaces
  };
}

function normalizeCollection(collection) {
  if (!collection.repo) fail("missing_marketplace_repo", "Marketplace repo is required");
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
    fail("invalid_marketplace_name", `Invalid marketplace name: ${name}`);
  }
}

function safeJsonParse(text, file) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("invalid_config_json", `Invalid config JSON at ${file}: ${error.message}`);
  }
}
