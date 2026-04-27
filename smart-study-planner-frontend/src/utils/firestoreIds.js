import { customAlphabet } from "nanoid";

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
 * Format: org_<shortOwnerId>_<emailSlug>_default
 * where shortOwnerId = first 6 characters of the Firebase Auth UID,
 * and emailSlug = slugified local-part of the owner's email (before @),
 * falling back to "workspace" when no email is available.
 *
 * @param {string} uid   - Firebase Auth UID
 * @param {string} email - Owner's email address (optional)
 * @returns {string}  e.g. "org_AvU4Op_sarinakavoli_default"
 */
export function personalOrgId(uid, email = "") {
  const shortOwnerId = String(uid).slice(0, 6);
  const localPart = email ? email.split("@")[0] : "";
  const emailSlug = localPart ? slugify(localPart).slice(0, 20) : "workspace";
  return `org_${shortOwnerId}_${emailSlug}_default`;
}

/**
 * Generates a readable organization ID based on the school name and admin UID.
 * Format: org_<schoolSlug>_<shortOwnerId>_<random4>
 *
 * This replaces personalOrgId for new org creation so the ID is meaningful
 * and does not include "_default".
 *
 * Examples:
 *   generateOrgId("AvU4Op9xKqZ...", "Springfield High School") → "org_springfield-high-school_AvU4Op_3kd9"
 *   generateOrgId("AvU4Op9xKqZ...", "Lincoln Academy")         → "org_lincoln-academy_AvU4Op_8xq1"
 *
 * @param {string} uid       - Firebase Auth UID of the admin
 * @param {string} orgName   - Human-readable school/org name
 * @returns {string}
 */
export function generateOrgId(uid, orgName = "") {
  const shortOwnerId = String(uid).slice(0, 6);
  const nameSlug = orgName ? slugify(orgName).slice(0, 28) : "school";
  const shortRandom = lowercase4();
  return `org_${nameSlug}_${shortOwnerId}_${shortRandom}`;
}

/**
 * Generates a human-readable document ID for the userIndex collection.
 * Format: user_<shortUserId>_<emailSlug>
 * where shortUserId = first 6 characters of the Firebase Auth UID,
 * and emailSlug = slugified local-part of the user's email (before @),
 * falling back to "unknown" when no email is available.
 *
 * Example: uid "AvU4OpeL5WO...", email "sarinakavoli@icloud.com"
 *          → "user_AvU4Op_sarinakavoli"
 *
 * Used only for the debugging-only userIndex collection.
 * The real auth key is always users/{uid} (the full Firebase UID).
 *
 * @param {string} uid   - Firebase Auth UID
 * @param {string} email - User's email address (optional)
 * @returns {string}  e.g. "user_AvU4Op_sarinakavoli"
 */
export function readableUserId(uid, email = "") {
  const shortUserId = String(uid).slice(0, 6);
  const localPart = email ? email.split("@")[0] : "";
  const emailSlug = localPart ? slugify(localPart).slice(0, 20) : "unknown";
  return `user_${shortUserId}_${emailSlug}`;
}

const lowercase4 = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 4);

/**
 * Generates a human-readable document ID for a task.
 * Format: task_<shortUserId>_<categorySlug>_<titleSlug>_<random4>
 *
 * @param {string} userId   - Firebase Auth UID of the current user
 * @param {string} category - Task category name (will be slugified)
 * @param {string} title    - Task title (will be slugified)
 * @returns {string}  e.g. "task_abc1de_school_unity-notes_v3kd"
 */
export function generateTaskId(userId, category, title) {
  const shortUserId = String(userId).slice(0, 6);
  const categorySlug = slugify(category);
  const titleSlug = slugify(title);
  const random4 = lowercase4();
  return `task_${shortUserId}_${categorySlug}_${titleSlug}_${random4}`;
}

/**
 * Generates a human-readable, globally unique document ID for a category.
 * Format: cat_<shortUserId>_<categorySlug>_<shortRandom>
 *
 * shortUserId    = first 6 characters of the Firebase Auth UID.
 * categorySlug   = lowercase, spaces replaced with hyphens, special chars removed.
 * shortRandom    = 4 lowercase letters/numbers for uniqueness.
 *
 * The same value is meant to be stored in the readableId field.
 *
 * @param {string} userId - Firebase Auth UID of the current user
 * @param {string} name   - Category name (will be slugified automatically)
 * @returns {string}  e.g. "cat_AvU4Op_math-science_3kd9"
 */

export function generateCategoryId(userId, name) {
  const shortUserId = String(userId).slice(0, 6);
  const categorySlug = slugify(name);
  const shortRandom = lowercase4();
  return `cat_${shortUserId}_${categorySlug}_${shortRandom}`;
}

/**
 * Generates a human-readable document ID for an invitation.
 * Format: invite_<shortOrgId>_<emailSlug>_<shortRandom>
 *
 * shortOrgId  = first 8 characters of the organization ID.
 * emailSlug   = slugified local-part of the invited email (before @).
 * shortRandom = 4 lowercase letters/numbers for uniqueness.
 *
 * @param {string} organizationId - The organization's Firestore document ID
 * @param {string} email          - The invited user's email address
 * @returns {string}  e.g. "invite_org_AvU4Op_sa_alice_3kd9"
 */
export function generateInviteId(organizationId, email) {
  const shortOrgId = String(organizationId).slice(0, 12);
  const localPart = email ? email.split("@")[0] : "user";
  const emailSlug = slugify(localPart).slice(0, 20);
  const shortRandom = lowercase4();
  return `invite_${shortOrgId}_${emailSlug}_${shortRandom}`;
}
