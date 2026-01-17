/**
 * Exhaustive type checking helper.
 * Ensures all cases of a discriminated union are handled.
 *
 * Usage:
 * ```typescript
 * switch (value.type) {
 *   case 'a': return handleA();
 *   case 'b': return handleB();
 *   default: return assertNever(value);
 * }
 * ```
 *
 * When a new union member is added, TypeScript will fail at compile time
 * if not all cases are handled in the switch statement.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
