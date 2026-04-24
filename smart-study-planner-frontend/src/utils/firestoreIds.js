import { nanoid, customAlphabet } from "nanoid";

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
 * Generates the default organization ID for a new user.
 * Format: org_<shortUserId>_default
 * where shortUserId = first 6 characters of the Firebase Auth UID.
 *
 * Example: uid "AvU4Op9xKqZ..." → "org_AvU4Op_default"
 *
 * This is only used when creating a brand-new organization on first
 * login. For existing users the organizationId is read from their
 * Firestore profile document instead of being computed here.
 *
 * @param {string} uid - Firebase Auth UID
 * @returns {string}  e.g. "org_AvU4Op_default"
 */
export function personalOrgId(uid) {
  const shortUserId = String(uid).slice(0, 6);
  return `org_${shortUserId}_default`;
}

/**
 * Generates a human-readable document ID for a task.
 * Format: task_<shortUserId>_<categorySlug>_<titleSlug>_<random4>
 *
 * @param {import("firebase/firestore").Firestore} _db - Firestore instance (unused, kept for call-site compatibility)
 * @param {string} userId   - Firebase Auth UID of the current user
 * @param {string} category - Task category name (will be slugified)
 * @param {string} title    - Task title (will be slugified)
 * @returns {Promise<string>}  e.g. "task_abc1_school_unity-notes_v3kD"
 */
const alphanumeric = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 4);

export async function generateTaskId(_db, userId, category, title) {
  const shortUserId = String(userId).slice(0, 6);
  const categorySlug = slugify(category);
  const titleSlug = slugify(title);
  const random4 = alphanumeric();
  return `task_${shortUserId}_${categorySlug}_${titleSlug}_${random4}`;
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
