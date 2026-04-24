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
 *   --delete           Delete only documents where seedData == true.
 *   --reset            Delete ALL documents in the tasks collection (full wipe).
 *                      Use this to start completely fresh before reseeding.
 *
 * EXAMPLES
 * ────────
 *   # Seed 200 tasks for one specific user:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --count=200 --users=uid_abc
 *
 *   # Full wipe, then reseed with defaults:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --reset
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 *   # Only remove seeded documents (leaves real user tasks untouched):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ────────────────────────────────────────────────────────────────────

let TOTAL_RECORDS = 10_000;
const BATCH_SIZE  = 250;
const COLLECTION    = "tasks";
const DB_NAME       = "smart-study";

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
// from the app (the app filters by userId, so these must match your real UID
// for the tasks to appear in the UI).
let USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// ── ID helpers ────────────────────────────────────────────────────────────────
// These helpers are inlined so the script runs without any frontend build
// tooling. NOTE: src/utils/firestoreIds.js uses a different task ID format
// (it includes a short user prefix and a random alphanumeric suffix). The
// seed script intentionally uses the simpler task_<catSlug>_<titleSlug>_<NNN>
// format that matches the audit regex in audit-readable-ids.mjs.

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
 * Builds a task document ID from pre-slugified segments and a numeric counter.
 * Format: task_<categorySlug>_<titleSlug>_<NNN>
 * Counter is zero-padded to at least 3 digits.
 */
function buildTaskId(categorySlug, titleSlug, counter) {
  return `task_${categorySlug}_${titleSlug}_${String(counter).padStart(3, "0")}`;
}

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

// ── Bootstrap Admin SDK ───────────────────────────────────────────────────────

const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error(
    "ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.\n" +
    "       Add it as a Replit Secret (the full JSON content of your service account key)."
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_NAME);

// ── CLI flag parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

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

// ── Mode dispatch ─────────────────────────────────────────────────────────────

if (args.includes("--reset")) {
  await resetCollection();
} else if (args.includes("--delete")) {
  await deleteSeedData();
} else {
  await insertTasks();
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
  console.log(`Inserting ${TOTAL_RECORDS.toLocaleString()} fake tasks into "${COLLECTION}" …`);
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
        createdAt:      new Date().toISOString(),
      });
    }

    await batch.commit();
    inserted += count;
    process.stdout.write(
      `\r  Progress: ${inserted.toLocaleString()} / ${TOTAL_RECORDS.toLocaleString()}`
    );
  }

  console.log(`\n✓ Done! ${inserted.toLocaleString()} tasks written to Firestore.`);
  console.log(`\n  Every document now has:`);
  console.log(`    - A readable ID:    task_<categorySlug>_<titleSlug>_<NNN>`);
  console.log(`    - organizationId:   org_<userId>`);
  console.log(`    - readableId:       (same as document ID)`);
  console.log(`    - seedData: true    (so you can clean up later)\n`);
  console.log(
    "  To delete only seed data later:\n" +
    "    node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete\n" +
    "  To wipe everything and start fresh:\n" +
    "    node smart-study-planner-frontend/scripts/seed-tasks.mjs --reset"
  );
}
