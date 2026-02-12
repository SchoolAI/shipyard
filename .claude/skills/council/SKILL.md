---
name: council
description: "Multi-agent deliberation council for design decisions and reviews. Use when the user asks for a council, design review, architecture review, multi-perspective analysis, or wants diverse expert opinions before making a decision. Spawns 2-4 agents with different personas to independently analyze the same question, then synthesizes findings."
---

# Council Deliberation

## What It Does

Spawns 2-4 parallel subagents with different expert personas to independently analyze a design decision, code review, or architecture question. Each agent works in isolation (preventing groupthink), then the parent agent synthesizes all findings into a structured recommendation.

## When to Use

- User asks for a "council", "design review", "architecture review", or "multi-perspective analysis"
- Before committing to a significant design decision or ADR
- Reviewing a PR or code change with high blast radius
- Evaluating competing approaches to a problem
- Any time the user wants diverse expert opinions

## The Process

### Step 1: Understand the Decision

Before spawning agents, read and understand:
- What is being decided (design choice, PR review, architecture question, approach evaluation)
- What files and code are involved (gather file paths)
- What constraints exist (check `docs/engineering-standards.md`, existing ADRs in `docs/decisions/`, relevant WHIPs in `docs/whips/`)
- What the user's proposed approach is (if any)

### Step 2: Select Personas (2-4)

**Pick personas dynamically based on the task.** Do NOT always use the same set. Use the table below to guide selection.

| Decision Type | Recommended Personas |
|--------------|---------------------|
| New feature design | Systems Architect, DX Advocate, +1 domain-relevant |
| Security-sensitive change | Security Engineer, Correctness Auditor, Systems Architect |
| Performance-sensitive change | Performance Engineer, Pragmatist, Testing Strategist |
| API/interface design | DX Advocate, Systems Architect, Simplicity Champion |
| Architecture decision (ADR) | Systems Architect, Pragmatist, Futurist, Devil's Advocate |
| Code review (general) | Correctness Auditor, Standards Enforcer, Simplicity Champion |
| Code review (critical path) | Correctness Auditor, Security Engineer, Testing Strategist, Performance Engineer |
| WHIP evaluation | Pragmatist, Futurist, DX Advocate, Operator |

Full persona library with detailed system prompts: [reference.md](./reference.md)

### Step 3: Spawn Agents in Parallel

Make multiple Task tool calls in a single message. Each subagent gets:
1. Their persona identity and focus areas
2. The decision context and question
3. File paths to read
4. Structured output instructions

**Subagent prompt template:**

```
You are a [PERSONA NAME] reviewing a [DECISION TYPE] for the Shipyard project.

## Context
[WHAT IS BEING DECIDED — include the user's question and any proposed approach]

## Your Focus
[PERSONA-SPECIFIC FOCUS AREAS — copied from reference.md persona entry]

## Shipyard Context
- Engineering standards: /Users/jacobpetterle/Working Directory/shipyard/docs/engineering-standards.md
- Architecture: /Users/jacobpetterle/Working Directory/shipyard/docs/architecture.md
[ADD any other relevant docs/files]

## Files to Read
[LIST ALL RELEVANT FILE PATHS — be specific, use absolute paths]

## Instructions
1. Read ALL relevant files thoroughly — do not skim
2. Read engineering-standards.md and architecture.md for project context
3. Analyze ONLY from your persona's perspective — stay in character
4. Be critical — find problems, not confirmations
5. Reference specific file paths and line numbers for every finding
6. Rate your confidence (high/medium/low) for each finding

## Output Format
### Key Findings
1. [Finding with file:line reference]
2. ...

### Risks Identified
- [Risk with severity: critical/high/medium/low]

### Recommendation
[approve / reject / modify — with specific changes if modify]

### Confidence
[high / medium / low — and why]
```

**Subagent tool restrictions:** Each subagent should only use read-only research tools: Read, Grep, Glob, WebSearch, WebFetch. They CANNOT spawn their own subagents, edit files, or run commands.

**Use existing agents for matching personas:** When the Standards Enforcer persona is selected, use `subagent_type: "engineering-standards"` instead of a generic agent — it auto-loads the engineering-standards skill with full rule knowledge. Similarly, use `subagent_type: "frontend-expert"` or `subagent_type: "backend-expert"` when a persona aligns with those domains.

### Step 4: Synthesize

After all subagents return, write a structured synthesis:

```
## Council Deliberation: [Topic]

### Participants
| Persona | Recommendation | Confidence |
|---------|---------------|------------|
| [name] | [approve/reject/modify] | [high/medium/low] |

### Consensus Areas
- [Points all/most agents agreed on]

### Disagreements
| Topic | View A (Persona) | View B (Persona) | Resolution |
|-------|------------------|------------------|------------|
| [point] | [view] | [view] | [parent's reasoned resolution] |

### Critical Findings
[Any critical or high severity risks identified, with file:line references]

### Final Recommendation
[Weighted synthesis — heavier weight to high-confidence findings and domain-relevant expertise. State the recommended path forward clearly.]

### Action Items
1. [Specific action]
2. ...
```

**Weighting rules for synthesis:**
- High-confidence findings from domain-relevant personas carry the most weight
- Critical/high severity risks from any persona are blocking unless explicitly overridden
- When personas disagree, the parent agent resolves based on Shipyard's engineering standards and architectural principles
- If the Devil's Advocate finds a flaw that no other persona addressed, flag it prominently

## Example: Design Decision Council

User asks: "Should we use WebSockets or SSE for the new notification system?"

1. **Understand**: Notification system, real-time delivery, server-to-client primary, check architecture.md for existing sync patterns
2. **Select**: Systems Architect (coupling), Performance Engineer (latency/resources), Pragmatist (simplest path), DX Advocate (API ergonomics)
3. **Spawn**: 4 parallel Task calls, each reading `docs/architecture.md`, relevant server code, and the notification WHIP if one exists
4. **Synthesize**: Merge findings, resolve disagreements, produce recommendation with action items

## Example: Code Review Council

User asks: "Review this PR for the new auth middleware"

1. **Understand**: Auth middleware PR, security-critical, check changed files
2. **Select**: Security Engineer, Correctness Auditor, Standards Enforcer (3 personas for critical-path review)
3. **Spawn**: 3 parallel Task calls, each reading the changed files plus `docs/engineering-standards.md`
4. **Synthesize**: Merge findings, flag any critical security issues as blocking

## Integration with Shipyard Workflows

- **ADRs**: Reference council output in the ADR's "Considered Alternatives" section
- **PRs**: Post council synthesis as a PR comment via `gh pr comment`
- **WHIPs**: Use council deliberation to inform design documents before implementation
- **Engineering Standards**: The council evaluates "is the approach right?" while engineering-standards.md governs "is the execution right?"

## Further Reading

- [reference.md](./reference.md) -- Full persona library, detailed system prompts, synthesis template, and integration guidance
