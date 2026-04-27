import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Converts an email address into a membership readableId slug.
 * Used only for the human-readable readableId FIELD — not the document ID.
 *
 * Examples:
 *   emailToSlug("sarinakavoli@icloud.com")  → "sarinakavoli_icloud_com"
 *   emailToSlug("teacher1@yorku.ca")        → "teacher1_yorku_ca"
 */
function emailToSlug(email) {
  return String(email)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Extracts a clean school slug from an organization ID.
 * Used only for the human-readable readableId FIELD — not the document ID.
 *
 * Examples:
 *   orgIdToSchoolSlug("org_york-school")  → "york_school"
 */
function orgIdToSchoolSlug(organizationId) {
  return String(organizationId)
    .replace(/^org_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Computes the canonical membership document ID.
 *
 * Format: <organizationId>_<email.toLowerCase()>
 * Example: "org_waterloou_sarinakavoli@icloud.com"
 *
 * @ and . are valid in Firestore document IDs.
 * The Firestore rules check this path using:
 *   exists(memberships/$(orgId + "_" + request.auth.token.email.lower()))
 *
 * This makes every membership document immediately human-readable in the
 * Firebase Console without any slugification.
 */
function canonicalMembershipId(organizationId, email) {
  return `${organizationId}_${String(email).trim().toLowerCase()}`;
}

/**
 * Returns the first active membership for a given user, or null if none found.
 *
 * Queries by userId field (works regardless of document ID format), then
 * checks whether the document ID matches the canonical format
 * orgId_email.lower(). If not, sets _needsRepair: true so the caller can
 * invoke repairMembershipIfNeeded().
 *
 * @param {string} userId - Firebase Auth UID
 * @param {string} email  - Firebase Auth email (used to verify canonical ID)
 * @returns {Promise<{id: string, organizationId: string, role: string, readableId: string, _needsRepair: boolean, ...}|null>}
 */
export async function getActiveMembership(userId, email) {
  const q = query(
    collection(db, "memberships"),
    where("userId", "==", userId),
    where("status", "==", "active")
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  // Prefer the doc with the canonical ID if multiple exist (e.g. after repair)
  const orgId = snapshot.docs[0].data().organizationId;
  const canonical = orgId && email ? canonicalMembershipId(orgId, email) : null;
  const preferred = canonical
    ? snapshot.docs.find((d) => d.id === canonical) ?? snapshot.docs[0]
    : snapshot.docs[0];

  const data = preferred.data();
  const resolvedOrgId = data.organizationId;
  const expectedId = resolvedOrgId && email
    ? canonicalMembershipId(resolvedOrgId, email)
    : null;
  const isCorrectFormat = preferred.id === expectedId;

  console.log(
    "[membership] found ——",
    "readableId:", data.readableId ?? "(missing)",
    "| docId:", preferred.id,
    "| expectedDocId:", expectedId ?? "(unknown — email not provided)",
    "| formatOK:", isCorrectFormat,
    "| role:", data.role,
    "| orgId:", resolvedOrgId,
  );

  if (!isCorrectFormat && expectedId) {
    console.warn(
      "[membership] LEGACY FORMAT DETECTED — doc is at:", preferred.id,
      "| rules need it at:", expectedId,
      "→ auto-repair will run now.",
    );
  }

  return { id: preferred.id, ...data, _needsRepair: !isCorrectFormat && !!expectedId };
}

/**
 * Repairs a membership document that uses an old ID format by writing a new
 * document at the canonical path: <organizationId>_<email.toLowerCase()>
 *
 * The old document cannot be deleted from the client (rules block it), but it
 * is harmless — the app and rules will use the new document going forward.
 *
 * @param {object} membership - The membership object returned by getActiveMembership
 * @returns {Promise<string>} The new canonical membership document ID
 */
export async function repairMembershipIfNeeded(membership) {
  if (!membership._needsRepair) {
    console.log(
      "[membership] no repair needed — ID is already canonical:", membership.id,
    );
    return membership.id;
  }

  const { organizationId, email } = membership;
  const newId = canonicalMembershipId(organizationId, email);

  const {
    _needsRepair,
    id: _oldId,
    createdAt: _oldCreatedAt,
    updatedAt: _oldUpdatedAt,
    ...restData
  } = membership;

  const repairedData = {
    ...restData,
    updatedAt: serverTimestamp(),
    createdAt: _oldCreatedAt ?? serverTimestamp(),
  };

  console.log(
    "[membership] REPAIR ——",
    "readableId:", repairedData.readableId ?? "(missing)",
    "| oldDocId (stale):", membership.id,
    "| newDocId (canonical):", newId,
  );

  const ref = doc(db, "memberships", newId);
  await setDoc(ref, repairedData, { merge: true });

  console.log(
    "[membership] REPAIR SUCCESS ——",
    "readableId:", repairedData.readableId ?? "(missing)",
    "| canonical docId:", newId,
    "| stale docId:", membership.id, "(delete in Firebase Console when convenient)",
  );

  return newId;
}

/**
 * Returns all active memberships for an organization.
 * Only admins can call this (enforced by Firestore rules).
 *
 * Each returned object includes:
 *   id          — Firestore document ID: <organizationId>_<email>
 *   readableId  — Human-readable: mbr_<schoolSlug>_<role>_<emailSlug>
 *   email, displayName, role, status, userId, organizationId, ...
 *
 * @param {string} organizationId
 * @returns {Promise<Array<{id: string, readableId: string, ...}>>}
 */
export async function getOrgMemberships(organizationId) {
  const q = query(
    collection(db, "memberships"),
    where("organizationId", "==", organizationId),
    where("status", "==", "active")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Creates (or upserts) a membership document for a user in an organization.
 *
 * Document ID format (used by Firestore security rules):
 *   <organizationId>_<email.toLowerCase()>
 *
 * @ and . are valid Firestore document ID characters, so the raw lowercase
 * email is used directly — no slugification needed for the ID itself.
 * The rules construct the same path via:
 *   orgId + "_" + request.auth.token.email.lower()
 *
 * Examples:
 *   Document ID : org_waterloou_sarinakavoli@icloud.com
 *   readableId  : mbr_waterloou_admin_sarinakavoli_icloud_com
 *
 * @param {object} params
 * @param {string}  params.organizationId
 * @param {string}  params.userId
 * @param {string}  params.email
 * @param {string}  params.role            - "admin" | "teacher" | "student"
 * @param {string}  [params.organizationName]
 * @param {string}  [params.displayName]
 * @param {string}  [params.invitedBy]
 * @param {string}  [params.invitationId]
 * @param {string}  [params.source]        - "invitation" | "create_org_form"
 * @returns {Promise<string>} The membership document ID
 */
export async function createMembership({
  organizationId,
  userId,
  email,
  role,
  organizationName,
  displayName,
  invitedBy,
  invitationId,
  source,
}) {
  if (!organizationId) {
    throw new Error("[membership] Cannot create membership — organizationId is missing.");
  }
  if (!email) {
    throw new Error("[membership] Cannot create membership — email is missing.");
  }

  // Canonical ID: orgId_email.toLowerCase()
  // e.g. "org_waterloou_sarinakavoli@icloud.com"
  // Rules check: exists(memberships/$(orgId + "_" + request.auth.token.email.lower()))
  const membershipId = canonicalMembershipId(organizationId, email);

  // Human-readable ID stored as a field (slugified for readability in logs/UI)
  const schoolSlug = orgIdToSchoolSlug(organizationId);
  const emailSlug = emailToSlug(email);
  const normalizedRole = role || "student";
  const readableId = `mbr_${schoolSlug}_${normalizedRole}_${emailSlug}`;

  const data = {
    organizationId,
    organizationName: organizationName || null,
    schoolSlug,
    userId,
    email: email.trim().toLowerCase(),
    displayName: displayName || null,
    role: normalizedRole,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: source || null,
    schemaVersion: 2,
    readableId,
  };

  if (invitedBy)    data.invitedBy    = invitedBy;
  if (invitationId) data.invitationId = invitationId;

  const ref = doc(db, "memberships", membershipId);

  console.log(
    "[membership] writing ——",
    "readableId:", readableId,
    "| docId:", membershipId,
    "| role:", normalizedRole,
    "| orgId:", organizationId,
    "| source:", source ?? "(none)",
  );

  await setDoc(ref, data, { merge: true });

  console.log(
    "[membership] written ——",
    "readableId:", readableId,
    "| docId:", membershipId,
  );

  return membershipId;
}
