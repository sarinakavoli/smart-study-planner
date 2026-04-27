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
 * Converts an email address into a membership-safe slug.
 * Replaces @, ., and any non-alphanumeric characters with underscores.
 *
 * Examples:
 *   emailToSlug("kavolisarina@gmail.com")  → "kavolisarina_gmail_com"
 *   emailToSlug("teacher1@yorku.ca")       → "teacher1_yorku_ca"
 *
 * @param {string} email
 * @returns {string}
 */
function emailToSlug(email) {
  return String(email)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/**
 * Extracts a clean school slug from an organization ID.
 * Strips the "org_" prefix and converts hyphens to underscores.
 *
 * Examples:
 *   orgIdToSchoolSlug("org_york-school")  → "york_school"
 *   orgIdToSchoolSlug("org_springfield-high-school")  → "springfield_high_school"
 *
 * @param {string} organizationId
 * @returns {string}
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
 * Format: <organizationId>_<userId>
 * e.g. "org_waterloou_AvU4OpeL5WO79GRp67C6JiJUYUY2"
 *
 * This is the format the Firestore rules check:
 *   exists(memberships/$(orgId + "_" + request.auth.uid))
 */
function canonicalMembershipId(organizationId, userId) {
  return `${organizationId}_${userId}`;
}

/**
 * Returns the first active membership for a given user, or null if none found.
 *
 * Document ID format: <organizationId>_<userId>
 * e.g. "org_waterloou_AvU4OpeL5WO79GRp67C6JiJUYUY2"
 *
 * If a legacy document in the old format (<userId>_<organizationId>) is found,
 * it is returned with a warning. Call repairMembershipIfNeeded() to fix it.
 *
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{id: string, organizationId: string, role: string, readableId: string, _needsRepair: boolean, ...}|null>}
 */
export async function getActiveMembership(userId) {
  const q = query(
    collection(db, "memberships"),
    where("userId", "==", userId),
    where("status", "==", "active")
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const doc0 = snapshot.docs[0];
  const data = doc0.data();
  const orgId = data.organizationId;
  const expectedId = orgId ? canonicalMembershipId(orgId, userId) : null;
  const isCorrectFormat = doc0.id === expectedId;

  console.log(
    "[membership] found ——",
    "readableId:", data.readableId ?? "(missing)",
    "| docId:", doc0.id,
    "| expectedDocId:", expectedId ?? "(unknown)",
    "| formatOK:", isCorrectFormat,
    "| role:", data.role,
    "| orgId:", orgId,
  );

  if (!isCorrectFormat && expectedId) {
    console.warn(
      "[membership] LEGACY FORMAT DETECTED — doc is at:", doc0.id,
      "but rules need it at:", expectedId,
      "— call repairMembershipIfNeeded() to fix. This user will NOT pass isAdminOfOrg checks until repaired.",
    );
  }

  return { id: doc0.id, ...data, _needsRepair: !isCorrectFormat && !!expectedId };
}

/**
 * Repairs a legacy membership document that uses the old ID format.
 *
 * Old format: <userId>_<organizationId>  (e.g. "AvU4Op..._org_waterloou")
 * New format: <organizationId>_<userId>  (e.g. "org_waterloou_AvU4Op...")
 *
 * The Firestore rules check the NEW format. If the membership is in the old
 * format, isAdminOfOrg() / hasActiveMembership() will always return false,
 * blocking invitation creation and other admin operations.
 *
 * This function writes a new document at the correct path using the same data.
 * The old document cannot be deleted from the client (rules block it), but it
 * is harmless — the app will use the new document going forward.
 *
 * @param {object} membership - The membership object returned by getActiveMembership
 * @returns {Promise<string>} The new canonical membership document ID
 */
export async function repairMembershipIfNeeded(membership) {
  if (!membership._needsRepair) {
    console.log("[membership] repairMembershipIfNeeded — no repair needed, ID is correct:", membership.id);
    return membership.id;
  }

  const { organizationId, userId } = membership;
  const newId = canonicalMembershipId(organizationId, userId);

  // Strip the _needsRepair flag and use existing data, refreshing updatedAt
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
  };

  // Preserve createdAt from the original if it exists
  if (_oldCreatedAt) {
    repairedData.createdAt = _oldCreatedAt;
  } else {
    repairedData.createdAt = serverTimestamp();
  }

  console.log(
    "[membership] REPAIR ——",
    "readableId:", repairedData.readableId ?? "(missing)",
    "| oldDocId (legacy):", membership.id,
    "| newDocId (correct):", newId,
  );

  const ref = doc(db, "memberships", newId);
  await setDoc(ref, repairedData, { merge: true });

  console.log(
    "[membership] REPAIR SUCCESS ——",
    "readableId:", repairedData.readableId ?? "(missing)",
    "| new docId:", newId,
    "| old (stale) docId:", membership.id, "(safe to delete in Firebase Console)",
  );

  return newId;
}

/**
 * Returns all active memberships for an organization.
 * Only admins can call this (enforced by Firestore rules).
 *
 * Each returned object includes:
 *   id          — Firestore document ID: <organizationId>_<userId>
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
 * Document ID format (predictable, used by Firestore security rules):
 *   <organizationId>_<userId>
 *
 * Org name is first so the document is immediately readable in the Firebase Console.
 * The human-readable role+email ID is stored as a field:
 *   readableId: mbr_<schoolSlug>_<role>_<emailSlug>
 *
 * Examples:
 *   Document ID : org_waterloou_AvU4OpeL5WO79GRp67C6JiJUYUY2
 *   readableId  : mbr_waterloou_admin_sarinakavoli_icloud_com
 *
 * @param {object} params
 * @param {string}  params.organizationId
 * @param {string}  params.userId
 * @param {string}  params.email
 * @param {string}  params.role            - "admin" | "teacher" | "student"
 * @param {string}  [params.organizationName]
 * @param {string}  [params.displayName]   - User's display name
 * @param {string}  [params.invitedBy]     - UID of the admin who sent the invitation
 * @param {string}  [params.invitationId]  - Firestore ID of the accepted invitation
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

  // Canonical ID: <organizationId>_<userId>
  // e.g. "org_waterloou_AvU4OpeL5WO79GRp67C6JiJUYUY2"
  // Rules check: exists(memberships/$(orgId + "_" + request.auth.uid))
  const membershipId = canonicalMembershipId(organizationId, userId);

  // Human-readable ID stored as a field for debugging
  const schoolSlug = orgIdToSchoolSlug(organizationId);
  const emailSlug = email ? emailToSlug(email) : "unknown";
  const normalizedRole = role || "student";
  const readableId = `mbr_${schoolSlug}_${normalizedRole}_${emailSlug}`;

  const data = {
    organizationId,
    organizationName: organizationName || null,
    schoolSlug,
    userId,
    email: email || "",
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
