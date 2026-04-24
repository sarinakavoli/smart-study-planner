import { nanoid } from "nanoid";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";

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
 *  1. Query Firestore for all docs whose IDs start with the prefix to find
 *     the current highest counter.
 *  2. Propose the next number (max + 1).
 *  3. Verify the candidate ID does not already exist (getDoc). If it does —
 *     e.g. due to a concurrent write that landed between the query and here —
 *     increment and retry until a free slot is found.
 *
 * This retry loop makes collisions extremely unlikely in practice. A
 * fully atomic guarantee would require a server-side counter; for this
 * client-only app the loop provides sufficient safety.
 *
 * @param {import("firebase/firestore").Firestore} db - Firestore instance
 * @param {string} category - Task category name (will be slugified)
 * @param {string} title    - Task title (will be slugified)
 * @returns {Promise<string>}  e.g. "task_school_unity-notes_002"
 */
export async function generateTaskId(db, category, title) {
  const categorySlug = slugify(category);
  const titleSlug = slugify(title);
  const prefix = `task_${categorySlug}_${titleSlug}_`;

  const q = query(
    collection(db, "tasks"),
    where(documentId(), ">=", prefix),
    where(documentId(), "<", prefix + "\uf8ff")
  );

  const snap = await getDocs(q);

  let maxNum = 0;
  snap.forEach((docSnap) => {
    const suffix = docSnap.id.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  });

  let candidate = maxNum + 1;
  while (true) {
    const candidateId = `${prefix}${String(candidate).padStart(3, "0")}`;
    const existing = await getDoc(doc(db, "tasks", candidateId));
    if (!existing.exists()) {
      return candidateId;
    }
    candidate++;
  }
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
