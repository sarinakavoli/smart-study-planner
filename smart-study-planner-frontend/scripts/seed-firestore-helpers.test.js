/**
 * seed-firestore-helpers.test.js
 *
 * Unit tests for fetchDeleteDocs and fetchUndoLastDocs in seed-firestore-helpers.mjs.
 *
 * All tests mock the Firestore Admin SDK — no GCP credentials or network calls
 * are required. The mock records which .where() filters were applied and what
 * documents were returned, so we can assert that:
 *   - Global queries omit the userId filter
 *   - Scoped queries add .where("userId", "in", [...]) for the right user IDs
 *   - Large user lists are correctly chunked into groups of ≤10
 *   - Duplicate user IDs are deduplicated before chunking
 */

import { describe, it, expect, vi } from "vitest";
import {
  fetchDeleteDocs,
  fetchUndoLastDocs,
} from "./seed-firestore-helpers.mjs";

// ── Firestore mock factory ────────────────────────────────────────────────────

/**
 * Builds a minimal mock Firestore db.
 *
 * Each call to db.collection().where()…get() is recorded in `queryLog` as
 *   { filters: [{field, op, value}, …], docs: <docsReturned> }
 *
 * @param {object[]} docsToReturn  Array of fake doc snapshots to return from .get()
 * @returns {{ db: object, queryLog: object[] }}
 */
function makeDb(docsToReturn = []) {
  const queryLog = [];

  function makeChain(filters = []) {
    return {
      where(field, op, value) {
        return makeChain([...filters, { field, op, value }]);
      },
      async get() {
        queryLog.push({ filters: [...filters], docs: docsToReturn });
        return { docs: docsToReturn };
      },
    };
  }

  const db = {
    collection: vi.fn(() => makeChain()),
  };

  return { db, queryLog };
}

// ── fetchDeleteDocs ───────────────────────────────────────────────────────────

describe("fetchDeleteDocs — global (userFilterActive=false)", () => {
  it("queries with seedData == true only (no userId filter)", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchDeleteDocs(db, "categories", false, []);

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters).toEqual([
      { field: "seedData", op: "==", value: true },
    ]);
  });

  it("returns the docs from the snapshot", async () => {
    const fakeDocs = [{ id: "doc1" }, { id: "doc2" }];
    const { db } = makeDb(fakeDocs);

    const result = await fetchDeleteDocs(db, "categories", false, []);

    expect(result).toEqual(fakeDocs);
  });

  it("queries the correct collection name", async () => {
    const { db } = makeDb([]);
    await fetchDeleteDocs(db, "tasks", false, []);

    expect(db.collection).toHaveBeenCalledWith("tasks");
  });

  it("does NOT add a userId IN filter when userFilterActive is false", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchDeleteDocs(db, "categories", false, ["uid_a", "uid_b"]);

    const allFilters = queryLog.flatMap((q) => q.filters);
    const userIdFilter = allFilters.find((f) => f.field === "userId");
    expect(userIdFilter).toBeUndefined();
  });
});

describe("fetchDeleteDocs — scoped (userFilterActive=true)", () => {
  it("adds seedData == true AND userId IN [uid] for a single user", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchDeleteDocs(db, "categories", true, ["uid_a"]);

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters).toContainEqual({ field: "seedData", op: "==", value: true });
    expect(queryLog[0].filters).toContainEqual({ field: "userId", op: "in", value: ["uid_a"] });
  });

  it("keeps all users in a single chunk when ≤10 users are given", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = ["u1", "u2", "u3", "u4", "u5"];
    await fetchDeleteDocs(db, "categories", true, userIds);

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters).toContainEqual({
      field: "userId",
      op: "in",
      value: userIds,
    });
  });

  it("splits 11 users into two chunks (10 + 1) to satisfy Firestore IN limit", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = Array.from({ length: 11 }, (_, i) => `uid_${i}`);
    await fetchDeleteDocs(db, "categories", true, userIds);

    expect(queryLog).toHaveLength(2);
    const allFetchedIds = queryLog.flatMap(
      (q) => q.filters.find((f) => f.field === "userId").value
    );
    expect(allFetchedIds).toHaveLength(11);
  });

  it("splits 20 users into two chunks of 10", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = Array.from({ length: 20 }, (_, i) => `uid_${i}`);
    await fetchDeleteDocs(db, "categories", true, userIds);

    expect(queryLog).toHaveLength(2);
    queryLog.forEach((q) => {
      const userFilter = q.filters.find((f) => f.field === "userId");
      expect(userFilter.value).toHaveLength(10);
    });
  });

  it("deduplicates repeated UIDs before chunking", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchDeleteDocs(db, "categories", true, ["uid_a", "uid_b", "uid_a"]);

    expect(queryLog).toHaveLength(1);
    const userFilter = queryLog[0].filters.find((f) => f.field === "userId");
    expect(userFilter.value).toEqual(["uid_a", "uid_b"]);
  });

  it("merges docs from all chunks into a single flat array", async () => {
    const fakeDocs = [{ id: "doc1" }];
    const { db } = makeDb(fakeDocs);
    const userIds = Array.from({ length: 11 }, (_, i) => `uid_${i}`);

    const result = await fetchDeleteDocs(db, "categories", true, userIds);

    expect(result).toEqual([...fakeDocs, ...fakeDocs]);
  });

  it("always includes seedData == true in every chunk query", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = Array.from({ length: 15 }, (_, i) => `uid_${i}`);
    await fetchDeleteDocs(db, "categories", true, userIds);

    for (const q of queryLog) {
      expect(q.filters).toContainEqual({ field: "seedData", op: "==", value: true });
    }
  });
});

// ── fetchUndoLastDocs ─────────────────────────────────────────────────────────

describe("fetchUndoLastDocs — global (userFilterActive=false)", () => {
  it("queries with seedRunId == runId only (no userId filter)", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchUndoLastDocs(db, "categories", "run_abc", false, []);

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters).toEqual([
      { field: "seedRunId", op: "==", value: "run_abc" },
    ]);
  });

  it("uses the exact runId string passed in", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchUndoLastDocs(db, "tasks", "run_2025-01-01T00-00-00-000Z", false, []);

    expect(queryLog[0].filters[0]).toEqual({
      field: "seedRunId",
      op: "==",
      value: "run_2025-01-01T00-00-00-000Z",
    });
  });

  it("queries the correct collection name", async () => {
    const { db } = makeDb([]);
    await fetchUndoLastDocs(db, "tasks", "run_abc", false, []);

    expect(db.collection).toHaveBeenCalledWith("tasks");
  });

  it("does NOT add a userId IN filter when userFilterActive is false", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchUndoLastDocs(db, "categories", "run_abc", false, ["uid_a"]);

    const allFilters = queryLog.flatMap((q) => q.filters);
    const userIdFilter = allFilters.find((f) => f.field === "userId");
    expect(userIdFilter).toBeUndefined();
  });

  it("returns the docs from the snapshot", async () => {
    const fakeDocs = [{ id: "cat_org_math_001" }];
    const { db } = makeDb(fakeDocs);

    const result = await fetchUndoLastDocs(db, "categories", "run_abc", false, []);

    expect(result).toEqual(fakeDocs);
  });
});

describe("fetchUndoLastDocs — scoped (userFilterActive=true)", () => {
  it("adds seedRunId == runId AND userId IN [uid] for a single user", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchUndoLastDocs(db, "categories", "run_abc", true, ["uid_a"]);

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters).toContainEqual({ field: "seedRunId", op: "==", value: "run_abc" });
    expect(queryLog[0].filters).toContainEqual({ field: "userId", op: "in", value: ["uid_a"] });
  });

  it("keeps all users in a single chunk when ≤10 users are given", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = ["u1", "u2", "u3"];
    await fetchUndoLastDocs(db, "categories", "run_abc", true, userIds);

    expect(queryLog).toHaveLength(1);
    const userFilter = queryLog[0].filters.find((f) => f.field === "userId");
    expect(userFilter.value).toEqual(userIds);
  });

  it("splits 11 users into two chunks (10 + 1) to satisfy Firestore IN limit", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = Array.from({ length: 11 }, (_, i) => `uid_${i}`);
    await fetchUndoLastDocs(db, "categories", "run_abc", true, userIds);

    expect(queryLog).toHaveLength(2);
  });

  it("deduplicates repeated UIDs before chunking", async () => {
    const { db, queryLog } = makeDb([]);
    await fetchUndoLastDocs(db, "categories", "run_abc", true, [
      "uid_a",
      "uid_b",
      "uid_a",
    ]);

    expect(queryLog).toHaveLength(1);
    const userFilter = queryLog[0].filters.find((f) => f.field === "userId");
    expect(userFilter.value).toEqual(["uid_a", "uid_b"]);
  });

  it("always includes seedRunId == runId in every chunk query", async () => {
    const { db, queryLog } = makeDb([]);
    const userIds = Array.from({ length: 15 }, (_, i) => `uid_${i}`);
    await fetchUndoLastDocs(db, "categories", "run_abc", true, userIds);

    for (const q of queryLog) {
      expect(q.filters).toContainEqual({ field: "seedRunId", op: "==", value: "run_abc" });
    }
  });

  it("merges docs from all chunks into a single flat array", async () => {
    const fakeDocs = [{ id: "doc1" }];
    const { db } = makeDb(fakeDocs);
    const userIds = Array.from({ length: 11 }, (_, i) => `uid_${i}`);

    const result = await fetchUndoLastDocs(db, "categories", "run_abc", true, userIds);

    expect(result).toEqual([...fakeDocs, ...fakeDocs]);
  });
});
