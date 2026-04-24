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
 *  1. Checks that the user is not already a member (no-op if they are).
 *  2. Adds the user's UID/email to the organization's memberIds/memberEmails.
 *  3. Removes the email from pendingInviteEmails.
 *  4. Updates the user's organizationId.
 *  5. Marks the invitation as accepted.
 *
 * @param {object} params
 * @param {object} params.invitation  - Invitation document data (must include id, organizationId, invitedEmail)
 * @param {string} params.userId      - Firebase Auth UID of the accepting user
 * @param {string} params.userEmail   - Email of the accepting user
 */
export async function acceptInvitation({ invitation, userId, userEmail }) {
  const { id: inviteId, organizationId, invitedEmail } = invitation;

  const orgRef = doc(db, "organizations", organizationId);
  const orgSnap = await getDoc(orgRef);

  if (!orgSnap.exists()) {
    console.warn("[invitation] Organization not found:", organizationId);
    return;
  }

  const orgData = orgSnap.data();
  if ((orgData.memberIds || []).includes(userId)) {
    console.log("[invitation] User already a member of org:", organizationId);
    await updateDoc(doc(db, "invitations", inviteId), {
      status: "accepted",
      acceptedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(orgRef, {
    memberIds: arrayUnion(userId),
    memberEmails: arrayUnion(userEmail),
    pendingInviteEmails: arrayRemove(invitedEmail),
  });

  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    organizationId,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "invitations", inviteId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
  });

  console.log("[invitation] Accepted:", inviteId, "→ org:", organizationId);
}
