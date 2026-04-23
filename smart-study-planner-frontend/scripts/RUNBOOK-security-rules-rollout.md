# Security Rules Rollout Runbook

This runbook describes the **mandatory order of operations** for deploying
the Firestore security rules that enforce `organizationId` on every task and
category document.

If you deploy the rules before running the migration, every user whose data
still has a legacy Firestore auto-ID (no `organizationId` field) will be
immediately locked out of all their tasks and categories.

---

## Prerequisites

- `GCP_SERVICE_ACCOUNT_JSON` is set as a Replit Secret **or** a
  `serviceAccountKey.json` file is placed in this `scripts/` directory.
- `firebase-admin` is installed: `npm install firebase-admin` from the
  project root if needed.
- The Firebase CLI is installed and you are logged in:
  `firebase login` (or use a CI service account).
- Optional: set `FIREBASE_PROJECT=<project-id>` in your environment to skip
  the project-ID prompt during the deploy step.

> **Execution context:** all `node` commands below assume you are running
> from the **repository root**.  If you prefer to run from the
> `smart-study-planner-frontend/` directory, drop that prefix from each path.
> The `deploy-firestore-rules.sh` script resolves all paths from its own
> location and works from any directory.

---

## Step 1 — Dry-run the migration

Run the migration in preview mode. **No data is written.**

```bash
node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs --dry-run
```

Review the output carefully:
- Every task and category that needs migration is listed.
- Storage attachment moves are shown without being executed.
- If any document is flagged as skipped or errored, investigate before
  proceeding.

---

## Step 2 — Run the audit (pre-migration baseline)

Confirm the baseline: the audit should report failures equal to the number of
legacy documents the dry-run identified.

```bash
node smart-study-planner-frontend/scripts/audit-readable-ids.mjs
```

This step is optional but useful for establishing a before/after comparison.

---

## Step 3 — Run the live migration

```bash
node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs
```

The script:
- Re-creates every task and category under the new `task_` / `cat_` ID format.
- Adds `organizationId` and `readableId` fields to every migrated document.
- Moves Storage attachments to paths matching the new document ID.
- Exits with code 1 if any document or attachment could not be migrated;
  re-run after investigating the error to retry only the remaining documents
  (the script is fully idempotent — already-migrated docs are skipped).

---

## Step 4 — Verify with the audit script

After the live migration, the audit must report **zero failures** before you
proceed.

```bash
node smart-study-planner-frontend/scripts/audit-readable-ids.mjs
```

Expected output ends with:

```
✓ All documents are in the new readable-ID format with no issues.
  Migration is complete and verified.
```

Exit code 0 means safe to continue.  Exit code 1 means legacy documents
remain — **do not deploy the security rules**.

---

## Step 5 — Deploy the Firestore security rules

Only proceed once Step 4 exits with code 0.

**Option A — deploy-guard script (recommended)**

The guard script combines Steps 4 and 5: it runs the audit first and aborts
the deploy if any legacy documents are detected.

```bash
bash smart-study-planner-frontend/scripts/deploy-firestore-rules.sh
```

**Option B — manual deploy**

Run from the `smart-study-planner-frontend/` directory (where `firebase.json`
lives), or pass `--config` explicitly:

```bash
firebase deploy \
  --config smart-study-planner-frontend/firebase.json \
  --only firestore:rules \
  --project <your-firebase-project-id>
```

---

## Rollback

If you accidentally deployed the security rules before the migration:

1. Roll back the rules to the previous permissive version via the Firebase
   Console (Firestore → Rules → History) or by deploying the old rules file.
2. Run the migration (Steps 1–4 above).
3. Re-deploy the new security rules.

---

## Summary

All commands below are written for the **repository root** as the working
directory. See the execution context note in the Prerequisites section.

| Step | Command (run from repo root) | Required |
|------|------------------------------|----------|
| 1 — Dry-run migration | `node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs --dry-run` | Yes |
| 2 — Baseline audit | `node smart-study-planner-frontend/scripts/audit-readable-ids.mjs` | Recommended |
| 3 — Live migration | `node smart-study-planner-frontend/scripts/migrate-to-readable-ids.mjs` | Yes |
| 4 — Post-migration audit | `node smart-study-planner-frontend/scripts/audit-readable-ids.mjs` | Yes — must exit 0 |
| 5 — Deploy security rules | `bash smart-study-planner-frontend/scripts/deploy-firestore-rules.sh` | Yes |
