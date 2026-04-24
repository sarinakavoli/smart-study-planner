/**
 * delete-task-counters.mjs
 *
 * One-time migration: deletes every document in the `task_counters` Firestore
 * collection, which was used by the old sequential task ID system.
 *
 * WHY THIS IS NEEDED
 * ──────────────────
 * Task IDs are now generated locally (user prefix + slugs + random suffix)
 * without touching Firestore.  The `task_counters` collection is no longer
 * written to, so the documents it contains are orphaned and serve no purpose.
 * Removing them reclaims storage and prevents confusion for future developers.
 *
 * WHAT IT DOES
 * ────────────
 * Fetches every document in `task_counters` in batches of up to 500 and
 * deletes them.  Supports a --dry-run flag that lists what would be deleted
 * without actually removing anything.
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   GCP_SERVICE_ACCOUNT_JSON must be set as a Replit Secret.
 *
 *   Dry run (no deletes):
 *     node smart-study-planner-frontend/scripts/delete-task-counters.mjs --dry-run
 *
 *   Live run:
 *     node smart-study-planner-frontend/scripts/delete-task-counters.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder, then run as above.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Config ──────────────────────────────────────────────────────────────────

const FIRESTORE_DATABASE = "smart-study";
const BATCH_SIZE = 500;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("DRY-RUN mode — no data will be deleted.\n");
}

// ── Load service account ────────────────────────────────────────────────────

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

// ── Initialise firebase-admin ────────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("Deleting all documents in task_counters collection");
  console.log("══════════════════════════════════════════════════\n");

  const snapshot = await db.collection("task_counters").get();

  if (snapshot.empty) {
    console.log("task_counters collection is already empty — nothing to delete.");
    return;
  }

  console.log(`Found ${snapshot.size} document(s) to delete.\n`);

  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} document(s))...`);

    if (DRY_RUN) {
      for (const doc of chunk) {
        console.log(`  [DRY-RUN] would delete task_counters/${doc.id}`);
      }
      continue;
    }

    const batch = db.batch();
    for (const doc of chunk) {
      console.log(`  Deleting task_counters/${doc.id}`);
      batch.delete(doc.ref);
    }

    try {
      await batch.commit();
      console.log(`  Batch ${batchNum} committed.\n`);
    } catch (err) {
      console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
      process.exit(1);
    }
  }

  if (!DRY_RUN) {
    console.log(`\nDone — deleted ${snapshot.size} document(s) from task_counters.`);
  } else {
    console.log(`\nDry run complete — ${snapshot.size} document(s) would have been deleted.`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
