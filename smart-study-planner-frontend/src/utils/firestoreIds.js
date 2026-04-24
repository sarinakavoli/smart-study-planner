import { nanoid } from "nanoid";
import { collection, doc, documentId, getDocs, query, runTransaction, where } from "firebase/firestore";

/**
 * Converts arbitrary text into a lowercase, URL-safe slug.
 * Only keeps letters, digits, and hyphens; collapses repeated hyphens;
 * trims leading/trailing hyphens; truncates to 30 characters.
 *
 * Examples:
 *   slugify("Math & Science!")  → "math-science"
 *   slugify("  My Category  ")  → "my-category"
 *   slugify("ABC123")           → "abc123"
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Returns the "personal org" identifier for a single user.
 * Every user gets a personal org whose ID is just `org_<uid>`.
 *
 * This keeps the door open for real multi-org support later:
 * when you add orgs, replace this with the user's actual org ID.
 *
 * @param {string} uid - Firebase Auth UID
 * @returns {string}  e.g. "org_ABC123uid"
 */
export function personalOrgId(uid) {
  return `org_${uid}`;
}

/**
 * Generates a human-readable, sequential document ID for a task.
 * Format: task_<categorySlug>_<titleSlug>_<NNN>
 *
 * Algorithm:
 *  1. Query existing task documents with the same prefix to find the current
 *     highest suffix number. This seeds the counter on first use so that new
 *     IDs never collide with tasks written before this counter system existed.
 *  2. Run a Firestore transaction on a dedicated counter document at
 *     `task_counters/org_<uid>_<categorySlug>_<titleSlug>`. The transaction
 *     reads the stored count, takes the max of that and the queried max
 *     (protecting against stale counter docs), increments it, and writes it
 *     back.
 *  3. Because Firestore serializes concurrent transactions on the same
 *     document, two simultaneous callers always receive different numbers —
 *     no retry loop is needed once a counter document exists.
 *  4. The counter document is scoped to the user's org ID so Firestore rules
 *     can enforce that users only read/write their own counter documents.
 *
 * @param {import("firebase/firestore").Firestore} db - Firestore instance
 * @param {string} userId   - Firebase Auth UID of the current user
 * @param {string} category - Task category name (will be slugified)
 * @param {string} title    - Task title (will be slugified)
 * @returns {Promise<string>}  e.g. "task_school_unity-notes_002"
 */
export async function generateTaskId(db, userId, category, title) {
  const categorySlug = slugify(category);
  const titleSlug = slugify(title);
  const prefix = `task_${categorySlug}_${titleSlug}_`;
  const orgId = personalOrgId(userId);
  const counterRef = doc(db, "task_counters", `${orgId}_${categorySlug}_${titleSlug}`);

  const existingSnap = await getDocs(
    query(
      collection(db, "tasks"),
      where(documentId(), ">=", prefix),
      where(documentId(), "<", prefix + "\uf8ff")
    )
  );

  let existingMax = 0;
  existingSnap.forEach((docSnap) => {
    const suffix = docSnap.id.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > existingMax) {
      existingMax = num;
    }
  });

  const nextCount = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const storedCount = counterSnap.exists() ? counterSnap.data().count : 0;
    const next = Math.max(storedCount, existingMax) + 1;
    transaction.set(counterRef, { count: next });
    return next;
  });

  return `${prefix}${String(nextCount).padStart(3, "0")}`;
}

/**
 * Generates a human-readable, globally unique document ID for a category.
 * Format: cat_<orgId>_<slug>_<nanoid(10)>
 *
 * The slug comes from the category name so the ID is self-describing.
 * The nanoid suffix ensures uniqueness even if two orgs use the same name.
 *
 * @param {string} orgId  - Organization ID (e.g. from personalOrgId())
 * @param {string} name   - Category name (will be slugified automatically)
 * @returns {string}  e.g. "cat_org_abc123_math-science_V3kD9pQrLm"
 */
export function generateCategoryId(orgId, name) {
  return `cat_${orgId}_${slugify(name)}_${nanoid(10)}`;
}
