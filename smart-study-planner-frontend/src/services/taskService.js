import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Loads tasks for a given user from Firestore.
 *
 * Always filters by userId. Optionally narrows by status and/or category.
 *
 * Title and description are NOT used as Firestore filter conditions — they are
 * returned as part of each document and any text-based filtering should be done
 * client-side on the returned array.
 *
 * NOTE: orderBy("dueDate") requires a deployed composite index. Until
 * firestore.indexes.json has been deployed via `firebase deploy --only firestore:indexes`,
 * sorting by dueDate is intentionally omitted here to keep the query working.
 *
 * @param {string} uid - The Firebase Auth UID of the current user.
 * @param {{ status?: string, category?: string }} [filters={}] - Optional filters.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>} Task documents.
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

  const q = query(collection(db, "tasks"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
