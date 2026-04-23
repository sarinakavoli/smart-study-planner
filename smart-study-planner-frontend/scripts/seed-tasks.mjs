/**
 * seed-tasks.mjs
 *
 * Inserts fake task documents into your Firestore "tasks" collection using
 * the new readable-ID schema introduced in Task #112.
 *
 * Every seeded document now includes:
 *   - A human-readable document ID:  task_<orgId>_<userId>_<nanoid10>
 *   - organizationId field          (matches the personal org: org_<uid>)
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
 *   (no flag)   Insert TOTAL_RECORDS fake task documents.
 *   --delete    Delete only documents where seedData == true.
 *   --reset     Delete ALL documents in the tasks collection (full wipe).
 *               Use this to start completely fresh before reseeding.
 *
 * EXAMPLES
 * ────────
 *   # Full wipe, then reseed:
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --reset
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 *   # Only remove seeded documents (leaves real user tasks untouched):
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────

const TOTAL_RECORDS = 10_000;
const BATCH_SIZE    = 250;          // 250 docs × 2 ops (set) = safe under Firestore 500 op limit
const COLLECTION    = "tasks";
const DB_NAME       = "smart-study"; // your named Firestore database

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
const USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// ── ID helpers ────────────────────────────────────────────────────────────────
// These mirror src/utils/firestoreIds.js exactly.
// They are inlined here so the script runs without any frontend build tooling.

const URL_SAFE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** Generates a URL-safe random string of `size` characters. */
function nanoid(size = 10) {
  return Array.from(randomBytes(size))
    .map((b) => URL_SAFE_ALPHABET[b % URL_SAFE_ALPHABET.length])
    .join("");
}

/** Returns the personal org ID for a given UID. Must match personalOrgId() in firestoreIds.js. */
function personalOrgId(uid) {
  return `org_${uid}`;
}

/** Generates a readable unique task document ID. Must match generateTaskId() in firestoreIds.js. */
function generateTaskId(orgId, userId) {
  return `task_${orgId}_${userId}_${nanoid(10)}`;
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

/** Generates one fake task document + its readable ID. */
function fakeTask(index) {
  const userId    = pick(USER_IDS);
  const orgId     = personalOrgId(userId);
  const taskId    = generateTaskId(orgId, userId);
  const dayOffset = Math.floor(Math.random() * 60) - 30; // -30 to +30 days
  const title     = pick(TITLES).replace("{n}", index + 1);

  return {
    id: taskId,   // used to set the Firestore doc ID; not stored as a field
    data: {
      title,
      description: `Auto-generated task ${index + 1} for load testing.`,
      category:    pick(CATEGORIES),
      status:      pick(STATUSES),
      dueDate:     dateOffset(dayOffset),
      userId,
      organizationId: orgId,
      readableId:     taskId,
      attachments:    [],
      seedData:       true,
      createdAt:      new Date().toISOString(),
    },
  };
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

// ── Mode dispatch ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

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

async function insertTasks() {
  console.log(`Inserting ${TOTAL_RECORDS.toLocaleString()} fake tasks into "${COLLECTION}" …`);
  console.log("  Each document will use the new readable-ID schema.\n");

  let inserted = 0;

  while (inserted < TOTAL_RECORDS) {
    const batch = db.batch();
    const count = Math.min(BATCH_SIZE, TOTAL_RECORDS - inserted);

    for (let i = 0; i < count; i++) {
      const task = fakeTask(inserted + i);
      const ref  = db.collection(COLLECTION).doc(task.id);
      batch.set(ref, task.data);
    }

    await batch.commit();
    inserted += count;
    process.stdout.write(
      `\r  Progress: ${inserted.toLocaleString()} / ${TOTAL_RECORDS.toLocaleString()}`
    );
  }

  console.log(`\n✓ Done! ${inserted.toLocaleString()} tasks written to Firestore.`);
  console.log(`\n  Every document now has:`);
  console.log(`    - A readable ID:    task_org_<userId>_<userId>_<10chars>`);
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
