/**
 * Bun `mock.module` is process-wide and is NOT undone by `mock.restore()`.
 * Capture the real module, apply the mock for this file, restore afterAll.
 */
import { afterAll, mock } from "bun:test";

/**
 * Mock a module for the duration of the current test file, then restore the
 * original exports so later files in the same `bun test` process are unaffected.
 */
export async function mockModuleIsolated(
  specifier: string,
  factory: () => Record<string, unknown>,
): Promise<void> {
  const original = await import(specifier);
  mock.module(specifier, factory);
  afterAll(() => {
    mock.module(specifier, () => original);
  });
}
