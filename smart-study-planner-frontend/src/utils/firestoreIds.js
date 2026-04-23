import { nanoid } from "nanoid";

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
 * Generates a human-readable, globally unique document ID for a task.
 * Format: task_<orgId>_<userId>_<nanoid(10)>
 *
 * Why this format?
 * - "task_" prefix makes the collection obvious at a glance in the Firebase Console
 * - orgId and userId scoping lets you grep logs and trace ownership instantly
 * - nanoid(10) suffix (~1 quadrillion combinations) makes collisions essentially impossible
 *
 * @param {string} orgId  - Organization ID (e.g. from personalOrgId())
 * @param {string} userId - Firebase Auth UID of the task owner
 * @returns {string}  e.g. "task_org_abc123_abc123_V3kD9pQrLm"
 */
export function generateTaskId(orgId, userId) {
  return `task_${orgId}_${userId}_${nanoid(10)}`;
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
