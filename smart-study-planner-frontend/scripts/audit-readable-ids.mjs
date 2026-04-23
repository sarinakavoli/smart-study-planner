/**
 * audit-readable-ids.mjs
 *
 * Post-migration audit: scans the tasks and categories collections and
 * reports on whether every document has been migrated to the human-readable
 * ID format introduced in Task #112.
 *
 * CHECKS PERFORMED
 * ────────────────
 *   PASS  — Document ID starts with the expected prefix ("task_" / "cat_")
 *           AND the document has both organizationId and readableId fields.
 *
 *   FAIL  — Document ID does NOT start with the expected prefix (legacy
 *           auto-ID).  Migration has not been run or did not complete.
 *
 *   WARN  — Document ID starts with the expected prefix but is missing the
 *           organizationId or readableId field.
 *
 *   WARN  — A task document has an attachment whose Storage path does not
 *           start with "tasks/<docId>/" (path references a different ID).
 *
 * EXIT CODES
 * ──────────
 *   0 — All documents passed; no failures detected.
 *   1 — One or more FAIL-level issues found (non-zero legacy documents
 *       remain, or unexpected error during scan).
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret.
 *
 *   node smart-study-planner-frontend/scripts/audit-readable-ids.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder.
 *
 *   node smart-study-planner-frontend/scripts/audit-readable-ids.mjs
 *
 * FLAGS
 * ─────
 *   --verbose   Print every affected document ID without the 20-item cap.
 *               For WARN(fields) docs the actual field values (or their
 *               absence) are shown.  For WARN(attachment) docs every
 *               mismatched path is listed.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Config ───────────────────────────────────────────────────────────────────

const FIRESTORE_DATABASE = "smart-study";

const VERBOSE = process.argv.includes("--verbose");

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

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
});

const db = admin.firestore();
db.settings({ databaseId: FIRESTORE_DATABASE });

// ── Audit helpers ────────────────────────────────────────────────────────────

/**
 * Checks whether a document ID looks like a legacy Firestore auto-ID.
 * Auto-IDs are 20 alphanumeric characters; the new format always starts with
 * a known prefix ("task_" or "cat_").
 */
function isLegacyId(docId, expectedPrefix) {
  return !docId.startsWith(expectedPrefix);
}

// ── Audit: tasks ─────────────────────────────────────────────────────────────

async function auditTasks() {
  console.log("══════════════════════════════════════════");
  console.log("Collection: tasks");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("tasks").get();
  console.log(`Total documents: ${snapshot.size}\n`);

  let pass             = 0;
  let fail             = 0;
  let warnMissingField = 0;
  let warnAttachment   = 0;

  const failIds        = [];
  const warnFieldIds   = [];
  const warnAttIds     = [];

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id;
    const data  = docSnap.data();

    // ── FAIL: legacy auto-ID ────────────────────────────────────────────────
    if (isLegacyId(docId, "task_")) {
      fail++;
      failIds.push(docId);
      continue;
    }

    // ── WARN: missing required fields ───────────────────────────────────────
    const missingFields = [];
    if (!data.organizationId) missingFields.push("organizationId");
    if (!data.readableId)     missingFields.push("readableId");

    if (missingFields.length > 0) {
      warnMissingField++;
      warnFieldIds.push({
        id: docId,
        missing: missingFields,
        organizationId: data.organizationId ?? null,
        readableId: data.readableId ?? null,
      });
    }

    // ── WARN: attachment Storage path mismatch ──────────────────────────────
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const mismatchedAtts = attachments.filter(
      (att) => att.path && !att.path.startsWith(`tasks/${docId}/`)
    );
    if (mismatchedAtts.length > 0) {
      warnAttachment++;
      warnAttIds.push({ id: docId, attachments: mismatchedAtts.map((a) => a.path) });
    }

    // ── PASS — new-format ID (WARN dimensions are independent) ─────────────
    pass++;
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`  PASS  (new readable-format ID):                         ${pass}`);
  console.log(`  FAIL  (legacy auto-ID — migration not run):             ${fail}`);
  console.log(`  WARN  (new-format ID but missing fields):               ${warnMissingField}`);
  console.log(`  WARN  (attachment path does not match document ID):     ${warnAttachment}`);

  if (failIds.length > 0) {
    const shown = VERBOSE ? failIds : failIds.slice(0, 20);
    console.log(
      VERBOSE
        ? "\n  Documents still using legacy IDs (all shown):"
        : "\n  Documents still using legacy IDs (first 20 shown):"
    );
    shown.forEach((id) => console.log(`    - ${id}`));
    if (!VERBOSE && failIds.length > 20) {
      console.log(`    … and ${failIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    console.log(
      VERBOSE
        ? "\n  New-format documents with missing fields (all shown):"
        : "\n  New-format documents with missing fields (first 20 shown):"
    );
    shown.forEach(({ id, missing, organizationId, readableId }) => {
      console.log(`    - ${id}  [missing: ${missing.join(", ")}]`);
      if (VERBOSE) {
        console.log(`        organizationId : ${organizationId ?? "(absent)"}`);
        console.log(`        readableId     : ${readableId ?? "(absent)"}`);
      }
    });
    if (!VERBOSE && warnFieldIds.length > 20) {
      console.log(`    … and ${warnFieldIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnAttIds.length > 0) {
    const shown = VERBOSE ? warnAttIds : warnAttIds.slice(0, 20);
    console.log(
      VERBOSE
        ? "\n  Tasks with mismatched attachment paths (all shown):"
        : "\n  Tasks with mismatched attachment paths (first 20 shown):"
    );
    shown.forEach(({ id, attachments }) => {
      console.log(`    - ${id}`);
      attachments.forEach((p) => console.log(`        path: ${p}`));
    });
    if (!VERBOSE && warnAttIds.length > 20) {
      console.log(`    … and ${warnAttIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  console.log();
  return { total: snapshot.size, pass, fail, warnMissingField, warnAttachment };
}

// ── Audit: categories ────────────────────────────────────────────────────────

async function auditCategories() {
  console.log("══════════════════════════════════════════");
  console.log("Collection: categories");
  console.log("══════════════════════════════════════════");

  const snapshot = await db.collection("categories").get();
  console.log(`Total documents: ${snapshot.size}\n`);

  let pass             = 0;
  let fail             = 0;
  let warnMissingField = 0;

  const failIds      = [];
  const warnFieldIds = [];

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id;
    const data  = docSnap.data();

    // ── FAIL: legacy auto-ID ────────────────────────────────────────────────
    if (isLegacyId(docId, "cat_")) {
      fail++;
      failIds.push(docId);
      continue;
    }

    // ── WARN: missing required fields ───────────────────────────────────────
    const missingFields = [];
    if (!data.organizationId) missingFields.push("organizationId");
    if (!data.readableId)     missingFields.push("readableId");

    if (missingFields.length > 0) {
      warnMissingField++;
      warnFieldIds.push({
        id: docId,
        missing: missingFields,
        organizationId: data.organizationId ?? null,
        readableId: data.readableId ?? null,
      });
    }

    // ── PASS — new-format ID (WARN dimensions are independent) ─────────────
    pass++;
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`  PASS  (new readable-format ID):         ${pass}`);
  console.log(`  FAIL  (legacy auto-ID — migration not run): ${fail}`);
  console.log(`  WARN  (new-format ID but missing fields): ${warnMissingField}`);

  if (failIds.length > 0) {
    const shown = VERBOSE ? failIds : failIds.slice(0, 20);
    console.log(
      VERBOSE
        ? "\n  Documents still using legacy IDs (all shown):"
        : "\n  Documents still using legacy IDs (first 20 shown):"
    );
    shown.forEach((id) => console.log(`    - ${id}`));
    if (!VERBOSE && failIds.length > 20) {
      console.log(`    … and ${failIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    console.log(
      VERBOSE
        ? "\n  New-format documents with missing fields (all shown):"
        : "\n  New-format documents with missing fields (first 20 shown):"
    );
    shown.forEach(({ id, missing, organizationId, readableId }) => {
      console.log(`    - ${id}  [missing: ${missing.join(", ")}]`);
      if (VERBOSE) {
        console.log(`        organizationId : ${organizationId ?? "(absent)"}`);
        console.log(`        readableId     : ${readableId ?? "(absent)"}`);
      }
    });
    if (!VERBOSE && warnFieldIds.length > 20) {
      console.log(`    … and ${warnFieldIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  console.log();
  return { total: snapshot.size, pass, fail, warnMissingField };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Smart Study Planner — Post-Migration Audit");
  console.log(`Database : ${FIRESTORE_DATABASE}`);
  console.log(`Run at   : ${new Date().toISOString()}`);
  if (VERBOSE) {
    console.log("Mode     : verbose (all affected IDs and field values will be shown)");
  }
  console.log();

  const taskResult     = await auditTasks();
  const categoryResult = await auditCategories();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════");
  console.log("Summary");
  console.log("══════════════════════════════════════════");

  const totalFail = taskResult.fail + categoryResult.fail;
  const totalWarnField =
    taskResult.warnMissingField + categoryResult.warnMissingField;
  const totalWarnAtt = taskResult.warnAttachment;

  console.log(
    `Tasks      — total: ${taskResult.total}, ` +
    `new-format (pass): ${taskResult.pass}, ` +
    `legacy (fail): ${taskResult.fail}, ` +
    `warn(missing fields): ${taskResult.warnMissingField}, ` +
    `warn(attachment mismatch): ${taskResult.warnAttachment}`
  );
  console.log(
    `Categories — total: ${categoryResult.total}, ` +
    `new-format (pass): ${categoryResult.pass}, ` +
    `legacy (fail): ${categoryResult.fail}, ` +
    `warn(missing fields): ${categoryResult.warnMissingField}`
  );
  console.log();
  console.log("Note: WARN dimensions overlap with PASS — a new-format document can")
  console.log("      also appear in a WARN category if it is missing fields or has")
  console.log("      mismatched attachment paths.");
  console.log();

  if (totalFail === 0 && totalWarnField === 0 && totalWarnAtt === 0) {
    console.log("✓ All documents are in the new readable-ID format with no issues.");
    console.log("  Migration is complete and verified.");
    process.exit(0);
  }

  if (totalFail === 0) {
    console.log("✓ No legacy-ID documents remain — migration appears complete.");
  } else {
    console.log(
      `✗ FAIL: ${totalFail} document(s) still use legacy auto-IDs. ` +
      "Run migrate-to-readable-ids.mjs to migrate them."
    );
  }

  if (totalWarnField > 0) {
    console.log(
      `  WARN: ${totalWarnField} document(s) have a readable-format ID but are ` +
      "missing organizationId or readableId fields."
    );
  }

  if (totalWarnAtt > 0) {
    console.log(
      `  WARN: ${totalWarnAtt} task(s) have attachment paths that do not match ` +
      "the parent document ID."
    );
  }

  // Exit non-zero only for FAIL-level issues (legacy IDs remaining).
  if (totalFail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
