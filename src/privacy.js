import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SECRET_PATTERNS = [
  {
    code: "github_token",
    pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    message: "Looks like a GitHub token."
  },
  {
    code: "secret_assignment",
    pattern: /\b(?:api[_-]?(?:key|token)|secret|token|cookie|password)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{12,}/gi,
    message: "Looks like an inline secret assignment."
  }
];

const LOCAL_PATH_PATTERN = /(?:\/Users\/[^/\s"'`]+|\/home\/[^/\s"'`]+)\/[^\s"'`]*/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CONNECTOR_PATTERN = /\[(?:@|\$)[^\]]+\]\((?:app|plugin):\/\//g;

export async function scanAutomationPrivacy(automation, options = {}) {
  const review = options.review || "auto";
  if (review === "off") return finalize("off", []);

  const rules = deterministicPrivacyScan(automation);
  if (review === "rules") return rules;

  if (review === "codex" || (review === "auto" && shouldUseCodex(options))) {
    try {
      const codex = await runCodexPrivacyReview(automation, options);
      return mergeScans(rules, codex);
    } catch (error) {
      if (review === "codex") throw error;
      return {
        ...rules,
        reviewer: rules.reviewer,
        warnings: [
          ...(rules.warnings || []),
          {
            code: "codex_privacy_review_unavailable",
            message: `Codex privacy review was unavailable; used local privacy rules instead. ${error.message}`
          }
        ]
      };
    }
  }

  return rules;
}

export function deterministicPrivacyScan(automation) {
  const findings = [];
  for (const { path: fieldPath, value } of flatten(automation)) {
    if (typeof value !== "string") continue;
    findings.push(...scanText(value, fieldPath));
  }
  return finalize("rules", dedupeFindings(findings));
}

export async function runCodexPrivacyReview(automation, options = {}) {
  const exec = options.codexExec || options.exec;
  if (!exec) throw new Error("No command runner was provided for Codex review");

  await exec("codex", ["--version"]);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-automation-privacy-"));
  try {
    const outputPath = path.join(temp, "review.json");
    const schemaPath = path.join(temp, "schema.json");
    await fs.writeFile(schemaPath, `${JSON.stringify(codexReviewSchema(), null, 2)}\n`);
    await exec("codex", [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--ignore-rules",
      "-s",
      "read-only",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
      "-"
    ], {
      input: codexReviewPrompt(automation, options)
    });

    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map(normalizeCodexFinding).filter(Boolean) : [];
    return finalize("codex", dedupeFindings(findings));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function shouldUseCodex(options) {
  return Boolean(options.realCommandRunner || options.codexExec);
}

function scanText(value, fieldPath) {
  const findings = [];
  for (const secret of SECRET_PATTERNS) {
    for (const match of value.matchAll(secret.pattern)) {
      findings.push({
        severity: "error",
        code: secret.code,
        path: fieldPath,
        match: redact(match[0]),
        message: secret.message,
        suggestion: "Remove the secret and reference an environment variable or external secret store."
      });
    }
  }

  for (const match of value.matchAll(LOCAL_PATH_PATTERN)) {
    findings.push({
      severity: "warning",
      code: "local_path",
      path: fieldPath,
      match: match[0],
      message: "Contains an absolute local path that may reveal a username or machine layout.",
      suggestion: "Replace local paths with ${workspace}, a package input, or a generic project path."
    });
  }

  for (const match of value.matchAll(EMAIL_PATTERN)) {
    findings.push({
      severity: "warning",
      code: "email_address",
      path: fieldPath,
      match: match[0],
      message: "Contains an email address.",
      suggestion: "Remove the email or replace it with a role/contact placeholder."
    });
  }

  for (const match of value.matchAll(CONNECTOR_PATTERN)) {
    findings.push({
      severity: "warning",
      code: "connector_reference",
      path: fieldPath,
      match: match[0],
      message: "References a local connector or plugin that may not exist for other users.",
      suggestion: "Mention required connectors in the package README or make the prompt work without them."
    });
  }
  return findings;
}

function flatten(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key));
  }
  return [{ path: prefix, value }];
}

function finalize(reviewer, findings) {
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity !== "error");
  return {
    ok: errors.length === 0,
    reviewer,
    findings,
    errors,
    warnings
  };
}

function mergeScans(rules, codex) {
  const findings = dedupeFindings([...(rules.findings || []), ...(codex.findings || [])]);
  return finalize("rules+codex", findings);
}

function dedupeFindings(findings) {
  const seen = new Set();
  const result = [];
  for (const finding of findings) {
    const key = [finding.severity, finding.code, finding.path, finding.match, finding.message].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

function normalizeCodexFinding(finding) {
  if (!finding || typeof finding !== "object") return undefined;
  const severity = finding.severity === "error" ? "error" : "warning";
  return {
    severity,
    code: String(finding.code || "codex_privacy_finding"),
    path: String(finding.path || "automation"),
    match: typeof finding.match === "string" ? redact(finding.match) : undefined,
    message: String(finding.message || "Codex found a possible personal detail."),
    suggestion: typeof finding.suggestion === "string" ? finding.suggestion : "Review before sharing."
  };
}

function redact(value) {
  if (!value || value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function codexReviewPrompt(automation, options) {
  return `Review this Codex automation before it is published to a public GitHub marketplace.

Find personal details, secrets, machine-specific assumptions, local paths, private repo names, private people/contact details, or anything that should be generalized before sharing.

Return only JSON that matches the provided schema. Use severity "error" for secrets or credentials. Use "warning" for personal or machine-specific details that can be shared only after review. Ignore the target marketplace repo ${options.ownerRepo || "(none)"}.

Automation JSON:
${JSON.stringify(automation, null, 2)}
`;
}

function codexReviewSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "code", "path", "message", "suggestion"],
          properties: {
            severity: { type: "string", enum: ["error", "warning"] },
            code: { type: "string" },
            path: { type: "string" },
            match: { type: "string" },
            message: { type: "string" },
            suggestion: { type: "string" }
          }
        }
      }
    }
  };
}
