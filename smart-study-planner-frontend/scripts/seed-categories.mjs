/**
 * seed-categories.mjs
 *
 * Inserts fake category documents into your Firestore "categories" collection
 * using the current human-readable ID schema.
 *
 * Every seeded document includes:
 *   - A human-readable document ID:
 *       cat_<orgSlug>_<catSlug>_<NNN>
 *       e.g. cat_org-user-test-001_math_001
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
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs
 *
 * FLAGS
 * ─────
 *   (no flag)          Insert TOTAL_RECORDS fake category documents.
 *   --count=N          Override TOTAL_RECORDS; insert exactly N documents.
 *   --users=u1,u2,...  Override USER_IDS pool; seed only for the listed UIDs.
 *   --dry-run          Preview what would be inserted (count, user IDs, sample
 *                      document IDs) without writing anything to Firestore.
 *                      Does not require GCP_SERVICE_ACCOUNT_JSON to be set.
 *                      Sample IDs assume counters start at 001; actual IDs may
 *                      use higher counters if matching docs already exist.
 *                      Takes precedence over --undo-last, --delete, and --reset
 *                      when combined with those flags.
 *   --undo-last        Delete only the documents written in the most recent
 *                      seeding run (identified by the run ID saved in
 *                      scripts/.last-seed-run-categories.json). Leaves all
 *                      other seed data and real user data untouched.
 *   --delete           Delete only documents where seedData == true.
 *   --reset            Delete ALL documents in the categories collection (full wipe).
 *                      Use this to start completely fresh before reseeding.
 *
 * EXAMPLES
 * ────────
 *   # Preview 100 categories for two specific users (no Firestore writes):
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs --count=100 --users=uid_abc,uid_xyz --dry-run
 *
 *   # Seed 100 categories for two specific users:
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs --count=100 --users=uid_abc,uid_xyz
 *
 *   # Undo only the most recent seeding run (leaves older seed data intact):
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs --undo-last
 *
 *   # Full wipe, then reseed with defaults:
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs --reset
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs
 *
 *   # Only remove seeded documents (leaves real user categories untouched):
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs --delete
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { verifySeedUsers } from "./seed-verify-helper.mjs";

// ── Config ────────────────────────────────────────────────────────────────────

let TOTAL_RECORDS = 500;
const BATCH_SIZE  = 250;
const COLLECTION    = "categories";
const DB_NAME       = "smart-study";
const DRY_RUN_SAMPLE_SIZE = 5;

// Path to the manifest file that records the last run ID.
const __dirname    = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, ".last-seed-run-categories.json");

// Fake data pools — edit freely to match your real data
const CATEGORY_NAMES = [
  "Math",
  "Science",
  "History",
  "English",
  "Computer Science",
  "Art",
  "Music",
  "Physical Education",
  "Geography",
  "Biology",
];

const COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];

// Fake user IDs — replace with real Firebase Auth UIDs if you want to query
// from the app (the app filters by userId == currentUser.uid, so these must
// match the actual Firebase Auth UIDs of your test accounts for the categories
// to appear in the UI).
//
// NOTE: After inserting, this script automatically verifies that every seeded
// userId exists in Firebase Auth and prints a PASS/FAIL summary. If any IDs
// are mismatched the script exits with code 1.
//
// You can find a user's UID in the Firebase console under
// Authentication → Users → copy the User UID column, then re-run:
//
//   node smart-study-planner-frontend/scripts/seed-categories.mjs \
//     --users=<real-uid-1>,<real-uid-2>
let USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// ── ID helpers ────────────────────────────────────────────────────────────────
// These helpers are inlined so the script runs without any frontend build
// tooling.

/**
 * Converts arbitrary text into a lowercase, URL-safe slug.
 * Only keeps letters, digits, and hyphens; collapses repeated hyphens;
 * trims leading/trailing hyphens; truncates to 30 characters.
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Returns the personal org ID for a given UID (used for organizationId field). */
function personalOrgId(uid) {
  return `org_${uid}`;
}

/**
 * Builds a category document ID from pre-slugified segments and a numeric counter.
 * Format: cat_<orgSlug>_<catSlug>_<NNN>
 * Counter is zero-padded to at least 3 digits.
 *
 * Both slug segments are derived from already-slugified input so the result
 * always satisfies the audit regex:
 *   /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/
 */
function buildCategoryId(orgSlug, catSlug, counter) {
  return `cat_${orgSlug}_${catSlug}_${String(counter).padStart(3, "0")}`;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

const dryRun  = args.includes("--dry-run");
const undoLast = args.includes("--undo-last");

// --count=N  → override TOTAL_RECORDS
const countArg = args.find((a) => a.startsWith("--count="));
if (countArg) {
  const raw = countArg.slice("--count=".length);
  if (!/^\d+$/.test(raw) || parseInt(raw, 10) < 1) {
    console.error("ERROR: --count must be a positive integer (e.g. --count=100)");
    process.exit(1);
  }
  TOTAL_RECORDS = parseInt(raw, 10);
}

// --users=uid1,uid2,...  → override USER_IDS
const usersArg = args.find((a) => a.startsWith("--users="));
if (usersArg) {
  const ids = usersArg.slice("--users=".length).split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("ERROR: --users must contain at least one UID (e.g. --users=uid_abc,uid_xyz)");
    process.exit(1);
  }
  USER_IDS = ids;
}

// ── Bootstrap Admin SDK (skipped in dry-run mode) ─────────────────────────────

let db;
let auth;

if (!dryRun) {
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
}

// ── Mode dispatch ─────────────────────────────────────────────────────────────

if (dryRun) {
  await dryRunCategories();
} else if (undoLast) {
  await undoLastRun();
} else if (args.includes("--reset")) {
  await resetCollection();
} else if (args.includes("--delete")) {
  await deleteSeedData();
} else {
  await insertCategories();
}

// ── Dry-run: preview planned inserts without touching Firestore ───────────────

async function dryRunCategories() {
  console.log(`DRY RUN — no data will be written to Firestore.\n`);
  console.log(`  Collection : ${COLLECTION}`);
  console.log(`  Count      : ${TOTAL_RECORDS.toLocaleString()} documents`);
  console.log(`  Users      : ${USER_IDS.join(", ")}\n`);

  // Plan all records (same logic as insertCategories, without the counter queries)
  const planned = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    const userId       = pick(USER_IDS);
    const categoryName = pick(CATEGORY_NAMES);
    planned.push({ userId, categoryName });
  }

  // Collect unique (orgSlug, catSlug) pairs and assign sequential counters
  // starting at 1 (dry-run doesn't query existing Firestore counters).
  const uniqueGroups = new Map();
  for (const item of planned) {
    const orgSlug = slugify(personalOrgId(item.userId));
    const catSlug = slugify(item.categoryName);
    const key     = `${orgSlug}|${catSlug}`;
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, { orgSlug, catSlug });
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
    const { userId, categoryName } = planned[i];
    const orgSlug = slugify(personalOrgId(userId));
    const catSlug = slugify(categoryName);
    const key     = `${orgSlug}|${catSlug}`;
    const counter = tempCounters.get(key);
    tempCounters.set(key, counter + 1);
    sampleIds.push(buildCategoryId(orgSlug, catSlug, counter));
  }

  console.log(`  Unique (org, category) groups : ${uniqueGroups.size}`);
  console.log(`  Sample document IDs (first ${sampleIds.length}):`);
  sampleIds.forEach((id) => console.log(`    ${id}`));
  console.log(`\n  NOTE: Sample IDs above assume counters start at 001. If matching documents`);
  console.log(`        already exist in Firestore the real IDs will use higher counter values.`);
  console.log(`\n  (Remove --dry-run to write ${TOTAL_RECORDS.toLocaleString()} documents to Firestore.)`);
}

// ── Undo last: delete only the most recent run's documents ────────────────────

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
  console.log(`  Expected  : ~${count} document(s)\n`);

  const snap = await db
    .collection(COLLECTION)
    .where("seedRunId", "==", runId)
    .get();

  const total = snap.size;
  if (total === 0) {
    console.log("  No documents found for this run (already deleted?).");
    return;
  }

  console.log(`  Found ${total} document(s). Deleting in batches of ${BATCH_SIZE} …`);

  let deleted = 0;
  while (deleted < total) {
    const chunk = snap.docs.slice(deleted, deleted + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${total}`);
  }

  console.log(`\n✓ Done. ${deleted} document(s) from run "${runId}" removed.`);
  console.log("  Other seed data and real user data are untouched.");
}

// ── Reset: delete ALL documents ───────────────────────────────────────────────

async function resetCollection() {
  console.log(`⚠️  RESET MODE: deleting ALL documents in "${COLLECTION}" …`);
  console.log("    (This removes real user categories too, not just seed data.)");

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
  console.log(`Delete mode: removing all documents where seedData == true …`);
  const snap = await db.collection(COLLECTION).where("seedData", "==", true).get();
  const total = snap.size;
  console.log(`Found ${total} seed documents. Deleting in batches of ${BATCH_SIZE} …`);

  let deleted = 0;
  while (deleted < total) {
    const chunk = snap.docs.slice(deleted, deleted + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${total}`);
  }

  console.log(`✓ Done. ${deleted} seed document(s) removed.`);
}

// ── Insert: write TOTAL_RECORDS categories with the new schema ────────────────

/**
 * Queries Firestore for the maximum existing numeric counter among all category
 * documents whose IDs start with `cat_<orgSlug>_<catSlug>_`.
 * Returns 0 if no such documents exist yet.
 */
async function fetchMaxCounter(orgSlug, catSlug) {
  const prefix = `cat_${orgSlug}_${catSlug}_`;
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

async function insertCategories() {
  // Generate a unique run ID for this seeding session.
  // Stored on every document so --undo-last can target exactly this run.
  const seedRunId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`Inserting ${TOTAL_RECORDS.toLocaleString()} fake categories into "${COLLECTION}" …`);
  console.log(`  Run ID: ${seedRunId}`);
  console.log("  Each document will use the current readable-ID schema.\n");

  // ── Step 1: plan all categories (choose user + category name for each record)
  const planned = [];
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    const userId       = pick(USER_IDS);
    const categoryName = pick(CATEGORY_NAMES);
    planned.push({ userId, categoryName });
  }

  // ── Step 2: collect unique (orgSlug, catSlug) pairs ─────────────────────────
  const uniqueGroups = new Map(); // key: "orgSlug|catSlug" → { orgSlug, catSlug }
  for (const item of planned) {
    const orgSlug = slugify(personalOrgId(item.userId));
    const catSlug = slugify(item.categoryName);
    const key     = `${orgSlug}|${catSlug}`;
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, { orgSlug, catSlug });
    }
  }

  // ── Step 3: query Firestore for the max existing counter per group ──────────
  // Queries are run in parallel (Promise.all) since groups are independent.
  console.log(`  Querying existing counters for ${uniqueGroups.size} unique (org, category) group(s) …`);
  const groupCounters = new Map(); // key: "orgSlug|catSlug" → next counter to assign
  await Promise.all(
    Array.from(uniqueGroups.entries()).map(async ([key, { orgSlug, catSlug }]) => {
      const maxExisting = await fetchMaxCounter(orgSlug, catSlug);
      groupCounters.set(key, maxExisting + 1);
    })
  );

  // ── Step 4: assign IDs and insert in batches ────────────────────────────────
  let inserted = 0;

  while (inserted < TOTAL_RECORDS) {
    const batch = db.batch();
    const count = Math.min(BATCH_SIZE, TOTAL_RECORDS - inserted);

    for (let i = 0; i < count; i++) {
      const { userId, categoryName } = planned[inserted + i];
      const orgId   = personalOrgId(userId);
      const orgSlug = slugify(orgId);
      const catSlug = slugify(categoryName);
      const key     = `${orgSlug}|${catSlug}`;

      const counter = groupCounters.get(key);
      groupCounters.set(key, counter + 1);

      const categoryId = buildCategoryId(orgSlug, catSlug, counter);

      const ref = db.collection(COLLECTION).doc(categoryId);
      batch.set(ref, {
        name:           categoryName,
        color:          pick(COLORS),
        userId,
        organizationId: orgId,
        readableId:     categoryId,
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

  console.log(`\n✓ Done! ${inserted.toLocaleString()} categories written to Firestore.`);
  console.log(`\n  Every document now has:`);
  console.log(`    - A readable ID:    cat_<orgSlug>_<catSlug>_<NNN>`);
  console.log(`    - organizationId:   org_<userId>`);
  console.log(`    - readableId:       (same as document ID)`);
  console.log(`    - seedData: true    (so you can clean up later)`);
  console.log(`    - seedRunId:        ${seedRunId}\n`);
  console.log(
    "  To undo only this run:\n" +
    "    node smart-study-planner-frontend/scripts/seed-categories.mjs --undo-last\n" +
    "  To delete only seed data later:\n" +
    "    node smart-study-planner-frontend/scripts/seed-categories.mjs --delete\n" +
    "  To wipe everything and start fresh:\n" +
    "    node smart-study-planner-frontend/scripts/seed-categories.mjs --reset"
  );

  const allPass = await verifySeedUsers(db, auth, COLLECTION);
  if (!allPass) process.exit(1);
}
