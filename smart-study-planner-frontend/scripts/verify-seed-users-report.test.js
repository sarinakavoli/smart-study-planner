/**
 * verify-seed-users-report.test.js
 *
 * Tests for the PASS / FAIL / MISMATCH report formatting produced by
 * verifyAllCollections() in seed-verify-helper.mjs.
 *
 * All Firebase interactions are replaced with lightweight in-memory mocks so
 * no real credentials or network calls are needed.  Three scenarios are covered:
 *
 *   A) All UIDs found in Auth   → "ALL PASS" summary, returns true
 *   B) Some UIDs missing        → "MISMATCH" summary, returns false
 *   C) No seeded docs found     → "Nothing to verify" message, returns true
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyAllCollections } from "./seed-verify-helper.mjs";

// ── Mock builders ─────────────────────────────────────────────────────────────

/**
 * Builds a mock Firestore that routes collection queries to per-collection
 * page arrays so multiple collections can be scanned independently.
 *
 * @param {Record<string, Array<Array<object>>>} collectionToPages
 */
function makeDbMulti(collectionToPages) {
  const pageIndexes = {};

  return {
    collection: vi.fn((colName) => {
      if (!(colName in pageIndexes)) pageIndexes[colName] = 0;
      const pages = collectionToPages[colName] ?? [[]];

      const makeQueryObj = () => ({
        get: vi.fn(async () => {
          const page = pages[pageIndexes[colName]] ?? [];
          pageIndexes[colName]++;
          const docs = page.map((d) => ({ data: () => d }));
          return { empty: docs.length === 0, docs, size: docs.length };
        }),
        startAfter: vi.fn(function () { return makeQueryObj(); }),
      });

      return {
        where: vi.fn(() => ({
          limit: vi.fn(() => makeQueryObj()),
        })),
      };
    }),
  };
}

/**
 * Builds a minimal mock Firebase Auth instance.
 * @param {Record<string, {email?: string}>} uidToUser  Maps uid → UserRecord shape.
 * @param {string[]} missingUids                         UIDs that should throw auth/user-not-found.
 */
function makeAuth(uidToUser = {}, missingUids = []) {
  return {
    getUser: vi.fn(async (uid) => {
      if (missingUids.includes(uid)) {
        const err = new Error("There is no user record for the provided identifier.");
        err.code = "auth/user-not-found";
        throw err;
      }
      if (Object.prototype.hasOwnProperty.call(uidToUser, uid)) {
        return uidToUser[uid];
      }
      const err = new Error("Unexpected UID: " + uid);
      err.code = "auth/user-not-found";
      throw err;
    }),
  };
}

// ── Shared console / stdout suppression ───────────────────────────────────────

let consoleSpy;
let stdoutSpy;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stdoutSpy  = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  stdoutSpy.mockRestore();
});

// ── Scenario A: all UIDs found in Auth (PASS output, ALL PASS summary) ────────

describe("verifyAllCollections: PASS report — all UIDs found in Auth", () => {
  it("returns true when all seeded UIDs are found in Auth", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
    });
    const auth = makeAuth({
      "uid-alice": { email: "alice@example.com" },
      "uid-bob":   { email: "bob@example.com" },
    });

    expect(await verifyAllCollections(db, auth, ["categories", "tasks"])).toBe(true);
  });

  it("prints 'ALL PASS' in the summary line", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/ALL PASS/);
  });

  it("prints a PASS section listing all found UIDs", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth({
      "uid-alice": { email: "alice@example.com" },
      "uid-bob":   { email: "bob@example.com" },
    });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-alice/);
    expect(logged).toMatch(/uid-bob/);
  });

  it("prints the Auth email for each found UID", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth({
      "uid-alice": { email: "alice@example.com" },
      "uid-bob":   { email: "bob@example.com" },
    });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/alice@example\.com/);
    expect(logged).toMatch(/bob@example\.com/);
  });

  it("prints per-collection document breakdown for found UIDs", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/categories/);
    expect(logged).toMatch(/tasks/);
  });

  it("does not print FAIL or MISMATCH when all UIDs are found", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/\bFAIL\b/);
    expect(logged).not.toMatch(/MISMATCH/);
  });

  it("works for a single-collection run as well", async () => {
    const db = makeDbMulti({ categories: [[{ userId: "uid-alice", seedData: true }]] });
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    const result = await verifyAllCollections(db, auth, ["categories"]);

    expect(result).toBe(true);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/ALL PASS/);
  });

  it("looks up each unique UID exactly once even if it appears in multiple collections", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }, { userId: "uid-bob", seedData: true }]],
    });
    const auth = makeAuth({
      "uid-alice": { email: "alice@example.com" },
      "uid-bob":   { email: "bob@example.com" },
    });

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });
});

// ── Scenario B: some UIDs missing from Auth (MISMATCH output) ────────────────

describe("verifyAllCollections: MISMATCH report — some UIDs missing from Auth", () => {
  it("returns false when at least one seeded UID is missing from Auth", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    expect(await verifyAllCollections(db, auth, ["categories", "tasks"])).toBe(false);
  });

  it("prints 'MISMATCH' in the summary line", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/MISMATCH/);
  });

  it("prints a FAIL section listing missing UIDs", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/FAIL/);
    expect(logged).toMatch(/uid-ghost/);
  });

  it("still prints a PASS section for UIDs that ARE found", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-alice/);
  });

  it("includes the mismatch count and OK count in the result line", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-alice", seedData: true }, { userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-alice", seedData: true }]],
    });
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/1 MISMATCH/);
    expect(logged).toMatch(/1 OK/);
  });

  it("includes HOW TO FIX guidance", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/HOW TO FIX/);
  });

  it("returns false and shows MISMATCH when ALL UIDs are missing", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth({}, ["uid-ghost"]);

    const result = await verifyAllCollections(db, auth, ["categories"]);

    expect(result).toBe(false);
    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/MISMATCH/);
    expect(logged).not.toMatch(/1 OK/);
  });

  it("prints [MISSING] marker for each UID absent from Auth", async () => {
    const db = makeDbMulti({
      categories: [[{ userId: "uid-ghost", seedData: true }]],
      tasks:      [[{ userId: "uid-ghost", seedData: true }]],
    });
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/\[MISSING\]/);
  });
});

// ── Scenario C: no seeded documents found ────────────────────────────────────

describe("verifyAllCollections: empty-data report — no seeded documents found", () => {
  it("returns true when there are no seeded documents in any collection", async () => {
    const db = makeDbMulti({ categories: [[]], tasks: [[]] });
    const auth = makeAuth();

    expect(await verifyAllCollections(db, auth, ["categories", "tasks"])).toBe(true);
  });

  it("prints 'Nothing to verify' when no seeded docs are found", async () => {
    const db = makeDbMulti({ categories: [[]], tasks: [[]] });
    const auth = makeAuth();

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/Nothing to verify/);
  });

  it("does not call auth.getUser when there are no seeded documents", async () => {
    const db = makeDbMulti({ categories: [[]], tasks: [[]] });
    const auth = makeAuth();

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("does not print PASS or FAIL report sections when collection is empty", async () => {
    const db = makeDbMulti({ categories: [[]], tasks: [[]] });
    const auth = makeAuth();

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/PASS — \d/);
    expect(logged).not.toMatch(/FAIL — \d/);
  });

  it("does not print MISMATCH when collection is empty", async () => {
    const db = makeDbMulti({ categories: [[]], tasks: [[]] });
    const auth = makeAuth();

    await verifyAllCollections(db, auth, ["categories", "tasks"]);

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).not.toMatch(/MISMATCH/);
  });

  it("returns true even when an empty single-collection run is requested", async () => {
    const db = makeDbMulti({ categories: [[]] });
    const auth = makeAuth();

    expect(await verifyAllCollections(db, auth, ["categories"])).toBe(true);
  });
});
