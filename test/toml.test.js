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

test("parses blank lines and comments", () => {
  const toml = `# This is a comment
version = 1

# Another comment
id = "test"
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.id, "test");
});

test("parses boolean values", () => {
  const toml = `enabled = true
disabled = false
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.disabled, false);
});

test("parses integer values", () => {
  const toml = `count = 42
negative = -7
zero = 0
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.count, 42);
  assert.equal(parsed.negative, -7);
  assert.equal(parsed.zero, 0);
});

test("parses quoted string values", () => {
  const toml = `name = "Hello World"
empty = ""
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.name, "Hello World");
  assert.equal(parsed.empty, "");
});

test("parses array values", () => {
  const toml = `tags = ["a", "b", "c"]
nums = [1, 2, 3]
`;
  const parsed = parseAutomationToml(toml);
  assert.deepEqual(parsed.tags, ["a", "b", "c"]);
  assert.deepEqual(parsed.nums, [1, 2, 3]);
});

test("parses arrays with trailing commas", () => {
  const toml = `tags = ["a", "b",]
`;
  const parsed = parseAutomationToml(toml);
  assert.deepEqual(parsed.tags, ["a", "b"]);
});

test("parses triple-quoted single-line strings", () => {
  const toml = `prompt = """one liner"""
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.prompt, "one liner");
});

test("parses triple-quoted multiline strings", () => {
  const toml = `prompt = """first
second
third"""
`;
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.prompt, "first\nsecond\nthird");
});

test("handles \\r\\n line endings", () => {
  const toml = "version = 1\r\nid = \"test\"\r\n";
  const parsed = parseAutomationToml(toml);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.id, "test");
});

test("throws on unclosed triple-quoted string", () => {
  const toml = `prompt = """open ended
no close
`;
  assert.throws(() => parseAutomationToml(toml), /Unclosed multiline string/);
});

test("throws on unsupported TOML line", () => {
  const toml = `not a valid line at all`;
  assert.throws(() => parseAutomationToml(toml), /Unsupported TOML line/);
});

test("throws on unsupported value format", () => {
  const toml = `key = unquoted_string`;
  assert.throws(() => parseAutomationToml(toml), /Unsupported TOML value/);
});

test("throws on unparseable array value", () => {
  const toml = `key = [not, valid, json]`;
  assert.throws(() => parseAutomationToml(toml), /Unsupported array value/);
});

test("stringifyAutomationToml orders known keys first", () => {
  const input = {
    custom_field: "x",
    id: "test",
    version: 1,
    kind: "cron",
    name: "Test",
    prompt: "Do stuff",
    status: "ACTIVE",
    rrule: "FREQ=DAILY"
  };
  const output = stringifyAutomationToml(input);
  const lines = output.trim().split("\n");
  assert.match(lines[0], /^version = /);
  assert.match(lines[1], /^id = /);
  assert.match(lines[2], /^kind = /);
  assert.match(lines[lines.length - 1], /^custom_field = /);
});

test("stringifyAutomationToml uses triple quotes for multiline prompt", () => {
  const input = { version: 1, prompt: "line1\nline2" };
  const output = stringifyAutomationToml(input);
  assert.match(output, /prompt = """line1\nline2"""/);
});

test("stringifyAutomationToml formats booleans and numbers", () => {
  const input = { enabled: true, count: 42 };
  const output = stringifyAutomationToml(input);
  assert.match(output, /enabled = true/);
  assert.match(output, /count = 42/);
});

test("stringifyAutomationToml formats arrays as JSON", () => {
  const input = { cwds: ["/a", "/b"] };
  const output = stringifyAutomationToml(input);
  assert.match(output, /cwds = \["\/a","\/b"\]/);
});
