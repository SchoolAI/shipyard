# Input Request Response Formats

Specification for how user responses are serialized in Y.Doc across all input types.

All responses are stored as strings in the Y.Doc for consistent serialization and cross-platform compatibility.

---

## Format Specification

| Type | Response Format | Example | Parsing |
|------|----------------|---------|---------|
| **text** | Raw string | `"hello world"` | Use as-is |
| **multiline** | String with newlines | `"line1\nline2\nline3"` | Preserve `\n` characters |
| **choice (single)** | Selected option string | `"PostgreSQL"` | Direct value match |
| **choice (multi)** | Comma-space separated | `"Dark mode, Offline support"` | Split by `", "` |
| **confirm** | Lowercase "yes" or "no" | `"yes"` | Compare with `"yes"` or `"no"` |
| **number** | Decimal representation | `"42"` or `"3.14"` | `parseFloat(response)` |
| **email** | Email address string | `"user@example.com"` | Validated before submit |
| **date** | ISO 8601 date | `"2026-01-24"` | `new Date(response)` |
| **dropdown** | Selected option string | `"United States"` | Direct value match |
| **rating** | Integer as string | `"5"` | `parseInt(response, 10)` |

---

## Type-Specific Details

### Text Input
- **Storage:** Exact string as entered by user
- **Validation:** None (any string accepted)
- **Empty value:** Empty string `""`
- **Whitespace:** Preserved as entered

**Example:**
```typescript
// User types: "Fix the login bug"
// Stored response: "Fix the login bug"
```

### Multiline Input
- **Storage:** String with newline characters (`\n`)
- **Validation:** None (any text accepted)
- **Line breaks:** Preserved using `\n`
- **Character count:** Displayed to user in UI

**Example:**
```typescript
// User types:
// "Line 1
// Line 2
// Line 3"
// Stored response: "Line 1\nLine 2\nLine 3"

// Parsing:
const lines = response.split('\n'); // ["Line 1", "Line 2", "Line 3"]
```

### Choice Input (Single Select)
- **Storage:** Selected option as string
- **Format:** Exact match of one option from the `options` array
- **Validation:** Must match one of the provided options (enforced by UI)

**Example:**
```typescript
// Options: ["PostgreSQL", "SQLite", "MongoDB"]
// User selects: PostgreSQL
// Stored response: "PostgreSQL"

// Parsing:
const selectedDb = response; // "PostgreSQL"
```

### Choice Input (Multi-Select)
- **Storage:** Comma-space separated string
- **Format:** `"option1, option2, option3"`
- **Separator:** Always `", "` (comma + space)
- **Order:** Preserves selection order

**Example:**
```typescript
// Options: ["Dark mode", "Offline support", "Push notifications"]
// User selects: ["Dark mode", "Offline support"]
// Stored response: "Dark mode, Offline support"

// Parsing:
const selected = response.split(', '); // ["Dark mode", "Offline support"]
```

### Confirm Input
- **Storage:** Lowercase string "yes" or "no"
- **Format:** Exactly `"yes"` or `"no"` (lowercase only)
- **Validation:** Only these two values are possible

**Example:**
```typescript
// User clicks "Yes" button
// Stored response: "yes"

// Parsing:
const confirmed = response === "yes"; // true
const declined = response === "no"; // false
```

### Number Input
- **Storage:** Decimal representation as string
- **Format:** JavaScript number converted to string
- **Validation:** Enforced min/max/step bounds in UI
- **Mobile:** Shows numeric keypad

**Example:**
```typescript
// User enters: 42
// Stored response: "42"

// User enters: 3.14
// Stored response: "3.14"

// Parsing:
const num = parseFloat(response); // 42 or 3.14
```

### Email Input
- **Storage:** Email address as string
- **Format:** Validated email format
- **Validation:** Regex validation + optional domain restriction
- **Mobile:** Shows email keyboard

**Example:**
```typescript
// User enters: user@company.com
// Stored response: "user@company.com"

// If domain restriction "company.com" is set:
// "user@other.com" would be rejected by UI validation
```

### Date Input
- **Storage:** ISO 8601 date string (YYYY-MM-DD)
- **Format:** Native date picker value
- **Validation:** Enforced min/max date range in UI
- **Mobile:** Shows native date picker

**Example:**
```typescript
// User selects: January 24, 2026
// Stored response: "2026-01-24"

// Parsing:
const date = new Date(response); // Date object
```

### Dropdown Input
- **Storage:** Selected option as string
- **Format:** Exact match of one option value
- **Validation:** Must match one of the provided options
- **Features:** Searchable ComboBox for long option lists

**Example:**
```typescript
// Options: ["United States", "Canada", "Mexico"]
// User selects: United States
// Stored response: "United States"
```

### Rating Input
- **Storage:** Integer as string
- **Format:** Rating value converted to string
- **Validation:** Must be within min/max bounds
- **Styles:** Stars, numbers, or emoji display

**Example:**
```typescript
// Rating scale: 1-5 stars
// User selects: 4 stars
// Stored response: "4"

// Parsing:
const rating = parseInt(response, 10); // 4
```

---

## Special Cases

### "Other" Option in Choice Inputs

When a choice input includes the escape hatch for custom text:
- **UI shows:** "Other (please specify)" option with text input field
- **Internal value:** `"__other__"` as placeholder
- **Response format:** Uses the custom text directly (NOT prefixed)

**Single-select with "Other":**
```typescript
// Options: ["PostgreSQL", "SQLite", "MongoDB"]
// User selects: "Other" and types "Redis"
// Stored response: "Redis"
// (NOT "Other: Redis" or "__other__: Redis")
```

**Multi-select with "Other":**
```typescript
// Options: ["Dark mode", "Offline support"]
// User selects: ["Dark mode", "__other__"] and types "Custom feature"
// Stored response: "Dark mode, Custom feature"
// The "__other__" placeholder is replaced with custom text
```

### Empty/Invalid Responses

Input requests enforce validation before allowing submission:
- Text fields require non-empty input
- Choice fields require at least one selection
- "Other" option requires custom text when selected
- Submit button is disabled until validation passes

If validation fails:
- `status` remains `"pending"`
- No `response` field is stored
- User must correct input before submitting

### Response Whitespace

- **Text/Multiline:** Leading/trailing whitespace preserved
- **Choice:** Options are trimmed during creation, responses match exactly
- **Confirm:** No whitespace (always `"yes"` or `"no"`)
- **Custom "Other" input:** Trimmed before storage (`.trim()` applied)

---

## Implementation Reference

### Creating Responses (Browser)
```typescript
// packages/schema/src/input-helpers.ts
export function answerInputRequest(
  ydoc: Y.Doc,
  requestId: string,
  response: string,  // Always a string
  answeredBy: string
): AnswerInputRequestResult
```

### Reading Responses (MCP/Agents)
```typescript
// Via execute_code:
const result = await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite"],
  multiSelect: true
});

if (result.success) {
  const response: string = result.response;
  // For multi-select: split by ", "
  const selections = response.split(', ');
}
```

---

## Cross-Platform Compatibility

All response formats are designed for cross-platform consistency:
- **Claude Code:** Native tool integration
- **Cursor/Windsurf:** MCP direct access
- **Claude Desktop:** MCP protocol
- **Browser:** Direct Y.Doc manipulation

String-based storage ensures:
- JSON serialization without type loss
- Simple parsing in any language
- No ambiguity in deserialization
- Consistent behavior across platforms

---

## See Also

- **Input Request Schema:** `/packages/schema/src/input-request.ts`
- **Browser UI Implementation:** `/apps/web/src/components/InputRequestModal.tsx`
- **MCP Tool Definition:** `/apps/server/src/tools/execute-code.ts` (requestUserInput is implemented inline)
- **Agent Instructions:** `/packages/shared/src/instructions/mcp-direct.ts`
