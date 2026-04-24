/**
 * migrate-to-readable-ids.mjs
 *
 * One-off migration: re-creates existing task and category documents that use
 * Firestore auto-IDs under the new human-readable ID format, and deletes the
 * old documents afterwards.
 *
 * NEW ID FORMATS
 * ──────────────
 *   Categories : cat_<orgId>_<categorySlug>_<hash>
 *     Examples : cat_org_abc123_work_A1B2C3D4E5
 *
 *   Tasks      : task_<orgId>_<userId>_<hash>
 *     Examples : task_org_abc123_abc123_A1B2C3D4E5
 *
 *   orgId = "org_<uid>" (the personal org ID, same as the organizationId field).
 *   hash  = first 10 chars of base64url(SHA-256(oldDocId)) — deterministic
 *           across reruns, effectively collision-free in practice.
 *
 * IDEMPOTENCY
 * ───────────
 * Documents whose ID already starts with "task_" or "cat_" are silently
 * skipped. Re-running after a partial failure is safe: the new ID is derived
 * deterministically from the old document ID via SHA-256 (first 10 chars of
 * base64url). The same old document always maps to the same new ID, so rerun
 * is a no-op for already-migrated docs and correctly retries any that were
 * left in the old format due to a batch failure.
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

/** Returns the personal org ID for a user (used for organizationId field). */
function personalOrgId(uid) {
  return `org_${uid}`;
}

/**
 * Returns a 10-character base64url-encoded SHA-256 hash of the given string.
 * Used to derive a deterministic, stable suffix from the old document ID so
 * that the migration is fully idempotent: the same old doc always maps to the
 * same new ID, even across partial-failure reruns where storage files may have
 * already been moved to the destination path.
 */
function stableHash(input) {
  return createHash("sha256").update(input).digest("base64url").slice(0, 10);
}

/**
 * Generates a deterministic category ID from the old document ID.
 * Format: cat_<orgId>_<categorySlug>_<stableHash(oldDocId)>
 * Stable across reruns: same oldDocId always produces the same new ID.
 */
function migrationCategoryId(orgId, categoryName, oldDocId) {
  return `cat_${orgId}_${slugify(categoryName)}_${stableHash(oldDocId)}`;
}

/**
 * Generates a deterministic task ID from the old document ID.
 * Format: task_<orgId>_<userId>_<stableHash(oldDocId)>
 * Stable across reruns: same oldDocId always produces the same new ID.
 */
function migrationTaskId(orgId, userId, oldDocId) {
  return `task_${orgId}_${userId}_${stableHash(oldDocId)}`;
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
    await srcFile.copy(destFile);

    const [meta] = await destFile.getMetadata();
    let token = meta.metadata && meta.metadata.firebaseStorageDownloadTokens;

    if (!token) {
      token = randomUUID();
      await destFile.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
      });
    }

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
  const alreadyMigratedCount = snapshot.size - legacy.length;
  console.log(`Already in new format:      ${alreadyMigratedCount}`);
  console.log(`Needs migration:            ${legacy.length}\n`);

  if (legacy.length === 0) {
    console.log("Nothing to migrate for tasks.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
    const chunk      = legacy.slice(i, i + BATCH_SIZE);
    const batch      = db.batch();
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(legacy.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} tasks)...`);

    let batchQueued = 0;

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data  = docSnap.data();

      const userId = data.userId;
      if (!userId) {
        console.warn(`  SKIP: task ${oldId} has no userId — cannot generate new ID`);
        skipped++;
        continue;
      }

      const orgId = data.organizationId || personalOrgId(userId);
      const newId = migrationTaskId(orgId, userId, oldId);

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
              console.error(
                `  ERROR: could not move attachment ${att.path} for task ${oldId}` +
                ` — skipping this task (will retry on next run)`
              );
              attachmentMoveFailed = true;
              break;
            }
          } else {
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
        migrated += batchQueued;
        console.log(`  Batch ${batchNum} committed (${batchQueued} tasks).\n`);
      } catch (err) {
        console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
        errors += batchQueued;
      }
    } else {
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
  const alreadyMigratedCount = snapshot.size - legacy.length;
  console.log(`Already in new format:          ${alreadyMigratedCount}`);
  console.log(`Needs migration:                ${legacy.length}\n`);

  if (legacy.length === 0) {
    console.log("Nothing to migrate for categories.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
    const chunk        = legacy.slice(i, i + BATCH_SIZE);
    const batch        = db.batch();
    const batchNum     = Math.floor(i / BATCH_SIZE) + 1;
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

      const name  = data.name || "uncategorized";
      const orgId = data.organizationId || personalOrgId(userId);
      const newId = migrationCategoryId(orgId, name, oldId);

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
        migrated += batchQueued;
        console.log(`  Batch ${batchNum} committed (${batchQueued} categories).\n`);
      } catch (err) {
        console.error(`  ERROR committing batch ${batchNum}: ${err.message}`);
        errors += batchQueued;
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
