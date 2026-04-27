/**
 * audit-id-helpers.mjs
 *
 * Shared helpers for the audit-readable-ids.mjs script.
 * Extracted here so classifyId() can be unit-tested directly without
 * spawning the CLI script as a child process.
 */

/**
 * Classifies a document ID:
 *   "ok"         — Passes strict refined-format regex.
 *   "deprecated" — Does NOT pass the regex AND starts with deprecated prefix.
 *   "malformed"  — Does NOT pass the regex AND has the right prefix but not deprecated.
 *   "legacy"     — Does NOT pass the regex AND lacks the expected prefix.
 *
 * The regex is checked first so a valid new-format ID (e.g. task_org_math_0001
 * for a category named "org") is never wrongly flagged as deprecated.
 *
 * @param {string} docId
 * @param {string} newPrefix         e.g. "task_"
 * @param {string} deprecatedPrefix  e.g. "task_org_"
 * @param {RegExp} refinedRegex
 * @returns {"ok"|"deprecated"|"malformed"|"legacy"}
 */
export function classifyId(docId, newPrefix, deprecatedPrefix, refinedRegex) {
  if (refinedRegex.test(docId)) return "ok";
  if (!docId.startsWith(newPrefix)) return "legacy";
  if (docId.startsWith(deprecatedPrefix)) return "deprecated";
  return "malformed";
}

/**
 * Prints a capped list of IDs using the supplied log function.
 * When verbose is false, only the first 20 items are shown.
 *
 * @param {string}   label    - Heading for the list
 * @param {string[]} ids      - Array of document IDs to display
 * @param {boolean}  verbose  - When true all items are printed
 * @param {Function} log      - Output function (defaults to console.log)
 */
export function printList(label, ids, verbose, log = console.log) {
  if (ids.length === 0) return;
  const shown = verbose ? ids : ids.slice(0, 20);
  log(verbose ? `\n  ${label} (all shown):` : `\n  ${label} (first 20 shown):`);
  shown.forEach((id) => log(`    - ${id}`));
  if (!verbose && ids.length > 20) {
    log(`    … and ${ids.length - 20} more. (run with --verbose to see all)`);
  }
}
