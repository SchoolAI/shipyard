# GritQL Custom Lint Rules for AI Coding Safety

**Goal:** Maximum verifiability for AI-generated code.

**Status:** 3 production-ready rules enforcing type safety.

## Philosophy

These rules enforce patterns that:
1. **Prevent runtime errors** - Catch bugs at compile time
2. **Force intention** - Ban shortcuts that AI agents take
3. **Maximize verifiability** - Make code review easier for humans

---

## Active Rules

### 01. No Type Cast (Except `as const`)
**File:** `01-no-type-cast-except-const.grit`
**Severity:** Error
**Rationale:** Type casts bypass TypeScript's type safety. AI should fix types, not cast them.

**Banned:**
```typescript
const user = data as User;              // ❌
const id = getValue() as number;        // ❌
const foo = obj as unknown as string;   // ❌ (double cast)
```

**Allowed:**
```typescript
const colors = ['red', 'blue'] as const;  // ✅ Safe for readonly assertions
```

**Fix:** Use type guards, Zod validation, or fix the source types.

---

### 02. No `as unknown` Cast
**File:** `04-no-unsafe-unknown-cast.grit`
**Severity:** Error
**Rationale:** `as unknown` is a type safety escape hatch. Use runtime validation instead.

**Banned:**
```typescript
const user = data as unknown;  // ❌
```

**Fix:** Use Zod schema validation:
```typescript
const UserSchema = z.object({ name: z.string() });
const user = UserSchema.parse(data);  // ✅
```

---

### 03. No `biome-ignore` Suppressions
**File:** `02-no-biome-ignore.grit`
**Severity:** Error
**Rationale:** AI should fix the underlying issue, not suppress warnings.

**Banned:**
```typescript
// biome-ignore lint/suspicious/noExplicitAny: reason
const foo: any = ...;  // ❌
```

**Fix:** Fix the underlying issue, or disable the rule in `biome.json` with a comment explaining why.

---

## Configuration

Already enabled in root `biome.json`:
```json
{
  "plugins": [
    ".grit/rules/01-no-type-cast-except-const.grit",
    ".grit/rules/02-no-biome-ignore.grit",
    ".grit/rules/04-no-unsafe-unknown-cast.grit"
  ]
}
```

---

## Testing

Test on a single file:
```bash
pnpm biome lint apps/web/src/App.tsx
```

Test on a package:
```bash
pnpm biome lint apps/signaling/src/
```

---

## Impact

These 3 rules catch **the #1 category of AI coding mistakes**: unsafe type assertions.

Combined with your existing TypeScript config (`noUncheckedIndexedAccess`, `strict: true`, etc.), you have **industry-leading AI coding safety**.

---

## Why Only 3 Rules?

**Attempted but impossible with GritQL:**
- ❌ Comment-based rules (comments not in AST)
- ❌ TODO ticket enforcement (comments not in AST)

**Want comment rules?** See [`.eslint-hybrid-setup.md`](../.eslint-hybrid-setup.md) for using ESLint alongside Biome.

**Attempted but not needed:**
- ⚠️ Default exports rule (debatable, conventional for React)

**What about console.log?**
Already enforced by Biome's built-in `noConsole` rule (enabled in `biome.json`).

---

## Future Rules (Ideas)

- **No unchecked array access** - Require `.at()` or bounds check (if possible in GritQL)
- **Exhaustive switch with assertNever** - Verify pattern in default case
- **Require Zod for external data** - All API responses must be validated
- **No mutation of params** - Functions shouldn't mutate arguments

---

## See Also

- [Biome Plugin Documentation](https://biomejs.dev/linter/plugins/)
- [GritQL Tutorial](https://docs.grit.io/tutorials/gritql)
- Project's `tsconfig.base.json` - Excellent TypeScript strict flags
- Project's `biome.json` - Main linter configuration

---

**Last Updated:** 2026-01-18
**Biome Version:** 2.3.11
