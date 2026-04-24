/**
 * seed-id-helpers.test.js
 *
 * Unit tests for the shared ID-generation helpers in seed-id-helpers.mjs.
 * Covers slugify, personalOrgId, buildCategoryId, and buildTaskId including
 * edge cases: empty strings, special characters, long input, numeric-only input.
 */

import { describe, it, expect } from "vitest";
import {
  slugify,
  personalOrgId,
  buildCategoryId,
  randomSuffix,
  buildTaskId,
} from "./seed-id-helpers.mjs";

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases uppercase letters", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("C++ & Java!")).toBe("c-java");
  });

  it("collapses consecutive special characters into a single hyphen", () => {
    expect(slugify("a---b")).toBe("a-b");
  });

  it("collapses mixed separators into a single hyphen", () => {
    expect(slugify("a!@#b")).toBe("a-b");
  });

  it("trims leading hyphens", () => {
    expect(slugify("!hello")).toBe("hello");
  });

  it("trims trailing hyphens", () => {
    expect(slugify("hello!")).toBe("hello");
  });

  it("trims both leading and trailing hyphens", () => {
    expect(slugify("!hello!")).toBe("hello");
  });

  it("handles numeric-only input", () => {
    expect(slugify("12345")).toBe("12345");
  });

  it("handles a mix of letters and numbers", () => {
    expect(slugify("Unit 7")).toBe("unit-7");
  });

  it("truncates output to 30 characters", () => {
    const long = "a".repeat(50);
    expect(slugify(long)).toBe("a".repeat(30));
  });

  it("truncates a long mixed string to 30 characters", () => {
    const input = "abcdefghijklmnopqrstuvwxyz1234567890";
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe("abcdefghijklmnopqrstuvwxyz1234");
  });

  it("returns an empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns an empty string for input containing only special characters", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("coerces non-string input (number) to string before slugifying", () => {
    expect(slugify(42)).toBe("42");
  });

  it("preserves hyphens that are already present", () => {
    expect(slugify("hello-world")).toBe("hello-world");
  });

  it("produces only lowercase letters, digits, and hyphens", () => {
    const result = slugify("Hello, World! 123 -- test");
    expect(result).toMatch(/^[a-z0-9-]*$/);
  });
});

// ── personalOrgId ─────────────────────────────────────────────────────────────

describe("personalOrgId", () => {
  it("returns org_<shortOwnerId>_<emailLocalSlug>_default for a typical UID and email", () => {
    expect(personalOrgId("abc123XYZ", "alice@example.com")).toBe("org_abc123_alice_default");
  });

  it("falls back to 'workspace' slug when no email is provided", () => {
    expect(personalOrgId("abc123XYZ")).toBe("org_abc123_workspace_default");
  });

  it("works for an empty string UID", () => {
    expect(personalOrgId("", "user@example.com")).toBe("org__user_default");
  });

  it("always starts with 'org_'", () => {
    expect(personalOrgId("someUser", "x@x.com")).toMatch(/^org_/);
  });

  it("uses exactly the first 6 characters of uid as the short owner ID", () => {
    expect(personalOrgId("ABCDEF123", "test@example.com")).toBe("org_ABCDEF_test_default");
  });

  it("slugifies the email local-part", () => {
    expect(personalOrgId("uid123", "my.name+tag@example.com")).toBe("org_uid123_my-name-tag_default");
  });
});

// ── randomSuffix ──────────────────────────────────────────────────────────────

describe("randomSuffix", () => {
  it("returns a 4-character string", () => {
    expect(randomSuffix()).toHaveLength(4);
  });

  it("contains only lowercase letters and digits", () => {
    for (let i = 0; i < 100; i++) {
      expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/);
    }
  });

  it("generates different values across calls", () => {
    const results = new Set(Array.from({ length: 200 }, () => randomSuffix()));
    expect(results.size).toBeGreaterThan(1);
  });
});

// ── buildCategoryId ───────────────────────────────────────────────────────────

describe("buildCategoryId", () => {
  it("builds the correct ID from typical inputs", () => {
    expect(buildCategoryId("avu4op", "math", "3kd9")).toBe("cat_avu4op_math_3kd9");
  });

  it("always starts with 'cat_'", () => {
    expect(buildCategoryId("a", "b", "xxxx")).toMatch(/^cat_/);
  });

  it("includes both shortUserId and catSlug in the output", () => {
    const id = buildCategoryId("myusr1", "mycat", "ab12");
    expect(id).toContain("myusr1");
    expect(id).toContain("mycat");
  });

  it("appends the random4 suffix verbatim", () => {
    const id = buildCategoryId("uid123", "science", "zz99");
    expect(id.endsWith("_zz99")).toBe(true);
  });

  it("matches the expected format cat_<shortUserId>_<catSlug>_<random4>", () => {
    const id = buildCategoryId("abc123", "math-101", "a1b2");
    expect(id).toMatch(/^cat_[a-z0-9A-Z]{1,6}_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/);
  });

  it("handles numeric-only slugs", () => {
    expect(buildCategoryId("123456", "456", "7890")).toBe("cat_123456_456_7890");
  });
});

// ── buildTaskId ───────────────────────────────────────────────────────────────

describe("buildTaskId", () => {
  it("builds the correct ID from typical inputs", () => {
    expect(buildTaskId("math-101", "homework", 1)).toBe("task_math-101_homework_0001");
  });

  it("zero-pads the counter to exactly 4 digits", () => {
    expect(buildTaskId("cat", "title", 1)).toMatch(/_0001$/);
  });

  it("does not pad counter when it already has 4 digits", () => {
    expect(buildTaskId("cat", "title", 9999)).toBe("task_cat_title_9999");
  });

  it("does not truncate counters larger than 4 digits", () => {
    expect(buildTaskId("cat", "title", 10000)).toBe("task_cat_title_10000");
  });

  it("uses counter = 0 with zero-padding", () => {
    expect(buildTaskId("cat", "title", 0)).toBe("task_cat_title_0000");
  });

  it("always starts with 'task_'", () => {
    expect(buildTaskId("a", "b", 1)).toMatch(/^task_/);
  });

  it("matches the expected task ID format", () => {
    const id = buildTaskId("science-lab", "report", 42);
    expect(id).toMatch(/^task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_[a-z0-9]{4}$/);
  });

  it("includes both categorySlug and titleSlug in the output", () => {
    const id = buildTaskId("history", "essay", 3);
    expect(id).toContain("history");
    expect(id).toContain("essay");
  });

  it("handles numeric-only slugs", () => {
    expect(buildTaskId("123", "456", 9)).toBe("task_123_456_0009");
  });
});
