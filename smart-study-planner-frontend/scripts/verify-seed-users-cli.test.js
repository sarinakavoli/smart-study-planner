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
import { writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { tmpdir } from "os";
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

  it("shows all three collections to be checked by default", () => {
    const { stdout } = run(["--dry-run"]);
    expect(stdout).toMatch(/categories/i);
    expect(stdout).toMatch(/tasks/i);
    expect(stdout).toMatch(/organizations/i);
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

  it("shows only organizations when --collection=organizations is supplied", () => {
    const { stdout } = run(["--dry-run", "--collection=organizations"]);
    expect(stdout).toMatch(/organizations/i);
    expect(stdout).not.toMatch(/\bcategories\b/);
    expect(stdout).not.toMatch(/\btasks\b/);
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
    expect(stderr).toMatch(/organizations/);
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

  it("exits 1 for --collection=organizations when credentials are missing", () => {
    const { exitCode } = run(["--collection=organizations"]);
    expect(exitCode).toBe(1);
  });

  it("reports credential error (not collection error) for --collection=organizations without credentials", () => {
    const { stderr } = run(["--collection=organizations"]);
    expect(stderr).toMatch(/GCP_SERVICE_ACCOUNT_JSON/);
  });
});

// ── --collection=organizations with SEED_VERIFY_MOCK_JSON ─────────────────────
//
// These tests exercise the full verify-seed-users.mjs CLI with
// --collection=organizations using mock Firestore / Auth so no real
// GCP credentials are required.  The organizations collection uses
// "ownerId" instead of "userId"; the mock path must honour that mapping.

function runWithMock(args, seeded = [], missing = []) {
  const mockJson = JSON.stringify({ users: seeded, missing });
  return run(args, { SEED_VERIFY_MOCK_JSON: mockJson });
}

describe("verify-seed-users.mjs --collection=organizations: all ownerId values match Auth (exit 0)", () => {
  it("exits 0 when the seeded ownerId exists in Auth", () => {
    const { exitCode } = runWithMock(["--collection=organizations"], ["real-uid-org-001"], []);
    expect(exitCode).toBe(0);
  });

  it("prints ALL PASS when the seeded ownerId is found in Auth", () => {
    const { stdout } = runWithMock(["--collection=organizations"], ["real-uid-org-001"], []);
    expect(stdout).toMatch(/ALL PASS/);
  });

  it("does not print FAIL when all ownerIds match Auth", () => {
    const { stdout } = runWithMock(["--collection=organizations"], ["real-uid-org-001"], []);
    expect(stdout).not.toMatch(/FAIL/);
  });

  it("exits 0 when multiple ownerIds all match Auth", () => {
    const { exitCode } = runWithMock(
      ["--collection=organizations"],
      ["real-uid-org-a", "real-uid-org-b"],
      []
    );
    expect(exitCode).toBe(0);
  });

  it("exits 0 and reports nothing to verify when no documents are seeded", () => {
    const { exitCode, stdout } = runWithMock(["--collection=organizations"], [], []);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Nothing to verify/);
  });
});

describe("verify-seed-users.mjs --collection=organizations: ownerId mismatch detected (exit 1)", () => {
  it("exits 1 when the seeded ownerId is not in Auth", () => {
    const { exitCode } = runWithMock(
      ["--collection=organizations"],
      ["ghost-uid-org-001"],
      ["ghost-uid-org-001"]
    );
    expect(exitCode).toBe(1);
  });

  it("prints FAIL or MISMATCH when the ownerId is missing from Auth", () => {
    const { stdout } = runWithMock(
      ["--collection=organizations"],
      ["ghost-uid-org-001"],
      ["ghost-uid-org-001"]
    );
    expect(stdout).toMatch(/FAIL|MISMATCH/);
  });

  it("mentions the missing ownerId value in the output", () => {
    const { stdout } = runWithMock(
      ["--collection=organizations"],
      ["ghost-uid-org-001"],
      ["ghost-uid-org-001"]
    );
    expect(stdout).toMatch(/ghost-uid-org-001/);
  });

  it("marks the missing ownerId as [MISSING] in the report", () => {
    const { stdout } = runWithMock(
      ["--collection=organizations"],
      ["ghost-uid-org-001"],
      ["ghost-uid-org-001"]
    );
    expect(stdout).toMatch(/\[MISSING\]/);
  });

  it("does not print ALL PASS when there is a mismatch", () => {
    const { stdout } = runWithMock(
      ["--collection=organizations"],
      ["ghost-uid-org-001"],
      ["ghost-uid-org-001"]
    );
    expect(stdout).not.toMatch(/ALL PASS/);
  });

  it("exits 1 on a partial mismatch (some ownerIds present, some missing)", () => {
    const { exitCode } = runWithMock(
      ["--collection=organizations"],
      ["real-uid-org", "ghost-uid-org"],
      ["ghost-uid-org"]
    );
    expect(exitCode).toBe(1);
  });

  it("still prints FAIL on a partial mismatch even when some ownerIds are OK", () => {
    const { stdout } = runWithMock(
      ["--collection=organizations"],
      ["real-uid-org", "ghost-uid-org"],
      ["ghost-uid-org"]
    );
    expect(stdout).toMatch(/FAIL|MISMATCH/);
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

// ── --dry-run metadata file (estimated document counts) ───────────────────────

describe("verify-seed-users.mjs --dry-run: metadata file absent", () => {
  it("states counts are unknown when no metadata file is found", () => {
    const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: "/tmp/__nonexistent_seed_counts__.json" });
    expect(stdout).toMatch(/unknown/i);
  });

  it("mentions that no metadata file was found", () => {
    const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: "/tmp/__nonexistent_seed_counts__.json" });
    expect(stdout).toMatch(/no metadata file/i);
  });

  it("still exits 0 when no metadata file is present", () => {
    const { exitCode } = run(["--dry-run"], { SEED_COUNTS_FILE: "/tmp/__nonexistent_seed_counts__.json" });
    expect(exitCode).toBe(0);
  });
});

describe("verify-seed-users.mjs --dry-run: metadata file present", () => {
  function withTempCountsFile(counts, fn) {
    const file = join(tmpdir(), `seed-counts-test-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(counts), "utf8");
    try {
      fn(file);
    } finally {
      try { unlinkSync(file); } catch { /* ignore */ }
    }
  }

  it("shows the document count for each collection from the metadata file", () => {
    withTempCountsFile({ categories: 12, tasks: 34 }, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/12/);
      expect(stdout).toMatch(/34/);
    });
  });

  it("labels the counts as estimated from the last recorded run", () => {
    withTempCountsFile({ categories: 5, tasks: 10 }, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/estimated|last recorded/i);
    });
  });

  it("shows updatedAt timestamp when present in the metadata file", () => {
    withTempCountsFile({ categories: 3, tasks: 7, updatedAt: "2025-06-01T00:00:00Z" }, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/2025-06-01/);
    });
  });

  it("shows 'unknown' for a collection missing from the metadata file", () => {
    withTempCountsFile({ categories: 9 }, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/tasks: unknown/i);
      expect(stdout).toMatch(/organizations: unknown/i);
    });
  });

  it("shows 'unknown' for categories when it is missing from the metadata file", () => {
    withTempCountsFile({ tasks: 5, organizations: 3 }, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/categories: unknown/i);
    });
  });

  it("shows 'unknown' for all three counts when the metadata file is an empty object", () => {
    withTempCountsFile({}, (file) => {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/categories: unknown/i);
      expect(stdout).toMatch(/tasks: unknown/i);
      expect(stdout).toMatch(/organizations: unknown/i);
    });
  });

  it("shows 'unknown' for the requested collection when --collection=categories and the metadata file is an empty object", () => {
    withTempCountsFile({}, (file) => {
      const { stdout } = run(["--dry-run", "--collection=categories"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/categories: unknown/i);
    });
  });

  it("shows 'unknown' for the requested collection when --collection=tasks and the metadata file is an empty object", () => {
    withTempCountsFile({}, (file) => {
      const { stdout } = run(["--dry-run", "--collection=tasks"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/tasks: unknown/i);
    });
  });

  it("shows 'unknown' for the requested collection when --collection=organizations and the metadata file is an empty object", () => {
    withTempCountsFile({}, (file) => {
      const { stdout } = run(["--dry-run", "--collection=organizations"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/organizations: unknown/i);
    });
  });

  it("exits with a non-zero exit code and prints a descriptive error when --collection=foobar is an unrecognized collection name", () => {
    const { exitCode, stderr } = run(["--dry-run", "--collection=foobar"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/foobar/i);
  });

  it("only shows counts for the requested collection when --collection is supplied", () => {
    withTempCountsFile({ categories: 42, tasks: 99 }, (file) => {
      const { stdout } = run(["--dry-run", "--collection=categories"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/42/);
      expect(stdout).not.toMatch(/99/);
    });
  });

  it("shows the organizations count and collection name when --collection=organizations is supplied", () => {
    withTempCountsFile({ categories: 5, tasks: 10, organizations: 7 }, (file) => {
      const { stdout } = run(["--dry-run", "--collection=organizations"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/organizations/i);
      expect(stdout).toMatch(/7/);
      expect(stdout).not.toMatch(/\bcategories\b/);
      expect(stdout).not.toMatch(/\btasks\b/);
    });
  });

  it("exits 0 when a valid metadata file is present", () => {
    withTempCountsFile({ categories: 1, tasks: 2 }, (file) => {
      const { exitCode } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(exitCode).toBe(0);
    });
  });

  it("does not produce any stderr output when a valid metadata file is present", () => {
    withTempCountsFile({ categories: 1, tasks: 2 }, (file) => {
      const { stderr } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stderr).toBe("");
    });
  });
});

describe("verify-seed-users.mjs --dry-run: malformed metadata JSON", () => {
  it("exits 0 when the metadata file contains invalid JSON", () => {
    const file = join(tmpdir(), `seed-counts-bad-${Date.now()}.json`);
    writeFileSync(file, "not-valid-json", "utf8");
    try {
      const { exitCode } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(exitCode).toBe(0);
    } finally {
      try { unlinkSync(file); } catch { /* ignore */ }
    }
  });

  it("states counts are unknown when the metadata file contains invalid JSON", () => {
    const file = join(tmpdir(), `seed-counts-bad-${Date.now()}.json`);
    writeFileSync(file, "{bad json", "utf8");
    try {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/unknown/i);
    } finally {
      try { unlinkSync(file); } catch { /* ignore */ }
    }
  });

  it("mentions invalid JSON in the diagnostic message for a malformed metadata file", () => {
    const file = join(tmpdir(), `seed-counts-bad-${Date.now()}.json`);
    writeFileSync(file, "{bad json", "utf8");
    try {
      const { stdout } = run(["--dry-run"], { SEED_COUNTS_FILE: file });
      expect(stdout).toMatch(/invalid json/i);
    } finally {
      try { unlinkSync(file); } catch { /* ignore */ }
    }
  });
});
