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
 * Document ID format: <organizationId>_<userId>
 * e.g. "org_york-university_eaq31bob6sTKpvZrL0CNklNJ4Uw1"
 *
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{id: string, organizationId: string, role: string, readableId: string, ...}|null>}
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
  console.log(
    "[membership] getActiveMembership — membershipId:", doc0.id,
    "| readableId:", data.readableId ?? "(missing)",
    "| role:", data.role,
    "| orgId:", data.organizationId,
  );
  return { id: doc0.id, ...data };
}

/**
 * Returns all active memberships for an organization.
 * Only admins can call this (enforced by Firestore rules).
 *
 * Each returned object includes:
 *   id          — Firestore document ID: <userId>_<organizationId>
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
 *   Document ID : org_york-school_UID123abc
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

  // Predictable ID for Firestore security rules:  <organizationId>_<userId>
  // e.g. "org_york-university_eaq31bob6sTKpvZrL0CNklNJ4Uw1"
  // Org name is first so the document is immediately readable in the Firebase Console.
  // Rules check: exists(memberships/$(orgId + "_" + request.auth.uid))
  const membershipId = `${organizationId}_${userId}`;

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

  console.log("ADMIN MEMBERSHIP WRITE PATH", `memberships/${membershipId}`);
  console.log("ADMIN MEMBERSHIP WRITE DATA", {
    ...data,
    createdAt: "<serverTimestamp>",
    updatedAt: "<serverTimestamp>",
  });

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
