/**
 * verify-seed-users.test.js
 *
 * Regression tests for the seed-verify pipeline, targeting the four validation
 * surfaces called out in the task acceptance criteria:
 *
 *   1. "missing file"    — no seed documents exist in the scanned collection.
 *                          verifySeedUsers must return true and report "Nothing
 *                          to verify" without touching Firebase Auth.
 *
 *   2. "malformed UIDs"  — seed documents contain null, empty-string, or other
 *                          falsy userId values. Those entries must be silently
 *                          skipped; Auth.getUser must never be called for them.
 *
 *   3. "empty file"      — a service-account JSON is supplied but is structurally
 *                          incomplete (valid JSON, wrong shape). The script must
 *                          exit non-zero and must not emit a success/result line.
 *
 *   4. "valid file"      — A mix of falsy and real userIds: only the real userId
 *                          is sent to Auth and the correct PASS/FAIL outcome is
 *                          reported.
 *
 * Error-message assertions are included so that CI catches regressions in the
 * user-facing output, not just the exit code.
 *
 * These cases do not overlap with seed-verify-helper.test.js (which tests
 * well-formed UIDs only) or verify-seed-users-cli.test.js (which tests the
 * --dry-run / --collection / credential-presence paths).
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  collectSeedUserIds,
  verifySeedUsers,
} from "./seed-verify-helper.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY_SCRIPT = join(__dirname, "verify-seed-users.mjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

function runScript(args = [], extraEnv = {}) {
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

function makeDb(pages) {
  let pageIndex = 0;

  const makeQueryObj = () => ({
    get: vi.fn(async () => {
      const page = pages[pageIndex] ?? [];
      pageIndex++;
      const docs = page.map((d) => ({ data: () => d }));
      return { empty: docs.length === 0, docs, size: docs.length };
    }),
    startAfter: vi.fn(function () { return makeQueryObj(); }),
  });

  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => makeQueryObj()),
      })),
    })),
  };
}

function makeAuth(uidToUser = {}, missingUids = []) {
  return {
    getUser: vi.fn(async (uid) => {
      if (missingUids.includes(uid)) {
        const err = new Error("User not found");
        err.code = "auth/user-not-found";
        throw err;
      }
      if (Object.prototype.hasOwnProperty.call(uidToUser, uid)) {
        return uidToUser[uid];
      }
      const err = new Error("Unexpected UID in test: " + uid);
      err.code = "auth/user-not-found";
      throw err;
    }),
  };
}

// ── 1. "missing file" — empty collection ─────────────────────────────────────
//
// When the scanned collection has no seedData:true documents the pipeline
// must report "Nothing to verify" and return true without calling Auth at all.

describe("verifySeedUsers: missing file (empty collection — no seed documents)", () => {
  let consoleSpy;
  let stdoutSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy   = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("returns true when there are no seed documents at all", async () => {
    const db   = makeDb([[]]);
    const auth = makeAuth();
    expect(await verifySeedUsers(db, auth, "categories")).toBe(true);
  });

  it("does not call auth.getUser when the collection is empty", async () => {
    const db   = makeDb([[]]);
    const auth = makeAuth();
    await verifySeedUsers(db, auth, "categories");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("reports 'Nothing to verify' in console output when the collection is empty", async () => {
    const db   = makeDb([[]]);
    const auth = makeAuth();
    await verifySeedUsers(db, auth, "categories");
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/Nothing to verify/);
  });
});

// ── 2. "malformed UIDs" — falsy userId values in seed documents ───────────────
//
// collectSeedUserIds and verifySeedUsers must silently ignore documents whose
// userId field is null, an empty string, or another falsy value.  These entries
// must never reach Firebase Auth because auth.getUser("") or auth.getUser(null)
// would produce misleading or crashing results.

describe("collectSeedUserIds: malformed UIDs (falsy userId values are silently skipped)", () => {
  it("returns an empty Map for userId: null", async () => {
    const db = makeDb([[{ userId: null, seedData: true }]]);
    expect((await collectSeedUserIds(db, "categories")).size).toBe(0);
  });

  it("returns an empty Map for userId: '' (empty string)", async () => {
    const db = makeDb([[{ userId: "", seedData: true }]]);
    expect((await collectSeedUserIds(db, "categories")).size).toBe(0);
  });

  it("returns an empty Map for userId: 0 (numeric zero)", async () => {
    const db = makeDb([[{ userId: 0, seedData: true }]]);
    expect((await collectSeedUserIds(db, "categories")).size).toBe(0);
  });

  it("excludes null userIds while still counting a valid userId in the same page", async () => {
    const db = makeDb([[{ userId: null, seedData: true }, { userId: "uid-ok", seedData: true }]]);
    const result = await collectSeedUserIds(db, "categories");
    expect(result.size).toBe(1);
    expect(result.get("uid-ok")).toBe(1);
  });

  it("excludes empty-string userIds while still counting a valid userId", async () => {
    const db = makeDb([
      [
        { userId: "",      seedData: true },
        { userId: "uid-x", seedData: true },
        { userId: "",      seedData: true },
      ],
    ]);
    const result = await collectSeedUserIds(db, "categories");
    expect(result.size).toBe(1);
    expect(result.get("uid-x")).toBe(1);
  });

  it("counts only valid userIds when the page mixes null, '', 0, and a real UID", async () => {
    const db = makeDb([
      [
        { userId: null,    seedData: true },
        { userId: "uid-a", seedData: true },
        { userId: "",      seedData: true },
        { userId: "uid-a", seedData: true },
        { userId: 0,       seedData: true },
      ],
    ]);
    const result = await collectSeedUserIds(db, "categories");
    expect(result.size).toBe(1);
    expect(result.get("uid-a")).toBe(2);
  });
});

describe("verifySeedUsers: malformed UIDs (falsy userId docs never reach Auth)", () => {
  let consoleSpy;
  let stdoutSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy   = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("does not call auth.getUser when all documents have userId: null", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }]]);
    const auth = makeAuth();
    await verifySeedUsers(db, auth, "categories");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("does not call auth.getUser when all documents have userId: ''", async () => {
    const db   = makeDb([[{ userId: "", seedData: true }]]);
    const auth = makeAuth();
    await verifySeedUsers(db, auth, "categories");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("returns true when all documents have a null userId", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }]]);
    const auth = makeAuth();
    expect(await verifySeedUsers(db, auth, "categories")).toBe(true);
  });

  it("prints 'Nothing to verify' when all documents have falsy userIds", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "", seedData: true }]]);
    const auth = makeAuth();
    await verifySeedUsers(db, auth, "categories");
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/Nothing to verify/);
  });
});

// ── 3. "empty file" — service-account JSON that is valid but structurally wrong ─
//
// The GCP_SERVICE_ACCOUNT_JSON env var contains well-formed JSON but lacks the
// required Firebase service-account fields.  The script must exit non-zero and
// must NOT print a success or result line, so CI does not silently pass.

describe("verify-seed-users.mjs (CLI): empty / structurally-invalid service-account JSON", () => {
  it("exits non-zero for an empty JSON object {}", () => {
    const { exitCode } = runScript([], { GCP_SERVICE_ACCOUNT_JSON: "{}" });
    expect(exitCode).not.toBe(0);
  });

  it("does not print a 'Result:' line for an empty JSON object", () => {
    const { stdout } = runScript([], { GCP_SERVICE_ACCOUNT_JSON: "{}" });
    expect(stdout).not.toMatch(/Result:/i);
  });

  it("does not print 'ALL PASS' for an empty JSON object", () => {
    const { stdout } = runScript([], { GCP_SERVICE_ACCOUNT_JSON: "{}" });
    expect(stdout).not.toMatch(/ALL PASS/i);
  });

  it("exits non-zero when the object has type:'service_account' but no private key", () => {
    const incompleteAccount = JSON.stringify({ type: "service_account", project_id: "test" });
    const { exitCode } = runScript([], { GCP_SERVICE_ACCOUNT_JSON: incompleteAccount });
    expect(exitCode).not.toBe(0);
  });

  it("does not print a 'Result:' line for an incomplete service account", () => {
    const incompleteAccount = JSON.stringify({ type: "service_account" });
    const { stdout } = runScript([], { GCP_SERVICE_ACCOUNT_JSON: incompleteAccount });
    expect(stdout).not.toMatch(/Result:/i);
  });
});

// ── 4. "valid file" — mixed falsy / real UIDs, correct outcome reported ────────
//
// When seed documents contain a mix of falsy and real userIds, only the real
// ones are sent to Auth and the PASS/FAIL result accurately reflects them.

describe("verifySeedUsers: valid file (real UIDs correctly checked against Auth)", () => {
  let consoleSpy;
  let stdoutSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy   = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("calls auth.getUser exactly once for the sole valid userId (mixed with nulls)", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "uid-real", seedData: true }]]);
    const auth = makeAuth({ "uid-real": { email: "real@example.com" } });
    await verifySeedUsers(db, auth, "categories");
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledWith("uid-real");
  });

  it("returns true when the valid userId is found in Auth (mixed with null)", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "uid-real", seedData: true }]]);
    const auth = makeAuth({ "uid-real": { email: "real@example.com" } });
    expect(await verifySeedUsers(db, auth, "categories")).toBe(true);
  });

  it("prints PASS output when the valid userId is found in Auth", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "uid-real", seedData: true }]]);
    const auth = makeAuth({ "uid-real": { email: "real@example.com" } });
    await verifySeedUsers(db, auth, "categories");
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-real/);
  });

  it("returns false when the valid userId is missing from Auth (mixed with null)", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);
    expect(await verifySeedUsers(db, auth, "categories")).toBe(false);
  });

  it("prints FAIL / MISMATCH output when the valid userId is missing from Auth", async () => {
    const db   = makeDb([[{ userId: null, seedData: true }, { userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);
    await verifySeedUsers(db, auth, "categories");
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/FAIL|MISMATCH|MISSING/);
    expect(logged).toMatch(/uid-ghost/);
  });
});
