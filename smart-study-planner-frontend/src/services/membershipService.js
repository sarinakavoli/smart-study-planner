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
 * @param {object} params
 * @param {string}  params.organizationId
 * @param {string}  params.userId
 * @param {string}  params.email
 * @param {string}  params.role            - "admin" | "teacher" | "student"
 * @param {string}  [params.organizationName]
 * @param {string}  [params.displayName]   - User's display name
 * @param {string}  [params.invitedBy]     - UID of the admin who sent the invitation
 * @param {string}  [params.invitationId]  - Firestore ID of the accepted invitation
 * @param {string}  [params.source]        - "invitation" | "org_creation"
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

  const membershipId = `mbr_${userId.slice(0, 6)}_${organizationId.slice(-12).replace(/[^a-zA-Z0-9]/g, "_")}`;
  const ref = doc(db, "memberships", membershipId);

  const data = {
    organizationId,
    userId,
    email: email || "",
    role: role || "student",
    status: "active",
    schemaVersion: 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (organizationName) data.organizationName = organizationName;
  if (displayName)      data.displayName      = displayName;
  if (invitedBy)        data.invitedBy        = invitedBy;
  if (invitationId)     data.invitationId     = invitationId;
  if (source)           data.source           = source;

  await setDoc(ref, data, { merge: true });
  console.log(
    "[membership] created — membershipId:", membershipId,
    "| userId:", userId,
    "| orgId:", organizationId,
    "| role:", role || "student",
    "| source:", source ?? "(none)",
  );
  return membershipId;
}
