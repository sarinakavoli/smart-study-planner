import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Invites an existing user by writing invite fields directly to their users/{uid} document.
 * No invitations collection is used.
 *
 * Fields written to the target user's doc:
 *   membershipStatus: "pending"
 *   organizationId, organizationName, role, departmentId, departmentName
 *   invitedBy, invitedByEmail, invitedAt, updatedAt
 *
 * @returns {Promise<string>} the target user's UID
 */
export async function inviteUserByEmail({
  adminUid,
  adminEmail,
  adminOrgId,
  adminOrgName,
  inviteeEmail,
  role,
  departmentId = null,
  departmentName = null,
}) {
  const email = inviteeEmail.trim().toLowerCase();

  const q = query(collection(db, "users"), where("email", "==", email));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("No account found with that email. The user must sign up first.");
  }

  const targetDoc = snapshot.docs[0];
  const targetData = targetDoc.data();

  if (targetData.membershipStatus === "active") {
    throw new Error("This user already belongs to an organization.");
  }

  const inviteFields = {
    membershipStatus: "pending",
    organizationId: adminOrgId,
    organizationName: adminOrgName ?? null,
    role,
    departmentId: departmentId ?? null,
    departmentName: departmentName ?? null,
    invitedBy: adminUid,
    invitedByEmail: adminEmail,
    invitedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log(
    "[invitationService] inviteUserByEmail — writing to users/",
    targetDoc.id,
    ":",
    { ...inviteFields, invitedAt: "(serverTimestamp)", updatedAt: "(serverTimestamp)" }
  );

  await updateDoc(doc(db, "users", targetDoc.id), inviteFields);
  return targetDoc.id;
}

/**
 * Accepts a pending membership invitation.
 * Only writes membershipStatus: "active" + timestamps to the user's own doc.
 * All org fields (organizationId, role, etc.) were already set by the admin.
 *
 * @param {string} uid  The accepting user's UID
 */
export async function acceptMembership(uid) {
  console.log("[invitationService] acceptMembership — writing to users/", uid);
  await updateDoc(doc(db, "users", uid), {
    membershipStatus: "active",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
