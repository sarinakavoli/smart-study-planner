/**
 * seed-tasks.mjs
 *
 * Inserts fake task documents into your Firestore "tasks" collection using
 * the current human-readable ID schema.
 *
 * Every seeded document includes:
 *   - A human-readable document ID:
 *       task_<categorySlug>_<titleSlug>_<NNN>
 *       e.g. task_math_read-chapter_001
 *   - organizationId field          (= "org_<uid>")
 *   - readableId field              (copy of the document ID for debugging)
 *   - seedData: true                (so you can delete only seed data later)
 *   - seedRunId: "<run-id>"         (identifies the specific seeding run)
 *
 * HOW TO RUN
 * ──────────
 * Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret (the full JSON
 * content of your Firebase Admin SDK service account key), then run from the
 * workspace root:
 *
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 * FLAGS
 * ─────
 *   (no flag)          Insert TOTAL_RECORDS fake task documents.
 *   --count=N          Override TOTAL_RECORDS; insert exactly N documents.
 *   --users=u1,u2,...  Override USER_IDS pool; seed only for the listed UIDs.
 *   --email=a@b,...    Resolve one or more email addresses to Firebase Auth UIDs
 *                      automatically, then seed for those UIDs.
 *                      Requires GCP_SERVICE_ACCOUNT_JSON to be set.
 *                      Cannot be combined with --users.
 *   --dry-run          Preview what would happen without writing or deleting
 *                      anything in Firestore.
 *                      Does not require GCP_SERVICE_ACCOUNT_JSON to be set.
 *                      When combined with --delete or --undo-last, previews
 *                      which documents would be deleted (user scope, filter).
 *                      When combined with insert flags, sample IDs assume
 *                      counters start at 001; actual IDs may use higher
 *                      counters if matching docs already exist.
 *                      Takes precedence over --undo-last, --delete, and --reset
 *                      when combined with those flags.
 *                      Note: --email addresses are not resolved in dry-run mode;
 *                      they are shown as-is in the user list.
 *   --undo-last        Delete only the documents written in the most recent
 *                      seeding run (identified by the run ID saved in
 *                      scripts/.last-seed-run-tasks.json). Leaves all other
 *                      seed data and real user data untouched.
 *                      When combined with --email, --users, or .seed-users,
 *                      deletes only the matching run documents belonging to
 *                      those users.
 *   --delete           Delete only documents where seedData == true.
 *                      When combined with --email or --users (or .seed-users),
 *                      deletes only seed documents belonging to those users.
 *   --reset            Delete ALL documents in the tasks collection (full wipe).
 *                      Use this to start completely fresh before reseeding.
 *   --skip-verify      Skip the post-insert seed-user verification step.
 *                      Useful in CI/scripting scenarios where the caller wants
 *                      to suppress the Auth lookup that runs after an insert.
 *                      Has no effect in --delete, --reset, or --undo-last modes
 *                      (verification is never run in those modes anyway).
 *
 * ENVIRONMENT VARIABLES
 * ─────────────────────
 *   GCP_SERVICE_ACCOUNT_JSON
 *                      Required for all live operations (insert, delete, reset,
 *                      undo-last, email resolution).  Set it as a Replit Secret
 *                      containing the full JSON content of your Firebase Admin
 *                      SDK service account key.  Not required for --dry-run.
 *
 *   SEED_USERS_PATH_OVERRIDE
 *                      Override the path to the .seed-users config file.
 *                      Default: scripts/.seed-users
 *                               (the .seed-users file next to this script)
 *                      Useful in CI or multi-project setups where the config
 *                      file lives outside the scripts directory.
 *
 *                      Example:
 *                        SEED_USERS_PATH_OVERRIDE=/tmp/my-users.json \
 *                          node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 *                      Expected JSON shape (same as .seed-users):
 *                        {
 *                          "users": [
 *                            "alice@example.com",
 *                            "firebase-uid-xyz"
 *                          ]
 *                        }
 *
 * .SEED-USERS CONFIG FILE
 * ───────────────────────
 *   If neither --users nor --email is supplied, the script looks for a
 *   scripts/.seed-users file.  When found, the users listed there are used
 *   instead of the default placeholder IDs.
 *
 *   Each entry can be an email address (resolved via Firebase Auth) or a raw UID.
 *   Copy scripts/.seed-users.example to scripts/.seed-users and fill it in:
 *
 *   {
 *     "users": [
 *       "alice@example.com",
 *       "bob@example.com"
 *     ]
 *   }
 *
 *   The .seed-users file is gitignored so personal account details stay local.
 *
 * EXAMPLES
 * ────────
 *   # Seed for a logged-in account using your email (no UID copy-paste needed):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --email=you@example.com
 *
 *   # Preview 200 tasks for one specific user (no Firestore writes):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --count=200 --users=uid_abc --dry-run
 *
 *   # Seed 200 tasks for one specific user:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --count=200 --users=uid_abc
 *
 *   # Undo only the most recent seeding run (leaves older seed data intact):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --undo-last
 *
 *   # Full wipe, then reseed with defaults:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --reset
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 *   # Only remove seeded documents (leaves real user tasks untouched):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete
 *
 *   # Remove seeded documents for a single user only (scoped delete):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --email=you@example.com --delete
 *
 *   # Remove seeded documents for a specific UID only (scoped delete):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --users=uid123 --delete
 *
 *   # Preview which documents would be deleted for a specific user (no writes):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --email=you@example.com --delete --dry-run
 *
 *   # Undo the last run for a specific user only:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --email=you@example.com --undo-last
 *
 *   # Seed and skip the post-insert Auth verification (e.g. in CI):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --skip-verify
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { verifySeedUsersOrExit } from "./seed-verify-helper.mjs";
import { loadSeedUsersFile, resolveMixedEntries } from "./seed-user-resolver.mjs";
import { fetchDeleteDocs, fetchUndoLastDocs } from "./seed-firestore-helpers.mjs";
import { slugify, personalOrgId, buildTaskId } from "./seed-id-helpers.mjs";
import { updateSeedCounts } from "./seed-counts-helper.mjs";

// ── Config ────────────────────────────────────────────────────────────────────

let TOTAL_RECORDS = 10_000;
const BATCH_SIZE  = 250;
const COLLECTION    = "tasks";
const DB_NAME       = "smart-study";
const DRY_RUN_SAMPLE_SIZE = 5;

// Path to the manifest file that records the last run ID.
const __dirname     = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, ".last-seed-run-tasks.json");
const SEED_COUNTS_PATH = join(__dirname, ".seed-counts.json");

// Fake data pools — edit freely to match your real data
const CATEGORIES = ["Math", "Science", "History", "English", "Computer Science", "Art"];
const STATUSES   = ["PENDING", "IN_PROGRESS", "DONE"];
const TITLES     = [
  "Read chapter {n}",
  "Complete problem set {n}",
  "Review notes for week {n}",
  "Write essay draft {n}",
  "Practice problems {n}",
  "Watch lecture {n}",
  "Summarise textbook section {n}",
  "Prepare flashcards {n}",
];

// Fake user IDs — replace with real Firebase Auth UIDs if you want to query
// from the app (the app filters by userId == currentUser.uid, so these must
// match the actual Firebase Auth UIDs of your test accounts for the tasks
// to appear in the UI).
//
// NOTE: After inserting, this script automatically verifies that every seeded
// userId exists in Firebase Auth and prints a PASS/FAIL summary. If any IDs
// are mismatched the script exits with code 1.
//
// You can find a user's UID in the Firebase console under
// Authentication → Users → copy the User UID column, then re-run:
//
//   node smart-study-planner-frontend/scripts/seed-tasks.mjs \
//     --users=<real-uid-1>,<real-uid-2>
let USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// ── Data helpers ──────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns a YYYY-MM-DD date string offset by `days` from today. */
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

/** Saves the run manifest so --undo-last can identify the most recent run. */
function saveManifest(runId, count, users) {
  const manifest = { runId, count, users, timestamp: new Date().toISOString() };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/** Loads the last run manifest. Returns null if no manifest exists. */
function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

// ── CLI flag parsing ──────────────────────────────────────────────────────────
// Parsed BEFORE SDK init so --dry-run works without GCP credentials.

const args = process.argv.slice(2);

const dryRun     = args.includes("--dry-run");
const undoLast   = args.includes("--undo-last");
const skipVerify = args.includes("--skip-verify");

// --count=N  → override TOTAL_RECORDS
const countArg = args.find((a) => a.startsWith("--count="));
if (countArg) {
  const raw = countArg.slice("--count=".length);
  if (!/^\d+$/.test(raw) || parseInt(raw, 10) < 1) {
    console.error("ERROR: --count must be a positive integer (e.g. --count=200)");
    process.exit(1);
  }
  TOTAL_RECORDS = parseInt(raw, 10);
}

// --users=uid1,uid2,...  → override USER_IDS with raw UIDs
const usersArg = args.find((a) => a.startsWith("--users="));

// Tracks whether the user list was explicitly provided (vs. falling back to
// the built-in placeholder IDs). When true, --delete and --undo-last will
// filter by userId so only the specified accounts are affected.
let userFilterActive = false;

if (usersArg) {
  const ids = usersArg.slice("--users=".length).split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("ERROR: --users must contain at least one UID (e.g. --users=uid_abc,uid_xyz)");
    process.exit(1);
  }
  USER_IDS = ids;
  userFilterActive = true;
}

// --email=a@b.com,...  → resolve email addresses to UIDs after SDK init
const emailArg = args.find((a) => a.startsWith("--email="));
let EMAIL_ENTRIES = null; // non-null means we need to resolve after SDK init

if (emailArg) {
  if (usersArg) {
    console.error("ERROR: --email and --users cannot be used together. Pick one.");
    process.exit(1);
  }
  const entries = emailArg.slice("--email=".length).split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) {
    console.error("ERROR: --email must contain at least one address (e.g. --email=you@example.com)");
    process.exit(1);
  }
  EMAIL_ENTRIES = entries;
  userFilterActive = true;
  // In dry-run mode show the emails as-is (cannot resolve without credentials)
  if (dryRun) {
    USER_IDS = entries;
  }
}

// If neither --users nor --email was given, check for a .seed-users config file
let SEED_FILE_ENTRIES = null; // non-null means file was loaded and may need resolving

if (!usersArg && !emailArg) {
  const fileEntries = loadSeedUsersFile();
  if (fileEntries) {
    console.log(`  Loading users from scripts/.seed-users (${fileEntries.length} entry/entries) …`);
    SEED_FILE_ENTRIES = fileEntries;
    userFilterActive = true;
    // In dry-run mode use entries as-is (emails won't be resolved)
    if (dryRun) {
      USER_IDS = fileEntries;
    }
  }
}

// ── Bootstrap Admin SDK (skipped in dry-run mode) ─────────────────────────────

let db;
let auth;

if (!dryRun && !process.env.SEED_VERIFY_MOCK_JSON) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");

  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error(
      "ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.\n" +
      "       Add it as a Replit Secret (the full JSON content of your service account key).\n" +
      "       Tip: use --dry-run to preview inserts without credentials."
    );
    process.exit(1);
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  initializeApp({ credential: cert(serviceAccount) });
  db   = getFirestore(DB_NAME);
  auth = getAuth();

  // Resolve --email entries to UIDs now that the Auth SDK is ready
  if (EMAIL_ENTRIES) {
    USER_IDS = await resolveMixedEntries(auth, EMAIL_ENTRIES);
    console.log();
  }

  // Resolve .seed-users file entries (may include emails) to UIDs
  if (SEED_FILE_ENTRIES) {
    USER_IDS = await resolveMixedEntries(auth, SEED_FILE_ENTRIES);
    console.log();
  }
}

// ── Mode dispatch ─────────────────────────────────────────────────────────────

if (dryRun) {
  await dryRunTasks();
} else if (undoLast) {
  await undoLastRun();
} else if (args.includes("--reset")) {
  await resetCollection();
} else if (args.includes("--delete")) {
  await deleteSeedData();
} else {
  await insertTasks();
}

// ── Dry-run: preview planned inserts without touching Firestore ───────────────

async function dryRunTasks() {
  // When combined with --delete or --undo-last, show a deletion preview
  // instead of the usual insert preview.
  if (args.includes("--delete")) {
    console.log(`DRY RUN — no data will be deleted from Firestore.\n`);
    console.log(`  Operation  : --delete (remove seed documents where seedData == true)`);
    console.log(`  Collection : ${COLLECTION}`);
    if (userFilterActive) {
      console.log(`  User scope : ${USER_IDS.join(", ")}`);
      console.log(`  Filter     : seedData == true AND userId IN [listed users]`);
    } else {
      console.log(`  User scope : ALL users (no --email, --users, or .seed-users filter)`);
      console.log(`  Filter     : seedData == true`);
    }
    console.log(`\n  (Remove --dry-run to execute the delete.)`);
    return;
  }

  if (args.includes("--undo-last")) {
    console.log(`DRY RUN — no data will be deleted from Firestore.\n`);
    console.log(`  Operation  : --undo-last`);
    console.log(`  Collection : ${COLLECTION}`);
    const manifest = loadManifest();
    if (manifest) {
      console.log(`  Run ID     : ${manifest.runId}`);
      console.log(`  Seeded at  : ${manifest.timestamp}`);
      console.log(`  Run users  : ${manifest.users.join(", ")}`);
    } else {
      console.log(`  Run ID     : (no manifest found at ${MANIFEST_PATH} — nothing to undo)`);
    }
    if (userFilterActive) {
      console.log(`  User scope : ${USER_IDS.join(", ")}`);
      console.log(`  Filter     : seedRunId == <run-id> AND userId IN [listed users]`);
    } else {
      console.log(`  User scope : ALL users (no --email, --users, or .seed-users filter)`);
      console.log(`  Filter     : seedRunId == <run-id>`);
    }
    console.log(`\n  (Remove --dry-run to execute the undo.)`);
    return;
  }

  console.log(`DRY RUN — no data will be written to Firestore.\n`);
  console.log(`  Collection : ${COLLECTION}`);
  console.log(`  Count      : ${TOTAL_RECORDS.toLocaleString()} documents`);
  console.log(`  Users      : ${USER_IDS.join(", ")}\n`);

  // Plan all records (same logic as insertTasks, without the counter queries)
  const planned = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    const userId        = pick(USER_IDS);
    const categoryName  = pick(CATEGORIES);
    const titleTemplate = pick(TITLES);
    const displayTitle  = titleTemplate.replace("{n}", i + 1);
    const dayOffset     = Math.floor(Math.random() * 60) - 30;
    planned.push({ userId, categoryName, titleTemplate, displayTitle, dayOffset });
  }

  // Collect unique (categorySlug, titleSlug) pairs and assign sequential
  // counters starting at 1 (dry-run doesn't query existing Firestore counters).
  const uniqueGroups = new Map();
  for (const task of planned) {
    const categorySlug = slugify(task.categoryName);
    const titleSlug    = slugify(task.titleTemplate.replace(/\s*\{n\}/, ""));
    const key          = `${categorySlug}|${titleSlug}`;
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, { categorySlug, titleSlug });
    }
  }

  const groupCounters = new Map();
  for (const [key] of uniqueGroups) {
    groupCounters.set(key, 1);
  }

  // Build sample IDs from the first DRY_RUN_SAMPLE_SIZE planned records
  const sampleIds = [];
  const tempCounters = new Map(groupCounters);
  for (let i = 0; i < Math.min(DRY_RUN_SAMPLE_SIZE, planned.length); i++) {
    const { categoryName, titleTemplate } = planned[i];
    const categorySlug = slugify(categoryName);
    const titleSlug    = slugify(titleTemplate.replace(/\s*\{n\}/, ""));
    const key          = `${categorySlug}|${titleSlug}`;
    const counter      = tempCounters.get(key);
    tempCounters.set(key, counter + 1);
    sampleIds.push(buildTaskId(categorySlug, titleSlug, counter));
  }

  console.log(`  Unique (category, title) groups : ${uniqueGroups.size}`);
  console.log(`  Sample document IDs (first ${sampleIds.length}):`);
  sampleIds.forEach((id) => console.log(`    ${id}`));
  console.log(`\n  NOTE: Sample IDs above assume counters start at 001. If matching documents`);
  console.log(`        already exist in Firestore the real IDs will use higher counter values.`);
  console.log(`\n  Flags:`);
  console.log(`    --skip-verify  Skip the post-insert Auth verification step.`);
  console.log(`\n  (Remove --dry-run to write ${TOTAL_RECORDS.toLocaleString()} documents to Firestore.)`);
}

// ── Undo last: delete only the most recent run's documents ────────────────────

/**
 * Fetches all documents matching seedRunId == runId, optionally also filtered
 * by userId when userFilterActive is true. Delegates to the shared helper in
 * seed-firestore-helpers.mjs so the query logic can be unit-tested.
 */
async function fetchUndoLastDocsLocal(runId) {
  return fetchUndoLastDocs(db, COLLECTION, runId, userFilterActive, USER_IDS);
}

async function undoLastRun() {
  const manifest = loadManifest();
  if (!manifest) {
    console.error(
      "ERROR: No previous seeding run found.\n" +
      `       Expected manifest at: ${MANIFEST_PATH}\n` +
      "       Run the script without flags first to seed some data."
    );
    process.exit(1);
  }

  const { runId, count, users, timestamp } = manifest;
  console.log(`Undo last run: removing documents from run "${runId}"`);
  console.log(`  Seeded at : ${timestamp}`);
  console.log(`  Users     : ${users.join(", ")}`);
  if (userFilterActive) {
    console.log(`  Scoped to : ${USER_IDS.join(", ")} (only these users' documents will be removed)`);
  }
  console.log(`  Expected  : ~${count} document(s)\n`);

  const docs = await fetchUndoLastDocsLocal(runId);
  const total = docs.length;

  if (total === 0) {
    console.log("  No documents found for this run (already deleted?).");
    return;
  }

  console.log(`  Found ${total} document(s). Deleting in batches of ${BATCH_SIZE} …`);

  let deleted = 0;
  while (deleted < total) {
    const chunk = docs.slice(deleted, deleted + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${total}`);
  }

  console.log(`\n✓ Done. ${deleted} document(s) from run "${runId}" removed.`);
  if (userFilterActive) {
    console.log(`  Documents for other users in this run are untouched.`);
  }
  console.log("  Other seed data and real user data are untouched.");
}

// ── Reset: delete ALL documents ───────────────────────────────────────────────

async function resetCollection() {
  console.log(`⚠️  RESET MODE: deleting ALL documents in "${COLLECTION}" …`);
  console.log("    (This removes real user tasks too, not just seed data.)");

  let totalDeleted = 0;

  while (true) {
    const snap = await db.collection(COLLECTION).limit(BATCH_SIZE).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    process.stdout.write(`\r  Deleted ${totalDeleted} documents so far …`);
  }

  console.log(`\n✓ Reset complete. Deleted ${totalDeleted} document(s).`);
  console.log("  Run without flags to reseed with the new schema.");
}

// ── Delete: remove only seedData == true documents ────────────────────────────

async function deleteSeedData() {
  if (userFilterActive) {
    console.log(`Delete mode: removing seed documents for user(s): ${USER_IDS.join(", ")} …`);
  } else {
    console.log(`Delete mode: removing all documents where seedData == true …`);
  }

  const allDocs = await fetchDeleteDocs(db, COLLECTION, userFilterActive, USER_IDS);

  const total = allDocs.length;
  console.log(`Found ${total} seed documents. Deleting in batches of ${BATCH_SIZE} …`);

  let deleted = 0;
  while (deleted < total) {
    const chunk = allDocs.slice(deleted, deleted + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${total}`);
  }

  console.log(`✓ Done. ${deleted} seed document(s) removed.`);
}

// ── Insert: write TOTAL_RECORDS tasks with the new schema ─────────────────────

/**
 * Queries Firestore for the maximum existing numeric counter among all task
 * documents whose IDs start with `task_<categorySlug>_<titleSlug>_`.
 * Returns 0 if no such documents exist yet.
 */
async function fetchMaxCounter(categorySlug, titleSlug) {
  const prefix = `task_${categorySlug}_${titleSlug}_`;
  const snap = await db
    .collection(COLLECTION)
    .orderBy("__name__")
    .startAt(prefix)
    .endBefore(prefix + "\uffff")
    .get();

  let max = 0;
  for (const doc of snap.docs) {
    const suffix = doc.id.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

async function insertTasks() {
  if (process.env.SEED_VERIFY_MOCK_JSON) {
    console.log("(Mock mode: skipping Firestore writes, running post-insert verification only.)");
    if (!skipVerify) {
      await verifySeedUsersOrExit(db, auth, COLLECTION);
    }
    return;
  }

  // Generate a unique run ID for this seeding session.
  // Stored on every document so --undo-last can target exactly this run.
  const seedRunId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`Inserting ${TOTAL_RECORDS.toLocaleString()} fake tasks into "${COLLECTION}" …`);
  console.log(`  Run ID: ${seedRunId}`);
  console.log("  Each document will use the current readable-ID schema.\n");

  // ── Step 1: plan all tasks (choose category + title template for each record)
  // titleTemplate is the raw template string (e.g. "Read chapter {n}").
  // displayTitle substitutes the global index for the display field.
  // The slug is derived from the template only (without {n}), so all tasks
  // sharing the same template and category are in the same counter group.
  // This keeps the number of unique groups bounded at
  // CATEGORIES.length × TITLES.length (at most 48) instead of TOTAL_RECORDS.
  const planned = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    const userId        = pick(USER_IDS);
    const categoryName  = pick(CATEGORIES);
    const titleTemplate = pick(TITLES);
    const displayTitle  = titleTemplate.replace("{n}", i + 1);
    const dayOffset     = Math.floor(Math.random() * 60) - 30;
    planned.push({ userId, categoryName, titleTemplate, displayTitle, dayOffset });
  }

  // ── Step 2: collect unique (categorySlug, titleSlug) pairs ──────────────────
  // Slug is based on the template (without the numeric suffix) so that all
  // instances of the same template land in the same counter group.
  const uniqueGroups = new Map(); // key: "catSlug|titleSlug" → { categorySlug, titleSlug }
  for (const task of planned) {
    const categorySlug = slugify(task.categoryName);
    const titleSlug    = slugify(task.titleTemplate.replace(/\s*\{n\}/, ""));
    const key          = `${categorySlug}|${titleSlug}`;
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, { categorySlug, titleSlug });
    }
  }

  // ── Step 3: query Firestore for the max existing counter per group ──────────
  // Queries are run in parallel (Promise.all) since groups are independent.
  console.log(`  Querying existing counters for ${uniqueGroups.size} unique (category, title) group(s) …`);
  const groupCounters = new Map(); // key: "catSlug|titleSlug" → next counter to assign
  await Promise.all(
    Array.from(uniqueGroups.entries()).map(async ([key, { categorySlug, titleSlug }]) => {
      const maxExisting = await fetchMaxCounter(categorySlug, titleSlug);
      groupCounters.set(key, maxExisting + 1);
    })
  );

  // ── Step 4: assign IDs and insert in batches ────────────────────────────────
  let inserted = 0;

  while (inserted < TOTAL_RECORDS) {
    const batch = db.batch();
    const count = Math.min(BATCH_SIZE, TOTAL_RECORDS - inserted);

    for (let i = 0; i < count; i++) {
      const { userId, categoryName, titleTemplate, displayTitle, dayOffset } = planned[inserted + i];
      const categorySlug = slugify(categoryName);
      const titleSlug    = slugify(titleTemplate.replace(/\s*\{n\}/, ""));
      const key          = `${categorySlug}|${titleSlug}`;

      const counter = groupCounters.get(key);
      groupCounters.set(key, counter + 1);

      const taskId = buildTaskId(categorySlug, titleSlug, counter);
      const orgId  = personalOrgId(userId);

      const ref = db.collection(COLLECTION).doc(taskId);
      batch.set(ref, {
        title:          displayTitle,
        description:    `Auto-generated task ${inserted + i + 1} for load testing.`,
        category:       categoryName,
        status:         pick(STATUSES),
        dueDate:        dateOffset(dayOffset),
        userId,
        organizationId: orgId,
        readableId:     taskId,
        attachments:    [],
        seedData:       true,
        seedRunId,
        createdAt:      new Date().toISOString(),
      });
    }

    await batch.commit();
    inserted += count;
    process.stdout.write(
      `\r  Progress: ${inserted.toLocaleString()} / ${TOTAL_RECORDS.toLocaleString()}`
    );
  }

  // Save manifest so --undo-last can target this run
  saveManifest(seedRunId, inserted, USER_IDS);

  // Update shared count metadata so dry-run reports stay accurate
  updateSeedCounts(SEED_COUNTS_PATH, COLLECTION, inserted);

  console.log(`\n✓ Done! ${inserted.toLocaleString()} tasks written to Firestore.`);
  console.log(`\n  Every document now has:`);
  console.log(`    - A readable ID:    task_<categorySlug>_<titleSlug>_<NNN>`);
  console.log(`    - organizationId:   org_<userId>`);
  console.log(`    - readableId:       (same as document ID)`);
  console.log(`    - seedData: true    (so you can clean up later)`);
  console.log(`    - seedRunId:        ${seedRunId}\n`);
  console.log(
    "  To undo only this run:\n" +
    "    node smart-study-planner-frontend/scripts/seed-tasks.mjs --undo-last\n" +
    "  To delete only seed data later:\n" +
    "    node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete\n" +
    "  To wipe everything and start fresh:\n" +
    "    node smart-study-planner-frontend/scripts/seed-tasks.mjs --reset"
  );

  if (skipVerify) {
    console.log("\n  (Skipping post-insert verification — --skip-verify flag is set.)");
  } else {
    await verifySeedUsersOrExit(db, auth, COLLECTION);
  }
}
