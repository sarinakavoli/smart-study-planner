/**
 * seed-verify-helper.mjs
 *
 * Shared Auth-lookup verification logic used by seed-categories.mjs and
 * seed-tasks.mjs to automatically confirm that seeded userIds map to real
 * Firebase Auth accounts immediately after an insert run.
 */

const BATCH_SIZE = 500;

/**
 * Maps collection names to the Firestore field that holds the owner's UID.
 * Collections not listed here default to "userId".
 */
const COLLECTION_FIELD_MAP = {
  categories:    "userId",
  tasks:         "userId",
  organizations: "ownerId",
};

/**
 * Maps collection names to their corresponding seed script filename.
 * Collections not listed here fall back to "seed-<collectionName>.mjs".
 */
const COLLECTION_SCRIPT_MAP = {
  categories:    "seed-categories.mjs",
  tasks:         "seed-tasks.mjs",
  organizations: "seed-organizations.mjs",
};

/**
 * Returns the UID field name for the given collection.
 *
 * @param {string} collectionName
 * @returns {string}
 */
function getFieldName(collectionName) {
  return COLLECTION_FIELD_MAP[collectionName] ?? "userId";
}

/**
 * Returns the seed script filename for the given collection.
 *
 * @param {string} collectionName
 * @returns {string}
 */
function getScriptName(collectionName) {
  return COLLECTION_SCRIPT_MAP[collectionName] ?? `seed-${collectionName}.mjs`;
}

/**
 * Returns every unique user UID present in documents where seedData == true
 * for the given Firestore collection.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} collectionName
 * @param {string} [fieldName]  The document field that contains the owner UID.
 *   Defaults to the value from COLLECTION_FIELD_MAP, or "userId" if the
 *   collection is not listed there.
 * @returns {Promise<Map<string, number>>}  uid → document count
 */
export async function collectSeedUserIds(db, collectionName, fieldName = getFieldName(collectionName)) {
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
      const uid = doc.data()[fieldName];
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
  const userCounts = await collectSeedUserIds(db, collectionName, getFieldName(collectionName));

  let totalDocs = 0;
  for (const count of userCounts.values()) totalDocs += count;
  console.log(
    ` found ${totalDocs.toLocaleString()} docs across ${userCounts.size} unique UID(s).`
  );
  console.log();

  if (userCounts.size === 0) {
    console.log("  No seeded documents found (seedData == true). Nothing to verify.");
    console.log("=".repeat(60));
    return true;
  }

  console.log(`  Checking ${userCounts.size} unique UID(s) against Firebase Auth …`);
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
    console.log(`  PASS — ${found.length} UID(s) exist in Firebase Auth:`);
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
    console.log(`  FAIL — ${notFound.length} UID(s) NOT found in Firebase Auth:`);
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
 * Builds a mock Firestore whose single collection page contains one document
 * per entry in `seededUids`.  Used when SEED_VERIFY_MOCK_JSON is set.
 *
 * @param {string[]} seededUids
 * @param {string}   [fieldName="userId"]  The field name to use for the UID.
 */
function buildMockDb(seededUids, fieldName = "userId") {
  const docs = seededUids.map((uid) => ({
    data: () => ({ [fieldName]: uid, seedData: true }),
  }));
  let fetched = false;
  const makeQueryObj = () => ({
    get: async () => {
      if (fetched) return { empty: true, docs: [], size: 0 };
      fetched = true;
      return { empty: docs.length === 0, docs, size: docs.length };
    },
    startAfter: () => makeQueryObj(),
  });
  return {
    collection: () => ({ where: () => ({ limit: () => makeQueryObj() }) }),
  };
}

/**
 * Builds a mock Firebase Auth instance.  UIDs listed in `missingUids` throw
 * auth/user-not-found; all others return a synthetic UserRecord.
 * Used when SEED_VERIFY_MOCK_JSON is set.
 *
 * @param {string[]} missingUids
 */
function buildMockAuth(missingUids) {
  return {
    getUser: async (uid) => {
      if (missingUids.includes(uid)) {
        const err = new Error("There is no user record for the provided identifier.");
        err.code = "auth/user-not-found";
        throw err;
      }
      return { uid, email: `${uid}@example.com` };
    },
  };
}

/**
 * Convenience wrapper: runs verifySeedUsers and exits the process with code 1
 * if any seeded userId is missing from Firebase Auth.
 *
 * When the SEED_VERIFY_MOCK_JSON environment variable is set the real `db`
 * and `auth` arguments are ignored and replaced with in-process mocks built
 * from the JSON value.  Expected shape:
 *
 *   { "users": ["uid1", "uid2"], "missing": ["uid2"] }
 *
 * where `users` lists UIDs that appear as seeded documents in the mock
 * Firestore collection and `missing` lists the subset that are absent from
 * mock Firebase Auth.  This allows end-to-end exit-code tests to spawn the
 * actual seed scripts without real GCP credentials.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {import("firebase-admin/auth").Auth} auth
 * @param {string} collectionName
 * @returns {Promise<void>}
 */
export async function verifySeedUsersOrExit(db, auth, collectionName) {
  const mockJson = process.env.SEED_VERIFY_MOCK_JSON;
  if (mockJson) {
    const { users: seededUids = [], missing: missingUids = [] } = JSON.parse(mockJson);
    db   = buildMockDb(seededUids, getFieldName(collectionName));
    auth = buildMockAuth(missingUids);
  }
  const allPass = await verifySeedUsers(db, auth, collectionName);
  if (!allPass) process.exit(1);
}

/**
 * Convenience wrapper: runs verifyAllCollections and exits the process with
 * code 1 if any seeded userId is missing from Firebase Auth.
 *
 * When the SEED_VERIFY_MOCK_JSON environment variable is set the real `db`
 * and `auth` arguments are ignored and replaced with in-process mocks built
 * from the JSON value.  Expected shape:
 *
 *   { "users": ["uid1", "uid2"], "missing": ["uid2"] }
 *
 * where `users` lists UIDs that appear as seeded documents in the mock
 * Firestore collections and `missing` lists the subset absent from mock
 * Firebase Auth.  Each collection uses the correct owner-UID field name
 * (e.g. "ownerId" for organizations, "userId" for categories/tasks).
 *
 * @param {FirebaseFirestore.Firestore}            db
 * @param {import("firebase-admin/auth").Auth}     auth
 * @param {string[]}                               collectionsToCheck
 * @returns {Promise<void>}
 */
export async function verifyAllCollectionsOrExit(db, auth, collectionsToCheck) {
  const mockJson = process.env.SEED_VERIFY_MOCK_JSON;
  if (mockJson) {
    const { users: seededUids = [], missing: missingUids = [] } = JSON.parse(mockJson);
    const perColMocks = Object.fromEntries(
      collectionsToCheck.map((col) => [col, buildMockDb(seededUids, getFieldName(col))])
    );
    db = {
      collection: (name) => {
        const mock = perColMocks[name] ?? buildMockDb(seededUids);
        return mock.collection(name);
      },
    };
    auth = buildMockAuth(missingUids);
  }
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
    const counts = await collectSeedUserIds(db, col, getFieldName(col));
    perCollection[col] = counts;

    let totalInCol = 0;
    for (const [uid, count] of counts) {
      combinedCounts.set(uid, (combinedCounts.get(uid) ?? 0) + count);
      totalInCol += count;
    }

    console.log(
      ` found ${totalInCol.toLocaleString()} docs across ${counts.size} unique UID(s).`
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

  console.log(`  Checking ${combinedCounts.size} unique UID(s) against Firebase Auth …`);
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
    console.log(`  PASS — ${found.length} UID(s) exist in Firebase Auth:`);
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
    console.log(`  FAIL — ${notFound.length} UID(s) NOT found in Firebase Auth:`);
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

    const failedCollections = collectionsToCheck.filter((col) =>
      notFound.some(({ uid }) => (perCollection[col].get(uid) ?? 0) > 0)
    );
    const scriptBase = "smart-study-planner-frontend/scripts";

    console.log("  HOW TO FIX");
    console.log("  ──────────");
    console.log("  Option A — pass your email address (no UID look-up needed):");
    for (const col of failedCollections) {
      const script = getScriptName(col);
      console.log(`     node ${scriptBase}/${script} \\`);
      console.log(`       --email=you@example.com`);
    }
    console.log();
    console.log("  Option B — add your email to scripts/.seed-users so every run");
    console.log("  picks it up automatically (copy .seed-users.example to get started).");
    console.log();
    console.log("  Option C — pass the raw UID (Firebase console → Authentication →");
    console.log("  Users → copy the UID column):");
    for (const col of failedCollections) {
      const script = getScriptName(col);
      console.log(`     node ${scriptBase}/${script} \\`);
      console.log(`       --users=<real-uid-1>,<real-uid-2>`);
    }
    console.log();
    console.log("  (Optional) Delete old mismatched seed data first:");
    for (const col of failedCollections) {
      const script = getScriptName(col);
      console.log(`     node ${scriptBase}/${script} --delete`);
    }
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
