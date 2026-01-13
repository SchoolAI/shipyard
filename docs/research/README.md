# Research Directory

This directory contains research and analysis documents for Peer-Plan features and integrations.

## Contents

### AI Platform Session Metadata Research (Issue #41)

**Purpose:** Determine how to capture origin session IDs from various AI agent platforms to enable conversation transcript export.

**Documents:**

1. **[ai-platform-session-metadata-research.md](./ai-platform-session-metadata-research.md)** - Comprehensive research document
   - Platform-by-platform detailed analysis
   - Hook systems and API capabilities
   - Implementation recommendations
   - Source documentation links
   - Hook implementation examples

2. **[platform-comparison-summary.md](./platform-comparison-summary.md)** - Quick reference guide
   - Comparison tables
   - Implementation priorities
   - Hook installation guides
   - Testing matrix
   - Next steps

**Quick Summary:**

| Platform | Hook System | Session ID | Status |
|----------|-------------|-----------|--------|
| Claude Code | ✅ Yes | ✅ Available | Already implemented |
| Cursor | ✅ Yes | ✅ Available | Ready to implement |
| Windsurf | ✅ Yes | ⚠️ Needs testing | Requires testing |
| Devin | ❌ No | ⚠️ Manual/API | Design needed |
| GitHub Copilot | ❌ No | ⚠️ Post-hoc | Manual workflow |
| Aider | ❌ No | ❌ No IDs | Timestamp-based |
| Continue.dev | ❌ No | ❌ Unclear | Needs research |

**Research Date:** 2026-01-13

**Related Issues:**
- [#41: Exporting conversation transcripts from AI agent sessions](https://github.com/YOUR_ORG/peer-plan/issues/41)

---

## How to Use This Research

### For Developers

1. **Start here:** Read [platform-comparison-summary.md](./platform-comparison-summary.md) for quick overview
2. **Deep dive:** Consult [ai-platform-session-metadata-research.md](./ai-platform-session-metadata-research.md) for implementation details
3. **Copy examples:** Hook implementation code is in the Appendix of the research doc

### For Product Planning

- **Priority recommendations:** See "Implementation Priority" in summary doc
- **Effort estimates:** Included for each platform
- **User workflows:** Documented per platform
- **Open questions:** Listed at end of research doc

### For Documentation

- **User guides:** Hook installation guides in summary doc
- **API specs:** Full endpoint documentation in research doc
- **Security considerations:** Privacy and API key handling guidelines

---

## Future Research Topics

Areas that need additional investigation:

1. **MCP Protocol Enhancement:** Standardizing session metadata passing
2. **Continue.dev:** Platform maturity and session management improvements
3. **VS Code Extension:** Building unified export extension for multiple platforms
4. **Enterprise Workflows:** Hook distribution at scale
5. **Multi-Platform Sessions:** Handling plans created from multiple AI sessions

---

## Contributing

When adding new research:

1. Create a new markdown file with descriptive name
2. Include research date and purpose
3. Add summary to this README
4. Link to related issues
5. Cite all sources with URLs

**Template:**
```markdown
# Research Topic

**Research Date:** YYYY-MM-DD
**Purpose:** [Brief description]
**Related Issues:** #XX

## Summary
[Key findings]

## Details
[Full analysis]

## Sources
- [Source 1](URL)
- [Source 2](URL)
```

---

**Last Updated:** 2026-01-13
