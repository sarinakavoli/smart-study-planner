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
 * Fields written (must match firestore.rules exactly):
 *   email, role, organizationId, organizationName,
 *   departmentId, departmentName, status: "pending",
 *   createdBy, createdByEmail, createdAt, updatedAt
 *
 * @returns {Promise<string>} the new invitation document ID
 */
export async function createInvitation({
  organizationId,
  organizationName = null,
  departmentId = null,
  departmentName = null,
  invitedEmail,
  role,
  invitedByUserId,
  invitedByEmail,
}) {
  const email = invitedEmail.trim().toLowerCase();
  const inviteId = generateInviteId(organizationId, email);

  const inviteData = {
    id: inviteId,
    email,
    role,
    organizationId,
    organizationName: organizationName ?? null,
    departmentId: departmentId ?? null,
    departmentName: departmentName ?? null,
    status: "pending",
    createdBy: invitedByUserId,
    createdByEmail: invitedByEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log("[invitationService] createInvitation — writing to invitations/", inviteId, ":", {
    ...inviteData,
    createdAt: "(serverTimestamp)",
    updatedAt: "(serverTimestamp)",
  });

  await setDoc(doc(db, "invitations", inviteId), inviteData);
  return inviteId;
}

/**
 * Returns all pending invitations addressed to a given email.
 * Queries by email only (no composite index needed) and filters status in code.
 *
 * @param {string} email
 * @returns {Promise<Array>}
 */
export async function getPendingInvitationsForEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, "invitations"),
    where("email", "==", normalizedEmail)
  );
  const snapshot = await getDocs(q);
  const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter((inv) => inv.status === "pending");
}

/**
 * Marks an invitation as accepted.
 * Only updates status, acceptedAt, and updatedAt — no other fields change
 * (required by firestore.rules).
 *
 * @param {string} invitationId
 */
export async function acceptInvitation(invitationId) {
  console.log("[invitationService] acceptInvitation — marking accepted:", invitationId);
  await updateDoc(doc(db, "invitations", invitationId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
