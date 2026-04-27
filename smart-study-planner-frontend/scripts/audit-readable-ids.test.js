/**
 * audit-readable-ids.test.js
 *
 * CLI tests for audit-readable-ids.mjs.
 *
 * Because the script requires a Firebase service account or a local key file
 * to perform a live Firestore audit, all tests run in the credential-less code
 * path.  When neither GCP_SERVICE_ACCOUNT_JSON nor
 * scripts/serviceAccountKey.json is present the script emits a warning and
 * exits 0 — a deliberate "graceful skip" so CI pipelines that have no
 * Firebase access do not fail the build.
 *
 * Each test spawns the script as a child process and asserts on the exit code
 * and stderr output without requiring any GCP credentials or network I/O.
 *
 * NOTE: Tests are skipped automatically when serviceAccountKey.json exists in
 * the scripts/ directory because the script proceeds past the credential check
 * in that case and the assertions below no longer hold.  CI environments do not
 * have this file so the full suite always runs there.
 */

import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = join(__dirname, "audit-readable-ids.mjs");

const KEY_FILE_PRESENT = existsSync(join(__dirname, "serviceAccountKey.json"));
const test = KEY_FILE_PRESENT ? it.skip : it;

/**
 * Spawns audit-readable-ids.mjs with the given arguments and returns
 * { exitCode, stdout, stderr }.
 *
 * GCP_SERVICE_ACCOUNT_JSON is explicitly removed from the environment so the
 * credential-less code path is taken consistently in all tests.
 *
 * @param {string[]} args     - CLI arguments
 * @param {object}   extraEnv - Optional additional environment variables
 */
function run(args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [AUDIT_SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: undefined, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── Graceful skip when no credentials are configured ──────────────────────────

describe("audit-readable-ids.mjs — no credentials", () => {
  test("exits 0 when GCP_SERVICE_ACCOUNT_JSON is not set and key file is absent", () => {
    const { exitCode } = run();
    expect(exitCode).toBe(0);
  });

  test("writes a warning to stderr", () => {
    const { stderr } = run();
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("warning mentions GCP_SERVICE_ACCOUNT_JSON", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });

  test("warning mentions serviceAccountKey.json", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/serviceAccountKey\.json/);
  });

  test("warning explains that the audit is being skipped", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/[Ss]kipping/);
  });

  test("does not write any meaningful output to stdout", () => {
    const { stdout } = run();
    expect(stdout.trim()).toBe("");
  });
});

// ── Flag acceptance in the credential-less path ───────────────────────────────

describe("audit-readable-ids.mjs — flags accepted without credentials", () => {
  test("exits 0 with --verbose flag", () => {
    const { exitCode } = run(["--verbose"]);
    expect(exitCode).toBe(0);
  });

  test("exits 0 with --json flag", () => {
    const { exitCode } = run(["--json"]);
    expect(exitCode).toBe(0);
  });

  test("exits 0 with both --verbose and --json flags", () => {
    const { exitCode } = run(["--verbose", "--json"]);
    expect(exitCode).toBe(0);
  });

  test("--json flag: warning still appears on stderr (not swallowed)", () => {
    const { stderr } = run(["--json"]);
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

// ── GITHUB_STEP_SUMMARY integration ──────────────────────────────────────────

describe("audit-readable-ids.mjs — GITHUB_STEP_SUMMARY", () => {
  test("writes a skip notice to GITHUB_STEP_SUMMARY when the env var is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-test-"));
    const summaryPath = join(dir, "step-summary.md");
    writeFileSync(summaryPath, "");

    try {
      run([], { GITHUB_STEP_SUMMARY: summaryPath });
      const content = readFileSync(summaryPath, "utf8");
      expect(content).toMatch(/[Ss]kipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("exits 0 even when GITHUB_STEP_SUMMARY is set but no credentials exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-test-"));
    const summaryPath = join(dir, "step-summary.md");
    writeFileSync(summaryPath, "");

    try {
      const { exitCode } = run([], { GITHUB_STEP_SUMMARY: summaryPath });
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
