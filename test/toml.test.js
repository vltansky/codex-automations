import assert from "node:assert/strict";
import test from "node:test";
import { parseAutomationToml, stringifyAutomationToml } from "../src/toml.js";
import { sampleToml } from "./helpers.js";

test("parses and stringifies Codex automation TOML", () => {
  const parsed = parseAutomationToml(sampleToml);
  assert.equal(parsed.id, "morning-pr-radar");
  assert.equal(parsed.prompt, "Line one\nLine two");
  assert.deepEqual(parsed.cwds, ["/Users/example/Projects/vlad"]);

  const roundTrip = parseAutomationToml(stringifyAutomationToml(parsed));
  assert.deepEqual(roundTrip, parsed);
});
