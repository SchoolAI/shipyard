# AI Platform Session Metadata - Quick Reference

**Last Updated:** 2026-01-13

## Quick Comparison Table

| Platform | Hook System | Session ID Available | Best Approach | Priority | Status |
|----------|-------------|---------------------|---------------|----------|---------|
| **Claude Code** | ✅ PreToolUse | ✅ `session_id`, `transcript_path` | Use hooks | ✅ Done | Already implemented |
| **Cursor** | ✅ beforeMCPExecution | ✅ `conversation_id`, `generation_id` | Use hooks + API export | ⭐ High | Ready to implement |
| **Windsurf** | ✅ pre_mcp_tool_use | ⚠️ Fields unknown | Use hooks (test first) | 🔶 Medium | Needs testing |
| **Devin** | ❌ No hooks | ⚠️ Manual or API key | Manual session ID param | 🔶 Medium | Design needed |
| **GitHub Copilot** | ❌ No hooks | ⚠️ Post-hoc only | CLI export after session | 🔵 Low | Manual workflow |
| **Aider** | ❌ No hooks | ❌ No session IDs | Timestamp correlation | 🔵 Low | Imprecise |
| **Continue.dev** | ❌ No hooks | ❌ Unclear | Unknown | ⚠️ Unclear | Needs more research |

---

## Session ID Fields by Platform

### Claude Code ✅
```json
{
  "session_id": "ses_abc123",
  "transcript_path": "/path/to/session.json"
}
```
**Hook:** `PreToolUse`

### Cursor ✅
```json
{
  "conversation_id": "conv_stable_across_turns",
  "generation_id": "gen_changes_per_prompt"
}
```
**Hook:** `beforeMCPExecution`

**Export API:**
```bash
curl https://api.cursor.com/v0/agents/{id}/conversation \
  -H "Authorization: Bearer $CURSOR_API_KEY"
```

### Windsurf ⚠️
```json
{
  "agent_action_name": "pre_mcp_tool_use",
  "tool_info": { "tool_name": "...", "arguments": {} }
  // session_id field: UNKNOWN - needs testing
}
```
**Hook:** `pre_mcp_tool_use`

**Action Required:** Install Windsurf and test hook payload

### Devin ⚠️
**No hooks - must use alternative approach:**

**Option A: Manual Parameter**
```typescript
create_plan({
  title: "...",
  origin: {
    platform: "devin",
    session_id: "devin_ses_123"  // User provides
  }
})
```

**Option B: API Export**
```bash
curl https://api.devin.ai/v1/sessions/{session_id} \
  -H "Authorization: Bearer $DEVIN_API_KEY"
```

### GitHub Copilot ⚠️
**No runtime access - post-hoc export only:**

```bash
# List sessions
gh agent-task list

# Export specific session
gh agent-task view SESSION_ID --log > session.json
```

**VS Code:**
- Command Palette → "Chat: Export Session..." → JSON
- Right-click → "Copy All" → Markdown

### Aider ❌
**No session IDs:**
- Markdown history: `.aider.chat.history.md`
- Use timestamps to correlate with tool calls
- Imprecise but possible

### Continue.dev ❌
**Insufficient documentation:**
- Logs: `~/.continue/logs/cn.log`
- `cn --resume` suggests local session tracking
- No clear session ID mechanism

---

## Implementation Priority

### Phase 1: Hook-Based Platforms (Immediate) ⚡

#### 1. Cursor (High Priority) ⭐
**Why:** Popular platform, comprehensive hook system, API for export

**Steps:**
1. Create `.cursor/hooks.json` configuration
2. Implement `beforeMCPExecution` hook script
3. Capture `conversation_id` and `generation_id`
4. Test with our MCP server
5. Implement API export using conversation ID

**Estimated Effort:** 2-4 hours

#### 2. Windsurf (Medium Priority) 🔶
**Why:** Growing platform, hook system available

**Steps:**
1. Install Windsurf and create test project
2. Configure `pre_mcp_tool_use` hook
3. Test and document session ID field names
4. Implement hook script
5. Investigate conversation export capabilities

**Estimated Effort:** 4-6 hours (includes testing/research)

### Phase 2: API-Based Platforms (Near Term) 📅

#### 3. Devin (Medium Priority) 🔶
**Why:** Enterprise-focused, comprehensive API

**Steps:**
1. Add optional `origin.session_id` parameter to `create_plan`
2. Document user workflow (how to get session ID)
3. Implement API-based export tool
4. Test with Devin API

**Estimated Effort:** 3-4 hours

### Phase 3: Manual Export Platforms (Future) 🔮

#### 4. GitHub Copilot (Low Priority) 🔵
**Why:** Popular but limited programmatic access

**Steps:**
1. Document manual workflow using `gh agent-task`
2. Create helper scripts for export
3. Consider VS Code extension for better UX

**Estimated Effort:** 4-8 hours (if building extension)

#### 5. Aider (Low Priority) 🔵
**Why:** Limited session tracking

**Steps:**
1. Implement timestamp-based correlation
2. Parse `.aider.chat.history.md`
3. Document limitations clearly

**Estimated Effort:** 2-3 hours

#### 6. Continue.dev (On Hold) ⏸️
**Why:** Insufficient documentation

**Action:** Monitor platform development, revisit later

---

## Hook Installation Guide (User-Facing)

### Cursor

**Location:** `.cursor/hooks.json` in your workspace root

**Template:**
```json
{
  "version": 1,
  "hooks": {
    "beforeMCPExecution": [
      {
        "command": "node .cursor/hooks/peer-plan-origin.js",
        "async": false
      }
    ]
  }
}
```

**Installation:**
```bash
# Copy hook files to your workspace
curl -o .cursor/hooks/peer-plan-origin.js \
  https://raw.githubusercontent.com/YOUR_ORG/peer-plan/main/hooks/cursor/peer-plan-origin.js

# Make executable
chmod +x .cursor/hooks/peer-plan-origin.js
```

**Enterprise Distribution:**
- Cursor Enterprise: Deploy via admin dashboard
- Individual users: Manual installation per workspace

### Windsurf

**Location:** `.windsurf/hooks.json` in your workspace root

**Template:**
```json
{
  "hooks": {
    "pre_mcp_tool_use": [
      {
        "command": "python3 .windsurf/hooks/peer-plan-origin.py",
        "show_output": false
      }
    ]
  }
}
```

**Installation:**
```bash
# Copy hook files
curl -o .windsurf/hooks/peer-plan-origin.py \
  https://raw.githubusercontent.com/YOUR_ORG/peer-plan/main/hooks/windsurf/peer-plan-origin.py

# Make executable
chmod +x .windsurf/hooks/peer-plan-origin.py
```

### Claude Code (Current)

**Location:** `.claude/hooks/` in your workspace root

**Already implemented** - users install hooks per [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks)

---

## Security Considerations

### API Key Storage

**Problem:** Some platforms require API keys for conversation export

**Solutions:**
1. **Environment Variables:** Store in user's shell environment
2. **Secure Config:** Use platform-specific secure storage (e.g., macOS Keychain)
3. **OAuth Tokens:** Where available, use token-based auth with expiry
4. **User Prompt:** Ask for API key on first use, cache encrypted

### Privacy Implications

**What We Store:**
- ✅ Session IDs (just identifiers)
- ✅ Timestamps
- ✅ Platform names
- ⚠️ API key hashes (for correlation)
- ❌ Full transcripts (only fetched on-demand)

**Retention Policy:**
- Session IDs: Permanent (needed for export)
- API keys: Only if user opts in
- Cached transcripts: 30 days or user-configurable

### Data Transmission

- All API calls use HTTPS
- MCP server should validate SSL certificates
- Consider adding end-to-end encryption for sensitive data

---

## Testing Matrix

| Platform | Hook Installed | Session ID Captured | Export Works | Edge Cases Tested |
|----------|---------------|--------------------|--------------|--------------------|
| Claude Code | ✅ | ✅ | ✅ | ✅ |
| Cursor | ⬜ | ⬜ | ⬜ | ⬜ |
| Windsurf | ⬜ | ⬜ | ⬜ | ⬜ |
| Devin | N/A | ⬜ | ⬜ | ⬜ |
| GitHub Copilot | N/A | ⬜ | ⬜ | ⬜ |
| Aider | N/A | N/A | ⬜ | ⬜ |
| Continue.dev | N/A | N/A | N/A | N/A |

---

## Open Issues

### Technical

1. **Cursor API Authentication:** How do users obtain API keys?
   - Check Cursor settings/preferences
   - May require enterprise account

2. **Windsurf Session Fields:** Need to test actual hook payload
   - Install Windsurf
   - Configure hook with logging
   - Document exact JSON structure

3. **MCP Protocol:** Can we standardize session metadata passing?
   - Propose extension to MCP spec?
   - Custom headers for session context?

### UX

1. **Hook Distribution:** How do users install hooks easily?
   - Option A: Manual (documentation)
   - Option B: CLI installer script
   - Option C: Platform-specific packages

2. **Error Handling:** What if session export fails?
   - Graceful degradation
   - Retry logic
   - User notifications

3. **Multi-Platform:** User switches between platforms
   - Same plan created from multiple sessions?
   - How to handle multiple origins?

### Documentation

1. Need user guides per platform
2. Troubleshooting section
3. Video walkthroughs for complex setups

---

## Next Steps

### Immediate (This Week)

1. ✅ Complete research (DONE)
2. ⬜ Test Cursor hooks
3. ⬜ Implement Cursor hook script
4. ⬜ Update MCP server to accept `origin` parameter

### Short Term (Next 2 Weeks)

1. ⬜ Test Windsurf hooks
2. ⬜ Document Windsurf session fields
3. ⬜ Implement Devin manual parameter approach
4. ⬜ Create user documentation

### Medium Term (Next Month)

1. ⬜ Implement conversation export tool
2. ⬜ Test with all supported platforms
3. ⬜ Create installation scripts
4. ⬜ Build example workflows

### Long Term (Future)

1. ⬜ VS Code extension for GitHub Copilot
2. ⬜ Aider timestamp correlation
3. ⬜ MCP spec proposal for session context
4. ⬜ Continue.dev support (if feasible)

---

## Related Issues

- **#41:** Exporting conversation transcripts from AI agent sessions
- **#50:** Speech-to-text review comments (related context capture)

---

## References

See [ai-platform-session-metadata-research.md](./ai-platform-session-metadata-research.md) for:
- Detailed platform analysis
- Source documentation links
- Hook implementation examples
- Full API specifications
