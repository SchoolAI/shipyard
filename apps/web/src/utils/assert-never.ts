/**
 * Type guard for exhaustive checking of discriminated unions.
 *
 * Use in the default case of switch statements to ensure all
 * cases are handled. The compiler will error if a new case is
 * added but not handled.
 *
 * @example
 * ```ts
 * type Status = 'draft' | 'approved' | 'rejected';
 *
 * function getColor(status: Status): string {
 *   switch (status) {
 *     case 'draft': return 'gray';
 *     case 'approved': return 'green';
 *     case 'rejected': return 'red';
 *     default: return assertNever(status);
 *   }
 * }
 * ```
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
