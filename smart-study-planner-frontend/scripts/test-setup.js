import { beforeEach, afterEach } from "vitest";

// ── Global console silencing ──────────────────────────────────────────────────
// Suppress console.log and console.error for all tests so that expected output
// (trimming notes, resolution lines, error messages) does not pollute CI output.
//
// Direct property assignment is used (rather than vi.spyOn) so that
// vi.resetAllMocks() calls inside per-describe beforeEach hooks do not
// inadvertently restore the originals and let output leak through.
//
// Tests that set up their own vi.spyOn for assertion purposes still work
// correctly: their local spy wraps the no-op and independently records calls,
// so toHaveBeenCalledWith() assertions are unaffected.
let _originalConsoleLog;
let _originalConsoleError;

beforeEach(() => {
  _originalConsoleLog = console.log;
  _originalConsoleError = console.error;
  console.log = () => {};
  console.error = () => {};
});

afterEach(() => {
  console.log = _originalConsoleLog;
  console.error = _originalConsoleError;
});
