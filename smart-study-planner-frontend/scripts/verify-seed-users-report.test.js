/**
 * verify-seed-users-report.test.js
 *
 * Tests for the PASS / FAIL / MISMATCH report formatting produced by the
 * runVerification() function exported from verify-seed-users.mjs.
 *
 * The module is tested with mocked firebase-admin modules and a mocked
 * seed-verify-helper so no real Firebase credentials or network calls are
 * needed.  Three scenarios are covered:
 *
 *   A) All UIDs found in Auth   → "ALL PASS" summary, return true, exit 0
 *   B) Some UIDs missing        → "MISMATCH" summary, return false, exit 1
 *   C) No seeded docs found     → "Nothing to verify" message, return true, exit 0
 */

import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────
// vi.hoisted runs before static imports, letting us set env vars and spy on
// process.exit before verify-seed-users.mjs evaluates its module-level code.

const { exitSpy } = vi.hoisted(() => {
  process.env.GCP_SERVICE_ACCOUNT_JSON = '{"type":"service_account","project_id":"test-proj"}';
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
  return { exitSpy };
});

// ── Module mocks ──────────────────────────────────────────────────────────────
// Mock firebase-admin/* so the Firebase SDK is never initialised.

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  cert: vi.fn((sa) => sa),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({})),
}));

// Mock the helper so collectSeedUserIds and lookupAuthUser are fully controlled.
// Default: empty collection (no docs) so module-level code exits cleanly on import.
vi.mock("./seed-verify-helper.mjs", () => ({
  collectSeedUserIds: vi.fn(async () => new Map()),
  lookupAuthUser:     vi.fn(async () => null),
}));

// ── Imports (evaluated after mocks are applied) ───────────────────────────────

import { runVerification }               from "./verify-seed-users.mjs";
import { collectSeedUserIds, lookupAuthUser } from "./seed-verify-helper.mjs";

// ── Shared console / stdout suppression ───────────────────────────────────────

let consoleSpy;
let stdoutSpy;

afterAll(() => {
  exitSpy.mockRestore();
});

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stdoutSpy  = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
  exitSpy.mockClear();
  vi.mocked(collectSeedUserIds).mockReset();
  vi.mocked(lookupAuthUser).mockReset();
});

afterEach(() => {
  consoleSpy.mockRestore();
  stdoutSpy.mockRestore();
});

// ── Scenario A: all UIDs found in Auth (PASS output, ALL PASS summary) ────────

describe("runVerification: PASS report — all UIDs found in Auth", () => {
  beforeEach(() => {
    vi.mocked(collectSeedUserIds).mockImplementation(async (_db, col) => {
      if (col === "categories") return new Map([["uid-alice", 3], ["uid-bob", 2]]);
      if (col === "tasks")      return new Map([["uid-alice", 5], ["uid-bob", 1]]);
      return new Map();
    });
    vi.mocked(lookupAuthUser).mockImplementation(async (_auth, uid) => {
      if (uid === "uid-alice") return { email: "alice@example.com" };
      if (uid === "uid-bob")   return { email: "bob@example.com" };
      return null;
    });
  });

  it("returns true when all seeded UIDs are found in Auth", async () => {
    expect(await runVerification({}, {}, ["categories", "tasks"])).toBe(true);
  });

  it("prints 'ALL PASS' in the summary line", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/ALL PASS/);
  });

  it("prints a PASS section listing all found UIDs", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-alice/);
    expect(logged).toMatch(/uid-bob/);
  });

  it("prints the Auth email for each found UID", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/alice@example\.com/);
    expect(logged).toMatch(/bob@example\.com/);
  });

  it("prints per-collection document breakdown for found UIDs", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/categories/);
    expect(logged).toMatch(/tasks/);
  });

  it("does not print FAIL or MISMATCH when all UIDs are found", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/\bFAIL\b/);
    expect(logged).not.toMatch(/MISMATCH/);
  });

  it("works for a single-collection run as well", async () => {
    vi.mocked(collectSeedUserIds).mockResolvedValue(new Map([["uid-alice", 3]]));
    vi.mocked(lookupAuthUser).mockResolvedValue({ email: "alice@example.com" });
    const result = await runVerification({}, {}, ["categories"]);
    expect(result).toBe(true);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/ALL PASS/);
  });

  it("looks up each unique UID exactly once even if it appears in multiple collections", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    expect(vi.mocked(lookupAuthUser)).toHaveBeenCalledTimes(2);
  });
});

// ── Scenario B: some UIDs missing from Auth (MISMATCH output, exit 1) ─────────

describe("runVerification: MISMATCH report — some UIDs missing from Auth", () => {
  beforeEach(() => {
    vi.mocked(collectSeedUserIds).mockImplementation(async (_db, col) => {
      if (col === "categories") return new Map([["uid-alice", 2], ["uid-ghost", 1]]);
      if (col === "tasks")      return new Map([["uid-ghost", 3]]);
      return new Map();
    });
    vi.mocked(lookupAuthUser).mockImplementation(async (_auth, uid) => {
      if (uid === "uid-alice") return { email: "alice@example.com" };
      return null;
    });
  });

  it("returns false when at least one seeded UID is missing from Auth", async () => {
    expect(await runVerification({}, {}, ["categories", "tasks"])).toBe(false);
  });

  it("prints 'MISMATCH' in the summary line", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/MISMATCH/);
  });

  it("prints a FAIL section listing missing UIDs", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/FAIL/);
    expect(logged).toMatch(/uid-ghost/);
  });

  it("still prints a PASS section for UIDs that ARE found", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-alice/);
  });

  it("includes the mismatch count and OK count in the result line", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/1 MISMATCH/);
    expect(logged).toMatch(/1 OK/);
  });

  it("includes HOW TO FIX guidance", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/HOW TO FIX/);
  });

  it("returns false and shows MISMATCH when ALL UIDs are missing", async () => {
    vi.mocked(collectSeedUserIds).mockResolvedValue(new Map([["uid-ghost", 2]]));
    vi.mocked(lookupAuthUser).mockResolvedValue(null);
    const result = await runVerification({}, {}, ["categories"]);
    expect(result).toBe(false);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/MISMATCH/);
    expect(logged).not.toMatch(/1 OK/);
  });

  it("prints [MISSING] marker for each UID absent from Auth", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/\[MISSING\]/);
  });
});

// ── Scenario C: no seeded documents found (empty-data message, exit 0) ─────────

describe("runVerification: empty-data report — no seeded documents found", () => {
  beforeEach(() => {
    vi.mocked(collectSeedUserIds).mockResolvedValue(new Map());
  });

  it("returns true when there are no seeded documents in any collection", async () => {
    expect(await runVerification({}, {}, ["categories", "tasks"])).toBe(true);
  });

  it("prints 'Nothing to verify' when no seeded docs are found", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/Nothing to verify/);
  });

  it("does not call lookupAuthUser when there are no seeded documents", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    expect(vi.mocked(lookupAuthUser)).not.toHaveBeenCalled();
  });

  it("does not print PASS or FAIL report sections when collection is empty", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/PASS — \d/);
    expect(logged).not.toMatch(/FAIL — \d/);
  });

  it("does not print MISMATCH when collection is empty", async () => {
    await runVerification({}, {}, ["categories", "tasks"]);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/MISMATCH/);
  });

  it("returns true even when an empty single-collection run is requested", async () => {
    expect(await runVerification({}, {}, ["categories"])).toBe(true);
  });
});
