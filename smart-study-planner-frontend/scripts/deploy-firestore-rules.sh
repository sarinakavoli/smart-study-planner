#!/usr/bin/env bash
# deploy-firestore-rules.sh
#
# Deploy Firestore security rules ONLY after confirming that no legacy
# documents remain in Firestore.
#
# This guard prevents operators from accidentally deploying the new rules
# (which require organizationId on every task/category document) before the
# readable-ID migration has been completed.  If any legacy documents are
# detected the script aborts with a non-zero exit code and prints remediation
# instructions.
#
# USAGE
# ─────
# Run from any directory — the script resolves all paths relative to its own
# location so it works whether invoked from the repo root, the frontend dir,
# or the scripts/ dir.
#
#   # From the repo root:
#   bash smart-study-planner-frontend/scripts/deploy-firestore-rules.sh
#
#   # From the frontend directory:
#   bash scripts/deploy-firestore-rules.sh
#
# REQUIREMENTS
# ────────────
#   • GCP_SERVICE_ACCOUNT_JSON Replit Secret (or serviceAccountKey.json in
#     the scripts/ directory) — required by the audit script.
#   • firebase-admin npm package installed (npm install firebase-admin).
#   • Firebase CLI installed and authenticated (firebase login, or a CI
#     service account configured via GOOGLE_APPLICATION_CREDENTIALS /
#     FIREBASE_TOKEN).
#   • Optional: set FIREBASE_PROJECT env var to skip the project-ID prompt.
#
# EXIT CODES
# ──────────
#   0 — Audit passed and rules were deployed successfully.
#   1 — Audit detected legacy documents; deploy was aborted.
#   2 — Required file not found (audit script or firebase.json).
#   3 — Firebase CLI not found.
#   4 — firebase deploy command failed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUDIT_SCRIPT="${SCRIPT_DIR}/audit-readable-ids.mjs"
FIREBASE_CONFIG="${FRONTEND_DIR}/firebase.json"

# ── Sanity checks ─────────────────────────────────────────────────────────────

if [ ! -f "${AUDIT_SCRIPT}" ]; then
  echo "ERROR: Audit script not found at ${AUDIT_SCRIPT}" >&2
  exit 2
fi

if [ ! -f "${FIREBASE_CONFIG}" ]; then
  echo "ERROR: Firebase config not found at ${FIREBASE_CONFIG}" >&2
  echo "Expected firebase.json in the smart-study-planner-frontend/ directory." >&2
  exit 2
fi

if ! command -v firebase &>/dev/null; then
  echo "ERROR: Firebase CLI not found." >&2
  echo "Install it with:  npm install -g firebase-tools" >&2
  exit 3
fi

# ── Run audit ─────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════"
echo "Step 1/2 — Checking for legacy Firestore documents …"
echo "════════════════════════════════════════════════════════"
echo ""

if ! node "${AUDIT_SCRIPT}"; then
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "DEPLOY ABORTED"
  echo "════════════════════════════════════════════════════════"
  echo ""
  echo "The audit script detected legacy documents that have not yet been"
  echo "migrated to the new readable-ID format.  Deploying the Firestore"
  echo "security rules at this point would lock users out of their data."
  echo ""
  echo "To fix this, run the migration first:"
  echo ""
  echo "  1. Dry-run (preview only, no writes):"
  echo "       node ${SCRIPT_DIR}/migrate-to-readable-ids.mjs --dry-run"
  echo ""
  echo "  2. Live migration:"
  echo "       node ${SCRIPT_DIR}/migrate-to-readable-ids.mjs"
  echo ""
  echo "  3. Re-run this script once the audit exits with code 0."
  echo ""
  echo "See ${SCRIPT_DIR}/RUNBOOK-security-rules-rollout.md for the full procedure."
  exit 1
fi

echo ""
echo "Audit passed — no legacy documents detected."
echo ""

# ── Deploy Firestore rules ────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════"
echo "Step 2/2 — Deploying Firestore security rules …"
echo "════════════════════════════════════════════════════════"
echo ""

# Always pass --config so the deploy works regardless of the caller's current
# working directory.  firebase.json lives in smart-study-planner-frontend/.
DEPLOY_ARGS="--config ${FIREBASE_CONFIG} --only firestore:rules"

if [ -n "${FIREBASE_PROJECT:-}" ]; then
  DEPLOY_ARGS="${DEPLOY_ARGS} --project ${FIREBASE_PROJECT}"
fi

if ! firebase deploy ${DEPLOY_ARGS}; then
  echo ""
  echo "ERROR: firebase deploy failed." >&2
  echo "Check the output above for details.  The security rules were NOT updated." >&2
  exit 4
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "Firestore security rules deployed successfully."
echo "════════════════════════════════════════════════════════"
