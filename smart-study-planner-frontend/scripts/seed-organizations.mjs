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
 * FLAGS
 * ─────
 *   --delete       Remove seed documents (seedData: true) instead of writing.
 *   --skip-verify  Skip the post-insert Auth verification step.
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

import { lookupAuthUser } from "./seed-verify-helper.mjs";

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

// ── Bootstrap Admin SDK (skipped in mock mode) ───────────────────────────────

let db;

if (!process.env.SEED_VERIFY_MOCK_JSON) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

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
  db = getFirestore(DB_NAME);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the personal org ID for a given uid and optional email.
 * Must match personalOrgId() in src/utils/firestoreIds.js exactly.
 * Format: org_<shortOwnerId>_<emailSlug>_default
 * where emailSlug = slugified email local-part, or "workspace" if no email.
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function personalOrgId(uid, email = "") {
  const shortOwnerId = String(uid).slice(0, 6);
  const localPart = email ? email.split("@")[0] : "";
  const emailSlug = localPart ? slugify(localPart).slice(0, 20) : "workspace";
  return `org_${shortOwnerId}_${emailSlug}_default`;
}

// ── Main ────────────────────────────────────────────────────────────────────

const isDelete = process.argv.includes("--delete");
const skipVerify = process.argv.includes("--skip-verify");

if (isDelete) {
  await deleteOrgSeedData();
} else {
  await seedOrganizations();
  if (skipVerify) {
    console.log("\n  (Skipping post-insert verification — --skip-verify flag is set.)");
  } else {
    await verifyOrgUsersOrExit(USER_IDS);
  }
}

async function seedOrganizations() {
  if (process.env.SEED_VERIFY_MOCK_JSON) {
    console.log("(Mock mode: skipping Firestore writes, running post-insert verification only.)");
    return;
  }

  console.log(`Seeding personal org documents for ${USER_IDS.length} user(s)…`);

  let created = 0;

  for (const uid of USER_IDS) {
    const now = new Date().toISOString();

    // For seed/test UIDs there is no real email — use a placeholder so the
    // ownerEmail / memberEmails fields are always present on every org doc.
    // When seeding real UIDs, fetch the user record from Firebase Auth first
    // and pass the actual email here.
    const placeholderEmail = `seed+${uid}@example.com`;
    const orgId = personalOrgId(uid, placeholderEmail);

    // Write the organization document.
    // merge: true — safe to re-run; existing orgs are not overwritten.
    await db.collection("organizations").doc(orgId).set(
      {
        id: orgId,
        readableId: orgId,
        name: `Personal org for ${uid}`,
        ownerId: uid,
        ownerEmail: placeholderEmail,
        memberIds: [uid],
        memberEmails: [placeholderEmail],
        createdAt: now,
        updatedAt: now,
        seedData: true,
        // When real multi-org support is added, remove seedData: true and
        // replace name/ownerEmail/memberIds/memberEmails with values from
        // your org management UI / Firebase Auth lookup.
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

/**
 * Verifies that each UID in `uids` exists in Firebase Auth.
 * Prints a PASS / FAIL summary and exits with code 1 if any are missing.
 *
 * The organizations and users collections written by this script use `ownerId`
 * (not `userId`), so we verify the in-memory UID list directly rather than
 * scanning Firestore — the result is equivalent and avoids a field-name mismatch.
 *
 * When SEED_VERIFY_MOCK_JSON is set the real Auth service is replaced with an
 * in-process mock so the function can be exercised in tests without real GCP
 * credentials.  Expected shape:
 *   { "users": ["uid1", "uid2"], "missing": ["uid2"] }
 * where `users` is used as the effective uid list and `missing` are absent from
 * mock Auth.
 *
 * @param {string[]} uids
 * @returns {Promise<void>}
 */
async function verifyOrgUsersOrExit(uids) {
  const mockJson = process.env.SEED_VERIFY_MOCK_JSON;

  let authLookup;
  let effectiveUids = uids;

  if (mockJson) {
    const { users: seededUids = [], missing: missingUids = [] } = JSON.parse(mockJson);
    effectiveUids = seededUids;
    authLookup = async (uid) => {
      if (missingUids.includes(uid)) return null;
      return { uid, email: `${uid}@example.com` };
    };
  } else {
    const { getAuth } = await import("firebase-admin/auth");
    const auth = getAuth();
    authLookup = (uid) => lookupAuthUser(auth, uid);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("  Seed-user verification");
  console.log("=".repeat(60));

  if (effectiveUids.length === 0) {
    console.log("  No seeded UIDs found. Nothing to verify.");
    console.log("=".repeat(60));
    return;
  }

  console.log(`  Checking ${effectiveUids.length} seeded UID(s) against Firebase Auth …`);
  console.log();

  const found    = [];
  const notFound = [];

  for (const uid of effectiveUids) {
    const user = await authLookup(uid);
    if (user) {
      found.push({ uid, email: user.email ?? "(no email)" });
    } else {
      notFound.push({ uid });
    }
  }

  if (found.length > 0) {
    console.log(`  PASS — ${found.length} userId(s) exist in Firebase Auth:`);
    console.log("  (Seeded data for these users WILL appear in the app)");
    console.log();
    for (const { uid, email } of found) {
      console.log(`    [OK] ${uid}`);
      console.log(`         Auth email : ${email}`);
      console.log();
    }
  }

  if (notFound.length > 0) {
    console.log(`  FAIL — ${notFound.length} userId(s) NOT found in Firebase Auth:`);
    console.log("  (Seeded data for these IDs will NOT appear in the app)");
    console.log();
    for (const { uid } of notFound) {
      console.log(`    [MISSING] ${uid}`);
      console.log();
    }

    console.log("  HOW TO FIX");
    console.log("  ──────────");
    console.log("  Replace the placeholder IDs in the USER_IDS array at the top of");
    console.log("  this script with real Firebase Auth UIDs (Firebase Console →");
    console.log("  Authentication → Users → copy the UID column), then re-run:");
    console.log("     node smart-study-planner-frontend/scripts/seed-organizations.mjs");
    console.log();
    console.log("  (Optional) Delete mismatched seed data first:");
    console.log("     node smart-study-planner-frontend/scripts/seed-organizations.mjs --delete");
    console.log();
  }

  console.log("=".repeat(60));
  if (notFound.length === 0) {
    console.log("  Result: ALL PASS — seeded data matches real Auth accounts.");
  } else {
    const failCount = notFound.length;
    const passCount = found.length;
    console.log(
      `  Result: ${failCount} MISMATCH(ES) detected` +
      (passCount > 0 ? `, ${passCount} OK.` : ".")
    );
    console.log("  Seeded data for mismatched IDs will NOT appear in the app.");
  }
  console.log("=".repeat(60));

  if (notFound.length > 0) process.exit(1);
}
