/**
 * seed-id-helpers.mjs
 *
 * Shared ID-generation helpers for seed scripts.
 * Centralised here so seed-categories.mjs and seed-tasks.mjs stay in sync
 * and never drift from each other.
 *
 * NOTE: personalOrgId() here intentionally uses the simpler `org_<uid>`
 * format used by the seed scripts, which differs from the app's
 * firestoreIds.js format (`org_<shortUid>_default`).  Do not merge them.
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

/** Returns the personal org ID for a given UID (used for organizationId field). */
export function personalOrgId(uid) {
  return `org_${uid}`;
}

/**
 * Builds a category document ID from pre-slugified segments and a numeric counter.
 * Format: cat_<orgSlug>_<catSlug>_<NNN>
 * Counter is zero-padded to at least 3 digits.
 *
 * Both slug segments are derived from already-slugified input so the result
 * always satisfies the audit regex:
 *   /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/
 */
export function buildCategoryId(orgSlug, catSlug, counter) {
  return `cat_${orgSlug}_${catSlug}_${String(counter).padStart(3, "0")}`;
}

/**
 * Builds a task document ID from pre-slugified segments and a numeric counter.
 * Format: task_<categorySlug>_<titleSlug>_<NNN>
 * Counter is zero-padded to at least 3 digits.
 */
export function buildTaskId(categorySlug, titleSlug, counter) {
  return `task_${categorySlug}_${titleSlug}_${String(counter).padStart(3, "0")}`;
}
