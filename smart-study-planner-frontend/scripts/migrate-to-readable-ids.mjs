/**
 * migrate-to-readable-ids.mjs
 *
 * One-off migration: re-creates existing task and category documents that use
 * Firestore auto-IDs under the new human-readable ID format introduced in
 * Task #112, and deletes the old documents afterwards.
 *
 * NEW ID FORMATS (produced by this migration)
 * ────────────────────────────────────────────
 *   Tasks      : task_<orgId>_<userId>_<sha256suffix(oldId)>
 *   Categories : cat_<orgId>_<slug>_<sha256suffix(oldId)>
 *
 * NOTE ON ID SUFFIX
 * ─────────────────
 * The production app generates IDs with a random nanoid(10) suffix. This
 * migration uses a deterministic 10-char SHA-256 hash of the old document ID
 * instead. This ensures that re-runs always produce the same new document ID
 * for a given legacy document, making Storage moves and Firestore writes fully
 * idempotent across partial failures. The format (prefix + suffix) is
 * otherwise identical to production IDs.
 *
 * IDEMPOTENCY
 * ───────────
 * Documents whose ID already starts with "task_" or "cat_" are silently
 * skipped. Re-running after a partial failure is safe: already-migrated docs
 * are skipped, and Storage files at the deterministic destination path are
 * detected and their URL recovered without re-copying.
 *
 * ATTACHMENT HANDLING
 * ───────────────────
 * Attachment Storage paths are assumed to follow the pattern:
 *   tasks/<taskId>/attachments/<filename>
 * When a task is migrated, every attachment whose path references the old
 * task ID is moved to the equivalent path under the new task ID. The stored
 * "path" and "url" fields are updated in the new Firestore document.
 *
 * If a Storage move cannot be completed (file missing at source AND
 * destination), the ENTIRE TASK is skipped — the old document is preserved
 * intact and an error is reported. The script exits with code 1 so the
 * operator knows to investigate and retry.
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret
 *   (full JSON content of your Firebase Admin SDK service account key).
 *
 *   Dry run (prints what would happen, writes nothing):
 *     node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs --dry-run
 *
 *   Live run (migrates data):
 *     node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder and the script will
 *   pick it up automatically if GCP_SERVICE_ACCOUNT_JSON is not set.
 *
 * SAFETY TIPS
 * ───────────
 *   • Always do a dry run first to review what will be migrated.
 *   • Back up Firestore before the live run (Firebase Console → Export).
 *   • The script processes one collection at a time so you can Ctrl+C safely
 *     between phases; re-running will skip already-migrated documents.
 *   • Run the optional audit script afterwards to verify all docs migrated.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { randomUUID, createHash } from "crypto";

// ── Helpers copied inline so the script has zero local dependencies ─────────

/** Converts text to a lowercase, URL-safe slug (max 30 chars). */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Returns the personal org ID for a user. */
function personalOrgId(uid) {
  return `org_${uid}`;
}

/**
 * Returns a 10-character URL-safe suffix derived deterministically from a
 * legacy Firestore document ID.
 *
 * WHY DETERMINISTIC?
 * During migration a random nanoid would produce a different new ID on every
 * run.  If Storage files are moved to tasks/<newId>/… but the subsequent
 * Firestore batch commit fails, the next re-run generates a different newId
 * and the "check if destination exists" recovery logic looks in the wrong
 * Storage path — leaving the file stranded and the attachment metadata stale.
 *
 * By deriving the suffix from a SHA-256 hash of the old doc ID, the same
 * legacy document always maps to the same new document ID across all runs,
 * making both the Firestore and Storage operations fully idempotent.
 *
 * The base64url encoding uses the alphabet A-Za-z0-9-_ (URL-safe and
 * compatible with Firestore document ID rules). SHA-256 collision probability
 * is negligible for any realistic dataset.
 *
 * @param {string} oldDocId  Legacy Firestore auto-ID
 * @returns {string}  10 URL-safe characters
 */
function deterministicSuffix(oldDocId) {
  return createHash("sha256").update(oldDocId).digest("base64url").slice(0, 10);
}

/** Migration-only task ID using a deterministic suffix for idempotency. */
function migrationTaskId(orgId, userId, oldDocId) {
  return `task_${orgId}_${userId}_${deterministicSuffix(oldDocId)}`;
}

/** Migration-only category ID using a deterministic suffix for idempotency. */
function migrationCategoryId(orgId, name, oldDocId) {
  return `cat_${orgId}_${slugify(name)}_${deterministicSuffix(oldDocId)}`;
}

// ── Config ──────────────────────────────────────────────────────────────────

const STORAGE_BUCKET     = "dev-sarina.firebasestorage.app";
const FIRESTORE_DATABASE = "smart-study";
// Each migrated document requires 2 Firestore ops (set new + delete old).
// Firestore hard cap is 500 ops per batch, so max chunk = 250 documents.
const BATCH_SIZE         = 250;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("DRY-RUN mode — no data will be written or deleted.\n");
}

// ── Load service account ─────────────────────────────────────────────────────

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
  storageBucket: STORAGE_BUCKET,
});

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DATABASE });
const bucket = admin.storage().bucket();

// ── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Constructs a Firebase Storage download URL from a bucket path and token.
 * Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>
 */
function buildDownloadUrl(bucketName, storagePath, token) {
  const encodedPath = encodeURIComponent(storagePath);
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}` +
    `?alt=media&token=${token}`
  );
}

/**
 * Moves a Storage file from oldPath to newPath.
 * Returns the new download URL, or null if the file does not exist.
 *
 * Strategy:
 *   1. Copy the file to the new path (preserves metadata & content type).
 *   2. Read the download token from the new file's metadata.
 *   3. If no token exists, generate one and patch metadata.
 *   4. Delete the original file.
 *   5. Return the constructed download URL.
 */
async function moveStorageFile(oldPath, newPath, dryRun) {
  const srcFile  = bucket.file(oldPath);
  const destFile = bucket.file(newPath);

  let srcExists;
  try {
    [srcExists] = await srcFile.exists();
  } catch (err) {
    console.warn(`  WARN: could not check existence of ${oldPath}: ${err.message}`);
    return null;
  }

  if (!srcExists) {
    // The source is gone. This can happen when a previous run moved the file
    // successfully but the subsequent Firestore batch commit failed, leaving
    // the old doc intact. Check whether the destination already exists so we
    // can recover the URL and remain idempotent.
    let destExists;
    try {
      [destExists] = await destFile.exists();
    } catch (err) {
      console.warn(`  WARN: could not check destination ${newPath}: ${err.message}`);
      return null;
    }

    if (destExists) {
      console.log(`    destination already exists (prior partial run): ${newPath}`);
      try {
        const [meta] = await destFile.getMetadata();
        const token = meta.metadata && meta.metadata.firebaseStorageDownloadTokens;
        if (token) {
          return buildDownloadUrl(STORAGE_BUCKET, newPath, token);
        }
        // Token missing — regenerate it
        const newToken = randomUUID();
        await destFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: newToken } });
        return buildDownloadUrl(STORAGE_BUCKET, newPath, newToken);
      } catch (err) {
        console.error(`  ERROR reading destination metadata ${newPath}: ${err.message}`);
        return null;
      }
    }

    console.warn(`  WARN: Storage file not found at source or destination: ${oldPath}`);
    return null;
  }

  if (dryRun) {
    console.log(`    [DRY-RUN] would move Storage: ${oldPath} → ${newPath}`);
    return `DRY_RUN_URL:${newPath}`;
  }

  try {
    // Copy to new location
    await srcFile.copy(destFile);

    // Read metadata of the new file to get (or set) the download token
    const [meta] = await destFile.getMetadata();
    let token =
      meta.metadata && meta.metadata.firebaseStorageDownloadTokens;

    if (!token) {
      // Generate a UUID-like token and patch the metadata
      token = randomUUID();
      await destFile.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
      });
    }

    // Delete the original file
    await srcFile.delete();

    return buildDownloadUrl(STORAGE_BUCKET, newPath, token);
  } catch (err) {
    console.error(`  ERROR moving Storage file ${oldPath} → ${newPath}: ${err.message}`);
    return null;
  }
}

// ── Task migration ───────────────────────────────────────────────────────────

async function migrateTasks() {
  console.log("══════════════════════════════════════════");
  console.log("Phase 1: Migrating tasks");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("tasks").get();
  console.log(`Total task documents found: ${snapshot.size}`);

  const legacy = snapshot.docs.filter((d) => !d.id.startsWith("task_"));
  const alreadyMigrated = snapshot.size - legacy.length;
  console.log(`Already in new format:      ${alreadyMigrated}`);
  console.log(`Needs migration:            ${legacy.length}\n`);

  if (legacy.length === 0) {
    console.log("Nothing to migrate for tasks.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  // Process in batches to respect Firestore write limits.
  // Each document needs 2 ops (set + delete), so chunk size <= 250 keeps us
  // under Firestore's hard cap of 500 operations per batch.
  for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
    const chunk = legacy.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(legacy.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} tasks)...`);

    // Track how many docs were successfully queued in this batch so we only
    // credit them as migrated after the commit succeeds.
    let batchQueued = 0;

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data  = docSnap.data();

      // Derive org and generate new ID
      const userId = data.userId;
      if (!userId) {
        console.warn(`  SKIP: task ${oldId} has no userId — cannot generate new ID`);
        skipped++;
        continue;
      }

      const orgId  = data.organizationId || personalOrgId(userId);
      // Use a deterministic suffix (SHA-256 of oldId) so re-runs always resolve
      // to the same destination ID and Storage paths remain consistent.
      const newId  = migrationTaskId(orgId, userId, oldId);

      console.log(`  ${oldId}`);
      console.log(`    → ${newId}`);

      // ── Handle attachments ──────────────────────────────────────────────
      let attachments = Array.isArray(data.attachments) ? [...data.attachments] : [];
      let attachmentMoveFailed = false;
      if (attachments.length > 0) {
        const updatedAttachments = [];
        for (const att of attachments) {
          if (att.path && att.path.startsWith(`tasks/${oldId}/`)) {
            const newPath = att.path.replace(
              `tasks/${oldId}/`,
              `tasks/${newId}/`
            );
            const newUrl = await moveStorageFile(att.path, newPath, DRY_RUN);
            if (newUrl !== null) {
              updatedAttachments.push({ ...att, path: newPath, url: newUrl });
              console.log(`    attachment moved: ${att.path} → ${newPath}`);
            } else {
              // Storage move failed — the task MUST NOT be migrated with a
              // stale attachment path pointing to the old doc ID. Skip the
              // entire task so the old doc stays intact and can be retried.
              console.error(
                `  ERROR: could not move attachment ${att.path} for task ${oldId}` +
                ` — skipping this task (will retry on next run)`
              );
              attachmentMoveFailed = true;
              break;
            }
          } else {
            // Path does not reference old ID — leave unchanged
            updatedAttachments.push(att);
          }
        }
        if (attachmentMoveFailed) {
          errors++;
          continue;
        }
        attachments = updatedAttachments;
      }

      // ── Build new document ──────────────────────────────────────────────
      const newData = {
        ...data,
        organizationId: orgId,
        readableId:     newId,
        attachments,
      };

      if (!DRY_RUN) {
        try {
          const newRef = db.collection("tasks").doc(newId);
          batch.set(newRef, newData);
          batch.delete(docSnap.ref);
        } catch (err) {
          console.error(`  ERROR queuing task ${oldId}: ${err.message}`);
          errors++;
          continue;
        }
      }

      batchQueued++;
    }

    if (!DRY_RUN) {
      try {
        await batch.commit();
        // Only credit the docs as migrated once the commit is confirmed.
        migrated += batchQueued;
        console.log(`  Batch ${batchNum} committed (${batchQueued} tasks).\n`);
      } catch (err) {
        console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
        errors += batchQueued; // the whole batch failed
      }
    } else {
      // In dry-run mode there is no commit, so count queued docs as "would migrate"
      migrated += batchQueued;
    }
  }

  console.log(`Tasks — migrated: ${migrated}, skipped: ${skipped}, errors: ${errors}\n`);
  return { migrated, skipped, errors };
}

// ── Category migration ───────────────────────────────────────────────────────

async function migrateCategories() {
  console.log("══════════════════════════════════════════");
  console.log("Phase 2: Migrating categories");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("categories").get();
  console.log(`Total category documents found: ${snapshot.size}`);

  const legacy = snapshot.docs.filter((d) => !d.id.startsWith("cat_"));
  const alreadyMigrated = snapshot.size - legacy.length;
  console.log(`Already in new format:          ${alreadyMigrated}`);
  console.log(`Needs migration:                ${legacy.length}\n`);

  if (legacy.length === 0) {
    console.log("Nothing to migrate for categories.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
    const chunk = legacy.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(legacy.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} categories)...`);

    let batchQueued = 0;

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data  = docSnap.data();

      const userId = data.userId;
      if (!userId) {
        console.warn(`  SKIP: category ${oldId} has no userId — cannot generate new ID`);
        skipped++;
        continue;
      }

      const name   = data.name || "uncategorized";
      const orgId  = data.organizationId || personalOrgId(userId);
      // Deterministic suffix (SHA-256 of oldId) ensures re-runs produce the same newId.
      const newId  = migrationCategoryId(orgId, name, oldId);

      console.log(`  ${oldId}`);
      console.log(`    → ${newId}`);

      const newData = {
        ...data,
        organizationId: orgId,
        readableId:     newId,
      };

      if (!DRY_RUN) {
        try {
          const newRef = db.collection("categories").doc(newId);
          batch.set(newRef, newData);
          batch.delete(docSnap.ref);
        } catch (err) {
          console.error(`  ERROR queuing category ${oldId}: ${err.message}`);
          errors++;
          continue;
        }
      }

      batchQueued++;
    }

    if (!DRY_RUN) {
      try {
        await batch.commit();
        // Only credit docs as migrated after commit succeeds.
        migrated += batchQueued;
        console.log(`  Batch ${batchNum} committed (${batchQueued} categories).\n`);
      } catch (err) {
        console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
        errors += batchQueued; // the whole batch failed
      }
    } else {
      migrated += batchQueued;
    }
  }

  console.log(`Categories — migrated: ${migrated}, skipped: ${skipped}, errors: ${errors}\n`);
  return { migrated, skipped, errors };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Smart Study Planner — Readable ID Migration");
  console.log(`Database : ${FIRESTORE_DATABASE}`);
  console.log(`Bucket   : ${STORAGE_BUCKET}`);
  console.log(`Mode     : ${DRY_RUN ? "DRY-RUN (no changes)" : "LIVE"}\n`);

  const taskResult     = await migrateTasks();
  const categoryResult = await migrateCategories();

  console.log("══════════════════════════════════════════");
  console.log("Summary");
  console.log("══════════════════════════════════════════");
  console.log(
    `Tasks      — migrated: ${taskResult.migrated}, ` +
    `skipped: ${taskResult.skipped}, errors: ${taskResult.errors}`
  );
  console.log(
    `Categories — migrated: ${categoryResult.migrated}, ` +
    `skipped: ${categoryResult.skipped}, errors: ${categoryResult.errors}`
  );

  const totalErrors = taskResult.errors + categoryResult.errors;
  if (DRY_RUN) {
    console.log("\nThis was a dry run. Re-run without --dry-run to apply changes.");
  } else if (totalErrors === 0) {
    console.log("\nMigration complete. All documents have been re-created under new IDs.");
    console.log("This script is idempotent — re-running it now is a no-op.");
  } else {
    console.log(
      `\nMigration finished with ${totalErrors} error(s). ` +
      "Check the output above for details, then re-run to retry failed documents."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
