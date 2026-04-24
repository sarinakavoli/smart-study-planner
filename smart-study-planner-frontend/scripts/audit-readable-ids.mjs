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
 *
 *   --json      Emit a single JSON object to stdout with total counts and
 *               the full list of affected IDs for each category (fail,
 *               warnFields, warnAttachments) for both tasks and categories.
 *               Human-readable output is redirected to stderr so that stdout
 *               contains only the JSON, making it easy for CI pipelines and
 *               other tooling to parse results programmatically.
 *               Can be combined with --verbose (both flags work independently).
 */

import { readFileSync, existsSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Config ───────────────────────────────────────────────────────────────────

const FIRESTORE_DATABASE = "smart-study";

const VERBOSE     = process.argv.includes("--verbose");
const JSON_OUTPUT = process.argv.includes("--json");

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/**
 * log() — writes human-readable output.
 * In --json mode output goes to stderr so that stdout stays clean JSON.
 * In normal mode output goes to stdout via console.log.
 */
function log(...args) {
  if (JSON_OUTPUT) {
    process.stderr.write(args.join(" ") + "\n");
  } else {
    console.log(...args);
  }
}

// ── Load service account ─────────────────────────────────────────────────────

let serviceAccount;

const envJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (envJson) {
  serviceAccount = JSON.parse(envJson);
  log("Using service account from GCP_SERVICE_ACCOUNT_JSON env var.\n");
} else {
  const keyPath = join(__dirname, "serviceAccountKey.json");
  if (!existsSync(keyPath)) {
    console.warn(
      "WARNING: GCP_SERVICE_ACCOUNT_JSON is not set and scripts/serviceAccountKey.json was not found.\n" +
      "Skipping audit — no Firebase credentials are available in this environment.\n" +
      "Set GCP_SERVICE_ACCOUNT_JSON (e.g. as a repository secret) to enable the audit.\n"
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "## Migration Audit: skipped\n" +
        "GCP_SERVICE_ACCOUNT_JSON is not configured in this environment. " +
        "Set the secret to enable post-deploy Firestore auditing.\n"
      );
    }
    process.exit(0);
  }
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
  log(`Using service account from ${keyPath}\n`);
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
  log("══════════════════════════════════════════");
  log("Collection: tasks");
  log("══════════════════════════════════════════");

  const snapshot = await db.collection("tasks").get();
  log(`Total documents: ${snapshot.size}\n`);

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
  log(`  PASS  (new readable-format ID):                         ${pass}`);
  log(`  FAIL  (legacy auto-ID — migration not run):             ${fail}`);
  log(`  WARN  (new-format ID but missing fields):               ${warnMissingField}`);
  log(`  WARN  (attachment path does not match document ID):     ${warnAttachment}`);

  if (failIds.length > 0) {
    const shown = VERBOSE ? failIds : failIds.slice(0, 20);
    log(
      VERBOSE
        ? "\n  Documents still using legacy IDs (all shown):"
        : "\n  Documents still using legacy IDs (first 20 shown):"
    );
    shown.forEach((id) => log(`    - ${id}`));
    if (!VERBOSE && failIds.length > 20) {
      log(`    … and ${failIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    log(
      VERBOSE
        ? "\n  New-format documents with missing fields (all shown):"
        : "\n  New-format documents with missing fields (first 20 shown):"
    );
    shown.forEach(({ id, missing, organizationId, readableId }) => {
      log(`    - ${id}  [missing: ${missing.join(", ")}]`);
      if (VERBOSE) {
        log(`        organizationId : ${organizationId ?? "(absent)"}`);
        log(`        readableId     : ${readableId ?? "(absent)"}`);
      }
    });
    if (!VERBOSE && warnFieldIds.length > 20) {
      log(`    … and ${warnFieldIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnAttIds.length > 0) {
    const shown = VERBOSE ? warnAttIds : warnAttIds.slice(0, 20);
    log(
      VERBOSE
        ? "\n  Tasks with mismatched attachment paths (all shown):"
        : "\n  Tasks with mismatched attachment paths (first 20 shown):"
    );
    shown.forEach(({ id, attachments }) => {
      log(`    - ${id}`);
      attachments.forEach((p) => log(`        path: ${p}`));
    });
    if (!VERBOSE && warnAttIds.length > 20) {
      log(`    … and ${warnAttIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  log();
  return {
    total: snapshot.size,
    pass,
    fail,
    warnMissingField,
    warnAttachment,
    failIds,
    warnFieldIds,
    warnAttachmentIds: warnAttIds,
  };
}

// ── Audit: categories ────────────────────────────────────────────────────────

async function auditCategories() {
  log("══════════════════════════════════════════");
  log("Collection: categories");
  log("══════════════════════════════════════════");

  const snapshot = await db.collection("categories").get();
  log(`Total documents: ${snapshot.size}\n`);

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
  log(`  PASS  (new readable-format ID):         ${pass}`);
  log(`  FAIL  (legacy auto-ID — migration not run): ${fail}`);
  log(`  WARN  (new-format ID but missing fields): ${warnMissingField}`);

  if (failIds.length > 0) {
    const shown = VERBOSE ? failIds : failIds.slice(0, 20);
    log(
      VERBOSE
        ? "\n  Documents still using legacy IDs (all shown):"
        : "\n  Documents still using legacy IDs (first 20 shown):"
    );
    shown.forEach((id) => log(`    - ${id}`));
    if (!VERBOSE && failIds.length > 20) {
      log(`    … and ${failIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    log(
      VERBOSE
        ? "\n  New-format documents with missing fields (all shown):"
        : "\n  New-format documents with missing fields (first 20 shown):"
    );
    shown.forEach(({ id, missing, organizationId, readableId }) => {
      log(`    - ${id}  [missing: ${missing.join(", ")}]`);
      if (VERBOSE) {
        log(`        organizationId : ${organizationId ?? "(absent)"}`);
        log(`        readableId     : ${readableId ?? "(absent)"}`);
      }
    });
    if (!VERBOSE && warnFieldIds.length > 20) {
      log(`    … and ${warnFieldIds.length - 20} more. (run with --verbose to see all)`);
    }
  }

  log();
  return {
    total: snapshot.size,
    pass,
    fail,
    warnMissingField,
    failIds,
    warnFieldIds,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("Smart Study Planner — Post-Migration Audit");
  log(`Database : ${FIRESTORE_DATABASE}`);
  log(`Run at   : ${new Date().toISOString()}`);
  if (VERBOSE) {
    log("Mode     : verbose (all affected IDs and field values will be shown)");
  }
  if (JSON_OUTPUT) {
    log("Mode     : json (structured output will be written to stdout)");
  }
  log();

  const taskResult     = await auditTasks();
  const categoryResult = await auditCategories();

  // ── Summary ───────────────────────────────────────────────────────────────
  log("══════════════════════════════════════════");
  log("Summary");
  log("══════════════════════════════════════════");

  const totalFail = taskResult.fail + categoryResult.fail;
  const totalWarnField =
    taskResult.warnMissingField + categoryResult.warnMissingField;
  const totalWarnAtt = taskResult.warnAttachment;

  log(
    `Tasks      — total: ${taskResult.total}, ` +
    `new-format (pass): ${taskResult.pass}, ` +
    `legacy (fail): ${taskResult.fail}, ` +
    `warn(missing fields): ${taskResult.warnMissingField}, ` +
    `warn(attachment mismatch): ${taskResult.warnAttachment}`
  );
  log(
    `Categories — total: ${categoryResult.total}, ` +
    `new-format (pass): ${categoryResult.pass}, ` +
    `legacy (fail): ${categoryResult.fail}, ` +
    `warn(missing fields): ${categoryResult.warnMissingField}`
  );
  log();
  log("Note: WARN dimensions overlap with PASS — a new-format document can")
  log("      also appear in a WARN category if it is missing fields or has")
  log("      mismatched attachment paths.");
  log();

  if (totalFail === 0 && totalWarnField === 0 && totalWarnAtt === 0) {
    log("✓ All documents are in the new readable-ID format with no issues.");
    log("  Migration is complete and verified.");
  } else {
    if (totalFail === 0) {
      log("✓ No legacy-ID documents remain — migration appears complete.");
    } else {
      log(
        `✗ FAIL: ${totalFail} document(s) still use legacy auto-IDs. ` +
        "Run migrate-to-readable-ids.mjs to migrate them."
      );
    }

    if (totalWarnField > 0) {
      log(
        `  WARN: ${totalWarnField} document(s) have a readable-format ID but are ` +
        "missing organizationId or readableId fields."
      );
    }

    if (totalWarnAtt > 0) {
      log(
        `  WARN: ${totalWarnAtt} task(s) have attachment paths that do not match ` +
        "the parent document ID."
      );
    }
  }

  // ── JSON output ───────────────────────────────────────────────────────────
  if (JSON_OUTPUT) {
    const output = {
      timestamp: new Date().toISOString(),
      database: FIRESTORE_DATABASE,
      tasks: {
        total: taskResult.total,
        pass: taskResult.pass,
        fail: taskResult.fail,
        warnFields: taskResult.warnMissingField,
        warnAttachments: taskResult.warnAttachment,
        failIds: taskResult.failIds,
        warnFieldIds: taskResult.warnFieldIds,
        warnAttachmentIds: taskResult.warnAttachmentIds,
      },
      categories: {
        total: categoryResult.total,
        pass: categoryResult.pass,
        fail: categoryResult.fail,
        warnFields: categoryResult.warnMissingField,
        warnAttachments: 0,
        failIds: categoryResult.failIds,
        warnFieldIds: categoryResult.warnFieldIds,
        warnAttachmentIds: [],
      },
      summary: {
        totalFail,
        totalWarnFields: totalWarnField,
        totalWarnAttachments: totalWarnAtt,
        passed: totalFail === 0,
      },
    };
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
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
