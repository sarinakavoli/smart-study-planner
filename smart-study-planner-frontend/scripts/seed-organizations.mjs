/**
 * seed-organizations.mjs
 *
 * Creates stub "personal org" documents in the Firestore "organizations"
 * collection for a list of users. This is the seed helper for the
 * multi-org design introduced in Task #112.
 *
 * What is a "personal org"?
 * ─────────────────────────
 * In single-user mode every user is automatically placed into a personal
 * organization whose ID is `org_<uid>`. This script makes those org docs
 * explicit in Firestore so that future multi-org code can query them.
 *
 * The script also writes (or refreshes) the corresponding `users/<uid>`
 * document with the correct `organizationId` field — the same write that
 * `App.jsx` now performs on every login.
 *
 * HOW TO RUN
 * ──────────
 * 1. Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret.
 *    It should contain the full JSON of your Firebase Admin SDK service account.
 *
 * 2. Edit the USER_IDS array below to include the real Firebase Auth UIDs
 *    you want to seed.  (Use the Firebase Console → Authentication to find them.)
 *
 * 3. Open the Replit Shell and run:
 *      node smart-study-planner-frontend/scripts/seed-organizations.mjs
 *
 * HOW TO DELETE SEED DATA
 * ────────────────────────
 * Each org document written by this script has  seedData: true  on it.
 * Run with the --delete flag to remove only those documents:
 *      node smart-study-planner-frontend/scripts/seed-organizations.mjs --delete
 *
 * EXTENDING FOR REAL MULTI-ORG SUPPORT
 * ──────────────────────────────────────
 * When you add real organizations (e.g. a school or team):
 *   1. Create a new org document in this script (without seedData: true).
 *   2. Add the member UIDs to the org's `memberIds` array.
 *   3. Update each member's `users/<uid>` document so organizationId points
 *      to the real org ID instead of their personal org.
 *   4. In App.jsx, replace personalOrgId(uid) calls with the real org ID
 *      loaded from the users/<uid> Firestore document.
 *   5. In taskService.js, add where("organizationId", "==", orgId) alongside
 *      the existing userId filter (see MULTI-ORG NOTE comments in that file).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ─────────────────────────────────────────────────────────────────

const DB_NAME = "smart-study"; // your named Firestore database

// Edit this list — add the real Firebase Auth UIDs you want to seed.
// You can find UIDs in the Firebase Console under Authentication → Users.
const USER_IDS = [
  "user_test_001",
  "user_test_002",
  "user_test_003",
  // Add your own UIDs here:
  // "abc123realuid",
];

// ── Bootstrap Admin SDK ─────────────────────────────────────────────────────

const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.");
  console.error("       Add it as a Replit Secret (the full JSON content of your service account key).");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  console.error("ERROR: GCP_SERVICE_ACCOUNT_JSON is not valid JSON.");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_NAME);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the personal org ID for a given uid.
 * Must match personalOrgId() in src/utils/firestoreIds.js exactly.
 * Format: org_<first6charsOfUid>_default
 */
function personalOrgId(uid) {
  return `org_${String(uid).slice(0, 6)}_default`;
}

// ── Main ────────────────────────────────────────────────────────────────────

const isDelete = process.argv.includes("--delete");

if (isDelete) {
  await deleteOrgSeedData();
} else {
  await seedOrganizations();
}

async function seedOrganizations() {
  console.log(`Seeding personal org documents for ${USER_IDS.length} user(s)…`);

  let created = 0;

  for (const uid of USER_IDS) {
    const orgId = personalOrgId(uid);
    const now = new Date().toISOString();

    // Write the organization document.
    // merge: true — safe to re-run; existing orgs are not overwritten.
    await db.collection("organizations").doc(orgId).set(
      {
        id: orgId,
        name: `Personal org for ${uid}`,
        ownerId: uid,
        memberIds: [uid],
        createdAt: now,
        updatedAt: now,
        seedData: true,
        // When real multi-org support is added, remove seedData: true and
        // replace name/memberIds with values from your org management UI.
      },
      { merge: true }
    );

    // Also refresh the user profile document so organizationId is consistent.
    await db.collection("users").doc(uid).set(
      {
        organizationId: orgId,
        createdAt: now,
        seedData: true,
      },
      { merge: true }
    );

    console.log(`  ✓ org: ${orgId}  (user: ${uid})`);
    created++;
  }

  console.log(`\nDone. Created/updated ${created} org doc(s) and ${created} user doc(s).`);
  console.log('Run with --delete to remove only documents that have seedData: true.');
}

async function deleteOrgSeedData() {
  console.log("Deleting seed org documents (seedData: true)…");

  const orgSnap = await db
    .collection("organizations")
    .where("seedData", "==", true)
    .get();

  const userSnap = await db
    .collection("users")
    .where("seedData", "==", true)
    .get();

  let deleted = 0;

  for (const docSnap of [...orgSnap.docs, ...userSnap.docs]) {
    await docSnap.ref.delete();
    console.log(`  ✓ deleted: ${docSnap.ref.path}`);
    deleted++;
  }

  console.log(`\nDone. Deleted ${deleted} seed document(s).`);
}
