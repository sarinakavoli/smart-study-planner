import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  slugify,
  personalOrgId,
  generateTaskId,
  generateCategoryId,
} from "./firestoreIds.js";

// ── Mock firebase/firestore ───────────────────────────────────────────────────

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  documentId: vi.fn(() => "__name__"),
  getDocs: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  where: vi.fn(),
}));

import { getDocs, runTransaction } from "firebase/firestore";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeFakeSnapshot(ids) {
  const docs = ids.map((id) => ({ id }));
  return { forEach: (fn) => docs.forEach(fn) };
}

/**
 * Returns a runTransaction mock that simulates a counter document.
 * @param {number|null} storedCount  null = no counter doc exists
 */
function makeTransactionMock(storedCount) {
  return async (_db, callback) => {
    const counterSnap =
      storedCount == null
        ? { exists: () => false }
        : { exists: () => true, data: () => ({ count: storedCount }) };
    const transaction = {
      get: vi.fn().mockResolvedValue(counterSnap),
      set: vi.fn(),
    };
    return callback(transaction);
  };
}

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
  const db = {};
  const userId = "user_abc123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task_001 when no matching documents exist and no counter doc", async () => {
    getDocs.mockResolvedValue(makeFakeSnapshot([]));
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "School", "Unity");
    expect(id).toBe("task_school_unity_001");
  });

  it("starts with 'task_'", async () => {
    getDocs.mockResolvedValue(makeFakeSnapshot([]));
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "Work", "Meeting Notes");
    expect(id).toMatch(/^task_/);
  });

  it("slugifies category and title in the ID", async () => {
    getDocs.mockResolvedValue(makeFakeSnapshot([]));
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "Math & Science!", "My Assignment");
    expect(id).toBe("task_math-science_my-assignment_001");
  });

  it("increments above existing task documents when no counter doc exists", async () => {
    getDocs.mockResolvedValue(
      makeFakeSnapshot(["task_school_unity_001", "task_school_unity_002"])
    );
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "School", "Unity");
    expect(id).toBe("task_school_unity_003");
  });

  it("zero-pads the counter to 3 digits", async () => {
    getDocs.mockResolvedValue(makeFakeSnapshot([]));
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "Work", "Review");
    expect(id).toMatch(/_\d{3}$/);
  });

  it("uses the stored counter when it is higher than existing task docs", async () => {
    getDocs.mockResolvedValue(makeFakeSnapshot(["task_school_unity_001"]));
    runTransaction.mockImplementation(makeTransactionMock(5));

    const id = await generateTaskId(db, userId, "School", "Unity");
    expect(id).toBe("task_school_unity_006");
  });

  it("handles the highest existing counter correctly", async () => {
    getDocs.mockResolvedValue(
      makeFakeSnapshot(["task_work_review_005", "task_work_review_003"])
    );
    runTransaction.mockImplementation(makeTransactionMock(null));

    const id = await generateTaskId(db, userId, "Work", "Review");
    expect(id).toBe("task_work_review_006");
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
