import { describe, it, expect } from "vitest";
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
  it("returns org_<uid>", () => {
    expect(personalOrgId("abc123")).toBe("org_abc123");
    expect(personalOrgId("user_test_001")).toBe("org_user_test_001");
  });

  it("always starts with 'org_'", () => {
    expect(personalOrgId("anything")).toMatch(/^org_/);
  });

  it("includes the uid verbatim after the prefix", () => {
    const uid = "XYZ-uid-789";
    expect(personalOrgId(uid)).toBe(`org_${uid}`);
  });
});

// ── generateTaskId ───────────────────────────────────────────────────────────

describe("generateTaskId", () => {
  const orgId = "org_user123";
  const userId = "user123";

  it("starts with 'task_'", () => {
    expect(generateTaskId(orgId, userId)).toMatch(/^task_/);
  });

  it("embeds orgId in the ID", () => {
    const id = generateTaskId(orgId, userId);
    expect(id).toContain(orgId);
  });

  it("embeds userId in the ID", () => {
    const id = generateTaskId(orgId, userId);
    expect(id).toContain(userId);
  });

  it("matches the expected format task_<orgId>_<userId>_<nanoid>", () => {
    const id = generateTaskId(orgId, userId);
    const regex = new RegExp(`^task_${orgId}_${userId}_[A-Za-z0-9_-]{10}$`);
    expect(id).toMatch(regex);
  });

  it("appends a 10-character nanoid suffix", () => {
    const id = generateTaskId(orgId, userId);
    // nanoid uses the URL-safe alphabet [A-Za-z0-9_-], which includes "_".
    // Splitting on "_" would truncate the suffix if it contains underscores.
    // Instead, strip the known prefix and measure what remains.
    const prefix = `task_${orgId}_${userId}_`;
    const suffix = id.slice(prefix.length);
    expect(suffix).toHaveLength(10);
  });

  it("generates unique IDs across multiple calls", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => generateTaskId(orgId, userId))
    );
    expect(ids.size).toBe(1000);
  });
});

// ── generateCategoryId ───────────────────────────────────────────────────────

describe("generateCategoryId", () => {
  const orgId = "org_user123";

  it("starts with 'cat_'", () => {
    expect(generateCategoryId(orgId, "Math")).toMatch(/^cat_/);
  });

  it("embeds orgId in the ID", () => {
    const id = generateCategoryId(orgId, "Science");
    expect(id).toContain(orgId);
  });

  it("slugifies the category name into the ID", () => {
    expect(generateCategoryId(orgId, "Math & Science!")).toContain("math-science");
    expect(generateCategoryId(orgId, "MY CATEGORY")).toContain("my-category");
    expect(generateCategoryId(orgId, "SCHOOL")).toContain("school");
  });

  it("matches the expected format cat_<orgId>_<slug>_<nanoid>", () => {
    const id = generateCategoryId(orgId, "Math");
    const regex = new RegExp(`^cat_${orgId}_math_[A-Za-z0-9_-]{10}$`);
    expect(id).toMatch(regex);
  });

  it("appends a 10-character nanoid suffix", () => {
    const id = generateCategoryId(orgId, "History");
    // nanoid uses the URL-safe alphabet [A-Za-z0-9_-], which includes "_".
    // Splitting on "_" would truncate the suffix if it contains underscores.
    // Instead, strip the known prefix and measure what remains.
    const prefix = `cat_${orgId}_history_`;
    const suffix = id.slice(prefix.length);
    expect(suffix).toHaveLength(10);
  });

  it("generates unique IDs across multiple calls for the same name", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => generateCategoryId(orgId, "Math"))
    );
    expect(ids.size).toBe(1000);
  });

  it("handles names with only special characters gracefully", () => {
    const id = generateCategoryId(orgId, "!@#$");
    expect(id).toMatch(/^cat_/);
    expect(id).toContain(orgId);
  });
});
