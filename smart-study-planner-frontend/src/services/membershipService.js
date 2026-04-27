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
 * Returns the first active membership for a given user, or null if none found.
 *
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{id: string, organizationId: string, role: string, ...}|null>}
 */
export async function getActiveMembership(userId) {
  const q = query(
    collection(db, "memberships"),
    where("userId", "==", userId),
    where("status", "==", "active")
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

/**
 * Creates (or upserts) a membership document for a user in an organization.
 *
 * Document ID format (predictable, used by Firestore security rules):
 *   membership_<userId>_<organizationId>
 *
 * The human-readable ID is stored as a field:
 *   readableId: mbr_<schoolSlug>_<role>_<emailSlug>
 *
 * Examples:
 *   Document ID : membership_UID123_org_york-school
 *   readableId  : mbr_york_school_admin_kavolisarina_gmail_com
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

  // Predictable ID for Firestore security rules
  const membershipId = `membership_${userId}_${organizationId}`;

  // Human-readable ID stored as a field for debugging
  const schoolSlug = orgIdToSchoolSlug(organizationId);
  const emailSlug = email ? emailToSlug(email) : "unknown";
  const normalizedRole = role || "student";
  const readableId = `mbr_${schoolSlug}_${normalizedRole}_${emailSlug}`;

  console.log("Creating membership", {
    membershipId,
    organizationId,
    organizationName: organizationName || null,
    role: normalizedRole,
    email: email || "",
    source: source ?? null,
  });

  const ref = doc(db, "memberships", membershipId);

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

  await setDoc(ref, data, { merge: true });

  console.log(
    "[membership] created — membershipId:", membershipId,
    "| readableId:", readableId,
    "| userId:", userId,
    "| orgId:", organizationId,
    "| role:", normalizedRole,
    "| source:", source ?? "(none)",
  );

  return membershipId;
}
