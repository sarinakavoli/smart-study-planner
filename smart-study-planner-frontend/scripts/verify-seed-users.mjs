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
 *   1. Queries Firestore for all documents where seedData == true in the
 *      "categories", "tasks", and "organizations" collections.
 *   2. Collects every unique owner UID found in those documents (using the
 *      appropriate field per collection: userId for categories/tasks,
 *      ownerId for organizations).
 *   3. Looks up each UID in Firebase Auth via the Admin SDK.
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
 *   (no flag)          Check "categories", "tasks", and "organizations" collections.
 *   --collection=NAME  Only check the named collection (categories, tasks, or organizations).
 *   --dry-run          Preview which collections would be scanned without
 *                      contacting Firebase. Exits 0. No credentials required.
 *                      When this flag is used, the script also reads a metadata
 *                      file to display estimated document counts from the last
 *                      recorded seed run (see SEED_COUNTS_FILE below).
 *
 * ENVIRONMENT VARIABLES
 * ─────────────────────
 *   SEED_COUNTS_FILE   Path to the JSON metadata file that stores document
 *                      counts written by the seed scripts after each run.
 *                      Used during --dry-run to display estimated counts
 *                      without contacting Firebase.
 *
 *                      Default: scripts/.seed-counts.json
 *                               (i.e. the .seed-counts.json file that lives
 *                               next to verify-seed-users.mjs)
 *
 *                      Expected JSON shape:
 *                        {
 *                          "categories":    <number>,
 *                          "tasks":         <number>,
 *                          "organizations": <number>
 *                        }
 *
 *                      Each key is a collection name; the value is the count
 *                      of seed documents written in the most recent run. You
 *                      can create or edit this file manually if you want
 *                      --dry-run to show specific counts, for example:
 *
 *                        echo '{"categories":12,"tasks":36}' \
 *                          > smart-study-planner-frontend/scripts/.seed-counts.json
 *
 *                      Or point the script at a custom file:
 *
 *                        SEED_COUNTS_FILE=/tmp/my-counts.json \
 *                          node smart-study-planner-frontend/scripts/verify-seed-users.mjs \
 *                          --dry-run
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
import { verifyAllCollectionsOrExit } from "./seed-verify-helper.mjs";

// ── Config ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DB_NAME    = "smart-study";

const ALL_COLLECTIONS = ["categories", "tasks", "organizations"];

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
  console.log(`    2. Collect every unique owner UID from those documents`);
  console.log(`    3. Look up each UID in Firebase Auth`);
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

// ── Main ──────────────────────────────────────────────────────────────────────

await verifyAllCollectionsOrExit(db, auth, collectionsToCheck);
