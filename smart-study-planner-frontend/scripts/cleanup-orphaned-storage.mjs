/**
 * Orphaned Storage File Cleanup Script
 * =====================================
 * Purpose: Delete files that exist in Firebase Storage under a task's attachment
 * folder but are no longer referenced in the Firestore task document.
 *
 * This covers leftovers from a broken replace flow where:
 *   1. The new file was uploaded to Storage
 *   2. Firestore was updated to point to the new file
 *   3. The old file was never deleted (app crashed, network dropped, etc.)
 *
 * --- QUICK OPTION (no script needed) ---
 * If you are logged into the app in your browser, open DevTools console and run:
 *
 *   await cleanupOrphanedStorageFiles("YOUR_TASK_ID_HERE")
 *
 * This uses the function already built into the app.
 *
 * --- SCRIPT OPTION (requires service account) ---
 * Prerequisites:
 *   1. Install firebase-admin:
 *        cd smart-study-planner-frontend && npm install --save-dev firebase-admin
 *
 *   2. Download a service account key from Firebase Console:
 *        Firebase Console → Project Settings → Service accounts → Generate new private key
 *        Save it as: smart-study-planner-frontend/scripts/serviceAccountKey.json
 *        (Never commit this file to git — it is already listed in .gitignore below)
 *
 * Usage:
 *   Dry run (lists orphans, deletes nothing):
 *     node scripts/cleanup-orphaned-storage.mjs <taskId>
 *
 *   Live run (actually deletes orphans):
 *     node scripts/cleanup-orphaned-storage.mjs <taskId> --force
 *
 *   Scan and clean ALL tasks (use with caution):
 *     node scripts/cleanup-orphaned-storage.mjs --all
 *     node scripts/cleanup-orphaned-storage.mjs --all --force
 */

import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVICE_ACCOUNT_PATH = join(__dirname, "serviceAccountKey.json");
const PROJECT_ID = "dev-sarina";
const STORAGE_BUCKET = "dev-sarina.firebasestorage.app";
const FIRESTORE_DATABASE = "smart-study";

// ─── Validate environment ─────────────────────────────────────────────────────

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`
ERROR: Service account key not found at:
  ${SERVICE_ACCOUNT_PATH}

Download it from:
  Firebase Console → Project Settings → Service accounts → Generate new private key

Save it as serviceAccountKey.json in the scripts/ folder, then re-run this script.
`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

// ─── Dynamic import of firebase-admin ────────────────────────────────────────

let admin;
try {
  const require = createRequire(import.meta.url);
  admin = require("firebase-admin");
} catch {
  console.error(`
ERROR: firebase-admin is not installed.

Run:
  cd smart-study-planner-frontend && npm install --save-dev firebase-admin

Then re-run this script.
`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: STORAGE_BUCKET,
});

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DATABASE });
const bucket = admin.storage().bucket();

// ─── Parse arguments ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes("--force");
const scanAll = args.includes("--all");
const taskId = args.find((a) => !a.startsWith("--"));

if (!scanAll && !taskId) {
  console.error(`
Usage:
  node scripts/cleanup-orphaned-storage.mjs <taskId>          # dry run for one task
  node scripts/cleanup-orphaned-storage.mjs <taskId> --force  # delete orphans for one task
  node scripts/cleanup-orphaned-storage.mjs --all             # dry run for all tasks
  node scripts/cleanup-orphaned-storage.mjs --all --force     # delete orphans for all tasks
`);
  process.exit(1);
}

if (force) {
  console.log("⚠  --force is set. Orphaned files WILL be permanently deleted.\n");
} else {
  console.log("ℹ  Dry-run mode. No files will be deleted. Pass --force to delete.\n");
}

// ─── Core cleanup function ────────────────────────────────────────────────────

async function cleanupTask(id) {
  console.log(`\n── Task: ${id}`);

  // 1. List all files in Storage for this task
  const prefix = `tasks/${id}/attachments/`;
  const [storageFiles] = await bucket.getFiles({ prefix });

  if (storageFiles.length === 0) {
    console.log("   Storage: (empty)");
    return { taskId: id, storageCount: 0, orphanCount: 0, deleted: 0 };
  }

  console.log(`   Storage files (${storageFiles.length}):`);
  storageFiles.forEach((f) => console.log(`     ${f.name}`));

  // 2. Fetch the task document from Firestore
  const taskDoc = await db.collection("tasks").doc(id).get();

  let referencedPaths = [];
  if (!taskDoc.exists) {
    console.log("   Firestore: task document NOT FOUND — treating all storage files as orphans");
  } else {
    const data = taskDoc.data();
    const attachments = data.attachments || [];
    referencedPaths = attachments.map((a) => a.path).filter(Boolean);

    console.log(`   Firestore attachments (${attachments.length}):`);
    if (attachments.length === 0) {
      console.log("     (none — attachments array is empty)");
    } else {
      attachments.forEach((a) => console.log(`     ${a.path || "(no path)"}`));
    }
  }

  // 3. Identify orphans
  const orphans = storageFiles.filter((f) => !referencedPaths.includes(f.name));

  if (orphans.length === 0) {
    console.log("   ✓ No orphaned files found for this task.");
    return { taskId: id, storageCount: storageFiles.length, orphanCount: 0, deleted: 0 };
  }

  console.log(`   Orphaned files (${orphans.length}):`);
  orphans.forEach((f) => console.log(`     ${f.name}`));

  // 4. Delete or report
  let deleted = 0;
  if (force) {
    for (const file of orphans) {
      try {
        await file.delete();
        console.log(`   ✓ Deleted: ${file.name}`);
        deleted++;
      } catch (err) {
        console.error(`   ✗ Failed to delete ${file.name}: ${err.message}`);
      }
    }
  } else {
    console.log(`   (skipping deletion — dry-run mode)`);
  }

  return { taskId: id, storageCount: storageFiles.length, orphanCount: orphans.length, deleted };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = [];

  if (scanAll) {
    console.log("Scanning all tasks in Firestore...");
    const snapshot = await db.collection("tasks").get();
    console.log(`Found ${snapshot.size} task(s).`);

    for (const doc of snapshot.docs) {
      const result = await cleanupTask(doc.id);
      results.push(result);
    }
  } else {
    const result = await cleanupTask(taskId);
    results.push(result);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const totalStorage = results.reduce((s, r) => s + r.storageCount, 0);
  const totalOrphans = results.reduce((s, r) => s + r.orphanCount, 0);
  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);

  console.log("\n═══════════════════════════════════");
  console.log("Summary");
  console.log("═══════════════════════════════════");
  console.log(`Tasks scanned:        ${results.length}`);
  console.log(`Total storage files:  ${totalStorage}`);
  console.log(`Orphaned files found: ${totalOrphans}`);
  if (force) {
    console.log(`Orphaned files deleted: ${totalDeleted}`);
  } else {
    console.log(`Orphaned files deleted: 0 (dry-run — re-run with --force to delete)`);
  }
  console.log("═══════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
