/**
 * seed-counts-helper.test.js
 *
 * Unit tests for updateSeedCounts in seed-counts-helper.mjs.
 *
 * All tests use a real temporary directory so there are no fs mocks to
 * maintain — each test gets its own isolated file path and cleans up after
 * itself.  No GCP credentials or network calls are required.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { updateSeedCounts } from "./seed-counts-helper.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a fresh temp directory for one test and returns its path. */
function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "seed-counts-test-"));
}

/** Reads and parses the counts file at `countsPath`. */
function readCounts(countsPath) {
  return JSON.parse(readFileSync(countsPath, "utf8"));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("updateSeedCounts — creating a new file", () => {
  let dir;
  let countsPath;

  beforeEach(() => {
    dir = makeTempDir();
    countsPath = join(dir, ".seed-counts.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the file when it does not yet exist", () => {
    expect(existsSync(countsPath)).toBe(false);

    updateSeedCounts(countsPath, "categories", 42);

    expect(existsSync(countsPath)).toBe(true);
  });

  it("writes the correct collection key and count", () => {
    updateSeedCounts(countsPath, "categories", 42);

    const data = readCounts(countsPath);
    expect(data.categories).toBeDefined();
    expect(data.categories.count).toBe(42);
  });

  it("writes a valid ISO timestamp in updatedAt", () => {
    updateSeedCounts(countsPath, "categories", 10);

    const { updatedAt } = readCounts(countsPath).categories;
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
  });

  it("writes valid, parseable JSON", () => {
    updateSeedCounts(countsPath, "tasks", 99);

    const raw = readFileSync(countsPath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe("updateSeedCounts — merging with an existing file", () => {
  let dir;
  let countsPath;

  beforeEach(() => {
    dir = makeTempDir();
    countsPath = join(dir, ".seed-counts.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves an existing collection's entry when updating a different one", () => {
    updateSeedCounts(countsPath, "categories", 100);
    updateSeedCounts(countsPath, "tasks", 200);

    const data = readCounts(countsPath);
    expect(data.categories.count).toBe(100);
    expect(data.tasks.count).toBe(200);
  });

  it("overwrites the count for the same collection on a second call", () => {
    updateSeedCounts(countsPath, "categories", 50);
    updateSeedCounts(countsPath, "categories", 75);

    const data = readCounts(countsPath);
    expect(data.categories.count).toBe(75);
  });

  it("updates updatedAt on each call", async () => {
    updateSeedCounts(countsPath, "categories", 1);
    const firstTimestamp = readCounts(countsPath).categories.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));

    updateSeedCounts(countsPath, "categories", 2);
    const secondTimestamp = readCounts(countsPath).categories.updatedAt;

    expect(new Date(secondTimestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(firstTimestamp).getTime()
    );
  });

  it("can accumulate three different collections without losing any", () => {
    updateSeedCounts(countsPath, "categories", 10);
    updateSeedCounts(countsPath, "tasks", 20);
    updateSeedCounts(countsPath, "organizations", 5);

    const data = readCounts(countsPath);
    expect(data.categories.count).toBe(10);
    expect(data.tasks.count).toBe(20);
    expect(data.organizations.count).toBe(5);
  });
});

describe("updateSeedCounts — corrupted or unreadable file", () => {
  let dir;
  let countsPath;

  beforeEach(() => {
    dir = makeTempDir();
    countsPath = join(dir, ".seed-counts.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts fresh (does not crash) when the file contains invalid JSON", () => {
    writeFileSync(countsPath, "this is not json {{{{");

    expect(() => updateSeedCounts(countsPath, "categories", 5)).not.toThrow();
  });

  it("writes the new entry correctly after recovering from a corrupted file", () => {
    writeFileSync(countsPath, "CORRUPTED");

    updateSeedCounts(countsPath, "tasks", 77);

    const data = readCounts(countsPath);
    expect(data.tasks.count).toBe(77);
  });

  it("starts fresh when the file is empty", () => {
    writeFileSync(countsPath, "");

    expect(() => updateSeedCounts(countsPath, "categories", 3)).not.toThrow();

    const data = readCounts(countsPath);
    expect(data.categories.count).toBe(3);
  });
});
