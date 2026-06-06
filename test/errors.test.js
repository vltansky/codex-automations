import assert from "node:assert/strict";
import test from "node:test";
import { CliError, fail } from "../src/errors.js";

test("CliError stores code, message, and details", () => {
  const error = new CliError("test_code", "Test message", { key: "value" });
  assert.equal(error.name, "CliError");
  assert.equal(error.code, "test_code");
  assert.equal(error.message, "Test message");
  assert.deepEqual(error.details, { key: "value" });
  assert.ok(error instanceof Error);
});

test("CliError defaults details to empty object", () => {
  const error = new CliError("code", "msg");
  assert.deepEqual(error.details, {});
});

test("fail throws a CliError", () => {
  assert.throws(
    () => fail("some_code", "some message"),
    (error) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "some_code");
      assert.equal(error.message, "some message");
      return true;
    }
  );
});

test("fail forwards details to CliError", () => {
  assert.throws(
    () => fail("code", "msg", { extra: 42 }),
    (error) => {
      assert.deepEqual(error.details, { extra: 42 });
      return true;
    }
  );
});
