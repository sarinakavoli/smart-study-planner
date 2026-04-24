/**
 * migrate-to-readable-ids.mjs
 *
 * One-off migration: re-creates existing task and category documents that use
 * either Firestore auto-IDs OR the deprecated `task_org_<uid>_<uid>_<nanoid>`
 * / `cat_org_<uid>_<slug>_<nanoid>` format, under the refined human-readable
 * ID format, then deletes the old documents.
 *
 * NEW ID FORMATS (refined)
 * ─────────────────────────
 *   Categories : cat_<orgSlug>_<categorySlug>_<counter>
 *     Examples : cat_org-abc123_research_1
 *                cat_org-abc123_school_2
 *
 *   Tasks      : task_<orgSlug>_<categorySlug>_<dueDate>_<counter>
 *     Examples : task_org-abc123_math_2025-04-19_1
 *                task_org-abc123_research_noduedate_1
 *
 *   Where:
 *     orgSlug      = slugify(organizationId)   e.g. "org_abc123" → "org-abc123"
 *     categorySlug = slugify(category name)    e.g. "Math & Science" → "math-science"
 *     dueDate      = YYYY-MM-DD string, or "noduedate" if absent
 *     counter      = 1-based integer, unique per (orgSlug, catSlug, dueDate)
 *                    Seeded from the maximum counter in existing refined docs
 *                    of the same group, so new assignments never collide with
 *                    already-migrated documents.
 *
 * DOCUMENTS THAT ARE MIGRATED
 * ────────────────────────────
 *   Phase 1 — Tasks
 *     • Legacy Firestore auto-IDs (no "task_" prefix)
 *     • Deprecated readable IDs starting with "task_org_"
 *     • IDs that start with "task_" but fail the strict refined-format regex
 *
 *   Phase 2 — Categories
 *     • Legacy Firestore auto-IDs (no "cat_" prefix)
 *     • Deprecated readable IDs starting with "cat_org_"
 *     • IDs that start with "cat_" but fail the strict refined-format regex
 *
 *   Documents already matching the refined regex are silently skipped.
 *
 * COLLISION SAFETY
 * ─────────────────
 * Before assigning counters, the script scans existing refined-format docs to
 * find the maximum counter already in use for each (orgSlug, catSlug, dueDate)
 * group. New counters start at maxExisting + 1, ensuring no overlap with
 * already-migrated docs. In addition, every target document is pre-checked for
 * existence before being written; if a target doc already exists and differs
 * from the intended write, the source doc is left untouched and reported as an
 * error — the operator can then investigate without silent data loss.
 *
 * IDEMPOTENCY
 * ───────────
 * Within a single run, docs are sorted by (orgSlug, catSlug, dueDate, oldDocId)
 * and counters are assigned in that stable order, so the same doc always
 * receives the same counter during a complete run. Partial-run reruns benefit
 * from the counter-seeding logic: already-migrated docs raise the baseline for
 * the next run, so newly assigned counters never collide with prior output.
 *
 * ATTACHMENT HANDLING
 * ───────────────────
 * Attachment Storage paths follow the pattern:
 *   tasks/<taskId>/attachments/<filename>
 * When a task is migrated, every attachment whose path references the old
 * task ID is moved to the equivalent path under the new task ID. The stored
 * "path" and "url" fields are updated in the new Firestore document.
 *
 * If a Storage move cannot be completed (file missing at source AND destination),
 * the ENTIRE TASK is skipped — the old document is preserved intact.
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   GCP_SERVICE_ACCOUNT_JSON must be set as a Replit Secret.
 *
 *   Dry run:
 *     node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs --dry-run
 *
 *   Live run:
 *     node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder.
 *
 * SAFETY TIPS
 * ───────────
 *   • Always do a dry run first to review what will be migrated.
 *   • Back up Firestore before the live run (Firebase Console → Export).
 *   • Run audit-readable-ids.mjs afterwards to confirm zero FAIL-level issues.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { randomUUID } from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts text to a lowercase, URL-safe slug (max 30 chars). */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Like slugify() but guarantees a non-empty result by falling back to
 * `fallback` when the input slugifies to an empty string (e.g. non-Latin
 * characters, blank string, etc.).
 */
function safeSlug(text, fallback) {
  const s = slugify(text ?? "");
  return s.length > 0 ? s : fallback;
}

/**
 * Strict regex for a VALID refined task ID.
 * Format: task_<orgSlug>_<catSlug>_<dateSlug>_<counter>
 * All slug segments: lowercase alphanumeric + hyphens.
 * Counter: one or more digits.
 */
const TASK_ID_REGEX = /^task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/;

/**
 * Strict regex for a VALID refined category ID.
 * Format: cat_<orgSlug>_<catSlug>_<counter>
 */
const CAT_ID_REGEX = /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/;

/**
 * Returns true if a document ID needs migration:
 *   - No expected prefix (legacy auto-ID).
 *   - Starts with deprecated prefix (e.g. "task_org_").
 *   - Has right prefix but fails the strict refined-format regex.
 */
function needsMigration(docId, newPrefix, deprecatedPrefix, refinedRegex) {
  if (!docId.startsWith(newPrefix)) return true;        // legacy auto-ID
  if (docId.startsWith(deprecatedPrefix)) return true;  // deprecated readable format
  if (!refinedRegex.test(docId)) return true;           // malformed new-prefix ID
  return false;
}

/**
 * Parses the numeric counter from the LAST underscore-delimited segment of
 * a refined-format ID.  Returns NaN if the segment is not a valid integer.
 * This works because slugs use hyphens (not underscores) internally.
 *
 * Examples:
 *   "cat_org-abc_research_3" → 3
 *   "task_org-abc_math_2025-04-19_7" → 7
 */
function parseCounter(docId) {
  const lastUnderscore = docId.lastIndexOf("_");
  if (lastUnderscore === -1) return NaN;
  return parseInt(docId.slice(lastUnderscore + 1), 10);
}

/**
 * Extracts the group key (everything before the last underscore segment)
 * from a refined-format ID.  Used to seed existing counters.
 *
 * Examples:
 *   "cat_org-abc_research_3"          → "cat_org-abc_research"
 *   "task_org-abc_math_2025-04-19_7"  → "task_org-abc_math_2025-04-19"
 */
function refinedGroupPrefix(docId) {
  const lastUnderscore = docId.lastIndexOf("_");
  if (lastUnderscore === -1) return docId;
  return docId.slice(0, lastUnderscore);
}

/**
 * Seeds groupCounters Map from already-refined docs so that new counter
 * assignments start above the maximum existing counter in each group.
 *
 * @param {FirebaseFirestore.QueryDocumentSnapshot[]} allDocs
 * @param {string}  newPrefix        e.g. "task_"
 * @param {string}  deprecatedPrefix e.g. "task_org_"
 * @param {RegExp}  refinedRegex
 * @param {Map}     groupCounters    Mutated in place.
 */
function seedGroupCounters(allDocs, newPrefix, deprecatedPrefix, refinedRegex, groupCounters) {
  for (const docSnap of allDocs) {
    const docId = docSnap.id;
    if (needsMigration(docId, newPrefix, deprecatedPrefix, refinedRegex)) continue;
    // docId is an existing refined doc — parse its counter.
    const counter = parseCounter(docId);
    if (isNaN(counter)) continue;
    const prefix = refinedGroupPrefix(docId);
    const current = groupCounters.get(prefix) ?? 0;
    if (counter > current) groupCounters.set(prefix, counter);
  }
}

/**
 * Assigns deterministic 1-based (or seeded) counters to each doc in `docs`.
 * Docs are sorted by composite key (orgSlug + catSlug + dateSlug + oldDocId)
 * for stable, reproducible ordering within a run.
 *
 * @param {FirebaseFirestore.QueryDocumentSnapshot[]} docs   Docs to migrate.
 * @param {function} getSegments   (docSnap) → { orgSlug, catSlug, dateSlug }
 * @param {string}   idPrefix      e.g. "cat_" or "task_"
 * @param {Map}      groupCounters Pre-seeded map; mutated in place.
 * @returns {Map<string, { orgSlug, catSlug, dateSlug, counter, newId }>}
 */
function assignCounters(docs, getSegments, idPrefix, groupCounters) {
  const sorted = [...docs].sort((a, b) => {
    const sa = getSegments(a);
    const sb = getSegments(b);
    const ka = `${sa.orgSlug}\x00${sa.catSlug}\x00${sa.dateSlug}\x00${a.id}`;
    const kb = `${sb.orgSlug}\x00${sb.catSlug}\x00${sb.dateSlug}\x00${b.id}`;
    return ka.localeCompare(kb);
  });

  const assignments = new Map();

  for (const docSnap of sorted) {
    const { orgSlug, catSlug, dateSlug } = getSegments(docSnap);

    // Build the group prefix that the new ID will share
    // (everything before the counter segment).
    let groupPrefix;
    if (idPrefix === "task_") {
      groupPrefix = `task_${orgSlug}_${catSlug}_${dateSlug}`;
    } else {
      groupPrefix = `cat_${orgSlug}_${catSlug}`;
    }

    const counter = (groupCounters.get(groupPrefix) ?? 0) + 1;
    groupCounters.set(groupPrefix, counter);

    const newId = `${groupPrefix}_${counter}`;
    assignments.set(docSnap.id, { orgSlug, catSlug, dateSlug, counter, newId });
  }

  return assignments;
}

// ── Config ────────────────────────────────────────────────────────────────────

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
  storageBucket: STORAGE_BUCKET,
});

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DATABASE });
const bucket = admin.storage().bucket();

// ── Storage helpers ───────────────────────────────────────────────────────────

function buildDownloadUrl(bucketName, storagePath, token) {
  const encodedPath = encodeURIComponent(storagePath);
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}` +
    `?alt=media&token=${token}`
  );
}

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
      await destFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    await srcFile.delete();
    return buildDownloadUrl(STORAGE_BUCKET, newPath, token);
  } catch (err) {
    console.error(`  ERROR moving Storage file ${oldPath} → ${newPath}: ${err.message}`);
    return null;
  }
}

// ── Task migration ─────────────────────────────────────────────────────────────

async function migrateTasks() {
  console.log("══════════════════════════════════════════");
  console.log("Phase 1: Migrating tasks");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("tasks").get();
  console.log(`Total task documents found: ${snapshot.size}`);

  const legacy = snapshot.docs.filter(
    (d) => needsMigration(d.id, "task_", "task_org_", TASK_ID_REGEX)
  );
  const alreadyRefinedCount = snapshot.size - legacy.length;
  console.log(`Already in refined format:  ${alreadyRefinedCount}`);
  console.log(`Needs migration:            ${legacy.length}`);
  if (legacy.length > 0) {
    const autoIds       = legacy.filter((d) => !d.id.startsWith("task_")).length;
    const deprecatedIds = legacy.filter((d) => d.id.startsWith("task_org_")).length;
    const malformedIds  = legacy.length - autoIds - deprecatedIds;
    console.log(`  → legacy auto-IDs:        ${autoIds}`);
    console.log(`  → deprecated readable:    ${deprecatedIds}`);
    console.log(`  → malformed new-prefix:   ${malformedIds}`);
  }
  console.log();

  if (legacy.length === 0) {
    console.log("Nothing to migrate for tasks.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  const getTaskSegments = (docSnap) => {
    const data    = docSnap.data();
    const orgId   = data.organizationId || `org_${data.userId || "unknown"}`;
    const orgSlug  = safeSlug(orgId, "unknown-org");
    const catSlug  = safeSlug(data.category || "uncategorized", "uncategorized");
    const dateSlug = data.dueDate ? safeSlug(data.dueDate, "noduedate") : "noduedate";
    return { orgSlug, catSlug, dateSlug };
  };

  // Seed group counters from existing refined docs to avoid collisions.
  const groupCounters = new Map();
  seedGroupCounters(snapshot.docs, "task_", "task_org_", TASK_ID_REGEX, groupCounters);
  if (groupCounters.size > 0) {
    console.log(`Counter seeds from existing refined docs: ${groupCounters.size} group(s)`);
    groupCounters.forEach((max, prefix) =>
      console.log(`  ${prefix}: max existing counter = ${max}`)
    );
    console.log();
  }

  const counterAssignments = assignCounters(legacy, getTaskSegments, "task_", groupCounters);

  // Sort for deterministic batch ordering.
  const sortedLegacy = [...legacy].sort((a, b) => {
    const sa = getTaskSegments(a);
    const sb = getTaskSegments(b);
    const ka = `${sa.orgSlug}\x00${sa.catSlug}\x00${sa.dateSlug}\x00${a.id}`;
    const kb = `${sb.orgSlug}\x00${sb.catSlug}\x00${sb.dateSlug}\x00${b.id}`;
    return ka.localeCompare(kb);
  });

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (let i = 0; i < sortedLegacy.length; i += BATCH_SIZE) {
    const chunk        = sortedLegacy.slice(i, i + BATCH_SIZE);
    const batch        = db.batch();
    const batchNum     = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sortedLegacy.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} tasks)...`);

    // Pre-check: fetch all target docs to guard against overwrites.
    let existingTargets = new Set();
    if (!DRY_RUN) {
      const targetRefs = chunk.map((docSnap) => {
        const { newId } = counterAssignments.get(docSnap.id);
        return db.collection("tasks").doc(newId);
      });
      try {
        const targetSnaps = await db.getAll(...targetRefs);
        existingTargets = new Set(
          targetSnaps.filter((s) => s.exists).map((s) => s.id)
        );
        if (existingTargets.size > 0) {
          console.warn(
            `  WARN: ${existingTargets.size} target doc(s) already exist — ` +
            "those source docs will be skipped to prevent overwrite:"
          );
          existingTargets.forEach((id) => console.warn(`    - ${id}`));
        }
      } catch (err) {
        console.error(`  ERROR pre-checking target existence: ${err.message}`);
        // Abort entire batch if we cannot confirm safety.
        errors += chunk.length;
        continue;
      }
    }

    let batchQueued = 0;

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data  = docSnap.data();

      const userId = data.userId;
      if (!userId && !data.organizationId) {
        console.warn(`  SKIP: task ${oldId} has no userId or organizationId — cannot derive org, skipping`);
        skipped++;
        continue;
      }

      const { newId } = counterAssignments.get(oldId);

      // Guard: skip if target doc already exists (would overwrite).
      if (!DRY_RUN && existingTargets.has(newId)) {
        console.error(
          `  ERROR: target ${newId} already exists — skipping source ${oldId} ` +
          "to prevent silent overwrite. Investigate and re-run."
        );
        errors++;
        continue;
      }

      console.log(`  ${oldId}`);
      console.log(`    → ${newId}`);

      // ── Handle attachments ─────────────────────────────────────────────────
      let attachments = Array.isArray(data.attachments) ? [...data.attachments] : [];
      let attachmentMoveFailed = false;

      if (attachments.length > 0) {
        const updatedAttachments = [];
        for (const att of attachments) {
          if (att.path && att.path.startsWith(`tasks/${oldId}/`)) {
            const newPath = att.path.replace(`tasks/${oldId}/`, `tasks/${newId}/`);
            const newUrl  = await moveStorageFile(att.path, newPath, DRY_RUN);
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

      // ── Build new document ─────────────────────────────────────────────────
      const orgId = data.organizationId || `org_${userId}`;
      const newData = {
        ...data,
        organizationId: orgId,
        readableId:     newId,
        attachments,
      };

      if (!DRY_RUN) {
        try {
          batch.set(db.collection("tasks").doc(newId), newData);
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

// ── Category migration ─────────────────────────────────────────────────────────

async function migrateCategories() {
  console.log("══════════════════════════════════════════");
  console.log("Phase 2: Migrating categories");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("categories").get();
  console.log(`Total category documents found: ${snapshot.size}`);

  const legacy = snapshot.docs.filter(
    (d) => needsMigration(d.id, "cat_", "cat_org_", CAT_ID_REGEX)
  );
  const alreadyRefinedCount = snapshot.size - legacy.length;
  console.log(`Already in refined format:      ${alreadyRefinedCount}`);
  console.log(`Needs migration:                ${legacy.length}`);
  if (legacy.length > 0) {
    const autoIds       = legacy.filter((d) => !d.id.startsWith("cat_")).length;
    const deprecatedIds = legacy.filter((d) => d.id.startsWith("cat_org_")).length;
    const malformedIds  = legacy.length - autoIds - deprecatedIds;
    console.log(`  → legacy auto-IDs:           ${autoIds}`);
    console.log(`  → deprecated readable:        ${deprecatedIds}`);
    console.log(`  → malformed new-prefix:       ${malformedIds}`);
  }
  console.log();

  if (legacy.length === 0) {
    console.log("Nothing to migrate for categories.\n");
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  const getCatSegments = (docSnap) => {
    const data   = docSnap.data();
    const orgId  = data.organizationId || `org_${data.userId || "unknown"}`;
    const orgSlug  = safeSlug(orgId, "unknown-org");
    const catSlug  = safeSlug(data.name || "uncategorized", "uncategorized");
    const dateSlug = "";
    return { orgSlug, catSlug, dateSlug };
  };

  // Seed group counters from existing refined docs.
  const groupCounters = new Map();
  seedGroupCounters(snapshot.docs, "cat_", "cat_org_", CAT_ID_REGEX, groupCounters);
  if (groupCounters.size > 0) {
    console.log(`Counter seeds from existing refined docs: ${groupCounters.size} group(s)`);
    groupCounters.forEach((max, prefix) =>
      console.log(`  ${prefix}: max existing counter = ${max}`)
    );
    console.log();
  }

  const counterAssignments = assignCounters(legacy, getCatSegments, "cat_", groupCounters);

  const sortedLegacy = [...legacy].sort((a, b) => {
    const sa = getCatSegments(a);
    const sb = getCatSegments(b);
    const ka = `${sa.orgSlug}\x00${sa.catSlug}\x00\x00${a.id}`;
    const kb = `${sb.orgSlug}\x00${sb.catSlug}\x00\x00${b.id}`;
    return ka.localeCompare(kb);
  });

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (let i = 0; i < sortedLegacy.length; i += BATCH_SIZE) {
    const chunk        = sortedLegacy.slice(i, i + BATCH_SIZE);
    const batch        = db.batch();
    const batchNum     = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sortedLegacy.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${chunk.length} categories)...`);

    // Pre-check: fetch all target docs to guard against overwrites.
    let existingTargets = new Set();
    if (!DRY_RUN) {
      const targetRefs = chunk.map((docSnap) => {
        const { newId } = counterAssignments.get(docSnap.id);
        return db.collection("categories").doc(newId);
      });
      try {
        const targetSnaps = await db.getAll(...targetRefs);
        existingTargets = new Set(
          targetSnaps.filter((s) => s.exists).map((s) => s.id)
        );
        if (existingTargets.size > 0) {
          console.warn(
            `  WARN: ${existingTargets.size} target doc(s) already exist — ` +
            "those source docs will be skipped to prevent overwrite:"
          );
          existingTargets.forEach((id) => console.warn(`    - ${id}`));
        }
      } catch (err) {
        console.error(`  ERROR pre-checking target existence: ${err.message}`);
        errors += chunk.length;
        continue;
      }
    }

    let batchQueued = 0;

    for (const docSnap of chunk) {
      const oldId = docSnap.id;
      const data  = docSnap.data();

      const userId = data.userId;
      if (!userId && !data.organizationId) {
        console.warn(`  SKIP: category ${oldId} has no userId or organizationId — cannot derive org, skipping`);
        skipped++;
        continue;
      }

      const { newId } = counterAssignments.get(oldId);

      // Guard: skip if target doc already exists (would overwrite).
      if (!DRY_RUN && existingTargets.has(newId)) {
        console.error(
          `  ERROR: target ${newId} already exists — skipping source ${oldId} ` +
          "to prevent silent overwrite. Investigate and re-run."
        );
        errors++;
        continue;
      }

      console.log(`  ${oldId}`);
      console.log(`    → ${newId}`);

      const orgId = data.organizationId || `org_${userId}`;
      const newData = {
        ...data,
        organizationId: orgId,
        readableId:     newId,
      };

      if (!DRY_RUN) {
        try {
          batch.set(db.collection("categories").doc(newId), newData);
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

// ── Main ──────────────────────────────────────────────────────────────────────

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
