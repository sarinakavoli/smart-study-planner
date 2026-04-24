/**
 * sync-task-counters.mjs
 *
 * One-off migration: reads every task document in the `tasks` collection,
 * extracts the numeric counter from its ID, and ensures the corresponding
 * document in `task_counters` reflects the maximum counter seen for each
 * (orgId, categorySlug, titleSlug) combination.
 *
 * WHY THIS IS NEEDED
 * ──────────────────
 * The atomic `task_counters` documents were introduced after some tasks were
 * already written to Firestore.  Counter documents for those pre-existing
 * tasks do not exist, so on first use the counter starts at 001 — risking
 * collisions with the documents that are already there.
 *
 * WHAT IT DOES
 * ────────────
 * For every task whose ID matches the refined format
 *   task_<categorySlug>_<titleSlug>_<NNN>
 * the script:
 *   1. Parses categorySlug, titleSlug, and the numeric counter from the ID.
 *   2. Reads organizationId (or derives it from userId) to build the counter
 *      document path: task_counters/<orgId>_<categorySlug>_<titleSlug>
 *   3. Tracks the maximum counter per (orgId, categorySlug, titleSlug) group.
 *   4. Writes a `{ count: <max> }` document for each group, only if the
 *      stored count is lower than what was found in the tasks collection.
 *
 * Tasks whose IDs do not match the refined format are skipped with a warning.
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   GCP_SERVICE_ACCOUNT_JSON must be set as a Replit Secret.
 *
 *   Dry run (no writes):
 *     node smart-study-planner-frontend/scripts/sync-task-counters.mjs --dry-run
 *
 *   Live run:
 *     node smart-study-planner-frontend/scripts/sync-task-counters.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder, then run as above.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Config ─────────────────────────────────────────────────────────────────────

const FIRESTORE_DATABASE = "smart-study";
const BATCH_SIZE = 500;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("DRY-RUN mode — no data will be written.\n");
}

// ── Regex for valid refined task IDs ──────────────────────────────────────────

/**
 * Matches: task_<categorySlug>_<titleSlug>_<NNN>
 * Slugs: lowercase alphanumeric + hyphens, no underscores.
 * Counter: one or more digits.
 *
 * Capture groups:
 *   1 → categorySlug
 *   2 → titleSlug
 *   3 → numeric counter string (e.g. "002")
 */
const TASK_ID_RE = /^task_([a-z0-9][a-z0-9-]*)_([a-z0-9][a-z0-9-]*)_(\d+)$/;

// ── Load service account ──────────────────────────────────────────────────────

let serviceAccount;

const envJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (envJson) {
  serviceAccount = JSON.parse(envJson);
  console.log("Using service account from GCP_SERVICE_ACCOUNT_JSON env var.\n");
} else {
  const keyPath = join(__dirname, "serviceAccountKey.json");
  if (!existsSync(keyPath)) {
    console.error(
      "ERROR: No service account credentials found.\n" +
      "Either set GCP_SERVICE_ACCOUNT_JSON as a Replit Secret, or save your\n" +
      "Firebase service account key as scripts/serviceAccountKey.json.\n"
    );
    process.exit(1);
  }
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
  console.log(`Using service account from ${keyPath}\n`);
}

// ── Initialise firebase-admin ─────────────────────────────────────────────────

const require = createRequire(import.meta.url);
let admin;
try {
  admin = require("firebase-admin");
} catch {
  console.error(
    "ERROR: firebase-admin is not installed.\n" +
    "Run:  npm install firebase-admin  (from the project root)\n"
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DATABASE });

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("Syncing task_counters from existing tasks");
  console.log("══════════════════════════════════════════\n");

  const snapshot = await db.collection("tasks").get();
  console.log(`Total task documents found: ${snapshot.size}\n`);

  /**
   * maxByCounterDocId  Map<counterDocId, number>
   * Tracks the highest counter seen for each (orgId, categorySlug, titleSlug).
   */
  const maxByCounterDocId = new Map();

  let parsed = 0;
  let skipped = 0;

  for (const docSnap of snapshot.docs) {
    const taskId = docSnap.id;
    const match = TASK_ID_RE.exec(taskId);

    if (!match) {
      console.warn(`  SKIP (non-refined ID): ${taskId}`);
      skipped++;
      continue;
    }

    const [, categorySlug, titleSlug, counterStr] = match;
    const counter = parseInt(counterStr, 10);

    const data = docSnap.data();
    const userId = data.userId;
    const orgId = data.organizationId || (userId ? `org_${userId}` : null);

    if (!orgId) {
      console.warn(
        `  SKIP (no organizationId or userId): ${taskId}`
      );
      skipped++;
      continue;
    }

    const counterDocId = `${orgId}_${categorySlug}_${titleSlug}`;
    const currentMax = maxByCounterDocId.get(counterDocId) ?? 0;
    if (counter > currentMax) {
      maxByCounterDocId.set(counterDocId, counter);
    }

    parsed++;
  }

  console.log(`Parsed:  ${parsed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Unique counter documents to sync: ${maxByCounterDocId.size}\n`);

  if (maxByCounterDocId.size === 0) {
    console.log("Nothing to write — no counter documents needed.\n");
    return;
  }

  const entries = [...maxByCounterDocId.entries()];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} counter documents)...`);

    const batch = db.batch();

    for (const [counterDocId, maxCount] of chunk) {
      const counterRef = db.collection("task_counters").doc(counterDocId);

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] would write task_counters/${counterDocId} → { count: ${maxCount} }`);
        continue;
      }

      const existing = await counterRef.get();
      const storedCount = existing.exists && typeof existing.data().count === "number"
        ? existing.data().count
        : 0;

      if (storedCount >= maxCount) {
        console.log(
          `  task_counters/${counterDocId}: stored count ${storedCount} >= ${maxCount}, no update needed.`
        );
        continue;
      }

      console.log(
        `  task_counters/${counterDocId}: ${storedCount} → ${maxCount}`
      );
      batch.set(counterRef, { count: maxCount }, { merge: true });
    }

    if (!DRY_RUN) {
      try {
        await batch.commit();
        console.log(`  Batch ${batchNum} committed.\n`);
      } catch (err) {
        console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
