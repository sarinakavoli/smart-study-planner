/**
 * seed-verify-exit-cli.test.js
 *
 * End-to-end exit-code tests for the verifySeedUsersOrExit path that
 * seed-categories.mjs and seed-tasks.mjs invoke after every insert run.
 *
 * Both seed scripts call verifySeedUsersOrExit(db, auth, collectionName) at
 * the end of a live insert run.  When a seeded userId has no matching Firebase
 * Auth account the function should print a FAIL / HOW TO FIX summary and exit
 * with code 1.  When all UIDs match it should print ALL PASS and exit 0.
 *
 * Strategy
 * ────────
 * Setting the SEED_VERIFY_MOCK_JSON environment variable activates mock mode
 * in both seed scripts:
 *   - Firebase initialisation and GCP credential checks are skipped.
 *   - The Firestore batch-write loop is bypassed (nothing is written).
 *   - verifySeedUsersOrExit replaces its real db/auth arguments with in-
 *     process mocks built from the JSON value:
 *       { "users": ["uid1"], "missing": ["uid1"] }
 *     where `users` are the UIDs present as seeded docs in mock Firestore
 *     and `missing` are the subset absent from mock Firebase Auth.
 *
 * This lets us spawn the actual seed scripts as child processes and assert
 * on their exit codes and output without any GCP credentials or network I/O.
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect } from "vitest";

const __dirname        = dirname(fileURLToPath(import.meta.url));
const CATEGORIES_SCRIPT = join(__dirname, "seed-categories.mjs");
const TASKS_SCRIPT      = join(__dirname, "seed-tasks.mjs");

/**
 * Spawns a seed script with SEED_VERIFY_MOCK_JSON set so that mock mode
 * is activated.  Returns { exitCode, stdout, stderr }.
 *
 * @param {string}   script     - Absolute path to the seed script
 * @param {string[]} seeded     - UIDs that appear as seeded docs (mock Firestore)
 * @param {string[]} missing    - Subset of seeded UIDs absent from mock Auth
 * @param {string[]} extraArgs  - Additional CLI arguments (e.g. --skip-verify)
 */
function run(script, seeded = [], missing = [], extraArgs = []) {
  const mockJson = JSON.stringify({ users: seeded, missing });
  const result = spawnSync(process.execPath, [script, ...extraArgs], {
    encoding: "utf8",
    env: {
      ...process.env,
      GCP_SERVICE_ACCOUNT_JSON: undefined,
      SEED_VERIFY_MOCK_JSON: mockJson,
    },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── seed-categories.mjs — bad userId ─────────────────────────────────────────

describe("seed-categories.mjs: exits 1 when seeded userId is not in Firebase Auth", () => {
  it("exits with code 1 for a single missing userId", () => {
    const { exitCode } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(exitCode).toBe(1);
  });

  it("prints FAIL when the userId is missing from Auth", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(stdout).toMatch(/FAIL/);
  });

  it("prints HOW TO FIX when the userId is missing from Auth", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(stdout).toMatch(/HOW TO FIX/);
  });

  it("marks the missing UID as [MISSING] in the report", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(stdout).toMatch(/\[MISSING\]/);
  });

  it("mentions the bad UID by value in the output", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(stdout).toMatch(/ghost-uid-cat-001/);
  });

  it("exits 1 when multiple UIDs are seeded and all are missing from Auth", () => {
    const { exitCode } = run(
      CATEGORIES_SCRIPT,
      ["ghost-uid-a", "ghost-uid-b"],
      ["ghost-uid-a", "ghost-uid-b"]
    );
    expect(exitCode).toBe(1);
  });

  it("exits 1 on a partial mismatch (some UIDs present, some missing)", () => {
    const { exitCode } = run(
      CATEGORIES_SCRIPT,
      ["real-uid-cat", "ghost-uid-cat"],
      ["ghost-uid-cat"]
    );
    expect(exitCode).toBe(1);
  });

  it("still prints FAIL on a partial mismatch even when some UIDs are OK", () => {
    const { stdout } = run(
      CATEGORIES_SCRIPT,
      ["real-uid-cat", "ghost-uid-cat"],
      ["ghost-uid-cat"]
    );
    expect(stdout).toMatch(/FAIL/);
  });

  it("does not print ALL PASS when there are mismatches", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["ghost-uid-cat-001"], ["ghost-uid-cat-001"]);
    expect(stdout).not.toMatch(/ALL PASS/);
  });
});

// ── seed-categories.mjs — matching userId ─────────────────────────────────────

describe("seed-categories.mjs: exits 0 when all seeded userIds match Firebase Auth", () => {
  it("exits with code 0 when the seeded userId exists in Auth", () => {
    const { exitCode } = run(CATEGORIES_SCRIPT, ["real-uid-cat"], []);
    expect(exitCode).toBe(0);
  });

  it("prints ALL PASS when all UIDs are found in Auth", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["real-uid-cat"], []);
    expect(stdout).toMatch(/ALL PASS/);
  });

  it("does not print FAIL when all UIDs match Auth", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["real-uid-cat"], []);
    expect(stdout).not.toMatch(/FAIL/);
  });

  it("exits 0 when multiple UIDs are all present in Auth", () => {
    const { exitCode } = run(
      CATEGORIES_SCRIPT,
      ["real-uid-cat-a", "real-uid-cat-b"],
      []
    );
    expect(exitCode).toBe(0);
  });

  it("exits 0 and notes nothing to verify when no UIDs are seeded", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [], []);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Nothing to verify/);
  });
});

// ── seed-tasks.mjs — bad userId ───────────────────────────────────────────────

describe("seed-tasks.mjs: exits 1 when seeded userId is not in Firebase Auth", () => {
  it("exits with code 1 for a single missing userId", () => {
    const { exitCode } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(exitCode).toBe(1);
  });

  it("prints FAIL when the userId is missing from Auth", () => {
    const { stdout } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(stdout).toMatch(/FAIL/);
  });

  it("prints HOW TO FIX when the userId is missing from Auth", () => {
    const { stdout } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(stdout).toMatch(/HOW TO FIX/);
  });

  it("marks the missing UID as [MISSING] in the report", () => {
    const { stdout } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(stdout).toMatch(/\[MISSING\]/);
  });

  it("mentions the bad UID by value in the output", () => {
    const { stdout } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(stdout).toMatch(/ghost-uid-task-001/);
  });

  it("exits 1 on a partial mismatch (some UIDs present, some missing)", () => {
    const { exitCode } = run(
      TASKS_SCRIPT,
      ["real-uid-task", "ghost-uid-task"],
      ["ghost-uid-task"]
    );
    expect(exitCode).toBe(1);
  });

  it("does not print ALL PASS when there are mismatches", () => {
    const { stdout } = run(TASKS_SCRIPT, ["ghost-uid-task-001"], ["ghost-uid-task-001"]);
    expect(stdout).not.toMatch(/ALL PASS/);
  });
});

// ── seed-tasks.mjs — matching userId ──────────────────────────────────────────

describe("seed-tasks.mjs: exits 0 when all seeded userIds match Firebase Auth", () => {
  it("exits with code 0 when the seeded userId exists in Auth", () => {
    const { exitCode } = run(TASKS_SCRIPT, ["real-uid-task"], []);
    expect(exitCode).toBe(0);
  });

  it("prints ALL PASS when all UIDs are found in Auth", () => {
    const { stdout } = run(TASKS_SCRIPT, ["real-uid-task"], []);
    expect(stdout).toMatch(/ALL PASS/);
  });

  it("does not print FAIL when all UIDs match Auth", () => {
    const { stdout } = run(TASKS_SCRIPT, ["real-uid-task"], []);
    expect(stdout).not.toMatch(/FAIL/);
  });

  it("exits 0 when multiple UIDs are all present in Auth", () => {
    const { exitCode } = run(TASKS_SCRIPT, ["real-uid-task-a", "real-uid-task-b"], []);
    expect(exitCode).toBe(0);
  });

  it("exits 0 and notes nothing to verify when no UIDs are seeded", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [], []);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Nothing to verify/);
  });
});
