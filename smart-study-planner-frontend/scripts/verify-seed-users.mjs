/**
 * verify-seed-users.mjs
 *
 * Smoke-test script that checks whether seeded categories and tasks will
 * actually appear in the app for test accounts.
 *
 * The seed scripts (seed-categories.mjs, seed-tasks.mjs) write documents with
 * a `userId` field that must exactly match a real Firebase Auth UID for those
 * documents to be visible in the UI (the app queries by `userId == currentUser.uid`).
 * By default the scripts use placeholder values like "user_test_001" which will
 * never match a real UID unless overridden with --users=<real-uid>.
 *
 * This script:
 *   1. Queries Firestore for all documents where seedData == true in both the
 *      "categories" and "tasks" collections.
 *   2. Collects every unique userId found in those documents.
 *   3. Looks up each userId in Firebase Auth via the Admin SDK.
 *   4. Reports which IDs exist (seeded data WILL appear) and which are missing
 *      from Auth (seeded data WILL NOT appear) so the mismatch is caught early.
 *
 * HOW TO RUN
 * ──────────
 * Make sure GCP_SERVICE_ACCOUNT_JSON is set as a Replit Secret (the full JSON
 * content of your Firebase Admin SDK service account key), then run from the
 * workspace root:
 *
 *   node smart-study-planner-frontend/scripts/verify-seed-users.mjs
 *
 * FLAGS
 * ─────
 *   (no flag)          Check both "categories" and "tasks" collections.
 *   --collection=NAME  Only check the named collection (categories or tasks).
 *   --dry-run          Preview which collections would be scanned without
 *                      contacting Firebase. Exits 0. No credentials required.
 *
 * EXIT CODE
 * ─────────
 *   0  All seeded userIds map to real Firebase Auth accounts — data will appear.
 *   1  One or more seeded userIds do not exist in Firebase Auth — mismatch found.
 *
 * FIXING A MISMATCH
 * ─────────────────
 * The easiest fix is to pass your email address instead of a UID:
 *
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs \
 *     --email=you@example.com
 *
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs \
 *     --email=you@example.com
 *
 * Or copy scripts/.seed-users.example to scripts/.seed-users, fill in your
 * email address(es), and the seed scripts will pick them up automatically on
 * every run (no flag needed):
 *
 *   cp smart-study-planner-frontend/scripts/.seed-users.example \
 *      smart-study-planner-frontend/scripts/.seed-users
 *
 * If you prefer to look up UIDs manually (Firebase console →
 * Authentication → Users → copy the UID column), pass them with --users:
 *
 *   node smart-study-planner-frontend/scripts/seed-categories.mjs \
 *     --users=<real-uid-1>,<real-uid-2>
 *
 *   node smart-study-planner-frontend/scripts/seed-tasks.mjs \
 *     --users=<real-uid-1>,<real-uid-2>
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { collectSeedUserIds, lookupAuthUser } from "./seed-verify-helper.mjs";

// ── Config ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DB_NAME    = "smart-study";

const ALL_COLLECTIONS = ["categories", "tasks"];

const DEFAULT_COUNTS_FILE = join(__dirname, ".seed-counts.json");

// ── CLI flag parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const dryRun = args.includes("--dry-run");

const collectionArg = args.find((a) => a.startsWith("--collection="));
let collectionsToCheck = ALL_COLLECTIONS;
if (collectionArg) {
  const name = collectionArg.slice("--collection=".length).trim();
  if (!ALL_COLLECTIONS.includes(name)) {
    console.error(
      `ERROR: --collection must be one of: ${ALL_COLLECTIONS.join(", ")}\n` +
      `       Got: "${name}"`
    );
    process.exit(1);
  }
  collectionsToCheck = [name];
}

// ── Dry-run early exit ────────────────────────────────────────────────────────

if (dryRun) {
  const countsFilePath = process.env.SEED_COUNTS_FILE ?? DEFAULT_COUNTS_FILE;
  let metaCounts = null;
  let metaLoadError = null;

  try {
    const raw = readFileSync(countsFilePath, "utf8");
    try {
      metaCounts = JSON.parse(raw);
    } catch {
      metaLoadError = `metadata file contains invalid JSON (${countsFilePath})`;
    }
  } catch {
    metaLoadError = `no metadata file found at ${countsFilePath}`;
  }

  console.log("=".repeat(60));
  console.log("  Seed-user verification smoke test  [DRY RUN]");
  console.log("=".repeat(60));
  console.log(`  Collections to be checked: ${collectionsToCheck.join(", ")}`);
  console.log();

  if (metaCounts) {
    console.log("  Estimated document counts (from last recorded run):");
    for (const col of collectionsToCheck) {
      const count = metaCounts[col];
      if (typeof count === "number") {
        console.log(`    ${col}: ${count.toLocaleString()} document(s)`);
      } else {
        console.log(`    ${col}: unknown`);
      }
    }
    if (metaCounts.updatedAt) {
      console.log(`  (counts last recorded: ${metaCounts.updatedAt})`);
    }
  } else {
    console.log("  Estimated document counts: unknown");
    console.log(`  (${metaLoadError})`);
  }

  console.log();
  console.log("  DRY RUN — no network calls will be made.");
  console.log("  In a real run the script would:");
  console.log(`    1. Query each collection for documents where seedData == true`);
  console.log(`    2. Collect every unique userId from those documents`);
  console.log(`    3. Look up each userId in Firebase Auth`);
  console.log(`    4. Report which IDs exist in Auth and which do not`);
  console.log();
  console.log("  Remove --dry-run to perform the actual verification.");
  console.log("=".repeat(60));
  process.exit(0);
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
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db   = getFirestore(DB_NAME);
const auth = getAuth();

// ── Core verification logic (exported for testing) ────────────────────────────

/**
 * Scans `collectionsToCheck` for seeded documents, checks every unique userId
 * against Firebase Auth, and prints the PASS / FAIL / MISMATCH report.
 *
 * @param {FirebaseFirestore.Firestore}            db
 * @param {import("firebase-admin/auth").Auth}     auth
 * @param {string[]}                               collectionsToCheck
 * @returns {Promise<boolean>}  true if all IDs match, false if any are missing.
 */
export async function runVerification(db, auth, collectionsToCheck) {
  console.log("=".repeat(60));
  console.log("  Seed-user verification smoke test");
  console.log("=".repeat(60));
  console.log(`  Collections checked: ${collectionsToCheck.join(", ")}`);
  console.log();

  // Step 1: gather all seeded userIds across requested collections
  const combinedCounts = new Map(); // userId → total seeded docs across collections
  const perCollection  = {};        // collectionName → Map<userId, count>

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

  // Step 2: check each userId against Firebase Auth
  console.log(`  Checking ${combinedCounts.size} unique userId(s) against Firebase Auth …`);
  console.log();

  const found    = []; // { uid, email, totalDocs }
  const notFound = []; // { uid, totalDocs }

  for (const [uid, totalDocs] of combinedCounts) {
    const user = await lookupAuthUser(auth, uid);
    if (user) {
      found.push({ uid, email: user.email ?? "(no email)", totalDocs });
    } else {
      notFound.push({ uid, totalDocs });
    }
  }

  // Step 3: report results

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

  // ── Summary ─────────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

const allPass = await runVerification(db, auth, collectionsToCheck);
process.exit(allPass ? 0 : 1);
