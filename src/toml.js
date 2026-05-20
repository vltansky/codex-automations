import { fail } from "./errors.js";

export function parseAutomationToml(text) {
  const out = {};
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const triple = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"""(.*)$/);
    if (triple) {
      const key = triple[1];
      const first = triple[2];
      const collected = [];
      if (first.endsWith('"""')) {
        out[key] = first.slice(0, -3);
        continue;
      }
      collected.push(first);
      index += 1;
      while (index < lines.length) {
        const current = lines[index];
        const closeAt = current.indexOf('"""');
        if (closeAt >= 0) {
          collected.push(current.slice(0, closeAt));
          break;
        }
        collected.push(current);
        index += 1;
      }
      if (index >= lines.length) fail("invalid_toml", `Unclosed multiline string for ${key}`);
      out[key] = collected.join("\n");
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!pair) fail("invalid_toml", `Unsupported TOML line: ${raw}`);

    out[pair[1]] = parseValue(pair[2].trim(), raw);
  }

  return out;
}

function parseValue(value, raw) {
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const json = value.replace(/,\s*]$/, "]");
    try {
      return JSON.parse(json);
    } catch {
      fail("invalid_toml", `Unsupported array value: ${raw}`);
    }
  }
  fail("invalid_toml", `Unsupported TOML value: ${raw}`);
}

export function stringifyAutomationToml(input) {
  const ordered = [
    "version",
    "id",
    "kind",
    "name",
    "prompt",
    "status",
    "rrule",
    "model",
    "reasoning_effort",
    "execution_environment",
    "cwds",
    "created_at",
    "updated_at"
  ];
  const keys = [...ordered.filter((key) => key in input), ...Object.keys(input).filter((key) => !ordered.includes(key))];
  return `${keys.map((key) => `${key} = ${formatValue(key, input[key])}`).join("\n")}\n`;
}

function formatValue(key, value) {
  if (key === "prompt" && typeof value === "string" && value.includes("\n")) return `"""${value.replace(/"""/g, '\\"\\"\\"')}"""`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}
