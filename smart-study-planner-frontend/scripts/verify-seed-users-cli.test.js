/**
 * verify-seed-users-cli.test.js
 *
 * CLI integration tests for verify-seed-users.mjs.
 *
 * All tests run without real GCP credentials. Tests cover:
 *   - Missing / empty credentials (the most important early-exit guard)
 *   - Invalid --collection flag values (caught before Firebase is initialised)
 *   - Valid --collection flag values that still fail on credentials
 *
 * Each test spawns the script as a child process and asserts on the exit code
 * and stdout/stderr output, following the seed-scripts-cli.test.js pattern.
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY_SCRIPT = join(__dirname, "verify-seed-users.mjs");

/**
 * Spawns verify-seed-users.mjs with the given arguments and returns
 * { exitCode, stdout, stderr }.
 *
 * @param {string[]} args     - CLI arguments
 * @param {object}   extraEnv - Optional additional environment variables
 */
function run(args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: undefined, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── --dry-run ─────────────────────────────────────────────────────────────────

describe("verify-seed-users.mjs --dry-run", () => {
  it("exits 0 without any credentials", () => {
    const { exitCode } = run(["--dry-run"]);
    expect(exitCode).toBe(0);
  });

  it("prints a DRY RUN header", () => {
    const { stdout } = run(["--dry-run"]);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("shows both collections to be checked by default", () => {
    const { stdout } = run(["--dry-run"]);
    expect(stdout).toMatch(/categories/i);
    expect(stdout).toMatch(/tasks/i);
  });

  it("shows only the specified collection when --collection is supplied", () => {
    const { stdout } = run(["--dry-run", "--collection=categories"]);
    expect(stdout).toMatch(/categories/i);
    expect(stdout).not.toMatch(/\btasks\b/);
  });

  it("shows only tasks when --collection=tasks is supplied", () => {
    const { stdout } = run(["--dry-run", "--collection=tasks"]);
    expect(stdout).toMatch(/tasks/i);
    expect(stdout).not.toMatch(/\bcategories\b/);
  });

  it("prints a preview message describing what would happen", () => {
    const { stdout } = run(["--dry-run"]);
    expect(stdout).toMatch(/no network calls/i);
  });

  it("tells the user to remove --dry-run to run for real", () => {
    const { stdout } = run(["--dry-run"]);
    expect(stdout).toMatch(/Remove --dry-run/);
  });

  it("does not produce any error output", () => {
    const { stderr } = run(["--dry-run"]);
    expect(stderr).toBe("");
  });

  it("still rejects an invalid --collection value even in dry-run mode", () => {
    const { exitCode, stderr } = run(["--dry-run", "--collection=bogus"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--collection/i);
  });
});

// ── Missing credentials ───────────────────────────────────────────────────────

describe("verify-seed-users.mjs: missing credentials", () => {
  it("exits 1 when GCP_SERVICE_ACCOUNT_JSON is not set", () => {
    const { exitCode } = run();
    expect(exitCode).toBe(1);
  });

  it("prints an ERROR mentioning GCP_SERVICE_ACCOUNT_JSON when the env var is missing", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });

  it("prints an ERROR (not a stack trace) when the env var is missing", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/ERROR/);
  });

  it("does not write any success output to stdout when credentials are missing", () => {
    const { stdout } = run();
    expect(stdout).not.toMatch(/Result:/i);
    expect(stdout).not.toMatch(/ALL PASS/i);
  });
});

// ── Empty credentials ─────────────────────────────────────────────────────────

describe("verify-seed-users.mjs: empty credentials", () => {
  it("exits 1 when GCP_SERVICE_ACCOUNT_JSON is an empty string", () => {
    const { exitCode } = run([], { GCP_SERVICE_ACCOUNT_JSON: "" });
    expect(exitCode).toBe(1);
  });

  it("prints an ERROR mentioning GCP_SERVICE_ACCOUNT_JSON for an empty string", () => {
    const { stderr } = run([], { GCP_SERVICE_ACCOUNT_JSON: "" });
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });

  it("mentions how to fix the problem (Replit Secret)", () => {
    const { stderr } = run([], { GCP_SERVICE_ACCOUNT_JSON: "" });
    expect(stderr).toMatch(/Replit Secret|service account/i);
  });
});

// ── --collection flag validation (happens before Firebase init) ───────────────

describe("verify-seed-users.mjs: --collection flag validation", () => {
  it("exits 1 for an unrecognised --collection value", () => {
    const { exitCode } = run(["--collection=bogus"]);
    expect(exitCode).toBe(1);
  });

  it("prints an ERROR mentioning --collection for an invalid value", () => {
    const { stderr } = run(["--collection=bogus"]);
    expect(stderr).toMatch(/ERROR.*--collection/i);
  });

  it("includes the invalid value in the error message", () => {
    const { stderr } = run(["--collection=bogus"]);
    expect(stderr).toMatch(/bogus/);
  });

  it("exits 1 for --collection=users (not a valid collection)", () => {
    const { exitCode, stderr } = run(["--collection=users"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--collection/i);
  });

  it("exits 1 for --collection= (empty value)", () => {
    const { exitCode, stderr } = run(["--collection="]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--collection/i);
  });

  it("lists the valid collection names in the error message", () => {
    const { stderr } = run(["--collection=bogus"]);
    expect(stderr).toMatch(/categories/);
    expect(stderr).toMatch(/tasks/);
  });
});

// ── Valid --collection flag still fails on credentials ────────────────────────

describe("verify-seed-users.mjs: valid --collection with missing credentials", () => {
  it("exits 1 for --collection=categories when credentials are missing", () => {
    const { exitCode } = run(["--collection=categories"]);
    expect(exitCode).toBe(1);
  });

  it("reports credential error (not collection error) for --collection=categories without credentials", () => {
    const { stderr } = run(["--collection=categories"]);
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });

  it("exits 1 for --collection=tasks when credentials are missing", () => {
    const { exitCode } = run(["--collection=tasks"]);
    expect(exitCode).toBe(1);
  });

  it("reports credential error (not collection error) for --collection=tasks without credentials", () => {
    const { stderr } = run(["--collection=tasks"]);
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

// ── Malformed credentials JSON ────────────────────────────────────────────────

describe("verify-seed-users.mjs: malformed credentials JSON", () => {
  it("exits non-zero when GCP_SERVICE_ACCOUNT_JSON is not valid JSON", () => {
    const { exitCode } = run([], { GCP_SERVICE_ACCOUNT_JSON: "not-valid-json" });
    expect(exitCode).not.toBe(0);
  });

  it("does not produce success output when credentials JSON is malformed", () => {
    const { stdout } = run([], { GCP_SERVICE_ACCOUNT_JSON: "not-valid-json" });
    expect(stdout).not.toMatch(/ALL PASS/i);
    expect(stdout).not.toMatch(/Result:/i);
  });
});
