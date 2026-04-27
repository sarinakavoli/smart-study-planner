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

  const inviteRef = doc(db, "invitations", inviteId);
  await setDoc(inviteRef, {
    readableId: inviteId,
    organizationId,
    organizationName,
    invitedEmail: normalizedEmail,
    invitedByUserId,
    invitedByEmail,
    role: role || "student",
    status: "pending",
    createdAt: serverTimestamp(),
    acceptedAt: null,
    declinedAt: null,
    expiresAt: null,
  });

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
  });
  console.log("[invitation] Declined:", inviteId);
}
