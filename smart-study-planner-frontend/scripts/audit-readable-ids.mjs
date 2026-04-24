/**
 * audit-readable-ids.mjs
 *
 * Post-migration audit: scans the tasks and categories collections and
 * reports on whether every document has been migrated to the refined
 * human-readable ID format.
 *
 * CHECKS PERFORMED
 * ────────────────
 *   PASS  — Document ID matches the strict refined-format regex (all
 *           segments lowercase-slug, last segment is a numeric counter).
 *           NOTE: WARN dimensions are independent — a PASS document can
 *           also appear in a WARN category if it is missing required fields
 *           or has mismatched attachment paths.
 *
 *   FAIL  — Document ID does NOT start with the expected prefix (legacy
 *           Firestore auto-ID).  Migration has not been run.
 *
 *   FAIL  — Document ID starts with the DEPRECATED readable prefix
 *           ("task_org_" / "cat_org_").  These were created by the first
 *           version of the migration script and must be re-migrated.
 *
 *   FAIL  — Document ID has the right prefix but does NOT match the strict
 *           refined-format regex (malformed — counter segment is not digits,
 *           segments contain uppercase or disallowed characters, wrong number
 *           of segments, etc.).
 *
 *   WARN  — Document ID passes the strict regex but is missing the
 *           organizationId or readableId field.
 *
 *   WARN  — A task document has an attachment whose Storage path does not
 *           start with "tasks/<docId>/" (path references a different ID).
 *
 * REFINED FORMAT REGEX
 * ────────────────────
 *   Tasks      : task_<categorySlug>_<titleSlug>_<shortRandom>
 *     Regex    : /^task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/
 *
 *   Categories : cat_<orgSlug>_<catSlug>_<shortRandom>
 *     Regex    : /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/
 *
 *   All slug segments are lowercase alphanumeric + hyphens (no underscores,
 *   no uppercase).  The suffix is a 4-character lowercase alphanumeric string.
 *
 * EXIT CODES
 * ──────────
 *   0 — All documents passed; no failures detected.
 *   1 — One or more FAIL-level issues found.
 *
 * HOW TO RUN
 * ──────────
 * Option A — Replit Secret (recommended):
 *   Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret.
 *   node smart-study-planner-frontend/scripts/audit-readable-ids.mjs
 *
 * Option B — local service account file:
 *   Save serviceAccountKey.json in the scripts/ folder.
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
 *               the full list of affected IDs for each category.
 *               Human-readable output is redirected to stderr so that stdout
 *               contains only the JSON, making it easy for CI pipelines to
 *               parse results programmatically.
 *               Can be combined with --verbose (both flags work independently).
 */

import { readFileSync, existsSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Config ────────────────────────────────────────────────────────────────────

const FIRESTORE_DATABASE = "smart-study";

const VERBOSE     = process.argv.includes("--verbose");
const JSON_OUTPUT = process.argv.includes("--json");

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Strict refined-format regexes ─────────────────────────────────────────────

/**
 * Valid refined task ID: task_<categorySlug>_<titleSlug>_<NNNN>
 * Both slug segments: lowercase alphanumeric + hyphens, start with [a-z0-9].
 * Suffix: exactly 4 lowercase alphanumeric characters.
 * Seed-script IDs use a zero-padded 4-digit counter (0001–9999); app-generated
 * IDs use a 4-char alphanumeric random suffix — both satisfy this regex.
 * NOTE: Documents seeded before this change used a 3-digit suffix (001–999).
 * Those IDs will be flagged as MALFORMED and require re-seeding to migrate.
 */
const TASK_ID_REGEX = /^task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/;

/**
 * Valid refined category ID: cat_<orgSlug>_<catSlug>_<shortRandom>
 * Suffix: 4 lowercase alphanumeric characters (from randomSuffix()).
 */
const CAT_ID_REGEX = /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/;

// ── log() helper ──────────────────────────────────────────────────────────────

function log(...args) {
  if (JSON_OUTPUT) {
    process.stderr.write(args.join(" ") + "\n");
  } else {
    console.log(...args);
  }
}

// ── Load service account ──────────────────────────────────────────────────────

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

// ── ID classification ─────────────────────────────────────────────────────────

/**
 * Classifies a document ID:
 *   "ok"         — Passes strict refined-format regex.
 *   "deprecated" — Does NOT pass the regex AND starts with deprecated prefix.
 *   "malformed"  — Does NOT pass the regex AND has the right prefix but not deprecated.
 *   "legacy"     — Does NOT pass the regex AND lacks the expected prefix.
 *
 * The regex is checked first so a valid new-format ID (e.g. task_org_math_0001
 * for a category named "org") is never wrongly flagged as deprecated.
 *
 * @param {string} docId
 * @param {string} newPrefix         e.g. "task_"
 * @param {string} deprecatedPrefix  e.g. "task_org_"
 * @param {RegExp} refinedRegex
 * @returns {"ok"|"deprecated"|"malformed"|"legacy"}
 */
function classifyId(docId, newPrefix, deprecatedPrefix, refinedRegex) {
  if (refinedRegex.test(docId)) return "ok";
  if (!docId.startsWith(newPrefix)) return "legacy";
  if (docId.startsWith(deprecatedPrefix)) return "deprecated";
  return "malformed";
}

// ── Helper: print a list of IDs with optional verbose mode ────────────────────

function printList(label, ids, verbose) {
  if (ids.length === 0) return;
  const shown = verbose ? ids : ids.slice(0, 20);
  log(verbose ? `\n  ${label} (all shown):` : `\n  ${label} (first 20 shown):`);
  shown.forEach((id) => log(`    - ${id}`));
  if (!verbose && ids.length > 20) {
    log(`    … and ${ids.length - 20} more. (run with --verbose to see all)`);
  }
}

// ── Audit: tasks ──────────────────────────────────────────────────────────────

async function auditTasks() {
  log("══════════════════════════════════════════");
  log("Collection: tasks");
  log("══════════════════════════════════════════");

  const snapshot = await db.collection("tasks").get();
  log(`Total documents: ${snapshot.size}\n`);

  let pass             = 0;
  let failLegacy       = 0;
  let failDeprecated   = 0;
  let failMalformed    = 0;
  let warnMissingField = 0;
  let warnAttachment   = 0;

  const failLegacyIds     = [];
  const failDeprecatedIds = [];
  const failMalformedIds  = [];
  const warnFieldIds      = [];
  const warnAttIds        = [];

  for (const docSnap of snapshot.docs) {
    const docId  = docSnap.id;
    const data   = docSnap.data();
    const status = classifyId(docId, "task_", "task_org_", TASK_ID_REGEX);

    if (status === "legacy") {
      failLegacy++;
      failLegacyIds.push(docId);
      continue;
    }
    if (status === "deprecated") {
      failDeprecated++;
      failDeprecatedIds.push(docId);
      continue;
    }
    if (status === "malformed") {
      failMalformed++;
      failMalformedIds.push(docId);
      continue;
    }

    // ── WARN: missing required fields ─────────────────────────────────────
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

    // ── WARN: attachment Storage path mismatch ────────────────────────────
    const attachments    = Array.isArray(data.attachments) ? data.attachments : [];
    const mismatchedAtts = attachments.filter(
      (att) => att.path && !att.path.startsWith(`tasks/${docId}/`)
    );
    if (mismatchedAtts.length > 0) {
      warnAttachment++;
      warnAttIds.push({ id: docId, attachments: mismatchedAtts.map((a) => a.path) });
    }

    pass++;
  }

  // ── Report ────────────────────────────────────────────────────────────────
  log(`  PASS  (refined readable-format ID):                     ${pass}`);
  log(`  FAIL  (legacy auto-ID — migration not run):             ${failLegacy}`);
  log(`  FAIL  (deprecated task_org_... — re-migrate):           ${failDeprecated}`);
  log(`  FAIL  (has task_ prefix but malformed structure):       ${failMalformed}`);
  log(`  WARN  (new-format ID but missing fields):               ${warnMissingField}`);
  log(`  WARN  (attachment path does not match document ID):     ${warnAttachment}`);

  printList("Documents using legacy auto-IDs", failLegacyIds, VERBOSE);
  printList("Documents using deprecated task_org_... IDs", failDeprecatedIds, VERBOSE);
  printList("Documents with malformed task_ IDs (re-migrate)", failMalformedIds, VERBOSE);

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    log(VERBOSE
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
    log(VERBOSE
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
    failLegacy,
    failDeprecated,
    failMalformed,
    fail: failLegacy + failDeprecated + failMalformed,
    warnMissingField,
    warnAttachment,
    failLegacyIds,
    failDeprecatedIds,
    failMalformedIds,
    warnFieldIds,
    warnAttachmentIds: warnAttIds,
  };
}

// ── Audit: categories ─────────────────────────────────────────────────────────

async function auditCategories() {
  log("══════════════════════════════════════════");
  log("Collection: categories");
  log("══════════════════════════════════════════");

  const snapshot = await db.collection("categories").get();
  log(`Total documents: ${snapshot.size}\n`);

  let pass             = 0;
  let failLegacy       = 0;
  let failDeprecated   = 0;
  let failMalformed    = 0;
  let warnMissingField = 0;

  const failLegacyIds     = [];
  const failDeprecatedIds = [];
  const failMalformedIds  = [];
  const warnFieldIds      = [];

  for (const docSnap of snapshot.docs) {
    const docId  = docSnap.id;
    const data   = docSnap.data();
    const status = classifyId(docId, "cat_", "cat_org_", CAT_ID_REGEX);

    if (status === "legacy") {
      failLegacy++;
      failLegacyIds.push(docId);
      continue;
    }
    if (status === "deprecated") {
      failDeprecated++;
      failDeprecatedIds.push(docId);
      continue;
    }
    if (status === "malformed") {
      failMalformed++;
      failMalformedIds.push(docId);
      continue;
    }

    // ── WARN: missing required fields ─────────────────────────────────────
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

    pass++;
  }

  // ── Report ────────────────────────────────────────────────────────────────
  log(`  PASS  (refined readable-format ID):                     ${pass}`);
  log(`  FAIL  (legacy auto-ID — migration not run):             ${failLegacy}`);
  log(`  FAIL  (deprecated cat_org_... — re-migrate):            ${failDeprecated}`);
  log(`  FAIL  (has cat_ prefix but malformed structure):        ${failMalformed}`);
  log(`  WARN  (new-format ID but missing fields):               ${warnMissingField}`);

  printList("Documents using legacy auto-IDs", failLegacyIds, VERBOSE);
  printList("Documents using deprecated cat_org_... IDs", failDeprecatedIds, VERBOSE);
  printList("Documents with malformed cat_ IDs (re-migrate)", failMalformedIds, VERBOSE);

  if (warnFieldIds.length > 0) {
    const shown = VERBOSE ? warnFieldIds : warnFieldIds.slice(0, 20);
    log(VERBOSE
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
    failLegacy,
    failDeprecated,
    failMalformed,
    fail: failLegacy + failDeprecated + failMalformed,
    warnMissingField,
    failLegacyIds,
    failDeprecatedIds,
    failMalformedIds,
    warnFieldIds,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("Smart Study Planner — Post-Migration Audit");
  log(`Database : ${FIRESTORE_DATABASE}`);
  log(`Run at   : ${new Date().toISOString()}`);
  if (VERBOSE)     log("Mode     : verbose (all affected IDs will be shown)");
  if (JSON_OUTPUT) log("Mode     : json (structured output will be written to stdout)");
  log();

  const taskResult     = await auditTasks();
  const categoryResult = await auditCategories();

  // ── Summary ───────────────────────────────────────────────────────────────
  log("══════════════════════════════════════════");
  log("Summary");
  log("══════════════════════════════════════════");

  const totalFail      = taskResult.fail + categoryResult.fail;
  const totalWarnField = taskResult.warnMissingField + categoryResult.warnMissingField;
  const totalWarnAtt   = taskResult.warnAttachment;

  log(
    `Tasks      — total: ${taskResult.total}, ` +
    `pass: ${taskResult.pass}, ` +
    `fail(legacy): ${taskResult.failLegacy}, ` +
    `fail(deprecated): ${taskResult.failDeprecated}, ` +
    `fail(malformed): ${taskResult.failMalformed}, ` +
    `warn(fields): ${taskResult.warnMissingField}, ` +
    `warn(attachments): ${taskResult.warnAttachment}`
  );
  log(
    `Categories — total: ${categoryResult.total}, ` +
    `pass: ${categoryResult.pass}, ` +
    `fail(legacy): ${categoryResult.failLegacy}, ` +
    `fail(deprecated): ${categoryResult.failDeprecated}, ` +
    `fail(malformed): ${categoryResult.failMalformed}, ` +
    `warn(fields): ${categoryResult.warnMissingField}`
  );
  log();
  log("Note: WARN dimensions overlap with PASS — a new-format document can");
  log("      also appear in a WARN category if it is missing fields or has");
  log("      mismatched attachment paths.");
  log();

  if (totalFail === 0 && totalWarnField === 0 && totalWarnAtt === 0) {
    log("✓ All documents are in the refined readable-ID format with no issues.");
    log("  Migration is complete and verified.");
  } else {
    const legacyTotal     = taskResult.failLegacy + categoryResult.failLegacy;
    const deprecatedTotal = taskResult.failDeprecated + categoryResult.failDeprecated;
    const malformedTotal  = taskResult.failMalformed + categoryResult.failMalformed;

    if (legacyTotal > 0) {
      log(
        `✗ FAIL: ${legacyTotal} document(s) still use legacy auto-IDs. ` +
        "These documents must be re-created with IDs matching the refined format " +
        "(task_<categorySlug>_<titleSlug>_<NNNN> / cat_<orgSlug>_<catSlug>_<xxxx>)."
      );
    }
    if (deprecatedTotal > 0) {
      log(
        `✗ FAIL: ${deprecatedTotal} document(s) use the deprecated task_org_/cat_org_ ` +
        "format. These documents must be re-created with IDs matching the refined format " +
        "(task_<categorySlug>_<titleSlug>_<NNNN> / cat_<orgSlug>_<catSlug>_<xxxx>)."
      );
    }
    if (malformedTotal > 0) {
      log(
        `✗ FAIL: ${malformedTotal} document(s) have a task_/cat_ prefix but do not ` +
        "match the refined ID structure. These documents must be re-created with " +
        "IDs matching the format task_<categorySlug>_<titleSlug>_<NNNN> / cat_<orgSlug>_<catSlug>_<xxxx>."
      );
    }
    if (totalWarnField > 0) {
      log(
        `  WARN: ${totalWarnField} document(s) are in refined format but are ` +
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
        failLegacy: taskResult.failLegacy,
        failDeprecated: taskResult.failDeprecated,
        failMalformed: taskResult.failMalformed,
        fail: taskResult.fail,
        warnFields: taskResult.warnMissingField,
        warnAttachments: taskResult.warnAttachment,
        failLegacyIds: taskResult.failLegacyIds,
        failDeprecatedIds: taskResult.failDeprecatedIds,
        failMalformedIds: taskResult.failMalformedIds,
        warnFieldIds: taskResult.warnFieldIds,
        warnAttachmentIds: taskResult.warnAttachmentIds,
      },
      categories: {
        total: categoryResult.total,
        pass: categoryResult.pass,
        failLegacy: categoryResult.failLegacy,
        failDeprecated: categoryResult.failDeprecated,
        failMalformed: categoryResult.failMalformed,
        fail: categoryResult.fail,
        warnFields: categoryResult.warnMissingField,
        warnAttachments: 0,
        failLegacyIds: categoryResult.failLegacyIds,
        failDeprecatedIds: categoryResult.failDeprecatedIds,
        failMalformedIds: categoryResult.failMalformedIds,
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

  // Exit non-zero for any FAIL-level issue.
  if (totalFail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
