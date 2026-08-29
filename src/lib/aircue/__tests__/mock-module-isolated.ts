/**
 * Bun `mock.module` is process-wide and is NOT undone by `mock.restore()`.
 * Capture the real module, apply the mock for this file, restore afterAll.
 */
import { afterAll, mock } from "bun:test";

function exportBag(mod: Record<string, unknown>): Record<string, unknown> {
  // Prefer a plain object of named exports — returning the Module namespace
  // from a mock factory leaves later files with broken bindings in Bun.
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(mod)) {
    out[key] = mod[key];
  }
  return out;
}

/**
 * Mock a module for the duration of the current test file, then restore the
 * original exports so later files in the same `bun test` process are unaffected.
 */
export async function mockModuleIsolated(
  specifier: string,
  factory: () => Record<string, unknown>,
): Promise<void> {
  const original = exportBag((await import(specifier)) as Record<string, unknown>);
  mock.module(specifier, factory);
  afterAll(() => {
    mock.module(specifier, () => exportBag(original));
  });
}
