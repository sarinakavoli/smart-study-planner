/**
 * seed-scripts-cli.test.js
 *
 * CLI integration tests for seed-categories.mjs and seed-tasks.mjs.
 *
 * All tests use --dry-run so no GCP credentials or Firestore writes are
 * required. Each test spawns the script as a child process and asserts on
 * the exit code and stdout/stderr output.
 */

import { spawnSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect, afterEach } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATEGORIES_SCRIPT    = join(__dirname, "seed-categories.mjs");
const TASKS_SCRIPT         = join(__dirname, "seed-tasks.mjs");
const ORGANIZATIONS_SCRIPT = join(__dirname, "seed-organizations.mjs");

/**
 * Spawns a seed script with the given arguments and returns
 * { exitCode, stdout, stderr }.
 *
 * @param {string}   script   - Absolute path to the script
 * @param {string[]} args     - CLI arguments
 * @param {object}   extraEnv - Optional additional environment variables
 */
function run(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: undefined, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout:   result.stdout ?? "",
    stderr:   result.stderr ?? "",
  };
}

// ── seed-categories.mjs ───────────────────────────────────────────────────────

describe("seed-categories.mjs --dry-run", () => {
  it("exits 0 and prints DRY RUN header", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("mentions the categories collection", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/categories/i);
  });

  it("reports the default document count (500)", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/500/);
  });

  it("shows sample document IDs in cat_<org>_<cat>_<NNN> format", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}/);
  });

  it("does not write to Firestore (no write-related lines)", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).not.toMatch(/Inserted|writing|batch/i);
  });

  it("mentions --skip-verify flag in the preview output", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/--skip-verify/);
  });

  it("reminds user to remove --dry-run to write to Firestore", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/Remove --dry-run/);
  });
});

describe("seed-categories.mjs --dry-run --count", () => {
  it("honours --count=10 and reports 10 documents", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--count=10"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/10/);
  });

  it("honours --count=1 (single document)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--count=1"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/1/);
  });

  it("exits 1 and prints ERROR for --count=0", () => {
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run", "--count=0"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--count/i);
  });

  it("exits 1 and prints ERROR for a non-numeric --count", () => {
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run", "--count=abc"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--count/i);
  });
});

describe("seed-categories.mjs --dry-run --users", () => {
  it("accepts a single UID via --users and exits 0", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--users=uid_abc"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_abc/);
  });

  it("accepts multiple UIDs and lists them all", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--users=uid_abc,uid_xyz",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_abc/);
    expect(stdout).toMatch(/uid_xyz/);
  });

  it("exits 1 and prints ERROR for empty --users=", () => {
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run", "--users="]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--users/i);
  });
});

describe("seed-categories.mjs --dry-run --email", () => {
  it("shows the email as-is in the user list (not resolved in dry-run)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--email=test@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/test@example\.com/);
  });

  it("exits 1 when --email and --users are both supplied", () => {
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--email=test@example.com",
      "--users=uid_abc",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--email.*--users|--users.*--email/i);
  });

  it("exits 1 for empty --email=", () => {
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run", "--email="]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--email/i);
  });
});

describe("seed-categories.mjs --dry-run --delete", () => {
  it("exits 0 and shows delete-preview output", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--delete"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
    expect(stdout).toMatch(/--delete/);
  });

  it("reports ALL users when no user filter is active (userFilterActive=false)", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--delete"]);
    expect(stdout).toMatch(/ALL users/i);
  });

  it("shows filter as 'seedData == true' only when no user scope is active", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--delete"]);
    expect(stdout).toMatch(/Filter\s*:\s*seedData == true$/m);
  });

  it("shows scoped user when --users is combined with --delete (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_xyz",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_xyz/);
  });

  it("shows 'userId IN' filter when --users is provided (scoped delete)", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_xyz",
    ]);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });

  it("shows scoped filter when --email is combined with --delete (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--delete",
      "--email=test@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/test@example\.com/);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });

  it("does not show ALL-users scope when --email activates the user filter", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--delete",
      "--email=test@example.com",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });

  it("shows multiple users when multiple --users are provided", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_a,uid_b",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_a/);
    expect(stdout).toMatch(/uid_b/);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });
});

describe("seed-categories.mjs --dry-run --undo-last", () => {
  it("exits 0 and shows undo-last preview output", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
    expect(stdout).toMatch(/--undo-last/);
  });

  it("mentions that no manifest was found when none exists", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(stdout).toMatch(/no manifest found|Run ID/i);
  });

  it("shows 'ALL users' filter when no user scope is active (userFilterActive=false)", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(stdout).toMatch(/ALL users/i);
    expect(stdout).toMatch(/Filter\s*:\s*seedRunId == <run-id>$/m);
  });

  it("shows scoped filter with 'userId IN' when --users is provided (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--users=uid_scoped",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_scoped/);
    expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
  });

  it("does not show ALL-users scope when --users activates the user filter for undo-last", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--users=uid_scoped",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });

  it("shows scoped filter when --email is combined with --undo-last (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--email=test@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/test@example\.com/);
    expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
  });

  it("does not show ALL-users scope when --email activates the user filter for undo-last", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--email=test@example.com",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });
});

describe("seed-categories.mjs --dry-run --skip-verify", () => {
  it("exits 0 when --skip-verify is combined with --dry-run", () => {
    const { exitCode } = run(CATEGORIES_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(exitCode).toBe(0);
  });

  it("still shows the DRY RUN header when --skip-verify is present", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("shows sample document IDs when --skip-verify is combined with --dry-run", () => {
    const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(stdout).toMatch(/cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}/);
  });
});

describe("seed-categories.mjs --reset", () => {
  it("exits 0 in --dry-run mode even when --reset is present", () => {
    const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--reset"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("exits 1 when --reset is used without credentials", () => {
    const result = spawnSync(
      process.execPath,
      [CATEGORIES_SCRIPT, "--reset"],
      {
        encoding: "utf8",
        env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: "" },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

describe("seed-categories.mjs: no credentials without --dry-run", () => {
  it("exits 1 and prints ERROR about missing credentials", () => {
    const result = spawnSync(
      process.execPath,
      [CATEGORIES_SCRIPT],
      {
        encoding: "utf8",
        env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: "" },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

// ── seed-tasks.mjs ────────────────────────────────────────────────────────────

describe("seed-tasks.mjs --dry-run", () => {
  it("exits 0 and prints DRY RUN header", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("mentions the tasks collection", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/tasks/i);
  });

  it("reports the default document count (10,000)", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/10[,.]?000/);
  });

  it("shows sample document IDs in task_<cat>_<title>_<random> format", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}/);
  });

  it("does not write to Firestore", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(stdout).not.toMatch(/Inserted|writing|batch/i);
  });

  it("reminds user to remove --dry-run to write to Firestore", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run"]);
    expect(stdout).toMatch(/Remove --dry-run/);
  });
});

describe("seed-tasks.mjs --dry-run --count", () => {
  it("honours --count=5 and exits 0", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--count=5"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/5/);
  });

  it("exits 1 and prints ERROR for --count=0", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run", "--count=0"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--count/i);
  });

  it("exits 1 and prints ERROR for --count=-1", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run", "--count=-1"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--count/i);
  });

  it("exits 1 and prints ERROR for non-numeric --count", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run", "--count=xyz"]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--count/i);
  });
});

describe("seed-tasks.mjs --dry-run --users", () => {
  it("accepts a single UID and exits 0", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--users=uid_abc"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_abc/);
  });

  it("accepts comma-separated UIDs and lists them", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--users=uid_one,uid_two,uid_three",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_one/);
    expect(stdout).toMatch(/uid_two/);
    expect(stdout).toMatch(/uid_three/);
  });

  it("exits 1 for empty --users=", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run", "--users="]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--users/i);
  });
});

describe("seed-tasks.mjs --dry-run --email", () => {
  it("shows the email as-is in dry-run mode", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--email=dev@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dev@example\.com/);
  });

  it("exits 1 when --email and --users are both supplied", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--email=dev@example.com",
      "--users=uid_abc",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--email.*--users|--users.*--email/i);
  });

  it("exits 1 for empty --email=", () => {
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run", "--email="]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*--email/i);
  });
});

describe("seed-tasks.mjs --dry-run --delete", () => {
  it("exits 0 and shows delete-preview output", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--delete"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
    expect(stdout).toMatch(/--delete/);
  });

  it("reports ALL users when no user filter is active (userFilterActive=false)", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--delete"]);
    expect(stdout).toMatch(/ALL users/i);
  });

  it("shows filter as 'seedData == true' only when no user scope is active", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--delete"]);
    expect(stdout).toMatch(/Filter\s*:\s*seedData == true$/m);
  });

  it("shows scoped user when --users is combined with --delete (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_xyz",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_xyz/);
  });

  it("shows 'userId IN' filter when --users is provided (scoped delete)", () => {
    const { stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_xyz",
    ]);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });

  it("shows scoped filter when --email is combined with --delete (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--delete",
      "--email=dev@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dev@example\.com/);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });

  it("does not show ALL-users scope when --email activates the user filter", () => {
    const { stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--delete",
      "--email=dev@example.com",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });

  it("shows multiple users when multiple --users are provided", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--delete",
      "--users=uid_a,uid_b",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_a/);
    expect(stdout).toMatch(/uid_b/);
    expect(stdout).toMatch(/seedData == true AND userId IN/);
  });
});

describe("seed-tasks.mjs --dry-run --undo-last", () => {
  it("exits 0 and shows undo-last preview output", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
    expect(stdout).toMatch(/--undo-last/);
  });

  it("mentions that no manifest was found when none exists", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(stdout).toMatch(/no manifest found|Run ID/i);
  });

  it("shows 'ALL users' filter when no user scope is active (userFilterActive=false)", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--undo-last"]);
    expect(stdout).toMatch(/ALL users/i);
    expect(stdout).toMatch(/Filter\s*:\s*seedRunId == <run-id>$/m);
  });

  it("shows scoped filter with 'userId IN' when --users is provided (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--users=uid_scoped",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/uid_scoped/);
    expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
  });

  it("does not show ALL-users scope when --users activates the user filter for undo-last", () => {
    const { stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--users=uid_scoped",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });

  it("shows scoped filter when --email is combined with --undo-last (userFilterActive=true)", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--email=dev@example.com",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dev@example\.com/);
    expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
  });

  it("does not show ALL-users scope when --email activates the user filter for undo-last", () => {
    const { stdout } = run(TASKS_SCRIPT, [
      "--dry-run",
      "--undo-last",
      "--email=dev@example.com",
    ]);
    expect(stdout).not.toMatch(/ALL users/i);
  });
});

describe("seed-tasks.mjs --dry-run --skip-verify", () => {
  it("exits 0 when --skip-verify is combined with --dry-run", () => {
    const { exitCode } = run(TASKS_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(exitCode).toBe(0);
  });

  it("still shows the DRY RUN header when --skip-verify is present", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("shows sample document IDs when --skip-verify is combined with --dry-run", () => {
    const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--skip-verify"]);
    expect(stdout).toMatch(/task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}/);
  });
});

describe("seed-tasks.mjs --reset", () => {
  it("exits 0 in --dry-run mode even when --reset is present", () => {
    const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--reset"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/DRY RUN/);
  });

  it("exits 1 when --reset is used without credentials", () => {
    const result = spawnSync(
      process.execPath,
      [TASKS_SCRIPT, "--reset"],
      {
        encoding: "utf8",
        env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: "" },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

describe("seed-tasks.mjs: no credentials without --dry-run", () => {
  it("exits 1 and prints ERROR about missing credentials", () => {
    const result = spawnSync(
      process.execPath,
      [TASKS_SCRIPT],
      {
        encoding: "utf8",
        env: { ...process.env, GCP_SERVICE_ACCOUNT_JSON: "" },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

// ── .seed-users file error path tests ────────────────────────────────────────
//
// Each test writes a malformed `.seed-users` file to a temporary directory and
// passes SEED_USERS_PATH_OVERRIDE so the spawned script reads from that
// isolated location. The temp directory is removed after each test.

describe(".seed-users file: broken content causes exit 1 with ERROR message", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function writeBadSeedUsers(content) {
    tmpDir = mkdtempSync(join(tmpdir(), "seed-users-bad-test-"));
    const seedUsersFile = join(tmpDir, ".seed-users");
    writeFileSync(seedUsersFile, content, "utf8");
    return { SEED_USERS_PATH_OVERRIDE: seedUsersFile };
  }

  it("exits 1 and prints ERROR when .seed-users contains invalid JSON", () => {
    const env = writeBadSeedUsers("{ not valid json }");
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*Failed to parse/i);
  });

  it("exits 1 and prints ERROR when .seed-users is missing the 'users' key", () => {
    const env = writeBadSeedUsers(JSON.stringify({ items: ["uid_abc"] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty "users" array/i);
  });

  it("exits 1 and prints ERROR when .seed-users has an empty users array", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty "users" array/i);
  });

  it("mentions the file path in the ERROR message for invalid JSON", () => {
    const env = writeBadSeedUsers("this is not json at all");
    const { stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(stderr).toMatch(/\.seed-users/);
  });

  it("(seed-tasks) mentions the file path in the ERROR message for invalid JSON", () => {
    const env = writeBadSeedUsers("this is not json at all");
    const { stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(stderr).toMatch(/\.seed-users/);
  });

  it("mentions the expected format in the ERROR message for missing 'users' key", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: null }));
    const { stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(stderr).toMatch(/"users"/i);
  });

  it("(seed-tasks) mentions the expected format in the ERROR message for missing 'users' key", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: null }));
    const { stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(stderr).toMatch(/"users"/i);
  });

  it("exits 1 and prints ERROR when users array contains a number", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [123] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("exits 1 and prints ERROR when users array contains null", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [null] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("exits 1 and prints ERROR when users array contains an empty string", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [""] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("exits 1 and reports the count of invalid entries for a mixed array", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [123, null, "", "valid-uid"] }));
    const { exitCode, stderr } = run(CATEGORIES_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
    expect(stderr).toMatch(/3 invalid/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when users array contains a number", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [123] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when users array contains null", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [null] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when users array contains an empty string", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [""] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
  });

  it("seed-tasks: exits 1 and reports the count of invalid entries for a mixed array", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [123, null, "", "valid-uid"] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty strings/i);
    expect(stderr).toMatch(/3 invalid/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when .seed-users contains invalid JSON", () => {
    const env = writeBadSeedUsers("{ not valid json }");
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*Failed to parse/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when .seed-users is missing the 'users' key", () => {
    const env = writeBadSeedUsers(JSON.stringify({ items: ["uid_abc"] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty "users" array/i);
  });

  it("seed-tasks: exits 1 and prints ERROR when .seed-users has an empty users array", () => {
    const env = writeBadSeedUsers(JSON.stringify({ users: [] }));
    const { exitCode, stderr } = run(TASKS_SCRIPT, ["--dry-run"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ERROR.*non-empty "users" array/i);
  });
});

// ── .seed-users file path tests ───────────────────────────────────────────────
//
// Each test creates a temporary directory, writes `.seed-users` there, and
// passes SEED_USERS_PATH_OVERRIDE so the spawned script reads from that
// isolated location. The temp directory is removed after each test, ensuring
// no real scripts/.seed-users file is touched.

describe(".seed-users file activates scoped filter in --dry-run output", () => {
  let tmpDir;
  let seedUsersFile;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
      seedUsersFile = undefined;
    }
  });

  function writeSeedUsers(users) {
    tmpDir = mkdtempSync(join(tmpdir(), "seed-users-test-"));
    seedUsersFile = join(tmpDir, ".seed-users");
    writeFileSync(seedUsersFile, JSON.stringify({ users }), "utf8");
    return { SEED_USERS_PATH_OVERRIDE: seedUsersFile };
  }

  describe("seed-categories.mjs --dry-run --delete", () => {
    it("shows scoped filter when .seed-users file contains UIDs", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--delete"], env);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/uid_from_file/);
      expect(stdout).toMatch(/seedData == true AND userId IN/);
    });

    it("does not show ALL-users scope when .seed-users file is present", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--delete"], env);
      expect(stdout).not.toMatch(/ALL users/i);
    });
  });

  describe("seed-categories.mjs --dry-run --undo-last", () => {
    it("shows scoped filter when .seed-users file contains UIDs", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { exitCode, stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--undo-last"], env);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/uid_from_file/);
      expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
    });

    it("does not show ALL-users scope when .seed-users file is present", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { stdout } = run(CATEGORIES_SCRIPT, ["--dry-run", "--undo-last"], env);
      expect(stdout).not.toMatch(/ALL users/i);
    });
  });

  describe("seed-tasks.mjs --dry-run --delete", () => {
    it("shows scoped filter when .seed-users file contains UIDs", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--delete"], env);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/uid_from_file/);
      expect(stdout).toMatch(/seedData == true AND userId IN/);
    });

    it("does not show ALL-users scope when .seed-users file is present", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--delete"], env);
      expect(stdout).not.toMatch(/ALL users/i);
    });
  });

  describe("seed-tasks.mjs --dry-run --undo-last", () => {
    it("shows scoped filter when .seed-users file contains UIDs", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { exitCode, stdout } = run(TASKS_SCRIPT, ["--dry-run", "--undo-last"], env);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/uid_from_file/);
      expect(stdout).toMatch(/seedRunId == <run-id> AND userId IN/);
    });

    it("does not show ALL-users scope when .seed-users file is present", () => {
      const env = writeSeedUsers(["uid_from_file"]);
      const { stdout } = run(TASKS_SCRIPT, ["--dry-run", "--undo-last"], env);
      expect(stdout).not.toMatch(/ALL users/i);
    });
  });
});

// ── seed-organizations.mjs ────────────────────────────────────────────────────

describe("seed-organizations.mjs --skip-verify", () => {
  it("exits 0 when --skip-verify is set", () => {
    const { exitCode } = run(
      ORGANIZATIONS_SCRIPT,
      ["--skip-verify"],
      { SEED_VERIFY_MOCK_JSON: "{}" }
    );
    expect(exitCode).toBe(0);
  });

  it("prints the skip message when --skip-verify is set", () => {
    const { stdout } = run(
      ORGANIZATIONS_SCRIPT,
      ["--skip-verify"],
      { SEED_VERIFY_MOCK_JSON: "{}" }
    );
    expect(stdout).toMatch(/Skipping post-insert verification/);
  });

  it("does not print the verification header when --skip-verify is set", () => {
    const { stdout } = run(
      ORGANIZATIONS_SCRIPT,
      ["--skip-verify"],
      { SEED_VERIFY_MOCK_JSON: "{}" }
    );
    expect(stdout).not.toMatch(/Seed-user verification/);
  });
});
