#!/usr/bin/env node
import { main } from "../src/cli.js";

const argv = process.argv.slice(2);

main(argv).catch((error) => {
  const payload = error && error.code
    ? { ok: false, code: error.code, message: error.message }
    : { ok: false, code: "unexpected_error", message: String(error?.message || error) };

  if (argv.includes("--json")) {
    console.error(JSON.stringify(payload, null, 2));
  } else {
    console.error(`Error: ${payload.message}`);
    const hint = hintFor(payload.code);
    if (hint) console.error(`Hint: ${hint}`);
  }
  process.exitCode = 1;
});

function hintFor(code) {
  if (code === "id_conflict") return "Use --replace to overwrite it, or --name \"My Copy\" to install a renamed copy.";
  if (code === "multiple_packages_found") return "Pass --automation <id> to choose one, or --all to install every automation.";
  if (code === "confirmation_required") return "Run in an interactive terminal, or pass --yes where supported.";
  return "";
}
