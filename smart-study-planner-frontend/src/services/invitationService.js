import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";
import { generateInviteId } from "../utils/firestoreIds";

/**
 * Creates a pending invitation for an email address to join an organization.
 * Also adds the invited email to organizations/{orgId}.pendingInviteEmails
 * so that Firestore security rules can permit the invitee to join.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.organizationName
 * @param {string} params.invitedEmail       - Email being invited (lower-cased)
 * @param {string} params.invitedByUserId
 * @param {string} params.invitedByEmail
 * @returns {Promise<string>}  The new invitation document ID
 */
export async function createInvitation({
  organizationId,
  organizationName,
  invitedEmail,
  invitedByUserId,
  invitedByEmail,
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
    role: "member",
    status: "pending",
    createdAt: serverTimestamp(),
    acceptedAt: null,
    declinedAt: null,
    expiresAt: null,
  });

  const orgRef = doc(db, "organizations", organizationId);
  await updateDoc(orgRef, {
    pendingInviteEmails: arrayUnion(normalizedEmail),
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
 *  1. Checks that the user is not already a member (skips org update if so).
 *  2. Adds the user's UID/email to the organization's memberIds/memberEmails.
 *  3. Removes the email from pendingInviteEmails.
 *  4. Updates the user's organizationId.
 *  5. Marks the invitation as accepted.
 *
 * @param {object} params
 * @param {object} params.invitation  - Invitation document data
 * @param {string} params.userId      - Firebase Auth UID of the accepting user
 * @param {string} params.userEmail   - Email of the accepting user
 * @returns {Promise<{organizationId: string, organizationName: string}>}
 */
export async function acceptInvitation({ invitation, userId, userEmail }) {
  const { id: inviteId, organizationId, organizationName, invitedEmail } = invitation;

  const orgRef = doc(db, "organizations", organizationId);
  const orgSnap = await getDoc(orgRef);

  if (!orgSnap.exists()) {
    throw new Error("Organization not found.");
  }

  const orgData = orgSnap.data();
  if (!(orgData.memberIds || []).includes(userId)) {
    await updateDoc(orgRef, {
      memberIds: arrayUnion(userId),
      memberEmails: arrayUnion(userEmail),
      pendingInviteEmails: arrayRemove(invitedEmail),
    });

    await updateDoc(doc(db, "users", userId), {
      organizationId,
      updatedAt: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, "invitations", inviteId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
  });

  console.log("[invitation] Accepted:", inviteId, "→ org:", organizationId);
  return { organizationId, organizationName };
}

/**
 * Declines a pending invitation.
 * Updates the invitation status to "declined" only.
 * Does not modify the organization or user documents.
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
