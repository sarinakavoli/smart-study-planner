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
  it("returns org_<uid> for a typical UID", () => {
    expect(personalOrgId("abc123")).toBe("org_abc123");
  });

  it("works for an empty string UID", () => {
    expect(personalOrgId("")).toBe("org_");
  });

  it("works for a UID with special characters", () => {
    expect(personalOrgId("user-001")).toBe("org_user-001");
  });

  it("always starts with 'org_'", () => {
    expect(personalOrgId("someUser")).toMatch(/^org_/);
  });

  it("appends the UID verbatim after the prefix", () => {
    const uid = "XYZ_789";
    expect(personalOrgId(uid)).toBe(`org_${uid}`);
  });
});

// ── buildCategoryId ───────────────────────────────────────────────────────────

describe("buildCategoryId", () => {
  it("builds the correct ID from typical inputs", () => {
    expect(buildCategoryId("alice", "math", 1)).toBe("cat_alice_math_001");
  });

  it("zero-pads the counter to at least 3 digits", () => {
    expect(buildCategoryId("org", "cat", 1)).toMatch(/_001$/);
  });

  it("does not pad counter when it already has 3 digits", () => {
    expect(buildCategoryId("org", "cat", 100)).toBe("cat_org_cat_100");
  });

  it("does not truncate counters larger than 3 digits", () => {
    expect(buildCategoryId("org", "cat", 1000)).toBe("cat_org_cat_1000");
  });

  it("uses counter = 0 with zero-padding", () => {
    expect(buildCategoryId("org", "cat", 0)).toBe("cat_org_cat_000");
  });

  it("always starts with 'cat_'", () => {
    expect(buildCategoryId("a", "b", 1)).toMatch(/^cat_/);
  });

  it("matches the audit regex for valid slugified inputs", () => {
    const id = buildCategoryId("alice", "math-101", 5);
    expect(id).toMatch(/^cat_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/);
  });

  it("includes both orgSlug and catSlug in the output", () => {
    const id = buildCategoryId("myorg", "mycat", 7);
    expect(id).toContain("myorg");
    expect(id).toContain("mycat");
  });

  it("handles numeric-only slugs", () => {
    expect(buildCategoryId("123", "456", 2)).toBe("cat_123_456_002");
  });
});

// ── buildTaskId ───────────────────────────────────────────────────────────────

describe("buildTaskId", () => {
  it("builds the correct ID from typical inputs", () => {
    expect(buildTaskId("math-101", "homework", 1)).toBe("task_math-101_homework_001");
  });

  it("zero-pads the counter to at least 3 digits", () => {
    expect(buildTaskId("cat", "title", 1)).toMatch(/_001$/);
  });

  it("does not pad counter when it already has 3 digits", () => {
    expect(buildTaskId("cat", "title", 999)).toBe("task_cat_title_999");
  });

  it("does not truncate counters larger than 3 digits", () => {
    expect(buildTaskId("cat", "title", 5000)).toBe("task_cat_title_5000");
  });

  it("uses counter = 0 with zero-padding", () => {
    expect(buildTaskId("cat", "title", 0)).toBe("task_cat_title_000");
  });

  it("always starts with 'task_'", () => {
    expect(buildTaskId("a", "b", 1)).toMatch(/^task_/);
  });

  it("matches the expected task ID format", () => {
    const id = buildTaskId("science-lab", "report", 42);
    expect(id).toMatch(/^task_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*_\d+$/);
  });

  it("includes both categorySlug and titleSlug in the output", () => {
    const id = buildTaskId("history", "essay", 3);
    expect(id).toContain("history");
    expect(id).toContain("essay");
  });

  it("handles numeric-only slugs", () => {
    expect(buildTaskId("123", "456", 9)).toBe("task_123_456_009");
  });
});
