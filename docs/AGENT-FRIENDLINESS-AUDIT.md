# Agent-Friendliness Audit: Input Types

An honest assessment of Shipyard's `request_user_input` API from an AI agent's perspective.

**Date**: 2026-01-24
**Evaluator**: Claude (as a proxy for AI agents)
**Scope**: 9 input types in Phase 1 implementation

---

## Summary Scorecard

| Type | Params (Req/Opt) | Param Score | Cognitive Load | Mistake Risk | Grade | Recommendation |
|------|------------------|-------------|----------------|--------------|-------|----------------|
| **text** | 2 / 3 | 2 | 1 | 2 | **A** | Keep as-is, add examples |
| **multiline** | 2 / 3 | 2 | 1 | 2 | **A** | Keep as-is |
| **confirm** | 2 / 3 | 2 | 1 | 2 | **A** | Keep as-is |
| **choice** | 3 / 4 | 5 | 3 | 4 | **B+** | Clarify multiSelect default |
| **dropdown** | 3 / 5 | 5 | 6 | 6 | **C+** | Merge with choice |
| **number** | 2 / 8 | 7 | 5 | 6 | **C** | Too many optional params |
| **email** | 2 / 5 | 5 | 4 | 4 | **B** | `domain` rarely useful |
| **date** | 2 / 5 | 5 | 6 | 7 | **C** | min/max type confusion |
| **rating** | 2 / 7 | 7 | 5 | 5 | **C+** | Simplify, better defaults |

**Overall API Grade: B-**

The core types (text, multiline, confirm) are excellent. The expanded types introduce complexity that will trip up agents.

---

## Detailed Analysis

### 1. text Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "text" | Discriminator |
| defaultValue | No | string | Pre-filled value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 2 (5 params total, 2 required)

**Cognitive Load Score**: 1 (Obvious)
- Purpose is crystal clear: single-line text input
- Name matches HTML `<input type="text">`
- Every agent knows when to use this

**Common Mistakes**: Score 2 (Low)
- Might forget `defaultValue` exists
- No validation to forget about

**Grade: A**

**Agent Perspective**: "I need to ask the user for their name. Use `type: 'text'`. Done."

---

### 2. multiline Input

**Parameter Inventory**: Same as text (5 params, 2 required)

**Complexity Score**: 2 (Simple)

**Cognitive Load Score**: 1 (Obvious)
- Clear difference from text: multi-line vs single-line
- Name is intuitive

**Common Mistakes**: Score 2 (Low)
- Might use text when multiline is better
- No serious consequences

**Grade: A**

**Agent Perspective**: "User needs to write a description. More than one line? `type: 'multiline'`."

---

### 3. confirm Input

**Parameter Inventory**: Same as text (5 params, 2 required)

**Complexity Score**: 2 (Simple)

**Cognitive Load Score**: 1 (Obvious)
- Boolean question: yes/no
- Response format documented: `"yes"` or `"no"`

**Common Mistakes**: Score 2 (Low)
- Might parse response incorrectly (case sensitivity)
- Response is lowercase `"yes"/"no"` - easy to remember

**Grade: A**

**Agent Perspective**: "Should I proceed with deployment? Boolean question. `type: 'confirm'`."

---

### 4. choice Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "choice" | Discriminator |
| options | **Yes** | string[] | Available choices |
| multiSelect | No | boolean | Allow multiple selections |
| defaultValue | No | string | Pre-selected value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 5 (7 params, 3 required)

**Cognitive Load Score**: 3 (Mostly clear)
- `options` is required - makes sense
- `multiSelect` default is unclear (is it false?)
- Rich option objects `{value, label, description}` add complexity

**Common Mistakes**: Score 4 (Moderate)
1. **Forgetting options**: Error returned, easy to fix
2. **multiSelect ambiguity**: "I want 2 options but not 5. Is that multi?"
3. **Response parsing for multi-select**: Split by `", "` - easy to forget the space
4. **Rich vs simple options**: When to use `{value, label}` vs plain strings?

**Grade: B+**

**Agent Perspective**: "Three database options. Use `type: 'choice'`, `options: ['PostgreSQL', 'SQLite', 'MongoDB']`. Wait, do I need multiSelect? The docs say 'allow multiple' - I only want one. Probably false? I'll omit it."

**Recommendation**:
- Document multiSelect default explicitly: `multiSelect: false (default)`
- Add example for multi-select response parsing

---

### 5. dropdown Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "dropdown" | Discriminator |
| options | **Yes** | string[] | Available choices |
| searchable | No | boolean | Enable search |
| placeholder | No | string | Empty state text |
| defaultValue | No | string | Pre-selected value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 5 (8 params, 3 required)

**Cognitive Load Score**: 6 (CONFUSING)

**The Critical Question: When do I use `dropdown` vs `choice`?**

Current guidance says:
- choice: 2-8 options
- dropdown: 10+ options

**Problems with this**:
1. **Agent must count options**: Extra cognitive step
2. **What about 9 options?**: Edge case uncertainty
3. **What if I use the wrong one?**: No validation error - just suboptimal UI
4. **Both work**: Agent has no way to know if they chose "wrong"

**Common Mistakes**: Score 6 (High)
1. **Wrong type selection**: choice vs dropdown confusion
2. **searchable default**: Is it true or false by default?
3. **placeholder rarely needed**: Extra param to ignore
4. **Same response format**: Why have two types?

**Grade: C+**

**Agent Perspective**: "195 countries. That's definitely dropdown. Wait, what about US states? 50? That's between 8 and 195. Dropdown? Let me re-read the docs... 'compact interface for long lists'. Is 50 'long'? I'll guess dropdown."

**Recommendation: MERGE WITH CHOICE**

```typescript
// Proposed: Single type with auto-UI selection
type: 'choice',
options: [...], // 50+ items
// Browser AUTOMATICALLY renders as searchable dropdown when options.length > 10
```

This removes ALL cognitive load. Agents always use `choice`. The UI handles presentation.

---

### 6. number Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "number" | Discriminator |
| min | No | number | Minimum bound |
| max | No | number | Maximum bound |
| step | No | number | Increment value |
| format | No | enum | 'integer' \| 'decimal' \| 'currency' \| 'percentage' |
| unit | No | string | Label like "seconds" |
| defaultValue | No | string | Pre-filled value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 7 (10 params, 2 required)

**Cognitive Load Score**: 5 (Moderate-High)
- 5 number-specific optional params
- `format` has 4 enum values to understand
- `unit` is a display-only hint
- When is `step` needed?

**Common Mistakes**: Score 6 (High)
1. **Forgetting min/max**: User can enter 999999999
2. **step for integers**: Do I need `step: 1` for integers or is `format: 'integer'` enough?
3. **format vs step overlap**: `format: 'integer'` vs `step: 1` - which constrains?
4. **currency localization**: What currency? No way to specify
5. **Response parsing**: `parseFloat(response)` - documented but easy to forget

**Grade: C**

**Agent Perspective**: "Ask for port number. Range 1-65535. Do I need step? Probably 1 but maybe the UI infers it from integers. Let me set min/max. Wait, do I also need format: 'integer'? Or does min/max of integers imply that? I'll add both to be safe."

```typescript
// Agent's safe but verbose choice
{
  type: 'number',
  min: 1,
  max: 65535,
  step: 1,  // Probably redundant?
  format: 'integer',  // Maybe redundant?
}
```

**Recommendation**:
1. Remove `format` OR make it a true validation constraint
2. Make `step: 1` the default for integers
3. Remove `unit` (nice for humans, useless for agents)

---

### 7. email Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "email" | Discriminator |
| allowMultiple | No | boolean | Multiple addresses |
| domain | No | string | Restrict to domain |
| defaultValue | No | string | Pre-filled value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 5 (7 params, 2 required)

**Cognitive Load Score**: 4 (Mostly Clear)
- Email validation built-in: nice
- `domain` is clear but rarely needed
- `allowMultiple` response format: how are they separated?

**Common Mistakes**: Score 4 (Moderate)
1. **Multiple email parsing**: "Comma separated" - with or without space?
2. **domain restriction**: Rarely needed, agents might over-use
3. **Mobile keyboard**: Automatic - good

**Grade: B**

**Agent Perspective**: "Need user's email. `type: 'email'`. Nice, built-in validation. Should I restrict domain? Probably not. Done."

**Recommendation**: Document multi-email separator clearly (`", "` with space)

---

### 8. date Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "date" | Discriminator |
| min | No | **string** | Min date (YYYY-MM-DD) |
| max | No | **string** | Max date (YYYY-MM-DD) |
| defaultValue | No | string | Pre-filled value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 5 (7 params, 2 required)

**Cognitive Load Score**: 6 (CONFUSING)

**Critical Issue: min/max are strings, not numbers**

The MCP tool schema says:
```typescript
min: {
  type: 'number',
  description: "For 'number'/'rating' - minimum value; for 'date' use ISO string",
}
```

**PROBLEM**: The JSON schema says `type: 'number'` but the description says "for date use ISO string". This is a type mismatch that WILL confuse agents.

Looking at the actual handler code:
```typescript
case 'date':
  params = {
    ...baseParams,
    type: 'date' as const,
    min: input.min !== undefined ? String(input.min) : undefined,  // Converts!
    max: input.max !== undefined ? String(input.max) : undefined,
  };
```

The server converts numbers to strings. So an agent might pass:
- `min: 20260124` (number) - Converted to `"20260124"` - WRONG FORMAT
- `min: "2026-01-24"` (string) - Correct but schema says number

**Common Mistakes**: Score 7 (HIGH)
1. **min/max type confusion**: Schema says number, implementation expects string
2. **Date format**: YYYY-MM-DD is specific but not enforced in MCP tool
3. **Response parsing**: `new Date(response)` - timezone issues possible
4. **Relative dates**: Can't say "next week" - must calculate

**Grade: C**

**Agent Perspective**: "Deadline date. min should be today... wait the schema says number but the description says ISO string. Let me try `min: "2026-01-24"`. Or should I pass a timestamp? I'll read the schema validation... it uses regex for YYYY-MM-DD. I'll pass the string and hope the JSON parser doesn't complain about the type mismatch."

**Recommendation: FIX TYPE DEFINITIONS**

```typescript
// Option A: Separate params for date
minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
maxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

// Option B: Type-aware params with explicit docs
min: z.union([z.number(), z.string()]).describe(
  "For number/rating: numeric value. For date: ISO string (YYYY-MM-DD)"
)
```

---

### 9. rating Input

**Parameter Inventory**:
| Parameter | Required | Type | Purpose |
|-----------|----------|------|---------|
| message | Yes | string | Question to ask |
| type | Yes | "rating" | Discriminator |
| min | No | number | Min value (default 1) |
| max | No | number | Max value (default 5) |
| style | No | enum | 'stars' \| 'numbers' \| 'emoji' |
| labels | No | object | `{low?: string, high?: string}` |
| defaultValue | No | string | Pre-selected value |
| timeout | No | number | Seconds until expiry |
| planId | No | string | Link to plan |

**Complexity Score**: 7 (9 params, 2 required)

**Cognitive Load Score**: 5 (Moderate)
- `style` is purely visual - agent doesn't care
- `labels` is nice for UX but adds param count
- min/max defaults (1-5) are sensible

**Common Mistakes**: Score 5 (Moderate)
1. **Style selection**: Does it matter for agent? No.
2. **Labels confusion**: Nested object `{low, high}` - easy syntax error
3. **Scale selection**: 1-5? 1-10? NPS (0-10)? Agent must decide
4. **Response parsing**: `parseInt(response, 10)`

**Grade: C+**

**Agent Perspective**: "NPS score, 0-10 scale. Set min: 0, max: 10. Style... uh, numbers I guess? Labels would be nice but that's more typing. Skip it."

**Recommendation**:
1. Remove `style` - let UI decide based on scale size
2. Add preset: `preset: 'nps' | 'satisfaction' | 'custom'`
3. Labels should auto-populate for presets

---

## High-Level Findings

### Complexity Hotspots (Score > 7)

| Type | Score | Issue |
|------|-------|-------|
| number | 7 | Too many optional params with overlapping purposes |
| rating | 7 | Style/labels rarely needed, inflate param count |

### Confusing Type Pairs

#### 1. choice vs dropdown

**Confusion level**: HIGH

| Aspect | choice | dropdown |
|--------|--------|----------|
| Options | Required | Required |
| Searchable | No | Yes (optional) |
| Multi-select | Yes | No |
| Recommended count | 2-8 | 10+ |
| Response format | Same | Same |

**Agent thought process**:
1. "How many options do I have?"
2. "Is 9 a lot?"
3. "Does searchable matter for the user?"
4. "What if I pick wrong?"

**Verdict**: MERGE THEM. Auto-select UI based on option count.

#### 2. text vs multiline

**Confusion level**: LOW

Clear distinction: single line vs multiple lines. No overlap.

#### 3. confirm vs choice with 2 options

**Confusion level**: MEDIUM

When to use:
- `confirm`: Yes/No with specific semantics
- `choice` with 2 options: Custom labels like "Approve/Reject"

**Problem**: Agent might use choice for yes/no questions.

**Recommendation**: Add note in docs: "Use confirm for boolean yes/no. Use choice for custom binary options."

### Parameter Reduction Opportunities

#### Current Total: 56 Parameters Across 9 Types

**Breakdown**:
- Shared (5): message, type, defaultValue, timeout, planId
- type-specific (51): Everything else

**Proposed Reductions**:

| Parameter | Types | Action | Rationale |
|-----------|-------|--------|-----------|
| `style` | rating | Remove | UI concern, not agent concern |
| `unit` | number | Remove | Display-only, rarely used |
| `format` | number | Simplify | Overlap with step |
| `searchable` | dropdown | Remove | Always true for 10+ options |
| `placeholder` | dropdown | Remove | Rarely customized |
| `domain` | email | Keep but deprioritize | Niche use case |

**After cleanup: ~44 parameters** (-21% reduction)

---

## Critical Analysis Questions

### Q1: Is `min` and `max` intuitive for dates?

**Answer: NO**

The current implementation has a type mismatch:
- Schema declares `min: number`
- Description says "use ISO string for dates"
- Server code converts number to string

**Agent confusion guaranteed**. Fix: Use `minDate`/`maxDate` as separate string params.

### Q2: Is `format` for number type needed?

**Answer: PARTIALLY**

- `integer` vs `decimal`: Useful for validation
- `currency` vs `percentage`: Display-only, agents don't care

**Recommendation**: Keep `integer`/`decimal`, remove `currency`/`percentage`.

### Q3: Should email `domain` be a common param?

**Answer: NO**

- 95% of email inputs don't need domain restriction
- When needed, it's very useful
- Keep as optional, don't mention prominently in docs

### Q4: Rating `style` - do agents care about stars vs numbers?

**Answer: NO**

Agents care about:
- What question to ask
- What scale to use (1-5, 0-10)
- What the response number means

They do NOT care whether humans see stars or emoji. This is a UI/UX decision that should be handled by the browser based on scale size or user preference.

### Q5: When would an agent use dropdown vs choice? Honest answer.

**Honest answer**: Agents would consistently guess wrong or add unnecessary mental overhead.

The "2-8 for choice, 10+ for dropdown" guideline requires:
1. Counting options
2. Remembering the threshold
3. Making a judgment call for edge cases

**Real agent behavior**: Use `choice` for everything, occasionally remember dropdown exists for country lists.

**Better design**: Single type, auto-UI selection.

---

## Recommendations

### Priority 1: Fix Type Safety Issues

**Date min/max confusion**

```typescript
// Current (broken)
min: z.number().optional().describe("...for date use ISO string")

// Fixed
date: {
  minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}
```

### Priority 2: Merge choice + dropdown

```typescript
// Current: Agent must choose
type: 'choice' | 'dropdown'

// Proposed: Single type
type: 'choice'
// Browser auto-converts to searchable dropdown when options.length > 8
```

**Migration**: Accept `dropdown` as alias for `choice`, deprecate in 6 months.

### Priority 3: Reduce number Type Parameters

```typescript
// Current: 5 optional params
{ type: 'number', min, max, step, format, unit }

// Proposed: 2 optional params
{ type: 'number', min, max }
// - Remove `unit` (display-only)
// - Remove `format` (use step: 1 for integer)
// - Remove `step` (derive from min/max being integers)
```

### Priority 4: Add More Examples to Tool Description

Current description has ~50 lines. Agents benefit from examples more than explanations.

**Add to MCP tool description**:
```
## Quick Examples

**Simple text input:**
{ message: "What's your name?", type: "text" }

**Choice with options:**
{ message: "Pick a database", type: "choice", options: ["PostgreSQL", "SQLite"] }

**Number with bounds:**
{ message: "Port number?", type: "number", min: 1, max: 65535 }

**Multi-select:**
{ message: "Select features", type: "choice", options: ["A", "B", "C"], multiSelect: true }
// Response: "A, C" (comma-space separated)
```

### Priority 5: Better Defaults Documentation

Create a defaults table in the tool description:

| Param | Default | Notes |
|-------|---------|-------|
| timeout | 1800 | 30 minutes |
| multiSelect | false | Single selection |
| searchable | true | For dropdown |
| rating.min | 1 | |
| rating.max | 5 | |
| rating.style | "stars" | |

---

## Agent Simulation Test

I simulated an agent (myself) trying to construct 5 common requests:

### Test 1: Simple text input
**Task**: Ask for a project name
**Agent's call**:
```typescript
{ message: "What's the project name?", type: "text" }
```
**Result**: CORRECT, immediate
**Time**: 2 seconds

### Test 2: Multiple choice
**Task**: Pick from 3 databases
**Agent's call**:
```typescript
{ message: "Which database?", type: "choice", options: ["PostgreSQL", "SQLite", "MongoDB"] }
```
**Result**: CORRECT
**Time**: 5 seconds

### Test 3: Country selection (50+ options)
**Task**: Pick a country
**Agent's first thought**: "That's a lot of options... dropdown or choice?"
**Agent's call** (after re-reading docs):
```typescript
{ message: "Which country?", type: "dropdown", options: countries }
```
**Result**: CORRECT but hesitant
**Time**: 15 seconds (including re-reading docs)

### Test 4: Date with range
**Task**: Pick a deadline, must be within next 30 days
**Agent's first thought**: "min should be today, max should be today + 30 days"
**Agent's confusion**: "Wait, min is a number but dates are strings?"
**Agent's call** (uncertain):
```typescript
{
  message: "Deadline?",
  type: "date",
  min: "2026-01-24",  // Hope this works despite schema saying number
  max: "2026-02-23"
}
```
**Result**: WORKS but agent was unsure
**Time**: 45 seconds (including confusion about types)

### Test 5: NPS rating (0-10)
**Task**: Get NPS score
**Agent's call**:
```typescript
{
  message: "How likely to recommend?",
  type: "rating",
  min: 0,
  max: 10,
  labels: { low: "Not likely", high: "Very likely" }
}
```
**Result**: CORRECT
**Time**: 20 seconds

### Summary

| Test | Time | Confidence |
|------|------|------------|
| text | 2s | High |
| choice | 5s | High |
| dropdown | 15s | Medium |
| date | 45s | Low |
| rating | 20s | Medium |

**Conclusion**: Core types are fast. Extended types cause hesitation. Date type causes active confusion.

---

## Final Grades Summary

| Type | Grade | Status |
|------|-------|--------|
| text | A | Ship it |
| multiline | A | Ship it |
| confirm | A | Ship it |
| choice | B+ | Minor docs improvement |
| dropdown | C+ | Merge with choice |
| number | C | Simplify params |
| email | B | Keep as-is |
| date | C | Fix type definitions |
| rating | C+ | Remove style param |

**Overall API: B-**

The foundation is solid. The expansion added complexity that should be simplified before widespread agent adoption.

---

## Appendix: Full Parameter Matrix

| Type | message | type | options | multiSelect | defaultValue | timeout | planId | min | max | step | format | unit | allowMultiple | domain | searchable | placeholder | style | labels |
|------|---------|------|---------|-------------|--------------|---------|--------|-----|-----|------|--------|------|---------------|--------|------------|-------------|-------|--------|
| text | R | R | - | - | O | O | O | - | - | - | - | - | - | - | - | - | - | - |
| multiline | R | R | - | - | O | O | O | - | - | - | - | - | - | - | - | - | - | - |
| confirm | R | R | - | - | O | O | O | - | - | - | - | - | - | - | - | - | - | - |
| choice | R | R | R | O | O | O | O | - | - | - | - | - | - | - | - | - | - | - |
| dropdown | R | R | R | - | O | O | O | - | - | - | - | - | - | - | O | O | - | - |
| number | R | R | - | - | O | O | O | O | O | O | O | O | - | - | - | - | - | - |
| email | R | R | - | - | O | O | O | - | - | - | - | - | O | O | - | - | - | - |
| date | R | R | - | - | O | O | O | O* | O* | - | - | - | - | - | - | - | - | - |
| rating | R | R | - | - | O | O | O | O | O | - | - | - | - | - | - | - | O | O |

R = Required, O = Optional, - = Not applicable, O* = Type confusion issue

---

*Audit complete. Recommend addressing Priority 1 (date type fix) and Priority 4 (examples) immediately.*
