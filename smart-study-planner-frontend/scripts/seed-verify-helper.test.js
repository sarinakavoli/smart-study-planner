import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  collectSeedUserIds,
  verifySeedUsers,
  verifySeedUsersOrExit,
} from "./seed-verify-helper.mjs";

// ── Mock builders ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Firestore that serves `pages` in order.
 * Each page is an array of document-data objects.
 * BATCH_SIZE in the helper is 500, so a page with 500 docs triggers another
 * fetch; fewer than 500 ends the loop.
 */
function makeDb(pages) {
  let pageIndex = 0;

  const makeQueryObj = () => {
    const obj = {
      get: vi.fn(async () => {
        const page = pages[pageIndex] ?? [];
        pageIndex++;
        const docs = page.map((d) => ({ data: () => d }));
        return { empty: docs.length === 0, docs, size: docs.length };
      }),
      startAfter: vi.fn(() => makeQueryObj()),
    };
    return obj;
  };

  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => makeQueryObj()),
      })),
    })),
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

// ── collectSeedUserIds ────────────────────────────────────────────────────────

describe("collectSeedUserIds", () => {
  it("returns an empty Map when the collection has no seeded documents", async () => {
    const db = makeDb([[]]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("returns a Map with userId → 1 for a single seeded document", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.get("uid-alice")).toBe(1);
  });

  it("accumulates counts when multiple documents share the same userId", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-alice", seedData: true },
        { userId: "uid-alice", seedData: true },
      ],
    ]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.get("uid-alice")).toBe(3);
  });

  it("tracks multiple distinct userIds independently", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-bob", seedData: true },
        { userId: "uid-alice", seedData: true },
      ],
    ]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.get("uid-alice")).toBe(2);
    expect(result.get("uid-bob")).toBe(1);
    expect(result.size).toBe(2);
  });

  it("skips documents that have no userId field", async () => {
    const db = makeDb([
      [
        { seedData: true },
        { userId: "uid-carol", seedData: true },
      ],
    ]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.size).toBe(1);
    expect(result.get("uid-carol")).toBe(1);
  });

  it("passes the collection name to the Firestore query", async () => {
    const db = makeDb([[]]);

    await collectSeedUserIds(db, "tasks");

    expect(db.collection).toHaveBeenCalledWith("tasks");
  });

  it("queries only documents where seedData == true", async () => {
    const db = makeDb([[]]);
    const collectionSpy = db.collection();
    db.collection.mockReturnValue(collectionSpy);

    await collectSeedUserIds(db, "categories");

    expect(collectionSpy.where).toHaveBeenCalledWith("seedData", "==", true);
  });

  it("fetches a second page when the first page is exactly BATCH_SIZE (500 docs)", async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({
      userId: `uid-${i}`,
      seedData: true,
    }));
    const secondPage = [{ userId: "uid-extra", seedData: true }];

    const db = makeDb([firstPage, secondPage]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.size).toBe(501);
    expect(result.get("uid-extra")).toBe(1);
  });

  it("stops after one page when fewer than BATCH_SIZE docs are returned", async () => {
    const onlyPage = [
      { userId: "uid-only", seedData: true },
    ];
    const db = makeDb([onlyPage]);

    const result = await collectSeedUserIds(db, "categories");

    expect(result.size).toBe(1);
  });
});

// ── verifySeedUsers ───────────────────────────────────────────────────────────

describe("verifySeedUsers", () => {
  let stdoutSpy;
  let consoleSpy;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("returns true when the collection has no seeded documents", async () => {
    const db = makeDb([[]]);
    const auth = makeAuth();

    const result = await verifySeedUsers(db, auth, "categories");

    expect(result).toBe(true);
  });

  it("returns true when all seeded userIds exist in Firebase Auth", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-bob", seedData: true },
      ],
    ]);
    const auth = makeAuth({
      "uid-alice": { email: "alice@example.com" },
      "uid-bob": { email: "bob@example.com" },
    });

    const result = await verifySeedUsers(db, auth, "categories");

    expect(result).toBe(true);
  });

  it("returns false when any seeded userId is missing from Firebase Auth", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-ghost", seedData: true },
      ],
    ]);
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    const result = await verifySeedUsers(db, auth, "categories");

    expect(result).toBe(false);
  });

  it("returns false when ALL seeded userIds are missing from Firebase Auth", async () => {
    const db = makeDb([[{ userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);

    const result = await verifySeedUsers(db, auth, "categories");

    expect(result).toBe(false);
  });

  it("prints a PASS line when a userId is found in Auth", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/PASS/);
    expect(logged).toMatch(/uid-alice/);
  });

  it("prints a FAIL line when a userId is not found in Auth", async () => {
    const db = makeDb([[{ userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/FAIL/);
    expect(logged).toMatch(/uid-ghost/);
    expect(logged).toMatch(/MISSING/);
  });

  it("prints the Auth email for found users", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/alice@example\.com/);
  });

  it("uses '(no email)' when the Auth user record has no email", async () => {
    const db = makeDb([[{ userId: "uid-noemail", seedData: true }]]);
    const auth = makeAuth({ "uid-noemail": {} });

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/\(no email\)/);
  });

  it("prints 'ALL PASS' result when no mismatches are found", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/ALL PASS/);
  });

  it("prints MISMATCH result line when mismatches are found", async () => {
    const db = makeDb([[{ userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/MISMATCH/);
  });

  it("includes HOW TO FIX instructions when there are mismatches", async () => {
    const db = makeDb([[{ userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/HOW TO FIX/);
  });

  it("reports the correct PASS count and FAIL count in the result line", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-ghost", seedData: true },
      ],
    ]);
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/1 MISMATCH/);
    expect(logged).toMatch(/1 OK/);
  });

  it("prints 'Nothing to verify' when there are no seeded documents", async () => {
    const db = makeDb([[]]);
    const auth = makeAuth();

    await verifySeedUsers(db, auth, "categories");

    const logged = consoleSpy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/Nothing to verify/);
  });

  it("looks up each unique userId exactly once in Auth", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-alice", seedData: true },
      ],
    ]);
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifySeedUsers(db, auth, "categories");

    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledWith("uid-alice");
  });

  it("uses process.stdout.write for the scanning progress line", async () => {
    const db = makeDb([[]]);
    const auth = makeAuth();

    await verifySeedUsers(db, auth, "categories");

    expect(stdoutSpy).toHaveBeenCalled();
    const written = stdoutSpy.mock.calls.flat().join("");
    expect(written).toMatch(/Scanning/);
    expect(written).toMatch(/categories/);
  });

  it("re-throws unexpected Auth errors that are not auth/user-not-found", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);
    const auth = {
      getUser: vi.fn().mockRejectedValue(new Error("network failure")),
    };

    await expect(verifySeedUsers(db, auth, "categories")).rejects.toThrow(
      "network failure"
    );
  });
});

// ── verifySeedUsersOrExit ─────────────────────────────────────────────────────

describe("verifySeedUsersOrExit", () => {
  let exitSpy;
  let stdoutSpy;
  let consoleSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("calls process.exit(1) when there are mismatched userIds", async () => {
    const db = makeDb([[{ userId: "uid-ghost", seedData: true }]]);
    const auth = makeAuth({}, ["uid-ghost"]);

    await expect(
      verifySeedUsersOrExit(db, auth, "categories")
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) even when only some userIds are missing", async () => {
    const db = makeDb([
      [
        { userId: "uid-alice", seedData: true },
        { userId: "uid-ghost", seedData: true },
      ],
    ]);
    const auth = makeAuth(
      { "uid-alice": { email: "alice@example.com" } },
      ["uid-ghost"]
    );

    await expect(
      verifySeedUsersOrExit(db, auth, "categories")
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does NOT call process.exit when all userIds are found in Auth", async () => {
    const db = makeDb([[{ userId: "uid-alice", seedData: true }]]);
    const auth = makeAuth({ "uid-alice": { email: "alice@example.com" } });

    await verifySeedUsersOrExit(db, auth, "categories");

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does NOT call process.exit when there are no seeded documents", async () => {
    const db = makeDb([[]]);
    const auth = makeAuth();

    await verifySeedUsersOrExit(db, auth, "categories");

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
