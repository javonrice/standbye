/**
 * Minimal ambient types for the Bun test runner.
 *
 * We deliberately do not add `@types/bun` to `compilerOptions.types`: its global
 * `fetch` declaration conflicts with the generated Supabase client files, which
 * are auto-generated and must not be edited. This shim covers only the APIs the
 * test suite actually uses.
 */
declare module "bun:test" {
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toHaveLength(expected: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toContain(expected: unknown): void;
    toThrow(expected?: unknown): void;
    readonly not: Matchers;
    readonly resolves: Matchers;
    readonly rejects: Matchers;
  }

  export function expect(actual: unknown): Matchers;

  export function describe(label: string, fn: () => void | Promise<void>): void;
  export function it(label: string, fn: () => void | Promise<void>, timeoutMs?: number): void;
  export function test(label: string, fn: () => void | Promise<void>, timeoutMs?: number): void;

  export function beforeAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  interface Mock {
    <T extends (...args: never[]) => unknown>(fn?: T): T & { mock: { calls: unknown[][] } };
    module(specifier: string, factory: () => unknown): void;
  }
  export const mock: Mock;

  export function setSystemTime(date?: Date | number): void;
}
