/**
 * seed-verify-helper.mjs
 *
 * Shared Auth-lookup verification logic used by seed-categories.mjs and
 * seed-tasks.mjs to automatically confirm that seeded userIds map to real
 * Firebase Auth accounts immediately after an insert run.
 */

const BATCH_SIZE = 500;

/**
 * Returns every unique userId present in documents where seedData == true
 * for the given Firestore collection.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} collectionName
 * @returns {Promise<Map<string, number>>}  userId → document count
 */
async function collectSeedUserIds(db, collectionName) {
  const userCounts = new Map();
  let lastDoc = null;

  while (true) {
    let q = db
      .collection(collectionName)
      .where("seedData", "==", true)
      .limit(BATCH_SIZE);

    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const uid = doc.data().userId;
      if (uid) {
        userCounts.set(uid, (userCounts.get(uid) ?? 0) + 1);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) break;
  }

  return userCounts;
}

/**
 * Looks up a Firebase Auth user by UID.
 * Returns the UserRecord on success, or null if not found.
 *
 * @param {import("firebase-admin/auth").Auth} auth
 * @param {string} uid
 * @returns {Promise<import("firebase-admin/auth").UserRecord | null>}
 */
async function lookupAuthUser(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  }
}

/**
 * Verifies that every seeded userId in `collectionName` exists in Firebase Auth.
 * Prints a PASS/FAIL summary to stdout.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {import("firebase-admin/auth").Auth} auth
 * @param {string} collectionName
 * @returns {Promise<boolean>}  true if all pass, false if any mismatch
 */
export async function verifySeedUsers(db, auth, collectionName) {
  console.log();
  console.log("=".repeat(60));
  console.log("  Seed-user verification");
  console.log("=".repeat(60));

  process.stdout.write(`  Scanning "${collectionName}" for seeded documents …`);
  const userCounts = await collectSeedUserIds(db, collectionName);

  let totalDocs = 0;
  for (const count of userCounts.values()) totalDocs += count;
  console.log(
    ` found ${totalDocs.toLocaleString()} docs across ${userCounts.size} unique userId(s).`
  );
  console.log();

  if (userCounts.size === 0) {
    console.log("  No seeded documents found (seedData == true). Nothing to verify.");
    console.log("=".repeat(60));
    return true;
  }

  console.log(`  Checking ${userCounts.size} unique userId(s) against Firebase Auth …`);
  console.log();

  const found    = [];
  const notFound = [];

  for (const [uid, count] of userCounts) {
    const user = await lookupAuthUser(auth, uid);
    if (user) {
      found.push({ uid, email: user.email ?? "(no email)", count });
    } else {
      notFound.push({ uid, count });
    }
  }

  if (found.length > 0) {
    console.log(`  PASS — ${found.length} userId(s) exist in Firebase Auth:`);
    console.log("  (Seeded data for these users WILL appear in the app)");
    console.log();
    for (const { uid, email, count } of found) {
      console.log(`    [OK] ${uid}`);
      console.log(`         Auth email : ${email}`);
      console.log(`         Seeded docs: ${count.toLocaleString()} ${collectionName}`);
      console.log();
    }
  }

  if (notFound.length > 0) {
    console.log(`  FAIL — ${notFound.length} userId(s) NOT found in Firebase Auth:`);
    console.log("  (Seeded data for these IDs will NOT appear in the app)");
    console.log();
    for (const { uid, count } of notFound) {
      console.log(`    [MISSING] ${uid}`);
      console.log(`              Seeded docs: ${count.toLocaleString()} ${collectionName}`);
      console.log();
    }

    console.log("  HOW TO FIX");
    console.log("  ──────────");
    console.log("  1. Find the real Firebase Auth UIDs for your test accounts:");
    console.log("     Firebase console → Authentication → Users → copy the UID column.");
    console.log();
    console.log(`  2. Re-run the seed script with those UIDs:`);
    console.log(`     node smart-study-planner-frontend/scripts/seed-${collectionName}.mjs \\`);
    console.log("       --users=<real-uid-1>,<real-uid-2>");
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

  return notFound.length === 0;
}
