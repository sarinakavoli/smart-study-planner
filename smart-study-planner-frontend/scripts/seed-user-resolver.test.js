import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── fs mocking ────────────────────────────────────────────────────────────────
// We mock the entire 'fs' module so that loadSeedUsersFile() never touches disk.
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
import {
  loadSeedUsersFile,
  resolveEmailsToUids,
  resolveMixedEntries,
} from "./seed-user-resolver.mjs";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Firebase Auth instance.
 * @param {Record<string, string>} emailToUid  Maps email → uid for successes.
 * @param {string[]} missingEmails             Emails that should throw auth/user-not-found.
 */
function makeAuth(emailToUid = {}, missingEmails = []) {
  return {
    getUserByEmail: vi.fn(async (email) => {
      if (missingEmails.includes(email)) {
        const err = new Error("There is no user record corresponding to the provided identifier.");
        err.code = "auth/user-not-found";
        throw err;
      }
      if (Object.prototype.hasOwnProperty.call(emailToUid, email)) {
        return { uid: emailToUid[email] };
      }
      const err = new Error("Unexpected email: " + email);
      err.code = "auth/user-not-found";
      throw err;
    }),
  };
}

// ── loadSeedUsersFile ─────────────────────────────────────────────────────────

describe("loadSeedUsersFile", () => {
  let exitSpy;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("returns null when the .seed-users file does not exist", () => {
    existsSync.mockReturnValue(false);

    const result = loadSeedUsersFile();

    expect(result).toBeNull();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("returns the trimmed users array from a valid JSON file", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ users: ["alice@example.com", "  bob-uid  "] })
    );

    const result = loadSeedUsersFile();

    expect(result).toEqual(["alice@example.com", "bob-uid"]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("returns a users array that contains both emails and raw UIDs", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ users: ["alice@example.com", "raw-firebase-uid-xyz"] })
    );

    const result = loadSeedUsersFile();

    expect(result).toContain("alice@example.com");
    expect(result).toContain("raw-firebase-uid-xyz");
  });

  it("calls process.exit(1) when the file contains malformed JSON", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("{ not valid json }}}");

    expect(() => loadSeedUsersFile()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when the users array is missing", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ something: "else" }));

    expect(() => loadSeedUsersFile()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when the users array is empty", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ users: [] }));

    expect(() => loadSeedUsersFile()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when a users entry is not a string", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ users: [42, "valid@example.com"] }));

    expect(() => loadSeedUsersFile()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when a users entry is a blank string", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ users: ["   "] }));

    expect(() => loadSeedUsersFile()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ── resolveEmailsToUids ───────────────────────────────────────────────────────

describe("resolveEmailsToUids", () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("resolves a single email to a UID", async () => {
    const auth = makeAuth({ "alice@example.com": "uid-alice" });

    const result = await resolveEmailsToUids(auth, ["alice@example.com"]);

    expect(result).toEqual(["uid-alice"]);
  });

  it("resolves multiple emails in order", async () => {
    const auth = makeAuth({
      "alice@example.com": "uid-alice",
      "bob@example.com": "uid-bob",
    });

    const result = await resolveEmailsToUids(auth, [
      "alice@example.com",
      "bob@example.com",
    ]);

    expect(result).toEqual(["uid-alice", "uid-bob"]);
  });

  it("calls getUserByEmail once per email", async () => {
    const auth = makeAuth({ "alice@example.com": "uid-alice" });

    await resolveEmailsToUids(auth, ["alice@example.com"]);

    expect(auth.getUserByEmail).toHaveBeenCalledTimes(1);
    expect(auth.getUserByEmail).toHaveBeenCalledWith("alice@example.com");
  });

  it("calls process.exit(1) when an email is not found in Firebase Auth", async () => {
    const auth = makeAuth({}, ["missing@example.com"]);

    await expect(
      resolveEmailsToUids(auth, ["missing@example.com"])
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) and reports all missing emails when multiple fail", async () => {
    const auth = makeAuth({}, ["x@example.com", "y@example.com"]);

    await expect(
      resolveEmailsToUids(auth, ["x@example.com", "y@example.com"])
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("re-throws unexpected errors that are not auth/user-not-found", async () => {
    const auth = {
      getUserByEmail: vi.fn().mockRejectedValue(new Error("network timeout")),
    };

    await expect(
      resolveEmailsToUids(auth, ["alice@example.com"])
    ).rejects.toThrow("network timeout");
  });
});

// ── resolveMixedEntries ───────────────────────────────────────────────────────

describe("resolveMixedEntries", () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("passes raw UIDs through unchanged (no @ sign)", async () => {
    const auth = makeAuth();

    const result = await resolveMixedEntries(auth, ["raw-uid-abc"]);

    expect(result).toContain("raw-uid-abc");
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
  });

  it("resolves email entries (contain @) to UIDs", async () => {
    const auth = makeAuth({ "alice@example.com": "uid-alice" });

    const result = await resolveMixedEntries(auth, ["alice@example.com"]);

    expect(result).toContain("uid-alice");
    expect(result).not.toContain("alice@example.com");
  });

  it("handles a mixed list of emails and raw UIDs", async () => {
    const auth = makeAuth({ "alice@example.com": "uid-alice" });

    const result = await resolveMixedEntries(auth, [
      "raw-uid-xyz",
      "alice@example.com",
    ]);

    expect(result).toContain("raw-uid-xyz");
    expect(result).toContain("uid-alice");
    expect(result).not.toContain("alice@example.com");
  });

  it("returns only UIDs when the list contains only raw UIDs", async () => {
    const auth = makeAuth();

    const result = await resolveMixedEntries(auth, ["uid-one", "uid-two"]);

    expect(result).toEqual(["uid-one", "uid-two"]);
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
  });

  it("distinguishes email vs UID purely by the presence of '@'", async () => {
    const auth = makeAuth({ "u@host": "uid-short" });

    const result = await resolveMixedEntries(auth, ["u@host", "noatsign"]);

    expect(result).toContain("uid-short");
    expect(result).toContain("noatsign");
  });

  it("propagates process.exit when an email cannot be resolved", async () => {
    const auth = makeAuth({}, ["missing@example.com"]);

    await expect(
      resolveMixedEntries(auth, ["missing@example.com", "some-uid"])
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
