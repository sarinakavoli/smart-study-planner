import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Loads tasks for a given user from Firestore.
 *
 * Always filters by userId. Optionally narrows by status and/or category.
 * Results are ordered by dueDate ascending so the soonest tasks appear first.
 *
 * Title and description are NOT used as Firestore filter conditions — they are
 * returned as part of each document and any text-based filtering should be done
 * client-side on the returned array.
 *
 * @param {string} uid - The Firebase Auth UID of the current user.
 * @param {{ status?: string, category?: string }} [filters={}] - Optional filters.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>} Ordered task documents.
 */
export async function loadUserTasks(uid, filters = {}) {
  const constraints = [
    where("userId", "==", uid),
  ];

  if (filters.status) {
    constraints.push(where("status", "==", filters.status));
  }

  if (filters.category) {
    constraints.push(where("category", "==", filters.category));
  }

  constraints.push(orderBy("dueDate", "asc"));

  const q = query(collection(db, "tasks"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
