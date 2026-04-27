/**
 * audit-id-helpers.test.js
 *
 * Unit tests for classifyId() and printList() in audit-id-helpers.mjs.
 * Tests cover all four classification outcomes (ok, deprecated, malformed,
 * legacy) and relevant edge cases, exercising both the task and category
 * prefixes/regexes used by the audit script.
 */

import { describe, it, expect, vi } from "vitest";
import { classifyId, printList } from "./audit-id-helpers.mjs";

// ── Regexes (mirrored from audit-readable-ids.mjs) ───────────────────────────

const TASK_ID_REGEX = /^task_[A-Za-z0-9]{1,6}_[a-z0-9-]*_[a-z0-9-]*_[a-z0-9]{4}$/;
const CAT_ID_REGEX  = /^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/;

// ── classifyId — task IDs ─────────────────────────────────────────────────────

describe('classifyId — task IDs', () => {
  const classify = (id) => classifyId(id, 'task_', 'task_org_', TASK_ID_REGEX);

  describe('"ok" — passes the refined task regex', () => {
    it('returns "ok" for a typical 5-part task ID (shortUserId + catSlug + titleSlug + counter)', () => {
      expect(classify('task_AvU4Op_math_homework_0001')).toBe('ok');
    });

    it('returns "ok" for a task ID with hyphens in the slug segments', () => {
      expect(classify('task_abc123_science-lab_read-chapter_0042')).toBe('ok');
    });

    it('returns "ok" for a task ID with a 4-char alphanumeric app-generated suffix', () => {
      expect(classify('task_uid001_history_essay_a1b2')).toBe('ok');
    });

    it('returns "ok" for a task ID whose shortUserId is all digits', () => {
      expect(classify('task_123456_overview_intro_zz99')).toBe('ok');
    });

    it('returns "ok" when the shortUserId looks like the deprecated "org" keyword', () => {
      expect(classify('task_org_math_homework_0001')).toBe('ok');
    });
  });

  describe('"deprecated" — starts with task_org_ and fails regex', () => {
    it('returns "deprecated" for an old task_org_... ID', () => {
      expect(classify('task_org_math_12345')).toBe('deprecated');
    });

    it('returns "deprecated" for a task_org_ ID with a 3-digit suffix (pre-refinement)', () => {
      expect(classify('task_org_science_001')).toBe('deprecated');
    });

    it('returns "deprecated" for a bare task_org_ prefix with no further segments', () => {
      expect(classify('task_org_')).toBe('deprecated');
    });
  });

  describe('"malformed" — has task_ prefix but does not pass regex and is not deprecated', () => {
    it('returns "malformed" for a task ID with a 3-digit counter suffix', () => {
      expect(classify('task_math_homework_001')).toBe('malformed');
    });

    it('returns "malformed" for a task ID missing the counter segment entirely', () => {
      expect(classify('task_math_homework')).toBe('malformed');
    });

    it('returns "malformed" for a task ID with an uppercase slug segment', () => {
      expect(classify('task_Math_Homework_0001')).toBe('malformed');
    });

    it('returns "malformed" for a task ID with a 5-char suffix', () => {
      expect(classify('task_math_homework_00001')).toBe('malformed');
    });

    it('returns "malformed" for a task_ prefix followed by nothing', () => {
      expect(classify('task_')).toBe('malformed');
    });

    it('returns "malformed" for a task ID with underscores inside a slug segment', () => {
      expect(classify('task_my_cat_my_title_0001')).toBe('malformed');
    });
  });

  describe('"legacy" — does not start with the task_ prefix', () => {
    it('returns "legacy" for a Firestore auto-ID', () => {
      expect(classify('3tQ8XvLzR2aKpNdMwYeJ')).toBe('legacy');
    });

    it('returns "legacy" for an empty string', () => {
      expect(classify('')).toBe('legacy');
    });

    it('returns "legacy" for an ID starting with "cat_"', () => {
      expect(classify('cat_math_algebra_0001')).toBe('legacy');
    });

    it('returns "legacy" for an ID starting with "TASK_" (wrong case)', () => {
      expect(classify('TASK_math_homework_0001')).toBe('legacy');
    });

    it('returns "legacy" for a numeric-only ID', () => {
      expect(classify('1234567890')).toBe('legacy');
    });
  });
});

// ── classifyId — category IDs ─────────────────────────────────────────────────

describe('classifyId — category IDs', () => {
  const classify = (id) => classifyId(id, 'cat_', 'cat_org_', CAT_ID_REGEX);

  describe('"ok" — passes the refined category regex', () => {
    it('returns "ok" for a typical category ID', () => {
      expect(classify('cat_avu4op_math_3kd9')).toBe('ok');
    });

    it('returns "ok" for a category ID with hyphens in slug segments', () => {
      expect(classify('cat_abc123_science-lab_zz99')).toBe('ok');
    });

    it('returns "ok" for a category ID with all-digit slug segments', () => {
      expect(classify('cat_123abc_456def_ab12')).toBe('ok');
    });
  });

  describe('"deprecated" — starts with cat_org_ and fails regex', () => {
    it('returns "deprecated" for an old cat_org_... ID', () => {
      expect(classify('cat_org_math_12345')).toBe('deprecated');
    });

    it('returns "deprecated" for a bare cat_org_ prefix', () => {
      expect(classify('cat_org_')).toBe('deprecated');
    });
  });

  describe('"malformed" — has cat_ prefix but does not pass regex and is not deprecated', () => {
    it('returns "malformed" for a category ID with a 3-char suffix', () => {
      expect(classify('cat_abc123_math_ab1')).toBe('malformed');
    });

    it('returns "malformed" for a category ID with an uppercase slug', () => {
      expect(classify('cat_ABC123_math_ab12')).toBe('malformed');
    });

    it('returns "malformed" for a category ID missing the suffix segment', () => {
      expect(classify('cat_abc123_math')).toBe('malformed');
    });

    it('returns "malformed" for a cat_ prefix followed by nothing', () => {
      expect(classify('cat_')).toBe('malformed');
    });
  });

  describe('"legacy" — does not start with the cat_ prefix', () => {
    it('returns "legacy" for a Firestore auto-ID', () => {
      expect(classify('AbCdEfGhIjKlMnOpQrSt')).toBe('legacy');
    });

    it('returns "legacy" for an empty string', () => {
      expect(classify('')).toBe('legacy');
    });

    it('returns "legacy" for an ID starting with "task_"', () => {
      expect(classify('task_math_algebra_0001')).toBe('legacy');
    });
  });
});

// ── classifyId — regex priority (ok check runs before deprecated check) ───────

describe('classifyId — regex takes priority over prefix checks', () => {
  it('classifies as "ok" a 5-part task ID whose shortUserId is "org" (starts with deprecated prefix but passes regex)', () => {
    const id = 'task_org_math_homework_0001';
    expect(classifyId(id, 'task_', 'task_org_', TASK_ID_REGEX)).toBe('ok');
  });

  it('classifies a 4-part task_org_... ID as "deprecated" (fails regex, deprecated prefix wins)', () => {
    const id = 'task_org_math_0001';
    expect(classifyId(id, 'task_', 'task_org_', TASK_ID_REGEX)).toBe('deprecated');
  });
});

// ── printList ─────────────────────────────────────────────────────────────────

describe('printList', () => {
  it('does not call log when ids array is empty', () => {
    const log = vi.fn();
    printList('My Label', [], false, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs a header and each ID for a small list', () => {
    const log = vi.fn();
    printList('Test label', ['id-1', 'id-2'], false, log);
    expect(log).toHaveBeenCalledTimes(3);
    const header = log.mock.calls[0][0];
    expect(header).toContain('Test label');
    expect(log.mock.calls[1][0]).toContain('id-1');
    expect(log.mock.calls[2][0]).toContain('id-2');
  });

  it('shows "first 20 shown" in the header when verbose is false', () => {
    const log = vi.fn();
    printList('Label', ['id-1'], false, log);
    expect(log.mock.calls[0][0]).toContain('first 20 shown');
  });

  it('shows "all shown" in the header when verbose is true', () => {
    const log = vi.fn();
    printList('Label', ['id-1'], true, log);
    expect(log.mock.calls[0][0]).toContain('all shown');
  });

  it('caps at 20 items and appends a "… and N more" line when verbose is false', () => {
    const log = vi.fn();
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i + 1}`);
    printList('Label', ids, false, log);
    const calls = log.mock.calls.map((c) => c[0]);
    const moreLine = calls.find((line) => line.includes('and 5 more'));
    expect(moreLine).toBeDefined();
    const idLines = calls.filter((line) => line.startsWith('    - '));
    expect(idLines).toHaveLength(20);
  });

  it('shows all items when verbose is true, with no "… and N more" line', () => {
    const log = vi.fn();
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i + 1}`);
    printList('Label', ids, true, log);
    const calls = log.mock.calls.map((c) => c[0]);
    const moreLine = calls.find((line) => line.includes('more'));
    expect(moreLine).toBeUndefined();
    const idLines = calls.filter((line) => line.startsWith('    - '));
    expect(idLines).toHaveLength(25);
  });

  it('uses console.log by default when no log function is supplied', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printList('Default log test', ['id-1'], false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
