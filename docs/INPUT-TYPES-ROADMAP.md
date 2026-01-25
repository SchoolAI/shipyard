# Shipyard Input Types: Roadmap & Expansion Plan

**Date**: 2026-01-24
**Status**: Research Complete, Prioritization Ready
**Context**: Issue #115 expansion - comprehensive input system audit

---

## Current State: We Have 4 Types

1. **text** - Single-line text input
2. **multiline** - Multi-line text area
3. **choice** - Radio buttons (single) or checkboxes (multi-select)
4. **confirm** - Yes/No buttons

**Just implemented**: "Other" escape hatch for choice questions ✅

---

## The Gap: Industry Offers 12-33 Types

| Tool | Input Types | Our Gap |
|------|-------------|---------|
| **Google Forms** | 12 types | Missing 8 |
| **Typeform** | 24 types | Missing 20 |
| **Notion** | 20+ types | Missing 16+ |
| **Airtable** | 33 types | Missing 29 |
| **Shipyard** | **4 types** | - |

---

## Expansion Roadmap

### Phase 1: Foundation Expansion (Next)

**Goal**: Get to 9 types - covers 80% of real-world agent needs

**Add 5 types** (all have HeroUI components ready):

1. **number**
   - Component: HeroUI `NumberField`
   - Features: min/max validation, increment/decrement buttons
   - Use cases: "How many retries?", "What port number?"
   - Schema: `{ type: 'number', min?: number, max?: number, step?: number }`

2. **date**
   - Component: HeroUI `DateField`
   - Features: Native date picker, locale support
   - Use cases: "When should this deploy?", "Deadline?"
   - Schema: `{ type: 'date', min?: string, max?: string }`

3. **email**
   - Component: HeroUI `Input` with `type="email"`
   - Features: Format validation, mobile keyboard (@)
   - Use cases: "Contact email?", "Send report to?"
   - Schema: `{ type: 'email' }`

4. **dropdown**
   - Component: HeroUI `Select`
   - Features: Search, keyboard navigation, for 10+ options
   - Use cases: Country selection, year selection, long lists
   - Schema: `{ type: 'dropdown', options: string[] }`

5. **rating**
   - Component: Custom star/number rating
   - Features: 1-5 or 1-10 scale, visual feedback
   - Use cases: "Rate this approach", NPS scores
   - Schema: `{ type: 'rating', min: 1, max: 5, labels?: { low: string, high: string } }`

**Effort**: 2-3 days
**Impact**: HIGH - covers most common agent input needs

---

### Phase 2: Power User Features

**Goal**: Add richness and power to existing types

**Enhancements**:

1. **Validation for text/email**
   - Add `pattern` (regex) to schema
   - Add `minLength` / `maxLength` with visual counter
   - Add format hints (`description` field)

2. **Rich choice options**
   - Change from `options: string[]` to `options: Array<{ value, label, description?, icon? }>`
   - Add search/filter for long lists (10+ options)
   - Add "Select All" / "Deselect All" for multi-select

3. **Enhanced confirm**
   - Add `variant: 'info' | 'warning' | 'danger'`
   - Custom button labels (`yesLabel`, `noLabel`)
   - Optional reason field when declining
   - Extra friction for dangerous actions (type confirmation text)

4. **Number enhancements**
   - Format: currency, percentage, decimal places
   - Unit display ("GB", "$", "ms")

5. **Accessibility fixes**
   - aria-describedby for all inputs
   - aria-invalid + aria-live for errors
   - Extend timeout mechanism
   - Better focus management

**Effort**: 3-4 days
**Impact**: MEDIUM - improves UX quality significantly

---

### Phase 3: Advanced Input Types

**Goal**: Support complex use cases

**Add 5 types**:

1. **time**
   - Component: HeroUI `TimeField`
   - Use cases: "What time should the cron run?"
   - Schema: `{ type: 'time', format: '12h' | '24h' }`

2. **url**
   - Component: HeroUI `Input` with validation
   - Use cases: "What's the API endpoint?", "Documentation link?"
   - Schema: `{ type: 'url', allowedProtocols?: string[] }`

3. **slider**
   - Component: HeroUI `Slider`
   - Use cases: "How verbose should logs be? (1-10)"
   - Schema: `{ type: 'slider', min: number, max: number, step?: number }`

4. **file**
   - Component: File input with drag-drop
   - Use cases: "Upload your config file", "Share screenshot"
   - Schema: `{ type: 'file', accept?: string, maxSize?: number }`

5. **ranking**
   - Component: Drag-drop ordered list
   - Use cases: "Prioritize these features", "Order by preference"
   - Schema: `{ type: 'ranking', items: string[] }`

**Effort**: 4-5 days
**Impact**: MEDIUM - enables advanced use cases

---

### Phase 4: SOTA Features (Future)

**Goal**: Cutting-edge multi-modal and context-aware patterns

**Patterns from 2025-2026 research**:

1. **Multi-Modal Input**
   - Voice input with real-time transcription
   - Screenshot analysis (Anthropic Computer Use pattern)
   - Code snippet selection from workspace
   - Visual pickers (color, layout)

2. **Context-Aware Defaults**
   - Pre-populate from codebase analysis (Cursor pattern)
   - Framework/library auto-detection (Replit pattern)
   - Historical preference learning

3. **Progressive Disclosure**
   - Conditional fields based on previous answers (Typeform Logic Jumps)
   - Layer-based information gathering (Deep Research pattern)
   - AI clarifying questions (Bayesian Experimental Design)

4. **Collaborative Features**
   - Voting/polling for team decisions (Miro pattern)
   - Multiple stakeholder approval
   - Consensus mechanisms

5. **Real-Time Intelligence**
   - Validation as user types (Stripe pattern)
   - Live suggestions/autocomplete
   - Duplicate detection (Linear pattern)

6. **Enhanced Escape Hatches**
   - "Ask me later" (defer without declining)
   - "Show me examples first" (request clarification)
   - "I'll describe it differently" (rephrase question)
   - "Takeover mode" (OpenAI Operator pattern for sensitive inputs)

**Effort**: 8-12 weeks
**Impact**: HIGH - differentiation from competitors

---

## Detailed Specification: Phase 1 Types

### 1. Number Input

**Schema**:
```typescript
interface NumberInputRequest extends InputRequestBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  format?: 'integer' | 'decimal' | 'currency' | 'percentage';
  unit?: string;  // "GB", "$", "ms"
  defaultValue?: number;
}
```

**UI Implementation**:
```tsx
import { NumberField } from '@heroui/react';

<NumberField
  value={value}
  onChange={setValue}
  minValue={request.min}
  maxValue={request.max}
  step={request.step || 1}
  formatOptions={getFormatOptions(request.format)}
>
  <Label>{request.message}</Label>
  <NumberField.Group>
    <NumberField.Input />
    <NumberField.Stepper>
      <NumberField.StepperButton slot="increment" />
      <NumberField.StepperButton slot="decrement" />
    </NumberField.Stepper>
  </NumberField.Group>
  {request.unit && <Description>{request.unit}</Description>}
</NumberField>
```

**Validation**:
- Client-side: Disable submit if value < min or > max
- Server-side: Zod schema validates bounds
- Error message: "Must be between {min} and {max}"

---

### 2. Date Input

**Schema**:
```typescript
interface DateInputRequest extends InputRequestBase {
  type: 'date';
  min?: string;  // ISO date string
  max?: string;
  defaultValue?: string;
}
```

**UI Implementation**:
```tsx
import { DateField } from '@heroui/react';

<DateField
  value={parseDate(value)}
  onChange={(date) => setValue(date.toString())}
  minValue={request.min ? parseDate(request.min) : undefined}
  maxValue={request.max ? parseDate(request.max) : undefined}
>
  <Label>{request.message}</Label>
  <DateField.Input />
</DateField>
```

**Validation**:
- ISO 8601 format (YYYY-MM-DD)
- Range validation
- Invalid date detection

---

### 3. Email Input

**Schema**:
```typescript
interface EmailInputRequest extends InputRequestBase {
  type: 'email';
  allowMultiple?: boolean;  // Comma-separated emails
  domain?: string;  // Restrict to specific domain
  defaultValue?: string;
}
```

**UI Implementation**:
```tsx
import { TextField, Input } from '@heroui/react';

<TextField isRequired isInvalid={!isValidEmail(value)}>
  <Label>{request.message}</Label>
  <Input
    type="email"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="you@example.com"
    inputMode="email"
    autoComplete="email"
  />
  {!isValidEmail(value) && (
    <Description>Please enter a valid email address</Description>
  )}
</TextField>
```

**Validation**:
- RFC 5322 regex pattern
- Domain restriction if specified
- Multiple email parsing if `allowMultiple`

---

### 4. Dropdown Input

**Schema**:
```typescript
interface DropdownInputRequest extends InputRequestBase {
  type: 'dropdown';
  options: string[];
  searchable?: boolean;
  defaultValue?: string;
}
```

**UI Implementation**:
```tsx
import { Select } from '@heroui/react';

<Select
  selectedKey={value}
  onSelectionChange={setValue}
  isDisabled={isSubmitting}
>
  <Label>{request.message}</Label>
  <Select.Trigger>
    <Select.Value />
  </Select.Trigger>
  <Select.Popover>
    <Select.ListBox>
      {request.options.map(opt => (
        <Select.Item key={opt} id={opt}>
          {opt}
        </Select.Item>
      ))}
    </Select.ListBox>
  </Select.Popover>
</Select>
```

**When to use vs choice**:
- **Choice (radio/checkbox)**: 2-8 options, need to see all at once
- **Dropdown**: 10+ options, prefer compact interface

---

### 5. Rating Input

**Schema**:
```typescript
interface RatingInputRequest extends InputRequestBase {
  type: 'rating';
  min: number;       // Default: 1
  max: number;       // Default: 5
  style?: 'stars' | 'numbers' | 'emoji';
  labels?: {
    low?: string;    // "Poor"
    high?: string;   // "Excellent"
  };
  defaultValue?: number;
}
```

**UI Implementation**:
```tsx
// Custom component - no HeroUI rating yet
<div className="space-y-2">
  <Label>{request.message}</Label>
  <div className="flex items-center gap-1">
    {Array.from({ length: request.max }, (_, i) => i + 1).map(rating => (
      <button
        key={rating}
        onClick={() => setValue(rating)}
        className={cn(
          "p-2 rounded hover:bg-accent transition-colors",
          value >= rating ? "text-warning" : "text-muted"
        )}
      >
        {request.style === 'stars' ? '★' : rating}
      </button>
    ))}
  </div>
  {request.labels && (
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{request.labels.low}</span>
      <span>{request.labels.high}</span>
    </div>
  )}
</div>
```

---

## Migration Strategy

### Backward Compatibility

All new types are additive - existing requests continue working:
- Schema uses discriminated union on `type` field
- Browser checks type and renders appropriate component
- Fallback to generic TextField if unknown type

### Schema Evolution

```typescript
// packages/schema/src/input-request.ts

// Add new schemas
const NumberInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  format: z.enum(['integer', 'decimal', 'currency', 'percentage']).optional(),
});

const DateInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('date'),
  min: z.string().optional(),
  max: z.string().optional(),
});

// ... email, dropdown, rating

// Update discriminated union
export const InputRequestSchema = z.discriminatedUnion('type', [
  TextInputSchema,
  MultilineInputSchema,
  ChoiceInputSchema,
  ConfirmInputSchema,
  NumberInputSchema,      // NEW
  DateInputSchema,        // NEW
  EmailInputSchema,       // NEW
  DropdownInputSchema,    // NEW
  RatingInputSchema,      // NEW
]);
```

### UI Component Pattern

```tsx
// apps/web/src/components/InputRequestModal.tsx

const renderInput = () => {
  if (!request) return null;

  switch (request.type) {
    case 'text': return <TextInput />;
    case 'multiline': return <MultilineInput />;
    case 'choice': return <ChoiceInput />;
    case 'confirm': return <ConfirmInput />;
    case 'number': return <NumberInput />;      // NEW
    case 'date': return <DateInput />;          // NEW
    case 'email': return <EmailInput />;        // NEW
    case 'dropdown': return <DropdownInput />; // NEW
    case 'rating': return <RatingInput />;      // NEW
    default: {
      const _exhaustive: never = request;
      return <UnsupportedTypeError type={request} />;
    }
  }
};
```

---

## Priority Matrix

### Immediate (Phase 1) - 2-3 Days Each

| Type | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| number | Low | High | HeroUI component ready, common need |
| email | Low | High | Validation + mobile keyboard critical |
| dropdown | Low | Medium | Better UX for long lists |
| date | Medium | High | Common agent question, native picker |
| rating | Medium | Medium | NPS/satisfaction scoring |

### Short-Term (Phase 2) - Enhancements

| Enhancement | Effort | Impact | Rationale |
|------------|--------|--------|-----------|
| Text validation | Low | High | Regex patterns, character limits |
| Rich choice options | Medium | High | Descriptions, icons, grouping |
| Confirm variants | Low | Medium | Danger styling, custom labels |
| Number formatting | Low | Medium | Currency, percentage display |

### Medium-Term (Phase 3) - Advanced

| Type | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| time | Low | Low | Less common than date |
| url | Low | Low | Similar to email |
| slider | Medium | Low | Specialized use case |
| file | High | Medium | Complex (upload, storage) |
| ranking | High | Low | Rare use case |
| matrix | High | Low | Complex implementation |

### Long-Term (Phase 4) - SOTA

| Feature | Effort | Impact | Rationale |
|---------|--------|--------|-----------|
| Voice input | High | High | Accessibility + convenience |
| Screenshot analysis | Very High | Medium | Computer Use pattern |
| Progressive disclosure | High | Medium | Adaptive forms |
| Collaborative voting | Medium | Low | Team decision-making |
| Context-aware defaults | High | High | Reduces user effort |

---

## Detailed Findings: What We're Doing WRONG

### Text Input Problems

**Current code** (InputRequestModal.tsx:224-236):
- ❌ No validation patterns
- ❌ No character limits
- ❌ No format hints
- ❌ Placeholder misused (should be example, not default value)
- ❌ No autocomplete attribute
- ❌ No input type variants (email, url, tel)

**What Typeform does**: Auto-detects email/phone/URL and validates with friendly messages

### Multiline Problems

**Current code** (InputRequestModal.tsx:238-253):
- ❌ Fixed 4 rows (not resizable)
- ❌ Character count shown but not enforced
- ❌ No min length requirement
- ❌ No rich text support
- ❌ No markdown preview

**What Google Forms does**: Auto-resizing textarea, min/max character validation

### Choice Problems

**Current code** (InputRequestModal.tsx:255-320):
- ❌ Options are plain strings (no descriptions, icons)
- ❌ No grouping for many options
- ❌ No search/filter
- ❌ No "Select All" / "Deselect All"
- ❌ No disabled options
- ❌ No recommended option highlighting
- ✅ NOW HAS "Other" escape hatch (just implemented)

**What Linear does**: Dropdown with search, icons, recently used options at top

### Confirm Problems

**Current code** (InputRequestModal.tsx:323-348):
- ❌ Binary only (no "Not Sure" / "Ask Later")
- ❌ Generic "Yes/No" labels
- ❌ No severity indication
- ❌ No extra friction for dangerous actions
- ❌ No reason field

**What GitHub does**: Type repository name to delete (extra friction)

---

## Mobile UX Gaps

### Touch Target Failures
- 44px minimum not enforced (Apple HIG requirement)
- No thumb zone optimization

### Missing Mobile Features
- No `inputMode` for numeric keypad
- No `autocapitalize` control
- No `autocorrect` disable for names/codes
- No native date/time pickers
- No haptic feedback
- No swipe gestures
- No voice input

**Research**: Baymard Institute found 54% of mobile sites fail to use optimized keyboards, reducing accuracy significantly.

---

## Accessibility Violations

### WCAG 2.1 AA Gaps

1. ❌ No `aria-describedby` - errors not associated with inputs
2. ❌ No `aria-invalid` - invalid state not announced
3. ❌ No `aria-live` - error messages don't auto-announce
4. ❌ Color-only warnings - timeout warning uses only color change
5. ❌ Keyboard dismissal disabled - `isKeyboardDismissDisabled={true}`
6. ❌ No timeout extension - WCAG 2.2.1 violation
7. ❌ Focus management incomplete - no error focus

**Fix priority**: HIGH - accessibility is not optional

---

## SOTA Patterns Summary

### From Cutting-Edge Research

**Multi-Modal (ChatGPT, Anthropic)**:
- Voice + text in single thread
- Screenshot analysis during agent execution
- Real-time video/screen share

**Context-Aware (Cursor, Devin, Windsurf)**:
- Pre-populate from codebase analysis
- Framework auto-detection
- Persistent memory across sessions

**Progressive (Gemini Deep Research, Perplexity)**:
- Iterative refinement with follow-up questions
- Layer-based disclosure (index → details → deep dive)
- AI clarifying questions using Bayesian principles

**Collaborative (GitHub, Linear, Miro)**:
- Voting/polling for team decisions
- Multi-stakeholder approval flows
- Consensus mechanisms

**Intelligent (Stripe, Linear, Notion)**:
- Real-time validation as user types
- Inline suggestions
- Duplicate detection

---

## Implementation Priority

### Week 1: Fix What We Have (Phase 2 Enhancements)
- Add validation to text (pattern, minLength, maxLength)
- Add descriptions to choice options
- Fix confirm button labels + danger styling
- Fix accessibility (aria attributes)

### Week 2-3: Add Foundation Types (Phase 1)
- Implement number, date, email, dropdown, rating
- 2-3 days per type
- Test on mobile devices
- Update documentation

### Week 4: Polish & Testing
- Mobile optimization
- Accessibility audit
- Cross-browser testing
- Performance testing with many concurrent requests

### Future: Advanced & SOTA (Phase 3-4)
- File upload
- Ranking/ordering
- Multi-modal input
- Progressive disclosure

---

## Success Metrics

**Coverage**: What % of real-world agent questions can we support?
- Current (4 types): ~40%
- After Phase 1 (9 types): ~80%
- After Phase 2 (enhanced): ~85%
- After Phase 3 (advanced): ~90%

**Completion Rate**: Do users finish forms?
- Target: >90% completion rate
- Track: abandonment per input type

**Satisfaction**: Do users feel constrained?
- Track: "Other" option usage frequency
- Track: decline rate per input type
- Survey: "Did the input options meet your needs?"

---

## Technical Debt Warnings

### Current Schema Limitations

1. **Flat structure** - No nested objects, no complex types
2. **String-based options** - Should be objects with metadata
3. **No versioning** - Adding types requires careful backward compat
4. **No field dependencies** - Cannot express "if A then show B"

### Migration Path

**Non-breaking additions**:
- Add new types to discriminated union
- Old types work forever
- Browser gracefully handles unknown types (show error)

**Breaking changes** (if needed later):
- Options → objects: Requires migration script
- Schema versioning: Add `schemaVersion` field
- Deprecation: Support old types for 6 months, then remove

---

## Comparison: Shipyard vs Industry Leaders

### Google Forms

**Input types** (12 total):
- Short answer (our `text`)
- Paragraph (our `multiline`)
- Multiple choice (our `choice` single-select)
- Checkboxes (our `choice` multi-select)
- Dropdown (MISSING)
- File upload (MISSING)
- Linear scale (MISSING)
- Multiple choice grid (MISSING)
- Checkbox grid (MISSING)
- Date (MISSING)
- Time (MISSING)

**Advanced features**:
- Question branching (conditional logic)
- Response validation (regex, number range)
- Required vs optional marking
- "Other" option with text field ✅ (we just added)

### Typeform

**Input types** (24 total):
- All of Google Forms +
- Rating (MISSING)
- Opinion Scale (MISSING)
- Ranking (MISSING)
- Matrix (MISSING)
- Picture choice (MISSING)
- Legal/Terms (MISSING)
- Phone number (MISSING)
- Website (MISSING)
- Payment (MISSING)
- Appointment (MISSING)
- Contact info (MISSING)

**UX innovations**:
- One question per screen
- Keyboard shortcuts (press A/B/C to select)
- Progress bar
- Friendly validation messages
- Conversational tone

### Linear

**Input types** (8 core + custom):
- Text
- Dropdown
- Checkbox
- Date
- Priority picker (custom)
- Label selector (custom)
- Assignee picker (custom)
- Status selector (custom)

**Smart features**:
- Search in dropdowns
- Recently used values at top
- Icons alongside options
- Triage Intelligence (AI suggests values)
- Duplicate detection

---

## Recommended Next Steps

1. **Implement "Other" escape hatch** ✅ DONE (just completed)

2. **Add Phase 1 types** (number, date, email, dropdown, rating)
   - Start with number (easiest, HeroUI ready)
   - Then email (validation is straightforward)
   - Then date (native picker on mobile)
   - Then dropdown (HeroUI Select component ready)
   - Finally rating (need custom component)

3. **Fix accessibility issues** (parallel with Phase 1)
   - Add aria-describedby to all inputs
   - Add aria-invalid + aria-live for errors
   - Fix keyboard navigation
   - Add timeout extension mechanism

4. **Enhance existing types** (Phase 2)
   - Text validation (pattern, lengths)
   - Choice descriptions
   - Confirm variants (danger, warning, info)

5. **Research and spec Phase 3** (file, ranking, slider, matrix)

---

## Sources

### Industry Standards
- [Google Forms Question Types](https://support.google.com/docs/answer/7322334)
- [Typeform Question Types](https://help.typeform.com/hc/en-us/articles/360051789692)
- [SurveyMonkey Question Types](https://help.surveymonkey.com/en/surveymonkey/create/question-types/)
- [Notion Database Properties](https://www.notion.com/help/database-properties)
- [Airtable Field Types](https://support.airtable.com/docs/supported-field-types-in-airtable-overview)
- [Linear Issue Properties](https://linear.app/docs/issue-properties)
- [Slack Workflow Inputs](https://api.slack.com/tutorials/workflow-builder-steps)

### HTML5 & Web Standards
- [HTML5 Input Types - MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input)
- [HTML5 Input Types - W3Schools](https://www.w3schools.com/html/html_form_input_types.asp)

### Mobile UX Research
- [Baymard Touch Keyboard Types](https://baymard.com/labs/touch-keyboard-types)
- [Mobile Form Best Practices - IvyForms](https://ivyforms.com/blog/mobile-form-best-practices/)
- [Apple HIG Touch Targets](https://developer.apple.com/design/human-interface-guidelines/accessibility)

### Accessibility Standards
- [WCAG 2.1 AA Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WCAG 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html)
- [WCAG 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html)
- [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)
- [Typeform Accessibility](https://www.typeform.com/help/a/create-accessible-forms-360055612291/)

### UX Research
- [NN/g Chatbots](https://www.nngroup.com/articles/chatbots/)
- [NN/g Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)
- [NN/g Form Errors](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- [Smashing Magazine: Inline Validation](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/)
- [Smashing Magazine: Destructive Actions](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- [GitLab Destructive Actions](https://design.gitlab.com/patterns/destructive-actions/)

### SOTA AI Patterns
- [ChatGPT Voice Mode](https://techcrunch.com/2025/11/25/chatgpts-voice-mode-is-no-longer-a-separate-interface/)
- [Anthropic Computer Use](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)
- [Claude Artifacts](https://www.anthropic.com/news/build-artifacts)
- [Cursor 2.0 Blog](https://cursor.com/blog/2-0)
- [Devin Deep Research](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [Windsurf Context Awareness](https://docs.windsurf.com/context-awareness/overview)
- [Gemini Deep Research](https://gemini.google/overview/deep-research/)
- [Perplexity Pro Search](https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search)
- [OpenAI Operator](https://openai.com/index/introducing-operator/)
- [LangGraph HITL](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)

---

*Research completed: 2026-01-24*
*Agents: aa037df (adversarial UX), a97282b (SOTA patterns)*
