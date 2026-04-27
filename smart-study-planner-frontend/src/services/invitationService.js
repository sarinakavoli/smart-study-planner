import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { generateInviteId } from "../utils/firestoreIds";

/**
 * Creates a pending invitation for an email address to join an organization.
 *
 * Required fields matched to Firestore rules:
 *   organizationId, organizationName, invitedEmail, email (same as invitedEmail),
 *   role, status: "pending", invitedByUserId, invitedByEmail,
 *   source: "admin_invite", schemaVersion: 2, createdAt, updatedAt
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.organizationName
 * @param {string} params.invitedEmail       - Email being invited (lower-cased)
 * @param {string} params.invitedByUserId
 * @param {string} params.invitedByEmail
 * @param {string} [params.role]             - "teacher" | "student" (default: "student")
 * @returns {Promise<string>}  The new invitation document ID
 */
export async function createInvitation({
  organizationId,
  organizationName,
  invitedEmail,
  invitedByUserId,
  invitedByEmail,
  role = "student",
}) {
  const normalizedEmail = invitedEmail.trim().toLowerCase();
  const inviteId = generateInviteId(organizationId, normalizedEmail);
  const invitationPath = `invitations/${inviteId}`;

  const invitationData = {
    readableId: inviteId,
    organizationId,
    organizationName: organizationName || null,
    invitedEmail: normalizedEmail,
    email: normalizedEmail,
    role: role || "student",
    status: "pending",
    invitedByUserId,
    invitedByEmail,
    source: "admin_invite",
    schemaVersion: 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    acceptedAt: null,
    declinedAt: null,
    expiresAt: null,
  };

  console.log("INVITATION WRITE PATH", invitationPath);
  console.log("INVITATION WRITE DATA", JSON.stringify(
    {
      ...invitationData,
      createdAt: "<serverTimestamp>",
      updatedAt: "<serverTimestamp>",
    },
    null,
    2,
  ));

  const inviteRef = doc(db, "invitations", inviteId);

  try {
    await setDoc(inviteRef, invitationData);
    console.log("INVITATION WRITE SUCCESS — id:", inviteId);
  } catch (error) {
    console.error("INVITATION WRITE FAILED", error.code, error.message);
    throw error;
  }

  return inviteId;
}

/**
 * Returns all pending invitations where invitedEmail matches the given email.
 *
 * @param {string} email
 * @returns {Promise<Array<{id: string, ...}>>}
 */
export async function getPendingInvitationsForEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, "invitations"),
    where("invitedEmail", "==", normalizedEmail),
    where("status", "==", "pending")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Accepts a pending invitation:
 *  1. Updates the user's organizationId in their user document.
 *  2. Marks the invitation as accepted.
 *
 * Note: membership creation is handled separately by createMembership().
 *
 * @param {object} params
 * @param {object} params.invitation  - Invitation document data
 * @param {string} params.userId      - Firebase Auth UID of the accepting user
 * @param {string} params.userEmail   - Email of the accepting user
 * @returns {Promise<{organizationId: string, organizationName: string, role: string}>}
 */
export async function acceptInvitation({ invitation, userId, userEmail }) {
  const { id: inviteId, organizationId, organizationName, role } = invitation;

  await updateDoc(doc(db, "users", userId), {
    organizationId,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "invitations", inviteId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log("[invitation] Accepted:", inviteId, "→ org:", organizationId, "role:", role);
  return { organizationId, organizationName, role: role || "student" };
}

/**
 * Declines a pending invitation.
 * Updates the invitation status to "declined" only.
 *
 * @param {string} inviteId - The invitation document ID
 * @returns {Promise<void>}
 */
export async function declineInvitation(inviteId) {
  await updateDoc(doc(db, "invitations", inviteId), {
    status: "declined",
    declinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log("[invitation] Declined:", inviteId);
}
