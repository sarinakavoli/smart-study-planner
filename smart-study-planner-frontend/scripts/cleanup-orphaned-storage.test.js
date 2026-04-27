/**
 * cleanup-orphaned-storage.test.js
 *
 * CLI tests for cleanup-orphaned-storage.mjs.
 *
 * The script requires a local service account key file
 * (scripts/serviceAccountKey.json) to connect to Firebase Storage and
 * Firestore.  When the key file is absent — the normal state in CI and in
 * development environments that use the GCP_SERVICE_ACCOUNT_JSON secret
 * instead — the script emits an error and exits 1.
 *
 * All tests in this file run in that credential-less code path so no real
 * Firebase credentials or network calls are needed.  Each test spawns the
 * script as a child process and asserts on the exit code and stderr output.
 *
 * NOTE: Tests are skipped automatically when serviceAccountKey.json exists in
 * the scripts/ directory because the script proceeds past the missing-key
 * check in that case and the exit-code / stderr assertions below no longer
 * hold.  CI environments do not have this file so the full suite always runs
 * there.
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect } from "vitest";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CLEANUP_SCRIPT = join(__dirname, "cleanup-orphaned-storage.mjs");

const KEY_FILE_PRESENT = existsSync(join(__dirname, "serviceAccountKey.json"));
const test = KEY_FILE_PRESENT ? it.skip : it;

/**
 * Spawns cleanup-orphaned-storage.mjs with the given arguments and returns
 * { exitCode, stdout, stderr }.
 *
 * @param {string[]} args     - CLI arguments
 * @param {object}   extraEnv - Optional additional environment variables
 */
function run(args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [CLEANUP_SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── Missing key file ──────────────────────────────────────────────────────────

describe("cleanup-orphaned-storage.mjs — missing service account key", () => {
  test("exits 1 when serviceAccountKey.json does not exist", () => {
    const { exitCode } = run(["some-task-id"]);
    expect(exitCode).toBe(1);
  });

  test("writes an error message to stderr", () => {
    const { stderr } = run(["some-task-id"]);
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("error mentions serviceAccountKey.json", () => {
    const { stderr } = run(["some-task-id"]);
    expect(stderr).toMatch(/serviceAccountKey\.json/);
  });

  test("error includes Firebase Console download instructions", () => {
    const { stderr } = run(["some-task-id"]);
    expect(stderr).toMatch(/Firebase Console/i);
  });

  test("exits 1 regardless of task ID argument", () => {
    const { exitCode } = run(["task_abc123_title_0001"]);
    expect(exitCode).toBe(1);
  });

  test("exits 1 with --all flag when key file is absent", () => {
    const { exitCode } = run(["--all"]);
    expect(exitCode).toBe(1);
  });

  test("exits 1 with --all --force flags when key file is absent", () => {
    const { exitCode } = run(["--all", "--force"]);
    expect(exitCode).toBe(1);
  });

  test("exits 1 with --force flag when key file is absent", () => {
    const { exitCode } = run(["some-task-id", "--force"]);
    expect(exitCode).toBe(1);
  });

  test("error mentions the expected path to the key file", () => {
    const { stderr } = run(["some-task-id"]);
    expect(stderr).toMatch(/scripts\//);
  });
});
