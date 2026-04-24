/**
 * seed-counts-helper.mjs
 *
 * Shared helper for updating the .seed-counts.json file.
 * Exported so it can be unit-tested independently of the CLI scripts.
 */

import { readFileSync, writeFileSync } from "fs";

/**
 * Updates the seed-counts JSON file at `countsPath` with the count for
 * `collection`.  Creates the file if it doesn't exist yet; merges cleanly
 * with any existing collection entries.  A corrupted file is treated as
 * missing — the function starts fresh rather than crashing.
 *
 * @param {string} countsPath  Absolute path to the .seed-counts.json file.
 * @param {string} collection  Firestore collection name (key in the JSON).
 * @param {number} count       Number of documents seeded in this run.
 */
export function updateSeedCounts(countsPath, collection, count) {
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(countsPath, "utf8"));
  } catch {
    // File doesn't exist yet or is corrupted — start fresh.
  }
  existing[collection] = { count, updatedAt: new Date().toISOString() };
  writeFileSync(countsPath, JSON.stringify(existing, null, 2));
}
