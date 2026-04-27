/**
 * seed-fake-tasks-for-index-test.test.js
 *
 * CLI tests for seed-fake-tasks-for-index-test.mjs.
 *
 * The script requires GCP_SERVICE_ACCOUNT_JSON to be set in order to
 * initialise the Firebase Admin SDK.  When the environment variable is absent
 * — the normal state in CI environments that have not been given Firebase
 * credentials — the script emits an error message and exits 1.
 *
 * All tests in this file run in that credential-less code path so no real
 * GCP credentials or network calls are needed.  Each test spawns the script
 * as a child process and asserts on the exit code and stderr output.
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect } from "vitest";

const __dirname    = dirname(fileURLToPath(import.meta.url));
const INDEX_SCRIPT = join(__dirname, "seed-fake-tasks-for-index-test.mjs");

/**
 * Spawns seed-fake-tasks-for-index-test.mjs with the given arguments and
 * returns { exitCode, stdout, stderr }.
 *
 * GCP_SERVICE_ACCOUNT_JSON is explicitly removed from the environment so the
 * credential-missing error path is taken consistently in all tests.
 *
 * @param {string[]} args     - CLI arguments
 * @param {object}   extraEnv - Optional additional environment variables
 */
function run(args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [INDEX_SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: undefined, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── Missing GCP credentials ───────────────────────────────────────────────────

describe("seed-fake-tasks-for-index-test.mjs — missing GCP credentials", () => {
  it("exits 1 when GCP_SERVICE_ACCOUNT_JSON is not set (default mode)", () => {
    const { exitCode } = run();
    expect(exitCode).toBe(1);
  });

  it("writes an error message to stderr", () => {
    const { stderr } = run();
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("error mentions GCP_SERVICE_ACCOUNT_JSON", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });

  it("error includes instructions on how to fix the missing credentials", () => {
    const { stderr } = run();
    expect(stderr).toMatch(/Replit Secret|service account/i);
  });

  it("exits 1 with --seed-only flag when credentials are missing", () => {
    const { exitCode } = run(["--seed-only"]);
    expect(exitCode).toBe(1);
  });

  it("exits 1 with --query flag when credentials are missing", () => {
    const { exitCode } = run(["--query"]);
    expect(exitCode).toBe(1);
  });

  it("exits 1 with --reset flag when credentials are missing", () => {
    const { exitCode } = run(["--reset"]);
    expect(exitCode).toBe(1);
  });

  it("does not write anything meaningful to stdout", () => {
    const { stdout } = run();
    expect(stdout.trim()).toBe("");
  });
});
