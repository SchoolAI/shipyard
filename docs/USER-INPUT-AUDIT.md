# Shipyard User Input System: Comprehensive Audit

**Issue**: #115 - Add "Other" escape hatch to all request_user_input modals
**Date**: 2026-01-24
**Status**: Audit Complete, Implementation Pending

---

## Executive Summary

Shipyard's `request_user_input` system currently **lacks an escape hatch** for choice-type questions. Users are forced to select from predefined options with no ability to provide custom free-form responses. This contradicts UX best practices and creates user frustration when none of the options fit.

**Critical Finding**: Claude Code's native `AskUserQuestion` tool automatically adds an "Other" option, but Shipyard blocks this tool and uses a browser modal without the escape hatch.

---

## 1. Current Implementation Architecture

### 1.1 Data Flow

```
Agent calls request_user_input MCP tool
         ↓
Server validates params, creates InputRequest in Y.Doc
         ↓
Y.Doc syncs via WebSocket to browser
         ↓
Browser shows InputRequestModal
         ↓
User responds or declines or timeout expires
         ↓
Browser updates InputRequest status in Y.Doc
         ↓
Y.Doc syncs back to server
         ↓
Server unblocks, returns response to agent
```

### 1.2 Input Types Supported

| Type | UI Component | User Can Enter | Escape Hatch |
|------|-------------|----------------|--------------|
| `text` | Single-line Input | Any text | ✅ Inherent (freeform) |
| `multiline` | TextArea (4 rows) | Any text | ✅ Inherent (freeform) |
| `choice` | Radio or Checkbox | Selection from options | ❌ **MISSING** |
| `confirm` | Yes/No buttons | "yes" or "no" | ❌ **MISSING** |

### 1.3 Schema Definition

**File**: `packages/schema/src/input-request.ts`

```typescript
InputRequestSchema = discriminatedUnion('type', [
  TextInputSchema,           // type: 'text'
  MultilineInputSchema,      // type: 'multiline'
  ChoiceInputSchema,         // type: 'choice', requires: options[]
  ConfirmInputSchema,        // type: 'confirm'
])
```

**ChoiceInputSchema** (lines 75-81):
```typescript
{
  type: literal('choice'),
  options: array(string).min(1),  // REQUIRED
  multiSelect: boolean().optional(),
}
```

**Gap**: No `allowOther` or `allowCustom` field exists.

---

## 2. Current User Experience Limitations

### 2.1 Choice Type Questions - No Escape Hatch

**Scenario**: Agent asks "Which database should we use?"
**Options**: PostgreSQL, SQLite, MongoDB
**User wants**: Redis or DynamoDB

**Current behavior**:
- User MUST pick one of the three options
- Cannot enter custom response
- Must decline entire request to break free
- Declining signals rejection, not clarification need

**User frustration points**:
1. Constrained choices feel restrictive
2. No way to express nuance ("PostgreSQL for production, SQLite for dev")
3. Must abandon workflow to provide feedback
4. Agent doesn't know WHY user declined

### 2.2 Confirm Type Questions - Binary Only

**Scenario**: Agent asks "Should we delete all test files?"
**Options**: Yes or No
**User wants**: "Only delete files in /old-tests/"

**Current behavior**:
- Binary choice only
- Cannot provide qualified answer
- Must decline and manually comment

### 2.3 Comparison to Claude Code Native Tool

**Claude Code AskUserQuestion** (auto-adds "Other"):

```typescript
┌────────────────────────────────────┐
│ Which database should we use?      │
│                                    │
│ ○ PostgreSQL                       │
│ ○ SQLite                           │
│ ○ MongoDB                          │
│ ○ Other                            │  ← AUTO-ADDED
│                                    │
│ [If Other selected]                │
│ └─> Please specify: [__________]   │
│                                    │
│         [Cancel] [Submit]          │
└────────────────────────────────────┘
```

**Shipyard browser modal** (no escape hatch):

```typescript
┌────────────────────────────────────┐
│ Which database should we use?      │
│                                    │
│ ○ PostgreSQL                       │
│ ○ SQLite                           │
│ ○ MongoDB                          │
│                                    │  ← NO ESCAPE HATCH
│                                    │
│                                    │
│                                    │
│      [Decline] [Submit]            │
└────────────────────────────────────┘
```

---

## 3. Industry Research Findings

### 3.1 UX Best Practices

**Key finding**: **Hybrid approach is universally recommended** - offer buttons for efficiency while allowing free text for flexibility.

#### Nielsen Norman Group Research

> "Some bots removed the option to type text completely, forcing the user to pick one of the choices displayed on the screen. This type of design made the bot similar to a website and restricted the paths that the user could explore within the system."

**Source**: [The User Experience of Chatbots - NN/G](https://www.nngroup.com/articles/chatbots/)

**Impact**: Forcing button-only choices causes:
- User frustration (88% won't return after frustrating interaction)
- Restricted exploration paths
- Unnatural conversation flow
- Dead ends when users deviate from script

#### AI Chatbot UX Research (2025)

> "People preferred to be able to select an option instead of having to enter lengthy text. Consider creating buttons for the most common possible inputs."

BUT:

> "When using Quick Replies, you should let users answer in a message anyway, without using the buttons. Even though there's a good chance of the user choosing one of the buttons rather than typing the same message, give them the opportunity to respond in their own words as well."

**Source**: [UX for AI Chatbots: Complete Guide (2025)](https://www.parallelhq.com/blog/ux-ai-chatbots)

#### Conversational AI Disambiguation Best Practices

**Always include "none of the above"**:
> "You should add a 'none of the above' type of choice to the clarification question. Include an option for the user to establish undetected context."

**Source**: [Conversation Builder — Disambiguation Dialogs](https://developers.liveperson.com/conversation-builder-dialogs-disambiguation-dialogs.html)

### 3.2 Specific Platform Patterns

#### Claude Code (Anthropic)

**Feature**: `AskUserQuestion` tool
- Auto-adds "Other" option to all multiple-choice questions
- When selected, reveals text input field
- User can type any response
- Max 4 questions, 2-4 options per question
- 60 second timeout

**Status in Shipyard**: BLOCKED by hook (deliberately not used)

#### Cursor AI

**Pattern**: Plan mode with clarifications
- Agent asks clarifying questions before execution
- Uses "explanation before action" to set expectations
- Validation checkpoints when output differs from expected
- Progressive disclosure of choices

#### Devin AI

**Pattern**: Confidence-based escalation
- Self-assessed confidence scoring
- If confidence < threshold → ask for clarification
- Uses multi-agent architecture with specialized agents
- Can request clarification mid-execution

#### Cline

**Tool**: `ask_followup_question`
- XML-based with `<suggest>` tags for options
- User can select suggestion OR type custom response
- No explicit "Other" button - free text always available

### 3.3 Survey Design Conventions

Standard practice in survey design:
- Multiple choice questions should include "Other, please specify: _____"
- Allows capturing responses outside researcher's assumptions
- Prevents forced choice bias
- Improves data quality

---

## 4. File Inventory

### Schema/Types
- `packages/schema/src/input-request.ts` - 199 lines (Zod schemas, types)
- `packages/schema/src/input-request.test.ts` - 163 lines (validation tests)
- `packages/schema/src/yjs-keys.ts` - YDOC_KEYS.INPUT_REQUESTS constant
- `packages/schema/src/yjs-helpers.ts` - CRDT update functions

### MCP Server
- `apps/server/src/tools/request-user-input.ts` - 230 lines (tool handler)
- `apps/server/src/services/input-request-manager.ts` - 414 lines (blocking wait)
- `apps/server/src/services/input-request-manager.test.ts` - Service tests
- `apps/server/src/tools/tool-names.ts` - TOOL_NAMES.REQUEST_USER_INPUT

### Browser UI
- `apps/web/src/components/InputRequestModal.tsx` - 471 lines (main modal)
- `apps/web/src/components/InputRequestInboxItem.tsx` - 69 lines (inbox card)
- `apps/web/src/hooks/useInputRequests.ts` - 273 lines (monitoring hook)

### Hook Integration
- `apps/hook/src/adapters/claude-code.ts` - 218 lines (blocks AskUserQuestion)
- `apps/hook/src/transforms/ask-user-question.ts` - 61 lines (passthrough)
- `apps/hook/src/transforms/ask-user-question.test.ts` - 106 lines (tests)

### Documentation
- `docs/designs/user-input-request-research.md` - 1,685 lines (Phase 1 research)
- `docs/designs/user-input-request-implementation-summary.md` - 271 lines

**Total**: ~3,700 lines of code + tests + documentation

---

## 5. Gap Analysis

### 5.1 Missing Features

**Choice Type:**
- ❌ No "Other" escape hatch option
- ❌ No ability to add custom values to choice lists
- ❌ No option descriptions in UI (only labels)
- ❌ No search/filter for long option lists (50+ items)
- ❌ No "Select All" / "Clear All" for multi-select
- ❌ No maximum options limit (could render 1000 options)

**Confirm Type:**
- ❌ Binary only (yes/no) - no qualified responses
- ❌ No reason field when declining
- ❌ No "abstain" or "not sure" option

**All Types:**
- ❌ No async validation (can't check if value exists before submit)
- ❌ No help text or examples in modal
- ❌ No timeout extension mechanism
- ❌ No edit/undo after submitting
- ❌ No request clarification from agent
- ❌ No defer/snooze option

### 5.2 Schema Constraints

**Current ChoiceInputSchema has no field for**:
```typescript
allowOther?: boolean;        // Enable escape hatch
allowCustom?: boolean;       // Alternative name
requireOther?: boolean;      // Force custom response (for "Other, please specify" at end)
customPrompt?: string;       // Label for custom input ("Please specify:", "Other:")
```

**Current validation**:
- `options` array must have min 1 item
- No max items limit
- Options are plain strings (no rich metadata like description, icon, group)

---

## 6. Implementation Options

### Option A: Auto-Add "Other" to All Choice Questions (Recommended)

**Approach**: Automatically append "Other (please specify)" option to every choice question.

**Schema changes**:
```typescript
// NO schema changes needed!
// Always add "Other" in UI, detect in response handler
```

**UI changes** (`InputRequestModal.tsx`):

```typescript
case 'choice': {
  // Append "Other" to options
  const OTHER_OPTION_VALUE = '__other__';
  const enhancedOptions = [
    ...request.options,
    OTHER_OPTION_VALUE
  ];

  const [customText, setCustomText] = useState('');
  const isOtherSelected = value === OTHER_OPTION_VALUE;

  return (
    <>
      <RadioGroup value={value} onChange={setValue}>
        {request.options.map(opt => (
          <Radio key={opt} value={opt}>{opt}</Radio>
        ))}
        <Radio key="other" value={OTHER_OPTION_VALUE}>
          Other (please specify)
        </Radio>
      </RadioGroup>

      {isOtherSelected && (
        <TextField
          placeholder="Type your answer..."
          value={customText}
          onChange={setCustomText}
          autoFocus
        />
      )}
    </>
  );
}
```

**Response format**:
- If option selected: `"PostgreSQL"`
- If Other selected: `"Redis with caching layer"` (custom text directly, no prefix)
- See **[docs/INPUT-RESPONSE-FORMATS.md](./INPUT-RESPONSE-FORMATS.md)** for complete format specification

**Pros**:
- ✅ No schema changes needed
- ✅ Backward compatible (old requests still work)
- ✅ Familiar pattern from surveys
- ✅ Works for both single and multi-select

**Cons**:
- Agent must parse "Other: ..." prefix
- Agent provided options are always shown (even if agent wants pure freeform)

---

### Option B: Agent-Controlled Escape Hatch

**Approach**: Add `allowOther` field to choice schema, agent opts in.

**Schema changes**:
```typescript
const ChoiceInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('choice'),
  options: z.array(z.string()).min(1),
  multiSelect: z.boolean().optional(),
  allowOther: z.boolean().optional().default(false),  // NEW
  otherPrompt: z.string().optional().default('Other (please specify)'),  // NEW
});
```

**MCP tool signature**:
```typescript
request_user_input({
  type: 'choice',
  options: ['PostgreSQL', 'SQLite', 'MongoDB'],
  allowOther: true,  // NEW - agent decides
  otherPrompt: 'Use a different database:',  // NEW - custom label
})
```

**Pros**:
- ✅ Agent has full control
- ✅ Can disable for strict validation cases
- ✅ Customizable "Other" prompt text
- ✅ Explicit in API

**Cons**:
- ❌ Requires schema migration
- ❌ Agent must remember to set flag
- ❌ More API surface area
- ❌ Could forget and restrict users unintentionally

---

### Option C: Separate Hybrid Input Type

**Approach**: New input type `choice_with_custom` that always has escape hatch.

**Schema changes**:
```typescript
const ChoiceWithCustomSchema = InputRequestBaseSchema.extend({
  type: z.literal('choice_with_custom'),
  options: z.array(z.string()).min(1),
  multiSelect: z.boolean().optional(),
  customPrompt: z.string().optional(),
});

// Update discriminated union
InputRequestSchema = z.discriminatedUnion('type', [
  TextInputSchema,
  MultilineInputSchema,
  ChoiceInputSchema,          // Original - strict options only
  ChoiceWithCustomSchema,      // NEW - options + escape hatch
  ConfirmInputSchema,
]);
```

**MCP tool usage**:
```typescript
// Strict - must pick from list
request_user_input({
  type: 'choice',
  options: ['red', 'green', 'blue'],
})

// Flexible - can pick or type custom
request_user_input({
  type: 'choice_with_custom',
  options: ['PostgreSQL', 'SQLite', 'MongoDB'],
})
```

**Pros**:
- ✅ Clear semantic distinction
- ✅ Backward compatible (existing 'choice' unchanged)
- ✅ Agent explicitly chooses strict vs flexible
- ✅ Type-safe

**Cons**:
- ❌ More types to maintain
- ❌ Conceptual overhead (when to use which?)
- ❌ Could lead to inconsistent usage

---

### Option D: Always Show Text Input Below (Parallel Inputs)

**Approach**: For choice and confirm types, always show text input as alternative.

**UI changes**:
```typescript
┌────────────────────────────────────┐
│ Which database should we use?      │
│                                    │
│ Pick one:                          │
│ ○ PostgreSQL                       │
│ ○ SQLite                           │
│ ○ MongoDB                          │
│                                    │
│ Or write your own answer:          │  ← Always visible
│ [_________________________]        │
│                                    │
│         [Cancel] [Submit]          │
└────────────────────────────────────┘
```

**Validation logic**:
```typescript
// If both selected and custom text entered, prefer custom text
const finalResponse = customText.trim()
  ? customText
  : selectedOption;
```

**Pros**:
- ✅ No schema changes
- ✅ Always available (can't forget to enable)
- ✅ Clear visual separation
- ✅ User controls priority (text overrides buttons)

**Cons**:
- ❌ UI clutter when not needed
- ❌ Confusing if user fills both
- ❌ Wastes vertical space on mobile

---

## 7. Recommended Implementation: Option A (Auto-Add "Other")

**Rationale**:
1. **Follows industry standard** - Surveys, forms, and Claude Code all auto-add "Other"
2. **No schema changes** - Backward compatible, minimal risk
3. **User-centric** - Always available without agent having to think about it
4. **Familiar pattern** - Users expect "Other" option in multiple choice
5. **Progressive disclosure** - Text input only shown when needed

### Implementation Steps

#### Phase 1: UI Changes Only (No Breaking Changes)

**File**: `apps/web/src/components/InputRequestModal.tsx`

**Changes needed**:

1. Add constants for "Other" handling (after imports):
```typescript
const OTHER_OPTION_VALUE = '__other__';
const OTHER_OPTION_LABEL = 'Other (please specify)';
```

2. Update choice rendering (lines 255-320):
```typescript
case 'choice': {
  const options = request.options || [];

  // Auto-add "Other" option
  const enhancedOptions = [...options, OTHER_OPTION_VALUE];

  // Track custom input separately
  const [customInput, setCustomInput] = useState('');
  const isOtherSelected = Array.isArray(value)
    ? value.includes(OTHER_OPTION_VALUE)
    : value === OTHER_OPTION_VALUE;

  // Multi-select with "Other" option
  if (request.multiSelect) {
    return (
      <div className="space-y-3">
        <CheckboxGroup
          isRequired
          value={Array.isArray(value) ? value : []}
          onChange={setValue}
          isDisabled={isSubmitting}
        >
          <Label>{request.message}</Label>
          {enhancedOptions.map((opt) => (
            <Checkbox key={opt} value={opt}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label>
                  {opt === OTHER_OPTION_VALUE ? OTHER_OPTION_LABEL : opt}
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ))}
        </CheckboxGroup>

        {isOtherSelected && (
          <TextField>
            <Label>Please specify:</Label>
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Type your answer..."
              autoFocus
            />
          </TextField>
        )}
      </div>
    );
  }

  // Single-select with "Other" option
  return (
    <div className="space-y-3">
      <RadioGroup
        isRequired
        value={typeof value === 'string' ? value : ''}
        onChange={setValue}
        isDisabled={isSubmitting}
      >
        <Label>{request.message}</Label>
        {enhancedOptions.map((opt) => (
          <Radio key={opt} value={opt}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>
                {opt === OTHER_OPTION_VALUE ? OTHER_OPTION_LABEL : opt}
              </Label>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>

      {isOtherSelected && (
        <TextField>
          <Label>Please specify:</Label>
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Type your answer..."
            autoFocus
          />
        </TextField>
      )}
    </div>
  );
}
```

3. Update submit handler (line 160):
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!ydoc || !request || !identity || isSubmitting) return;

  setIsSubmitting(true);

  try {
    let responseValue: string;

    // Handle "Other" option for choice type
    if (request.type === 'choice') {
      const isOtherSelected = Array.isArray(value)
        ? value.includes(OTHER_OPTION_VALUE)
        : value === OTHER_OPTION_VALUE;

      if (isOtherSelected) {
        // Use custom input instead
        responseValue = Array.isArray(value)
          ? [...value.filter(v => v !== OTHER_OPTION_VALUE), customInput].join(', ')
          : customInput;
      } else {
        // Use selected options
        responseValue = Array.isArray(value) ? value.join(', ') : value;
      }
    } else {
      // For other types, use value as-is
      responseValue = Array.isArray(value) ? value.join(', ') : value;
    }

    const result = answerInputRequest(ydoc, request.id, responseValue, identity.username);
    // ... rest of handler
  }
}
```

4. Update validation (line 451):
```typescript
isDisabled={
  isSubmitting ||
  (request.type === 'choice' && !request.options?.length) ||
  // For "Other" option, require custom input
  (isOtherSelected && !customInput.trim()) ||
  // For regular options, require selection
  (!isOtherSelected && (Array.isArray(value) ? value.length === 0 : !value))
}
```

#### Phase 2: Confirm Type Escape Hatch

**Add custom response field to confirm questions**:

```typescript
case 'confirm':
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">{request.message}</p>

      <div className="flex gap-2">
        <Button onPress={() => handleConfirmResponse('yes')}>
          Yes
        </Button>
        <Button onPress={() => handleConfirmResponse('no')} variant="secondary">
          No
        </Button>
      </div>

      <div className="border-t pt-3 mt-3">
        <TextField>
          <Label className="text-sm text-muted-foreground">
            Or provide a custom response:
          </Label>
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Type your answer..."
          />
        </TextField>

        {customInput.trim() && (
          <Button
            onPress={() => handleConfirmResponse(customInput)}
            size="sm"
            className="mt-2"
          >
            Submit Custom Response
          </Button>
        )}
      </div>
    </div>
  );
```

#### Phase 3: Enhanced Schema (Optional)

**If we need more control later**, add opt-in fields:

```typescript
const ChoiceInputSchema = InputRequestBaseSchema.extend({
  type: z.literal('choice'),
  options: z.array(z.string()).min(1),
  multiSelect: z.boolean().optional(),

  // NEW - Escape hatch controls
  disableOther: z.boolean().optional().default(false),
  otherLabel: z.string().optional().default('Other (please specify)'),
  otherPlaceholder: z.string().optional().default('Type your answer...'),
});
```

**Usage**:
```typescript
// Default: Auto-adds "Other"
request_user_input({ type: 'choice', options: [...] })

// Strict mode: No escape hatch (rare cases)
request_user_input({
  type: 'choice',
  options: [...],
  disableOther: true  // Only when validation MUST be strict
})

// Custom labels:
request_user_input({
  type: 'choice',
  options: ['Red', 'Green', 'Blue'],
  otherLabel: 'Use a different color:',
  otherPlaceholder: 'Enter hex code or color name...'
})
```

---

## 8. Testing Plan

### Unit Tests Needed

**File**: `apps/web/src/components/InputRequestModal.test.tsx` (new)

```typescript
describe('InputRequestModal - Choice Type with Other', () => {
  it('should auto-add Other option to choice questions', () => {
    const request = { type: 'choice', options: ['A', 'B', 'C'] };
    render(<InputRequestModal request={request} />);

    expect(screen.getByText('Other (please specify)')).toBeInTheDocument();
  });

  it('should show text input when Other selected', () => {
    const request = { type: 'choice', options: ['A', 'B'] };
    render(<InputRequestModal request={request} />);

    fireEvent.click(screen.getByText('Other (please specify)'));

    expect(screen.getByPlaceholderText('Type your answer...')).toBeVisible();
  });

  it('should submit custom text when Other selected', async () => {
    const request = { type: 'choice', options: ['A', 'B'] };
    const onSubmit = vi.fn();
    render(<InputRequestModal request={request} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('Other (please specify)'));
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Redis' }
    });
    fireEvent.click(screen.getByText('Submit'));

    expect(onSubmit).toHaveBeenCalledWith('Redis');
  });

  it('should handle multi-select with Other option', () => {
    const request = {
      type: 'choice',
      options: ['Dark mode', 'Offline'],
      multiSelect: true
    };
    render(<InputRequestModal request={request} />);

    fireEvent.click(screen.getByText('Dark mode'));
    fireEvent.click(screen.getByText('Other (please specify)'));
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Custom feature' }
    });
    fireEvent.click(screen.getByText('Submit'));

    expect(onSubmit).toHaveBeenCalledWith('Dark mode, Custom feature');
  });
});
```

### Integration Tests

**File**: `apps/server/src/services/input-request-manager.test.ts` (update)

Add tests for:
- Agent receives "Other: [text]" response correctly
- Response parsing when "Other" selected
- Multi-select with mixed options + custom text

### Manual Test Scenarios

**Test 1: Single Choice with Custom**
```
1. Agent: request_user_input({ type: 'choice', options: ['PostgreSQL', 'SQLite'] })
2. Browser: Modal shows PostgreSQL, SQLite, Other
3. User: Selects "Other", types "Redis"
4. User: Clicks Submit
5. Agent: Receives response = "Redis"
```

**Test 2: Multi-Select with Custom**
```
1. Agent: request_user_input({ type: 'choice', options: ['Dark', 'Offline'], multiSelect: true })
2. Browser: Modal shows checkboxes
3. User: Checks "Dark mode" + "Other", types "Analytics"
4. User: Clicks Submit
5. Agent: Receives response = "Dark mode, Analytics"
```

**Test 3: Custom Input Validation**
```
1. User selects "Other" but leaves text input empty
2. Submit button should be disabled
3. User types something → Submit enabled
```

**Test 4: Keyboard Navigation**
```
1. Tab through radio options
2. Press Enter on "Other"
3. Text input receives focus automatically
4. Type answer
5. Press Enter → submits
```

---

## 9. Migration Path

### Backward Compatibility

**Option A implementation is fully backward compatible**:
- Existing requests without "Other" still render correctly
- Old responses (before "Other" added) still parse correctly
- No database migrations needed
- No version checks needed

### Rollout Strategy

1. **Deploy UI changes** (Option A, Phase 1)
   - Browser modal now shows "Other" option
   - No server changes needed
   - Existing agents immediately get escape hatch

2. **Update documentation**
   - Add to MCP tool docs: "Users can always select 'Other' to provide custom response"
   - Update Shipyard skill instructions
   - Add to user-facing help

3. **Monitor usage**
   - Track how often "Other" is selected
   - Identify questions where options are insufficient
   - Use data to improve agent prompting

4. **(Optional) Phase 2/3** - If needed based on usage data

---

## 10. Open Questions

1. **Should confirm type have escape hatch?**
   - Yes/No is often sufficient
   - But qualified answers ("Yes, but only for new files") could be valuable
   - Recommendation: Add in Phase 2 if users request it

2. **What if agent provides 50+ options?**
   - Should we add search/filter UI?
   - Or limit options to max 10 and force agent to use text type?
   - Recommendation: Start without limit, add search if becomes problem

3. **Should "Other" responses be tracked?**
   - Could help improve agent prompting
   - Identify commonly requested options
   - Recommendation: Add analytics in future milestone

4. **Mobile UX considerations?**
   - Text input might be cumbersome on mobile
   - Voice input as alternative?
   - Recommendation: Test on mobile devices before finalizing

---

## 11. Success Criteria

### Phase 1 (Option A Implementation)

- [ ] Choice questions auto-add "Other" option
- [ ] Selecting "Other" reveals text input with auto-focus
- [ ] Text input is required when "Other" selected
- [ ] Submit button validates correctly
- [ ] Agent receives custom text as response
- [ ] Multi-select works with "Other" + other options
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Works on mobile (touch-friendly)
- [ ] Backward compatible with existing requests
- [ ] No schema migrations required

### Phase 2 (Confirm Type Escape Hatch)

- [ ] Confirm questions show custom response field
- [ ] Can submit custom instead of Yes/No
- [ ] Custom response clearly distinguished from binary choice
- [ ] Agent receives whichever user chose

### Phase 3 (Schema Enhancement - If Needed)

- [ ] Agent can disable "Other" option via `disableOther: true`
- [ ] Agent can customize "Other" label
- [ ] Agent can customize placeholder text
- [ ] Schema migration path documented

---

## 12. Related Issues

- #115 - Add "Other" escape hatch (THIS ISSUE - expanded to full audit)
- #114 - Agent input plan association
- #72 - Request user input (original implementation)

---

## 13. References

### Internal Documentation
- `docs/designs/user-input-request-research.md` - Original Phase 1 research (1,685 lines)
- `docs/designs/user-input-request-implementation-summary.md` - Backend implementation (271 lines)
- Issue #115 - Original issue describing the problem

### Industry Research Sources

**UX Research**:
- [The User Experience of Chatbots - NN/G](https://www.nngroup.com/articles/chatbots/)
- [UX for AI Chatbots: Complete Guide (2025)](https://www.parallelhq.com/blog/ux-ai-chatbots)
- [Chatbot UX Design: Complete Guide (2025)](https://www.parallelhq.com/blog/chatbot-ux-design)
- [Progressive Disclosure Chat Pattern](https://multitaskai.com/blog/chat-ui-design/)

**Best Practices**:
- [Conversation Builder — Disambiguation Dialogs](https://developers.liveperson.com/conversation-builder-dialogs-disambiguation-dialogs.html)
- [Prompt Controls in GenAI Chatbots - NN/G](https://www.nngroup.com/articles/prompt-controls-genai/)
- [15 Chatbot UI examples - Sendbird](https://sendbird.com/blog/chatbot-ui)
- [Quick Reply Best Practices](https://www.chatbot.com/help/bot-responses/how-to-use-quick-replies/)

**AI Agent Patterns**:
- [Claude Tool Use Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [MCP Elicitation Specification](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [How Cursor AI Works](https://blog.sshh.io/p/how-cursor-ai-ide-works)
- [Devin Agents 101](https://devin.ai/agents101)

---

## 14. Conclusion

**Current State**: Shipyard's choice-type input requests force users to select from predefined options with no escape hatch.

**Industry Standard**: Auto-adding "Other (please specify)" with conditional text input is the universal pattern.

**Recommendation**: Implement **Option A (Auto-Add "Other")** in Phase 1 as it:
- Requires NO schema changes
- Is fully backward compatible
- Follows industry best practices
- Matches user expectations from surveys and Claude Code
- Minimal implementation risk

**Effort Estimate**: 4-6 hours for Phase 1 (UI changes + tests)

---

*Audit completed: 2026-01-24*
*Research agents: a7b50e1 (codebase), a6750aa (industry patterns)*
