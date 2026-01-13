# Plan: Review Comments + Speech-to-Text Infrastructure

## Overview

Two related features:
1. **Review Comments** - Add optional comment when Approving/Requesting Changes (GitHub-style popover UX)
2. **Speech-to-Text Infrastructure** (Issue #50) - Browser-based STT for mobile voice input (separate PR)

---

## Part 1: Review Comments with Approve/Request Changes

### UX Pattern (GitHub-style)

Click Approve/Request Changes → Popover opens with:
- Textarea for optional feedback ("Feedback for the agent")
- Confirm button
- For "Request Changes": auto-focus textarea

### Implementation Steps

#### 1.1 Schema Changes
**File: `packages/schema/src/plan.ts`**

Add to `PlanMetadata` interface:
```typescript
/** Optional comment from reviewer when approving/requesting changes */
reviewComment?: string;
```

Add to `PlanMetadataSchema`:
```typescript
reviewComment: z.string().optional(),
```

#### 1.2 ReviewActions Component Refactor
**File: `apps/web/src/components/ReviewActions.tsx`**

Transform buttons to popover-based flow using HeroUI v3 Popover:

```tsx
import { Button, Popover, TextArea } from '@heroui/react';

// State
const [activePopover, setActivePopover] = useState<'approve' | 'changes' | null>(null);
const [comment, setComment] = useState('');

// Each button wrapped in Popover
<Popover>
  <Popover.Trigger>
    <Button onPress={() => identity ? setActivePopover('approve') : onRequestIdentity()}>
      Approve
    </Button>
  </Popover.Trigger>
  <Popover.Content placement="top" className="w-80">
    <Popover.Dialog>
      <Popover.Arrow />
      <Popover.Heading>Approve Plan</Popover.Heading>
      <TextArea
        placeholder="Feedback for the agent (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onPress={() => setActivePopover(null)}>
          Cancel
        </Button>
        <Button className="bg-success text-white" size="sm" onPress={handleApprove}>
          Approve
        </Button>
      </div>
    </Popover.Dialog>
  </Popover.Content>
</Popover>
```

Update Y.Doc transaction to include reviewComment:
```typescript
ydoc.transact(() => {
  const metadata = ydoc.getMap('metadata');
  metadata.set('status', newStatus);
  metadata.set('reviewedAt', Date.now());
  metadata.set('reviewedBy', identity.name);
  if (comment.trim()) {
    metadata.set('reviewComment', comment.trim());
  } else {
    metadata.delete('reviewComment');
  }
  metadata.set('updatedAt', Date.now());
});
```

#### 1.3 Export/API Integration
**Files to modify:**
- `apps/server/src/export-markdown.ts` - Include reviewComment in markdown output
- `apps/server/src/tools/read-plan.ts` - Include reviewComment in tool response
- `apps/hook/src/core/review-status.ts` - Include reviewComment in feedback extraction

Add to export:
```typescript
if (reviewComment) {
  output += `\n\n## Reviewer Comment\n\n> ${reviewComment}\n`;
}
```

#### 1.4 Hook API Schema
**File: `packages/schema/src/hook-api.ts`**

Add `reviewComment` to `GetReviewStatusResponseSchema`:
```typescript
reviewComment: z.string().optional(),
```

### Files Summary

| File | Change |
|------|--------|
| `packages/schema/src/plan.ts` | Add `reviewComment` field |
| `apps/web/src/components/ReviewActions.tsx` | Popover-based UX with textarea |
| `apps/server/src/export-markdown.ts` | Include reviewComment in export |
| `apps/server/src/tools/read-plan.ts` | Include reviewComment in response |
| `apps/hook/src/core/review-status.ts` | Include reviewComment in feedback |
| `packages/schema/src/hook-api.ts` | Add reviewComment to schema |

---

## Part 2: Speech-to-Text Infrastructure (Issue #50) - Separate PR

### Overview

Browser-based STT using Moonshine (5-15x faster than Whisper for short audio).

### Architecture

1. **Core Hook**: `useSpeechToText()` - Manages Moonshine model, audio recording, transcription
2. **UI Component**: `VoiceInput` - Microphone button with recording state
3. **Integration Points**: Comment inputs, general text fields

### Implementation Steps (Future PR)

#### 2.1 Dependencies
```bash
pnpm add @anthropic-ai/moonshine-web --filter @peer-plan/web
```

#### 2.2 Core Hook
**File: `apps/web/src/hooks/useSpeechToText.ts`**

```typescript
interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions) {
  // 1. WebGPU detection with WASM fallback
  // 2. Model loading (lazy, cached)
  // 3. Audio recording via MediaRecorder
  // 4. Streaming transcription
  // 5. Permission handling

  return {
    isSupported: boolean;
    isModelLoading: boolean;
    isRecording: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    error: Error | null;
  };
}
```

#### 2.3 VoiceInput Component
**File: `apps/web/src/components/VoiceInput.tsx`**

Microphone button that:
- Shows loading state while model loads
- Animates during recording
- Streams partial transcripts
- Handles errors gracefully

#### 2.4 Integration Points
- Review comment textarea (Part 1)
- BlockNote comment composer
- Future: General comment input

### Acceptance Criteria (from Issue #50)
- Cross-platform (Chrome Android, Safari iOS)
- Streaming transcription display
- Sub-5-second model loading
- Offline operation (no server transmission)
- Graceful error handling

---

## Testing Checklist

### Part 1: Review Comments
- [ ] Approve with no comment - sets status only
- [ ] Approve with comment - sets status + reviewComment
- [ ] Request Changes with comment - sets status + reviewComment
- [ ] Request Changes empty - sets status only
- [ ] `read_plan` includes reviewComment
- [ ] Hook extracts reviewComment in feedback
- [ ] Identity gate works (no popover without auth)

### Part 2: STT (Future)
- [ ] WebGPU detection
- [ ] WASM fallback
- [ ] Model caching
- [ ] Recording state management
- [ ] Permission handling
- [ ] Cross-browser testing

---

## Open Questions

None - ready for implementation.
