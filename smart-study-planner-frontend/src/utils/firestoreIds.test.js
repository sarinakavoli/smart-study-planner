import { describe, it, expect, vi } from "vitest";
import {
  slugify,
  personalOrgId,
  generateTaskId,
  generateCategoryId,
} from "./firestoreIds.js";

// ── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases all characters", () => {
    expect(slugify("HELLO")).toBe("hello");
    expect(slugify("ABC123")).toBe("abc123");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("my category")).toBe("my-category");
  });

  it("replaces special characters with hyphens and collapses runs", () => {
    expect(slugify("Math & Science!")).toBe("math-science");
    expect(slugify("a--b&&c")).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  My Category  ")).toBe("my-category");
    expect(slugify("!hello!")).toBe("hello");
    expect(slugify("---hello---")).toBe("hello");
  });

  it("truncates to 30 characters", () => {
    const long = "a".repeat(50);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe("a".repeat(30));
  });

  it("handles a string that is exactly 30 characters after slugifying", () => {
    const text = "a".repeat(30);
    expect(slugify(text)).toBe("a".repeat(30));
  });

  it("handles strings with only special characters", () => {
    const result = slugify("!@#$%^&*()");
    expect(result).toBe("");
  });

  it("preserves digits", () => {
    expect(slugify("chapter 1")).toBe("chapter-1");
    expect(slugify("123")).toBe("123");
  });

  it("coerces non-string input via String()", () => {
    expect(slugify(42)).toBe("42");
    expect(slugify(null)).toBe("null");
  });

  it("handles an empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ── personalOrgId ────────────────────────────────────────────────────────────

describe("personalOrgId", () => {
  it("returns org_<shortOwnerId>_<emailLocalSlug>_default using the first 6 chars of uid and email local-part", () => {
    expect(personalOrgId("abc123XYZ", "alice@example.com")).toBe("org_abc123_alice_default");
    expect(personalOrgId("AvU4Op9xKqZ", "bob@example.com")).toBe("org_AvU4Op_bob_default");
  });

  it("falls back to 'workspace' slug when no email is provided", () => {
    expect(personalOrgId("abc123XYZ")).toBe("org_abc123_workspace_default");
    expect(personalOrgId("AvU4Op9xKqZ")).toBe("org_AvU4Op_workspace_default");
  });

  it("always starts with 'org_'", () => {
    expect(personalOrgId("anything", "user@example.com")).toMatch(/^org_/);
  });

  it("uses exactly the first 6 characters of the uid as the short owner ID", () => {
    const uid = "ABCDEF123456";
    expect(personalOrgId(uid, "test@example.com")).toBe("org_ABCDEF_test_default");
  });

  it("slugifies the email local-part", () => {
    expect(personalOrgId("uid123", "my.name+tag@example.com")).toBe("org_uid123_my-name-tag_default");
  });

  it("works when uid is shorter than 6 characters", () => {
    expect(personalOrgId("ab", "user@example.com")).toBe("org_ab_user_default");
  });
});

// ── generateTaskId ───────────────────────────────────────────────────────────

describe("generateTaskId", () => {
  const userId = "abcXYZ123456";

  it("starts with 'task_'", () => {
    const id = generateTaskId(userId, "School", "Unity");
    expect(id).toMatch(/^task_/);
  });

  it("embeds the first 6 characters of userId after the task_ prefix", () => {
    const id = generateTaskId(userId, "School", "Unity");
    const shortUserId = userId.slice(0, 6);
    expect(id.startsWith(`task_${shortUserId}_`)).toBe(true);
  });

  it("slugifies the category into the ID", () => {
    const id = generateTaskId(userId, "Math & Science!", "Assignment");
    expect(id).toContain("math-science");
  });

  it("slugifies the title into the ID", () => {
    const id = generateTaskId(userId, "School", "My Assignment");
    expect(id).toContain("my-assignment");
  });

  it("ends with a 4-character strictly alphanumeric suffix", () => {
    const id = generateTaskId(userId, "School", "Unity");
    expect(id).toMatch(/_[a-z0-9]{4}$/);
  });

  it("matches the full expected format", () => {
    const id = generateTaskId(userId, "School", "Unity Notes");
    expect(id).toMatch(/^task_[A-Za-z0-9]{1,6}_[a-z0-9-]*_[a-z0-9-]*_[a-z0-9]{4}$/);
  });

  it("generates unique IDs across multiple calls", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () =>
        generateTaskId(userId, "School", "Unity")
      )
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("does not require any Firestore reads or writes", () => {
    expect(generateTaskId(userId, "Work", "Meeting")).toMatch(/^task_/);
  });
});

// ── generateCategoryId ───────────────────────────────────────────────────────

describe("generateCategoryId", () => {
  const userId = "AvU4Op9xKqZ";

  it("starts with 'cat_'", () => {
    expect(generateCategoryId(userId, "Math")).toMatch(/^cat_/);
  });

  it("embeds the first 6 characters of userId after the cat_ prefix", () => {
    const id = generateCategoryId(userId, "Science");
    expect(id.startsWith("cat_AvU4Op_")).toBe(true);
  });

  it("slugifies the category name into the ID", () => {
    expect(generateCategoryId(userId, "Math & Science!")).toContain("math-science");
    expect(generateCategoryId(userId, "MY CATEGORY")).toContain("my-category");
    expect(generateCategoryId(userId, "SCHOOL")).toContain("school");
  });

  it("matches the format cat_<shortUserId>_<categorySlug>_<random4>", () => {
    const id = generateCategoryId(userId, "Math");
    expect(id).toMatch(/^cat_[A-Za-z0-9]{1,6}_[a-z0-9-]+_[a-z0-9]{4}$/);
  });

  it("appends a 4-character lowercase alphanumeric suffix", () => {
    const id = generateCategoryId(userId, "History");
    const suffix = id.split("_").at(-1);
    expect(suffix).toHaveLength(4);
    expect(suffix).toMatch(/^[a-z0-9]{4}$/);
  });

  it("generates unique IDs across multiple calls for the same name", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => generateCategoryId(userId, "Math"))
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("handles names with only special characters gracefully", () => {
    const id = generateCategoryId(userId, "!@#$");
    expect(id).toMatch(/^cat_/);
  });
});
