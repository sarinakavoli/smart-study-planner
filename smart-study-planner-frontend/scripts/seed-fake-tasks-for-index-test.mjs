/**
 * seed-fake-tasks-for-index-test.mjs
 *
 * Seeds 10,000 fake task documents into the Firestore "tasks" collection to
 * support composite index performance testing.  Every document is tagged with
 * isSeedData: true so it can be removed without touching real user tasks.
 *
 * After seeding, the script automatically runs a complex five-field query
 * (organizationId + userId + category + status-in + dueDate) and times it
 * with console.time so you can observe the Firestore index benefit.
 *
 * HOW TO RUN
 * ──────────
 * Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret, then run
 * from the workspace root:
 *
 *   node smart-study-planner-frontend/scripts/seed-fake-tasks-for-index-test.mjs
 *
 * FLAGS
 * ─────
 *   (no flag)   Seed 10,000 fake task documents, then run the query test.
 *   --seed-only Seed without running the query test afterwards.
 *   --query     Skip seeding; just run the complex query against existing data.
 *   --reset     Delete every document where isSeedData == true (safe; leaves
 *               real user tasks untouched), then exit.
 *
 * EXPECTED COMPOSITE INDEX
 * ────────────────────────
 * Collection : tasks
 * Fields     : organizationId ASC, userId ASC, category ASC,
 *              status ASC, dueDate ASC
 *
 * Add this index to firestore.indexes.json (already done alongside this
 * script) and deploy with:
 *   firebase deploy --only firestore:indexes
 *
 * If Firestore reports a missing index at runtime the auto-generated index
 * creation link is printed to the console.
 *
 * ENVIRONMENT VARIABLES
 * ─────────────────────
 *   GCP_SERVICE_ACCOUNT_JSON   Full JSON content of your Firebase Admin SDK
 *                              service account key (required for all modes).
 */

import { slugify, randomSuffix } from "./seed-id-helpers.mjs";

// ── Config ────────────────────────────────────────────────────────────────────

const TOTAL_RECORDS = 10_000;
const BATCH_SIZE    = 250;
const COLLECTION    = "tasks";
const DB_NAME       = "smart-study";

// Fake data pools
const CATEGORIES = ["SCHOOL", "WORK", "PERSONAL", "PROJECT"];
const STATUSES   = ["PENDING", "IN_PROGRESS", "DONE"];

// A small set of title templates — the {n} placeholder is replaced with the
// loop index so every title is unique.
const TITLES = [
  "Review notes {n}",
  "Complete assignment {n}",
  "Read chapter {n}",
  "Prepare report {n}",
  "Submit form {n}",
  "Attend meeting {n}",
  "Draft proposal {n}",
  "Fix issue {n}",
];

// Test user IDs — replace with real Firebase Auth UIDs to see tasks in the app.
const USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
];

// Derive a stable org ID per user  (format mirrors personalOrgId in the app)
function orgIdForUser(userId) {
  const short = String(userId).slice(0, 6).toLowerCase();
  return `org_${short}_workspace_default`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns a Date offset by `days` from now (negative = in the past). */
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/** Returns a YYYY-MM-DD string for the given Date object. */
function toDateString(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Builds a document ID for this script's seed documents.
 * Format: task_<shortUserId>_<categorySlug>_<titleSlug>_<shortRandom>
 * Example: task_user_t_school_review-notes_3kd9
 */
function buildIndexTestTaskId(userId, categorySlug, titleSlug) {
  const shortUserId = String(userId).slice(0, 6).toLowerCase();
  const random4 = randomSuffix();
  return `task_${shortUserId}_${categorySlug}_${titleSlug}_${random4}`;
}

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const seedOnly   = args.includes("--seed-only");
const queryOnly  = args.includes("--query");
const resetMode  = args.includes("--reset");

// ── Bootstrap Admin SDK ───────────────────────────────────────────────────────

const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error(
    "ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.\n" +
    "       Add it as a Replit Secret containing the full JSON of your\n" +
    "       Firebase Admin SDK service account key."
  );
  process.exit(1);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_NAME);

// ── Mode dispatch ─────────────────────────────────────────────────────────────

if (resetMode) {
  await resetSeedData();
} else if (queryOnly) {
  await runComplexQuery();
} else {
  await seedTasks();
  if (!seedOnly) {
    console.log();
    await runComplexQuery();
  }
}

// ── Seed: insert 10,000 fake task documents ───────────────────────────────────

async function seedTasks() {
  console.log(`Seeding ${TOTAL_RECORDS.toLocaleString()} fake tasks into "${COLLECTION}" …`);
  console.log(`  Batch size  : ${BATCH_SIZE}`);
  console.log(`  Users       : ${USER_IDS.join(", ")}`);
  console.log(`  Categories  : ${CATEGORIES.join(", ")}`);
  console.log(`  isSeedData  : true  (safe to delete with --reset)\n`);

  const now = new Date();
  let inserted = 0;

  while (inserted < TOTAL_RECORDS) {
    const chunk = Math.min(BATCH_SIZE, TOTAL_RECORDS - inserted);
    const batch = db.batch();

    for (let i = 0; i < chunk; i++) {
      const globalIndex   = inserted + i + 1;
      const userId        = pick(USER_IDS);
      const category      = pick(CATEGORIES);
      const status        = pick(STATUSES);
      const titleTemplate = pick(TITLES);
      const title         = titleTemplate.replace("{n}", globalIndex);

      // dueDate: random date from 60 days ago to 30 days in the future
      const dayOffset     = Math.floor(Math.random() * 91) - 60;
      const dueDateObj    = dateOffset(dayOffset);
      const dueDate       = toDateString(dueDateObj);

      const organizationId = orgIdForUser(userId);
      const categorySlug   = slugify(category);
      const titleSlug      = slugify(titleTemplate.replace(/\s*\{n\}/, "")).slice(0, 20);
      const docId          = buildIndexTestTaskId(userId, categorySlug, titleSlug);

      // Derive a human-readable readable ID (mirrors the doc ID for debugging)
      const readableId = docId;

      const userShort = String(userId).slice(0, 6).toLowerCase();
      const userEmail = `${userShort}@seed-test.example.com`;

      const doc = {
        title,
        category,
        status,
        dueDate,
        userId,
        userEmail,
        organizationId,
        readableId,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
        isSeedData: true,
      };

      const ref = db.collection(COLLECTION).doc(docId);
      batch.set(ref, doc);
    }

    await batch.commit();
    inserted += chunk;
    process.stdout.write(`\r  Inserted ${inserted.toLocaleString()} / ${TOTAL_RECORDS.toLocaleString()} …`);
  }

  console.log(`\n\n✓ Seeding complete. ${inserted.toLocaleString()} documents written.`);
}

// ── Complex query: five-field filter with console.time ────────────────────────

/**
 * Finds SCHOOL tasks owned by a specific user that are more than 7 days
 * overdue and still not done (status IN ["PENDING", "IN_PROGRESS"]).
 *
 * Requires the composite index:
 *   organizationId ASC, userId ASC, category ASC, status ASC, dueDate ASC
 *
 * If Firestore raises a missing-index error the auto-generated index URL is
 * printed so you can create it in one click.
 */
async function runComplexQuery() {
  // Pick the first test user as the query subject
  const userId         = USER_IDS[0];
  const organizationId = orgIdForUser(userId);
  const category       = "SCHOOL";

  // Cutoff: tasks due more than 7 days ago are considered overdue
  const cutoffDate = toDateString(dateOffset(-7));

  console.log("Running complex index query …");
  console.log(`  organizationId : ${organizationId}`);
  console.log(`  userId         : ${userId}`);
  console.log(`  category       : ${category}`);
  console.log(`  status         : IN ["PENDING", "IN_PROGRESS"]`);
  console.log(`  dueDate        : <= ${cutoffDate}  (overdue by > 7 days)`);
  console.log();

  console.time("complexTaskQuery");

  let snapshot;
  try {
    snapshot = await db
      .collection(COLLECTION)
      .where("organizationId", "==", organizationId)
      .where("userId",         "==", userId)
      .where("category",       "==", category)
      .where("status",         "in", ["PENDING", "IN_PROGRESS"])
      .where("dueDate",        "<=", cutoffDate)
      .get();
  } catch (err) {
    console.timeEnd("complexTaskQuery");

    // Firestore embeds the index-creation URL inside the error message when a
    // required composite index is missing.  Surface it clearly.
    const urlMatch = err.message && err.message.match(/https:\/\/console\.firebase\.google\.com\S+/);
    if (urlMatch) {
      console.error("\n⚠️  Missing composite index detected.");
      console.error("   Create it in one click using the URL below, then re-run this query:\n");
      console.error(`   ${urlMatch[0]}\n`);
      console.error(
        "   Or add the index to firestore.indexes.json and deploy with:\n" +
        "     firebase deploy --only firestore:indexes\n"
      );
    } else {
      console.error("ERROR running query:", err.message);
    }
    process.exit(1);
  }

  console.timeEnd("complexTaskQuery");

  const count = snapshot.size;
  console.log(`\n  Documents returned : ${count.toLocaleString()}`);

  if (count > 0) {
    console.log(`  Sample document IDs (first ${Math.min(5, count)}):`);
    snapshot.docs.slice(0, 5).forEach((d) => {
      const data = d.data();
      console.log(`    ${d.id}  →  status=${data.status}  dueDate=${data.dueDate}`);
    });
  } else {
    console.log(
      "\n  NOTE: No documents matched. This is expected if the seeded users\n" +
      "        (user_test_001 etc.) don't match the organizationId or category\n" +
      "        you queried, or if no SCHOOL tasks landed in the overdue window.\n" +
      "        Re-seed and try again, or adjust the query parameters above."
    );
  }
}

// ── Reset: delete only isSeedData == true documents ──────────────────────────

async function resetSeedData() {
  console.log(`Reset mode: removing documents where isSeedData == true …`);
  console.log("  (Real user-created tasks are not touched.)\n");

  let totalDeleted = 0;

  while (true) {
    const snap = await db
      .collection(COLLECTION)
      .where("isSeedData", "==", true)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    process.stdout.write(`\r  Deleted ${totalDeleted} documents so far …`);
  }

  if (totalDeleted === 0) {
    console.log("  No seed documents found (already cleaned up?).");
  } else {
    console.log(`\n\n✓ Reset complete. ${totalDeleted.toLocaleString()} seed document(s) deleted.`);
    console.log("  Run without --reset to re-seed.");
  }
}
