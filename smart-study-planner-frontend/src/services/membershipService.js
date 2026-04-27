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
 * @param {string} params.organizationId
 * @param {string} params.userId
 * @param {string} params.email
 * @param {string} params.role - "admin" | "teacher" | "student"
 * @returns {Promise<string>} The membership document ID
 */
export async function createMembership({ organizationId, userId, email, role }) {
  const membershipId = `mbr_${userId.slice(0, 6)}_${organizationId.slice(-12).replace(/[^a-zA-Z0-9]/g, "_")}`;
  const ref = doc(db, "memberships", membershipId);
  await setDoc(
    ref,
    {
      organizationId,
      userId,
      email: email || "",
      role: role || "student",
      status: "active",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return membershipId;
}
