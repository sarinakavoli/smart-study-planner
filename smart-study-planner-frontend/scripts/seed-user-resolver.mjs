/**
 * seed-user-resolver.mjs
 *
 * Shared helper that resolves a mix of email addresses and UIDs into a final
 * list of Firebase Auth UIDs for use by seed-categories.mjs and seed-tasks.mjs.
 *
 * Two sources are supported:
 *
 *   1. CLI flags (passed as already-parsed strings)
 *      --users=uid1,uid2   → raw UIDs, used as-is
 *      --email=a@b.com,... → email addresses resolved via Firebase Auth Admin SDK
 *
 *   2. .seed-users config file (scripts/.seed-users)
 *      Read automatically when neither --users nor --email is supplied on the CLI.
 *      Each entry is either an email address (contains "@") or a raw UID.
 *      Emails are resolved to UIDs; raw UIDs are passed through unchanged.
 *
 * File format (scripts/.seed-users):
 *   Plain JSON object with a "users" array of email addresses or UIDs.
 *   Comments are not supported (standard JSON).
 *
 *   Example:
 *   {
 *     "users": [
 *       "alice@example.com",
 *       "bob@example.com",
 *       "some-firebase-uid-xyz"
 *     ]
 *   }
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEED_USERS_PATH =
  process.env.SEED_USERS_PATH_OVERRIDE || join(__dirname, ".seed-users");

/**
 * Attempts to load the .seed-users config file from the scripts directory.
 * Returns the array of user strings (emails or UIDs), or null if the file
 * does not exist.
 *
 * Exits the process with an error message if the file exists but is malformed.
 *
 * @returns {string[] | null}
 */
export function loadSeedUsersFile() {
  if (!existsSync(SEED_USERS_PATH)) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(SEED_USERS_PATH, "utf8"));
  } catch (err) {
    console.error(
      `ERROR: Failed to parse ${SEED_USERS_PATH}:\n` +
      `       ${err.message}\n` +
      `       Fix the JSON syntax or delete the file to use the default user list.\n` +
      `       See .seed-users.example for the expected format.`
    );
    process.exit(1);
  }

  if (!parsed || !Array.isArray(parsed.users) || parsed.users.length === 0) {
    console.error(
      `ERROR: ${SEED_USERS_PATH} must be a JSON object with a non-empty "users" array.\n` +
      `       Example: { "users": ["alice@example.com", "firebase-uid-xyz"] }\n` +
      `       See .seed-users.example for the expected format.`
    );
    process.exit(1);
  }

  const invalid = parsed.users.filter((u) => typeof u !== "string" || !u.trim());
  if (invalid.length > 0) {
    console.error(
      `ERROR: All entries in the "users" array in ${SEED_USERS_PATH} must be non-empty strings.\n` +
      `       Found ${invalid.length} invalid entry/entries.`
    );
    process.exit(1);
  }

  return parsed.users.map((u) => u.trim());
}

/**
 * Resolves a list of email addresses to Firebase Auth UIDs.
 * Logs each resolution result and exits the process with code 1 if any
 * email cannot be found in Firebase Auth.
 *
 * @param {import("firebase-admin/auth").Auth} auth  Initialized Auth instance
 * @param {string[]} emails                          List of email addresses
 * @returns {Promise<string[]>}                      Resolved UIDs in the same order
 */
export async function resolveEmailsToUids(auth, emails) {
  console.log(`  Resolving ${emails.length} email address(es) to Firebase Auth UIDs …`);

  const results = await Promise.all(
    emails.map(async (email) => {
      try {
        const user = await auth.getUserByEmail(email);
        console.log(`    [OK] ${email} → ${user.uid}`);
        return { email, uid: user.uid, ok: true };
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          console.error(`    [MISSING] ${email} — no Firebase Auth account found`);
          return { email, uid: null, ok: false };
        }
        throw err;
      }
    })
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `\nERROR: ${failed.length} email address(es) could not be resolved to Firebase Auth UIDs.\n` +
      `       Make sure the accounts exist in Firebase Auth before seeding.\n` +
      `       Missing: ${failed.map((r) => r.email).join(", ")}`
    );
    process.exit(1);
  }

  return results.map((r) => r.uid);
}

/**
 * Resolves a mixed list of emails and UIDs into a final list of UIDs.
 * Entries containing "@" are treated as email addresses; all others are used
 * as raw UIDs unchanged.
 *
 * @param {import("firebase-admin/auth").Auth} auth  Initialized Auth instance
 * @param {string[]} entries                         Mix of emails and UIDs
 * @returns {Promise<string[]>}                      Final list of UIDs
 */
export async function resolveMixedEntries(auth, entries) {
  const emails = entries.filter((e) => e.includes("@"));
  const uids   = entries.filter((e) => !e.includes("@"));

  let resolvedFromEmails = [];
  if (emails.length > 0) {
    resolvedFromEmails = await resolveEmailsToUids(auth, emails);
  }

  return [...uids, ...resolvedFromEmails];
}
