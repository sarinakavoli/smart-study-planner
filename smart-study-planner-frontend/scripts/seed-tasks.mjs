/**
 * seed-tasks.mjs
 *
 * Inserts 10,000 fake task documents into your Firestore "tasks" collection.
 * Uses the Firebase Admin SDK, which writes directly without needing browser auth.
 *
 * HOW TO RUN
 * ----------
 * 1. Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret.
 *    This should be the full JSON content of your Firebase service account key.
 *    (The same key used for Google Secret Manager access works if it is the
 *     firebase-adminsdk service account.)
 *
 * 2. Open the Replit Shell and run:
 *      node smart-study-planner-frontend/scripts/seed-tasks.mjs
 *
 * 3. When done, check Firebase Console → Firestore → tasks collection.
 *    You should see 10,000 new documents.
 *
 * HOW TO DELETE THE SEED DATA
 * ---------------------------
 * Each seeded document has  seedData: true  on it.
 * To delete only seed data, run with the --delete flag:
 *      node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ────────────────────────────────────────────────────────────────────

const TOTAL_RECORDS   = 10_000;
const BATCH_SIZE      = 500;        // Firestore maximum per batch
const COLLECTION      = "tasks";
const DB_NAME         = "smart-study"; // your named Firestore database

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
// Fake user IDs — replace with real Firebase Auth UIDs if you want to query them
const USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns a YYYY-MM-DD date string offset by `days` from today. */
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Generate one fake task document. */
function fakeTask(index) {
  // Mix of past-due (negative offset) and future tasks
  const dayOffset = Math.floor(Math.random() * 60) - 30; // -30 to +30 days
  const title = pick(TITLES).replace("{n}", index + 1);

  return {
    userId:      pick(USER_IDS),
    title,
    description: `Auto-generated task ${index + 1} for load testing.`,
    category:    pick(CATEGORIES),
    status:      pick(STATUSES),
    dueDate:     dateOffset(dayOffset),   // stored as "YYYY-MM-DD" string
    seedData:    true,                    // flag so you can delete these later
    createdAt:   new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error(
    "ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.\n" +
    "Add it as a Replit Secret (the full JSON content of your service account key)."
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore(DB_NAME);

const isDelete = process.argv.includes("--delete");

if (isDelete) {
  // ── Delete mode: remove all documents where seedData == true ───────────────
  console.log("Delete mode: removing all documents where seedData == true …");
  const snap = await db.collection(COLLECTION).where("seedData", "==", true).get();
  const total = snap.size;
  console.log(`Found ${total} seed documents. Deleting in batches of ${BATCH_SIZE} …`);

  let deleted = 0;
  while (deleted < total) {
    const chunk = snap.docs.slice(deleted, deleted + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${total}`);
  }
  console.log("All seed data deleted.");

} else {
  // ── Insert mode: write 10,000 fake tasks ──────────────────────────────────
  console.log(`Inserting ${TOTAL_RECORDS.toLocaleString()} fake tasks into "${COLLECTION}" …`);

  let inserted = 0;
  while (inserted < TOTAL_RECORDS) {
    const batch = db.batch();
    const count = Math.min(BATCH_SIZE, TOTAL_RECORDS - inserted);

    for (let i = 0; i < count; i++) {
      const ref = db.collection(COLLECTION).doc(); // auto-ID
      batch.set(ref, fakeTask(inserted + i));
    }

    await batch.commit();
    inserted += count;
    process.stdout.write(`\r  Progress: ${inserted.toLocaleString()} / ${TOTAL_RECORDS.toLocaleString()}`);
  }

  console.log(`\nDone! ${inserted.toLocaleString()} tasks written to Firestore.`);
  console.log(
    "\nTo delete the seed data later, run:\n" +
    "  node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete"
  );
}
