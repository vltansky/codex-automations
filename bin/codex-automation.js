#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  const payload = error && error.code
    ? { ok: false, code: error.code, message: error.message }
    : { ok: false, code: "unexpected_error", message: String(error?.message || error) };

  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
});
