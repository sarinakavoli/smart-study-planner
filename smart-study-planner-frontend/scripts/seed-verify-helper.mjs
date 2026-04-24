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
export async function collectSeedUserIds(db, collectionName) {
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
export async function lookupAuthUser(auth, uid) {
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
    console.log("  Option A — pass your email address (no UID look-up needed):");
    console.log(`     node smart-study-planner-frontend/scripts/seed-${collectionName}.mjs \\`);
    console.log("       --email=you@example.com");
    console.log();
    console.log("  Option B — add your email to scripts/.seed-users so every run");
    console.log("  picks it up automatically (copy .seed-users.example to get started).");
    console.log();
    console.log("  Option C — pass the raw UID (Firebase console → Authentication →");
    console.log("  Users → copy the UID column):");
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

/**
 * Convenience wrapper: runs verifySeedUsers and exits the process with code 1
 * if any seeded userId is missing from Firebase Auth.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {import("firebase-admin/auth").Auth} auth
 * @param {string} collectionName
 * @returns {Promise<void>}
 */
export async function verifySeedUsersOrExit(db, auth, collectionName) {
  const allPass = await verifySeedUsers(db, auth, collectionName);
  if (!allPass) process.exit(1);
}

/**
 * Convenience wrapper: runs verifyAllCollections and exits the process with
 * code 1 if any seeded userId is missing from Firebase Auth.
 *
 * @param {FirebaseFirestore.Firestore}            db
 * @param {import("firebase-admin/auth").Auth}     auth
 * @param {string[]}                               collectionsToCheck
 * @returns {Promise<void>}
 */
export async function verifyAllCollectionsOrExit(db, auth, collectionsToCheck) {
  const allPass = await verifyAllCollections(db, auth, collectionsToCheck);
  if (!allPass) process.exit(1);
}

/**
 * Scans every collection in `collectionsToCheck` for seeded documents,
 * checks every unique userId against Firebase Auth, and prints the combined
 * PASS / FAIL / MISMATCH report.
 *
 * @param {FirebaseFirestore.Firestore}            db
 * @param {import("firebase-admin/auth").Auth}     auth
 * @param {string[]}                               collectionsToCheck
 * @returns {Promise<boolean>}  true if all IDs match, false if any are missing.
 */
export async function verifyAllCollections(db, auth, collectionsToCheck) {
  console.log("=".repeat(60));
  console.log("  Seed-user verification smoke test");
  console.log("=".repeat(60));
  console.log(`  Collections checked: ${collectionsToCheck.join(", ")}`);
  console.log();

  const combinedCounts = new Map();
  const perCollection  = {};

  for (const col of collectionsToCheck) {
    process.stdout.write(`  Scanning "${col}" for seeded documents …`);
    const counts = await collectSeedUserIds(db, col);
    perCollection[col] = counts;

    let totalInCol = 0;
    for (const [uid, count] of counts) {
      combinedCounts.set(uid, (combinedCounts.get(uid) ?? 0) + count);
      totalInCol += count;
    }

    console.log(
      ` found ${totalInCol.toLocaleString()} docs across ${counts.size} unique userId(s).`
    );
  }

  console.log();

  if (combinedCounts.size === 0) {
    console.log("  No seeded documents found (seedData == true). Nothing to verify.");
    console.log();
    console.log("  If you expected seeded data, run the seed scripts first:");
    console.log("    node smart-study-planner-frontend/scripts/seed-categories.mjs");
    console.log("    node smart-study-planner-frontend/scripts/seed-tasks.mjs");
    return true;
  }

  console.log(`  Checking ${combinedCounts.size} unique userId(s) against Firebase Auth …`);
  console.log();

  const found    = [];
  const notFound = [];

  for (const [uid, totalDocs] of combinedCounts) {
    const user = await lookupAuthUser(auth, uid);
    if (user) {
      found.push({ uid, email: user.email ?? "(no email)", totalDocs });
    } else {
      notFound.push({ uid, totalDocs });
    }
  }

  if (found.length > 0) {
    console.log(`  PASS — ${found.length} userId(s) exist in Firebase Auth:`);
    console.log("  (Seeded data for these users WILL appear in the app)");
    console.log();
    for (const { uid, email, totalDocs } of found) {
      const breakdown = collectionsToCheck
        .map((col) => {
          const count = perCollection[col].get(uid) ?? 0;
          return count > 0 ? `${count.toLocaleString()} ${col}` : null;
        })
        .filter(Boolean)
        .join(", ");

      console.log(`    [OK] ${uid}`);
      console.log(`         Auth email : ${email}`);
      console.log(`         Seeded docs: ${breakdown}`);
      console.log();
    }
  }

  if (notFound.length > 0) {
    console.log(`  FAIL — ${notFound.length} userId(s) NOT found in Firebase Auth:`);
    console.log("  (Seeded data for these IDs will NOT appear in the app)");
    console.log();
    for (const { uid, totalDocs } of notFound) {
      const breakdown = collectionsToCheck
        .map((col) => {
          const count = perCollection[col].get(uid) ?? 0;
          return count > 0 ? `${count.toLocaleString()} ${col}` : null;
        })
        .filter(Boolean)
        .join(", ");

      console.log(`    [MISSING] ${uid}`);
      console.log(`              Seeded docs: ${breakdown}`);
      console.log();
    }

    console.log("  HOW TO FIX");
    console.log("  ──────────");
    console.log("  Option A — pass your email address (no UID look-up needed):");
    console.log("     node smart-study-planner-frontend/scripts/seed-categories.mjs \\");
    console.log("       --email=you@example.com");
    console.log("     node smart-study-planner-frontend/scripts/seed-tasks.mjs \\");
    console.log("       --email=you@example.com");
    console.log();
    console.log("  Option B — add your email to scripts/.seed-users so every run");
    console.log("  picks it up automatically (copy .seed-users.example to get started).");
    console.log();
    console.log("  Option C — pass the raw UID (Firebase console → Authentication →");
    console.log("  Users → copy the UID column):");
    console.log("     node smart-study-planner-frontend/scripts/seed-categories.mjs \\");
    console.log("       --users=<real-uid-1>,<real-uid-2>");
    console.log("     node smart-study-planner-frontend/scripts/seed-tasks.mjs \\");
    console.log("       --users=<real-uid-1>,<real-uid-2>");
    console.log();
    console.log("  (Optional) Delete old mismatched seed data first:");
    console.log("     node smart-study-planner-frontend/scripts/seed-categories.mjs --delete");
    console.log("     node smart-study-planner-frontend/scripts/seed-tasks.mjs --delete");
    console.log();
  }

  console.log("=".repeat(60));
  if (notFound.length === 0) {
    console.log("  Result: ALL PASS — seeded data matches real Auth accounts.");
    console.log("=".repeat(60));
    return true;
  } else {
    const passCount = found.length;
    const failCount = notFound.length;
    console.log(
      `  Result: ${failCount} MISMATCH(ES) detected` +
      (passCount > 0 ? `, ${passCount} OK.` : ".")
    );
    console.log("  Seeded data for mismatched IDs will NOT appear in the app.");
    console.log("=".repeat(60));
    return false;
  }
}
