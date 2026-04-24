/**
 * seed-firestore-helpers.mjs
 *
 * Shared Firestore query helpers used by seed-categories.mjs and seed-tasks.mjs.
 * Extracted into their own module so the query logic can be unit-tested with a
 * mocked Firestore without needing real Firebase credentials.
 */

/**
 * Fetches all documents to delete in a scoped or global seed-data purge.
 *
 * - When userFilterActive is false: queries where seedData == true (global)
 * - When userFilterActive is true : queries where seedData == true AND
 *   userId IN [userIds] (chunked into groups of 10 to respect Firestore limits)
 *
 * @param {object}   db              Firestore Admin SDK db instance
 * @param {string}   collection      Collection name ("categories" | "tasks")
 * @param {boolean}  userFilterActive Whether to scope the query to specific users
 * @param {string[]} userIds         UIDs to scope to (used when userFilterActive)
 * @returns {Promise<object[]>}      Array of Firestore document snapshots
 */
export async function fetchDeleteDocs(db, collection, userFilterActive, userIds) {
  if (!userFilterActive) {
    const snap = await db
      .collection(collection)
      .where("seedData", "==", true)
      .get();
    return snap.docs;
  }

  const uniqueIds = [...new Set(userIds)];
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    chunks.push(uniqueIds.slice(i, i + 10));
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection(collection)
        .where("seedData", "==", true)
        .where("userId", "in", chunk)
        .get()
    )
  );
  return snaps.flatMap((s) => s.docs);
}

/**
 * Fetches all documents belonging to a specific seed run, optionally filtered
 * to specific users.
 *
 * - When userFilterActive is false: queries where seedRunId == runId (global)
 * - When userFilterActive is true : queries where seedRunId == runId AND
 *   userId IN [userIds] (chunked into groups of 10)
 *
 * @param {object}   db              Firestore Admin SDK db instance
 * @param {string}   collection      Collection name ("categories" | "tasks")
 * @param {string}   runId           The seed run ID to match
 * @param {boolean}  userFilterActive Whether to scope the query to specific users
 * @param {string[]} userIds         UIDs to scope to (used when userFilterActive)
 * @returns {Promise<object[]>}      Array of Firestore document snapshots
 */
export async function fetchUndoLastDocs(db, collection, runId, userFilterActive, userIds) {
  if (!userFilterActive) {
    const snap = await db
      .collection(collection)
      .where("seedRunId", "==", runId)
      .get();
    return snap.docs;
  }

  const uniqueIds = [...new Set(userIds)];
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    chunks.push(uniqueIds.slice(i, i + 10));
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection(collection)
        .where("seedRunId", "==", runId)
        .where("userId", "in", chunk)
        .get()
    )
  );
  return snaps.flatMap((s) => s.docs);
}
