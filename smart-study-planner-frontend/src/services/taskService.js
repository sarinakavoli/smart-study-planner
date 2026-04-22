import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

// ─── IMPORTANT: INDEX REQUIREMENT ────────────────────────────────────────────
//
// `loadOverdueTasks` uses a composite Firestore query:
//   userId (==) + category (==) + status (==) + dueDate (<) + orderBy dueDate
//
// This REQUIRES a composite index deployed to Firebase before it will work.
// See firestore.indexes.json for the index definition.
// How to deploy: run `firebase deploy --only firestore:indexes`
//   from the smart-study-planner-frontend/ directory.
//
// Until deployed, calling loadOverdueTasks will throw a FirebaseError
// with a link in the browser console — clicking that link creates the index
// automatically in ~1 minute.
//
// `loadUserTasks` only uses a single equality filter (userId ==) so it
// works without any composite index.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads all tasks for a user.
 * No composite index required — uses only a single equality filter.
 *
 * @param {string} uid - Firebase Auth UID of the current user.
 * @param {{ status?: string, category?: string }} [filters={}]
 *   Optional equality filters applied after the userId filter.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function loadUserTasks(uid, filters = {}) {
  const constraints = [where("userId", "==", uid)];

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

/**
 * Loads tasks that belong to a specific user AND category AND status,
 * AND whose dueDate is before the given cutoff date (i.e. past-due by
 * more than `overdueByDays` days).
 *
 * ⚠️  REQUIRES a composite Firestore index (see firestore.indexes.json).
 *     Deploy with: firebase deploy --only firestore:indexes
 *     Without the index this throws a FirebaseError — the console error
 *     includes a link to auto-create the index in one click.
 *
 * Firestore can filter by userId, category, status, and dueDate range
 * all in one server-side query — nothing is fetched unnecessarily.
 *
 * Results are ordered by dueDate ascending (most overdue first).
 *
 * @param {string} uid        Firebase Auth UID of the task owner.
 * @param {string} category   Exact category string (e.g. "Math").
 * @param {string} status     Exact status string (e.g. "PENDING").
 *   Pass an array like ["PENDING","IN_PROGRESS"] to match multiple statuses
 *   using Firestore's `in` operator.
 * @param {number} [overdueByDays=0]
 *   How many days past the due date to look. 0 = any overdue task,
 *   3 = tasks that were due more than 3 days ago.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function loadOverdueTasks(
  uid,
  category,
  status,
  overdueByDays = 0,
) {
  // Build the cutoff date string in YYYY-MM-DD format.
  // dueDate is stored as a plain string in that format so string comparison works.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - overdueByDays);
  const cutoffString = cutoff.toISOString().split("T")[0]; // e.g. "2025-04-19"

  const constraints = [
    where("userId", "==", uid),
    where("category", "==", category),
    // Support single status string OR an array of statuses (OR logic via `in`).
    Array.isArray(status)
      ? where("status", "in", status)
      : where("status", "==", status),
    where("dueDate", "<", cutoffString),
    orderBy("dueDate", "asc"),
  ];

  const q = query(collection(db, "tasks"), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
