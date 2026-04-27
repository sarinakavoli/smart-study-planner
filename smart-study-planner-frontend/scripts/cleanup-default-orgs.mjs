/**
 * cleanup-default-orgs.mjs
 * ========================
 * Deletes legacy "personal workspace" / default organizations from Firestore,
 * together with every membership, invitation, task, and category that
 * references those organizations.
 *
 * An organization is considered a "default" org when either of these is true:
 *   - Its Firestore document ID ends with "_default"
 *   - Its name field contains "'s Workspace" (e.g. "Sarina's Workspace")
 *
 * USAGE
 * ─────
 *   Dry run (lists what would be deleted, touches nothing):
 *     node scripts/cleanup-default-orgs.mjs --dry-run
 *
 *   Live run with interactive confirmation:
 *     node scripts/cleanup-default-orgs.mjs --confirm
 *
 *   Live run without prompts (for CI / scripted use):
 *     node scripts/cleanup-default-orgs.mjs --force
 *
 * PREREQUISITES
 * ─────────────
 *   Set GCP_SERVICE_ACCOUNT_JSON as a Replit Secret (or env var) containing
 *   the full JSON of your Firebase Admin SDK service account key.
 *   Firebase Console → Project Settings → Service accounts → Generate new private key
 */

import { createInterface } from "readline";

const DB_NAME = "smart-study";

// ── Parse flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun  = args.includes("--dry-run");
const force   = args.includes("--force");
const confirm = args.includes("--confirm");

if (!dryRun && !force && !confirm) {
  console.error(`
Usage:
  node scripts/cleanup-default-orgs.mjs --dry-run   # list what would be deleted (safe)
  node scripts/cleanup-default-orgs.mjs --confirm   # interactive: asks before deleting
  node scripts/cleanup-default-orgs.mjs --force     # delete without prompting
`);
  process.exit(1);
}

// ── Bootstrap Admin SDK (skipped in dry-run) ──────────────────────────────────

let db;

if (!dryRun) {
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error(`
ERROR: GCP_SERVICE_ACCOUNT_JSON environment variable is not set.
Add it as a Replit Secret, then re-run this script.
`);
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    console.error("ERROR: GCP_SERVICE_ACCOUNT_JSON is not valid JSON.");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore }        = await import("firebase-admin/firestore");

  initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore(DB_NAME);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDefaultOrg(id, name) {
  if (String(id).endsWith("_default")) return true;
  if (typeof name === "string" && name.includes("'s Workspace")) return true;
  return false;
}

async function confirm_action(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ── Scanning ──────────────────────────────────────────────────────────────────

async function collectTargets() {
  console.log("\nScanning organizations for default/personal workspaces…\n");

  if (dryRun) {
    console.log("(DRY RUN — no changes will be made)\n");
  }

  let orgIds = [];

  if (dryRun) {
    console.log("Tip: in dry-run mode the script cannot query Firestore.");
    console.log("It will report based on ID pattern detection only.");
    console.log("Run with --confirm or --force (and credentials) to scan live data.\n");
    return { orgIds: [], memberships: [], invitations: [], tasks: [], categories: [] };
  }

  const orgSnap = await db.collection("organizations").get();
  const defaultOrgs = orgSnap.docs.filter((d) => isDefaultOrg(d.id, d.data().name));

  if (defaultOrgs.length === 0) {
    console.log("No default/personal-workspace organizations found. Nothing to do.\n");
    return null;
  }

  orgIds = defaultOrgs.map((d) => d.id);
  console.log(`Found ${defaultOrgs.length} default org(s):`);
  defaultOrgs.forEach((d) => {
    console.log(`  ${d.id}  (name: "${d.data().name ?? "(none)"}")`);
  });
  console.log();

  const memberships = [];
  const invitations = [];
  const tasks       = [];
  const categories  = [];

  for (const orgId of orgIds) {
    const [mSnap, iSnap, tSnap, cSnap] = await Promise.all([
      db.collection("memberships").where("organizationId", "==", orgId).get(),
      db.collection("invitations").where("organizationId", "==", orgId).get(),
      db.collection("tasks").where("organizationId", "==", orgId).get(),
      db.collection("categories").where("organizationId", "==", orgId).get(),
    ]);

    mSnap.docs.forEach((d) => memberships.push({ ref: d.ref, id: d.id, orgId }));
    iSnap.docs.forEach((d) => invitations.push({ ref: d.ref, id: d.id, orgId }));
    tSnap.docs.forEach((d) => tasks.push({ ref: d.ref, id: d.id, orgId }));
    cSnap.docs.forEach((d) => categories.push({ ref: d.ref, id: d.id, orgId }));
  }

  console.log(`  Memberships : ${memberships.length}`);
  console.log(`  Invitations : ${invitations.length}`);
  console.log(`  Tasks       : ${tasks.length}`);
  console.log(`  Categories  : ${categories.length}`);
  console.log();

  return { orgIds, memberships, invitations, tasks, categories, defaultOrgs };
}

// ── Deletion ──────────────────────────────────────────────────────────────────

async function deleteAll({ orgIds, memberships, invitations, tasks, categories, defaultOrgs }) {
  const allRefs = [
    ...memberships.map((x) => x.ref),
    ...invitations.map((x) => x.ref),
    ...tasks.map((x) => x.ref),
    ...categories.map((x) => x.ref),
  ];

  const BATCH_SIZE = 400;
  let totalDeleted = 0;

  for (let i = 0; i < allRefs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    allRefs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
    totalDeleted += Math.min(BATCH_SIZE, allRefs.length - i);
  }

  for (const orgDoc of defaultOrgs) {
    await orgDoc.ref.delete();
    totalDeleted++;
    console.log(`  Deleted org: ${orgDoc.id}`);
  }

  console.log(`\nDone. Deleted ${totalDeleted} document(s) total.`);
  console.log(`  Organizations : ${orgIds.length}`);
  console.log(`  Memberships   : ${memberships.length}`);
  console.log(`  Invitations   : ${invitations.length}`);
  console.log(`  Tasks         : ${tasks.length}`);
  console.log(`  Categories    : ${categories.length}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (dryRun) {
    console.log("═══════════════════════════════════════");
    console.log("  DRY RUN — default org cleanup");
    console.log("═══════════════════════════════════════");
    console.log();
    console.log("Organizations matching cleanup criteria:");
    console.log("  ID pattern : ends with \"_default\"");
    console.log("  Name pattern: contains \"'s Workspace\"");
    console.log();
    console.log("To scan live Firestore data and delete, run:");
    console.log("  node scripts/cleanup-default-orgs.mjs --confirm");
    console.log("  node scripts/cleanup-default-orgs.mjs --force");
    console.log();
    return;
  }

  const targets = await collectTargets();
  if (!targets) return;
  if (targets.orgIds.length === 0) return;

  if (confirm) {
    const totalDocs =
      targets.orgIds.length +
      targets.memberships.length +
      targets.invitations.length +
      targets.tasks.length +
      targets.categories.length;

    const proceed = await confirm_action(
      `Delete ${totalDocs} document(s) across ${targets.orgIds.length} org(s)? [y/N] `
    );
    if (!proceed) {
      console.log("\nAborted. No data was deleted.");
      return;
    }
  } else {
    console.log("--force flag set — proceeding without confirmation.");
  }

  console.log("\nDeleting…");
  await deleteAll(targets);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
