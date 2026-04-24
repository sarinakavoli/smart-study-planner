/**
 * seed-id-helpers.mjs
 *
 * Shared ID-generation helpers for seed scripts.
 * Centralised here so seed-categories.mjs and seed-tasks.mjs stay in sync
 * and never drift from each other.
 */

/**
 * Converts arbitrary text into a lowercase, URL-safe slug.
 * Only keeps letters, digits, and hyphens; collapses repeated hyphens;
 * trims leading/trailing hyphens; truncates to 30 characters.
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Returns the personal org ID for a given uid and optional email.
 * Format: org_<shortOwnerId>_<emailSlug>_default
 * where shortOwnerId = first 6 characters of the Firebase Auth UID,
 * and emailSlug = slugified local-part of the owner's email (before @),
 * falling back to "workspace" when no email is available.
 *
 * Must match personalOrgId() in src/utils/firestoreIds.js exactly.
 *
 * @param {string} uid   - Firebase Auth UID
 * @param {string} email - Owner email address (optional)
 * @returns {string}  e.g. "org_AvU4Op_sarinakavoli_default"
 */
export function personalOrgId(uid, email = "") {
  const shortOwnerId = String(uid).slice(0, 6);
  const localPart = email ? email.split("@")[0] : "";
  const emailSlug = localPart ? slugify(localPart).slice(0, 20) : "workspace";
  return `org_${shortOwnerId}_${emailSlug}_default`;
}

/**
 * Generates a 4-character random suffix from lowercase letters and digits.
 * Used as shortRandom in category document IDs.
 */
export function randomSuffix() {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Builds a category document ID.
 * Format: cat_<shortUserId>_<catSlug>_<shortRandom>
 *
 * shortUserId = first 6 characters of the Firebase Auth UID.
 * catSlug     = pre-slugified category name.
 * shortRandom = 4 lowercase letters/numbers.
 *
 * Satisfies the audit regex:
 *   /^cat_[a-z0-9]{1,6}_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/
 *
 * @param {string} shortUserId - First 6 chars of Firebase Auth UID
 * @param {string} catSlug     - Pre-slugified category name
 * @param {string} random4     - 4-char lowercase alphanumeric suffix
 * @returns {string}  e.g. "cat_avu4op_math_3kd9"
 */
export function buildCategoryId(shortUserId, catSlug, random4) {
  return `cat_${shortUserId}_${catSlug}_${random4}`;
}

/**
 * Builds a task document ID from pre-slugified segments and a numeric counter.
 * Format: task_<categorySlug>_<titleSlug>_<NNN>
 * Counter is zero-padded to at least 3 digits.
 */
export function buildTaskId(categorySlug, titleSlug, counter) {
  return `task_${categorySlug}_${titleSlug}_${String(counter).padStart(3, "0")}`;
}
