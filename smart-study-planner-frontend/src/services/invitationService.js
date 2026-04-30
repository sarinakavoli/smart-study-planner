import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { generateInviteId } from "../utils/firestoreIds";

/**
 * Creates a pending invitation document in invitations/{inviteId}.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string|null} params.departmentId
 * @param {string} params.invitedEmail
 * @param {"teacher"|"student"} params.role
 * @param {string} params.invitedByUserId
 * @param {string} params.invitedByEmail
 * @param {string|null} params.organizationName  - denormalized for display
 * @param {string|null} params.departmentName    - denormalized for display
 * @returns {Promise<string>} the new invitation document ID
 */
export async function createInvitation({
  organizationId,
  departmentId,
  invitedEmail,
  role,
  invitedByUserId,
  invitedByEmail,
  organizationName = null,
  departmentName = null,
}) {
  const email = invitedEmail.trim().toLowerCase();
  const inviteId = generateInviteId(organizationId, email);
  await setDoc(doc(db, "invitations", inviteId), {
    id: inviteId,
    organizationId,
    departmentId: departmentId || null,
    organizationName: organizationName || null,
    departmentName: departmentName || null,
    invitedEmail: email,
    role,
    status: "pending",
    invitedByUserId,
    invitedByEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return inviteId;
}

/**
 * Returns all pending invitations addressed to a given email.
 *
 * @param {string} email
 * @returns {Promise<Array>}
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
 * Marks an invitation as accepted.
 *
 * @param {string} invitationId
 * @param {string} acceptedByUserId
 */
export async function acceptInvitation(invitationId, acceptedByUserId) {
  await updateDoc(doc(db, "invitations", invitationId), {
    status: "accepted",
    acceptedByUserId,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Marks an invitation as declined.
 *
 * @param {string} invitationId
 * @param {string} declinedByUserId
 */
export async function declineInvitation(invitationId, declinedByUserId) {
  await updateDoc(doc(db, "invitations", invitationId), {
    status: "declined",
    declinedByUserId,
    declinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
