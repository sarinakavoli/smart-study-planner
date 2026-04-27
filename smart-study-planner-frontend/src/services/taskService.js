import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

// ─── IMPORTANT: INDEX REQUIREMENTS ───────────────────────────────────────────
//
// `loadOverdueTasks` uses a composite Firestore query:
//   userId (==) + category (==) + status (==) + dueDate (<) + orderBy dueDate
//
// `loadOrgTasks` uses a composite Firestore query:
//   organizationId (==) + assignedTo (==) + status (==) + orderBy dueDate asc
//
// Both REQUIRE composite indexes deployed to Firebase.
// See firestore.indexes.json for the index definitions.
// How to deploy: run `firebase deploy --only firestore:indexes`
//   from the smart-study-planner-frontend/ directory.
//
// Until deployed, these functions will throw a FirebaseError with a link in
// the browser console — clicking that link creates the index automatically.
//
// `loadUserTasks` only uses equality filters so it works without a composite index.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads all tasks for a user, scoped to their active organization.
 * No composite index required — uses only equality filters.
 *
 * @param {string} uid    - Firebase Auth UID of the current user.
 * @param {string} [orgId] - Active organization ID to scope the query.
 * @param {{ status?: string, category?: string }} [filters={}]
 *   Optional equality filters applied after the userId filter.
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function loadUserTasks(uid, orgId, filters = {}) {
  console.log("[taskService] loadUserTasks — userId:", uid, "| organizationId used in query:", orgId ?? "(none, filtering by userId only)");

  const constraints = [where("userId", "==", uid)];

  if (orgId) {
    constraints.push(where("organizationId", "==", orgId));
  }

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
 * Results are ordered by dueDate ascending (most overdue first).
 *
 * @param {string} uid          Firebase Auth UID of the task owner.
 * @param {string} [orgId]      Active organization ID to scope the query.
 * @param {string} category     Exact category string (e.g. "Math").
 * @param {string} status       Exact status string (e.g. "PENDING").
 * @param {number} [overdueByDays=0]
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function loadOverdueTasks(
  uid,
  orgId,
  category,
  status,
  overdueByDays = 0,
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - overdueByDays);
  const cutoffString = cutoff.toISOString().split("T")[0];

  console.log("[taskService] loadOverdueTasks — userId:", uid, "| organizationId used in query:", orgId ?? "(none)");

  const constraints = [
    where("userId", "==", uid),
  ];

  if (orgId) {
    constraints.push(where("organizationId", "==", orgId));
  }

  constraints.push(
    where("category", "==", category),
    Array.isArray(status)
      ? where("status", "in", status)
      : where("status", "==", status),
    where("dueDate", "<", cutoffString),
    orderBy("dueDate", "asc"),
  );

  const q = query(collection(db, "tasks"), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * Loads tasks scoped to an organization, filtered by assignee and status,
 * ordered by dueDate ascending (soonest due first).
 *
 * ⚠️  REQUIRES a composite Firestore index (see firestore.indexes.json):
 *     organizationId (ASC) + assignedTo (ASC) + status (ASC) + dueDate (ASC)
 *     Deploy with: firebase deploy --only firestore:indexes
 *
 * @param {string} orgId       - Active organization ID (mandatory)
 * @param {string} assignedTo  - UID of the user the task is assigned to
 * @param {string} [status]    - Task status filter, e.g. "todo", "PENDING" (optional)
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export async function loadOrgTasks(orgId, assignedTo, status) {
  console.log("[taskService] loadOrgTasks — organizationId:", orgId, "| assignedTo:", assignedTo, "| status:", status ?? "(all)");

  const constraints = [
    where("organizationId", "==", orgId),
    where("assignedTo", "==", assignedTo),
  ];

  if (status) {
    constraints.push(where("status", "==", status));
  }

  constraints.push(orderBy("dueDate", "asc"));

  console.log("[taskService] loadOrgTasks — query filters: organizationId ==", orgId, ", assignedTo ==", assignedTo, status ? `, status == ${status}` : "", ", orderBy dueDate asc");

  const q = query(collection(db, "tasks"), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
