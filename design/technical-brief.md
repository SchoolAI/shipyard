# Peer-Plan: P2P Collaborative Plan Review

**Technical Architecture Brief**  
*Draft v0.2 — January 2026*

---

## Executive Summary

This document outlines a peer-to-peer (P2P) architecture for collaborative review of implementation plans. The system enables real-time collaboration between AI agents and humans using WebRTC for direct communication and CRDTs for conflict-free document synchronization.

The solution is designed to be fully open-source, requiring no paid infrastructure, and can be deployed using a static GitHub Pages site combined with local MCP (Model Context Protocol) servers. Companies install the MCP server locally, connecting to their own GitHub repos with their existing PAT—no external services required.

---

## Problem Statement

When AI coding agents generate implementation plans, there is currently no standardized way to:

- Enable real-time collaborative review between humans and agents
- Allow multiple reviewers to annotate and comment simultaneously
- Provide a feedback loop that wakes the agent to address comments
- Achieve this without requiring centralized infrastructure or paid services

### The Deeper Problem: Agent Verifiability

**When an AI agent claims to have completed a task, how do we verify it actually did what it said?**

Agents make claims. Claims aren't proof. We need a verification layer where humans (or other agents) can inspect evidence.

| Claim | Evidence Required |
|-------|-------------------|
| "I built this UI" | Screenshots |
| "All tests pass" | Test results JSON |
| "Here's me running the flow" | Screen recordings |
| "Here's what I executed" | Execution logs |
| "Here's exactly what changed" | Code diffs |

The plan review system becomes a **verification layer** where reviewers inspect artifacts that prove work was done.

---

## Solution Overview

The proposed solution uses a mesh architecture where the MCP server, the author's browser, and collaborator browsers all participate as equal peers in a CRDT mesh network.

### Core Components

1. **MCP Server (Local):** Runs on the developer's machine, provides tools for plan creation, joins the CRDT mesh as a peer, uploads artifacts to GitHub
2. **Static Web UI (GitHub Pages):** Renders the plan, provides annotation interface, handles WebRTC connections
3. **loro-extended:** CRDT framework with built-in WebRTC adapters for conflict-free synchronization
4. **Public Signaling Server:** Free, open-source signaling for WebRTC peer discovery (e.g., STUN/TURN servers)
5. **Orphan Branch Storage:** Artifacts stored in a dedicated git branch that never merges to main

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CRDT Library | loro-extended | Built-in WebRTC adapters, no polyfill hacks, schemas + reactivity out of box |
| Artifact Storage | Git orphan branch | Same repo, same permissions, main stays clean, no external services |
| Deployment | Self-hosted MCP + GitHub Pages | Companies install locally, uses existing PAT, fully self-contained |
| Signaling | Public STUN/TURN | Sufficient for mesh coordination |

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  GitHub Repository                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ main branch  │  │ plan-artifacts│  │ GitHub Pages │       │
│  │ (code only)  │  │ (orphan)      │  │ (static UI)  │       │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘       │
└────────────────────────────┼──────────────────┼──────────────┘
                             │                  │
                             ▼                  ▼
                    ┌─────────────────────────────────┐
                    │      Static Site (Browser)      │
                    │  • Loads plan JSON from branch  │
                    │  • Displays artifacts via raw   │
                    │  • loro-extended for live sync  │
                    │  • Falls back to static view    │
                    └─────────────────────────────────┘
                             ▲
                             │ loro-extended WebRTC
                             │ (when peers online)
                             ▼
                    ┌─────────────────────────────────┐
                    │    MCP Server (Local Node.js)   │
                    │  • Creates plans                │
                    │  • Uploads artifacts to branch  │
                    │  • Joins loro mesh as peer      │
                    └─────────────────────────────────┘
```

### Three-Peer Mesh Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Public Signaling Server                          │
│                  (wss://signaling.yjs.dev)                          │
└─────────────────────────┬───────────────────────┬───────────────────┘
                          │ WSS                   │ WSS               
                          ▼                       ▼                   
┌────────────────────────────────┐    ┌────────────────────────────────┐
│     Your Machine               │    │     Peer's Machine             │
│  ┌──────────────────────────┐  │    │  ┌──────────────────────────┐  │
│  │ Claude / AI Agent        │  │    │  │ Browser                  │  │
│  └──────────┬───────────────┘  │    │  │ (GitHub Pages UI)        │  │
│             │ MCP              │    │  │ loro-extended (peer)     │  │
│             ▼                  │    │  └──────────┬───────────────┘  │
│  ┌──────────────────────────┐  │    └─────────────┼──────────────────┘
│  │ MCP Server               │  │                  │                 
│  │ loro-extended (peer)     │◄─┼──── WebRTC P2P ──┤                 
│  └──────────┬───────────────┘  │                  │                 
│             │ WebRTC           │                  │                 
│             ▼                  │                  │                 
│  ┌──────────────────────────┐  │                  │                 
│  │ Browser                  │  │                  │                 
│  │ (GitHub Pages UI)        │◄─┼──── WebRTC P2P ──┘                 
│  │ loro-extended (peer)     │  │                                    
│  └──────────────────────────┘  │                                    
└────────────────────────────────┘                                    
```

**Key insight:** All three nodes (MCP server, author's browser, peer's browser) are equal participants in the loro-extended CRDT mesh. Changes propagate automatically to all peers.

---

## Hybrid Live + Async Model

P2P (WebRTC) only works when peers are online together. For async PR-style review, we need persistent storage.

| Mode | When | How |
|------|------|-----|
| **Live collaboration** | Peers online together | loro-extended WebRTC mesh |
| **Async review** | Reviewer opens PR link later | Static JSON from orphan branch |

### Flow

1. Agent works on `feature/xyz` branch
2. Agent generates plan + artifacts (screenshots, test results, etc.)
3. Agent commits to `plan-artifacts` orphan branch at `/pr-{N}/plan-{id}/`
4. Agent pushes artifacts
5. Plan URL: `https://{org}.github.io/{repo}/plan?repo={org}/{project}&pr={N}&plan={id}`
6. Static site:
   - Tries to join loro-extended mesh (if peers online)
   - Falls back to fetching from `raw.githubusercontent.com`
   - Displays plan + artifacts either way

---

## Orphan Branch Strategy

### Why Orphan Branch?

We evaluated several storage options:

| Option | Verdict | Why Not |
|--------|---------|---------|
| GitHub Releases | ❌ | Pollutes releases list with plan artifacts |
| Commit to feature branch | ❌ | Bloats main when merged |
| GitHub Actions Artifacts | ❌ | 90-day retention, 500MB quota |
| IPFS/web3.storage | ❌ | Requires signup, API keys, not "off the shelf" |
| **Orphan branch** | ✅ | Same repo, same permissions, never merges |

### Benefits

- ✅ No extra repos or services needed
- ✅ Uses existing GitHub PAT
- ✅ Same access control as code
- ✅ Main branch stays clean (never merges)
- ✅ Works offline (it's just git)
- ✅ Artifacts associated with PRs
- ✅ Can add retention policies via GitHub Actions
- ✅ Shared across all devs using the tool (generic branch naming)

### Setup

```bash
git checkout --orphan plan-artifacts
git commit --allow-empty -m "Initialize plan artifacts branch"
git push -u origin plan-artifacts
```

### Directory Structure

```
plan-artifacts/
├── pr-123/
│   └── plan-abc/
│       ├── plan.json
│       ├── screenshot.png
│       └── test-results.json
└── pr-124/
    └── plan-xyz/
        └── demo.mp4
```

### Artifact URLs

```
https://raw.githubusercontent.com/{org}/{repo}/plan-artifacts/pr-{N}/plan-{id}/{file}
```

### Optional Cleanup (GitHub Action)

```yaml
# .github/workflows/cleanup-old-artifacts.yml
name: Cleanup Old Plan Artifacts
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: plan-artifacts
      - name: Delete artifacts older than 90 days
        run: |
          find . -type d -name "pr-*" -mtime +90 -exec rm -rf {} +
          git add -A
          git commit -m "Cleanup old artifacts" || exit 0
          git push
```

---

## Sequence Diagrams

### Plan Creation & Artifact Upload

```
┌───────┐      ┌───────────┐      ┌──────────┐      ┌──────────┐
│ Agent │      │MCP Server │      │ Browser  │      │ Signaling│
└───┬───┘      └─────┬─────┘      └────┬─────┘      └────┬─────┘
    │                │                 │                 │      
    │ create_plan()  │                 │                 │      
    │───────────────>│                 │                 │      
    │                │                 │                 │      
    │                │ Store in loro   │                 │      
    │                │ doc + upload    │                 │      
    │                │ artifacts       │                 │      
    │                │─────┐           │                 │      
    │                │     │           │                 │      
    │                │<────┘           │                 │      
    │                │                 │                 │      
    │                │ Connect WSS     │                 │      
    │                │────────────────────────────────────>│      
    │                │                 │                 │      
    │                │ Join room       │                 │      
    │                │────────────────────────────────────>│      
    │                │                 │                 │      
    │                │ open browser    │                 │      
    │                │ (URL with room) │                 │      
    │                │────────────────>│                 │      
    │                │                 │                 │      
    │                │                 │ Connect WSS     │      
    │                │                 │────────────────>│      
    │                │                 │                 │      
    │                │                 │ Join same room  │      
    │                │                 │────────────────>│      
    │                │                 │                 │      
    │                │<─ WebRTC P2P ──>│                 │      
    │                │   (established) │                 │      
    │                │                 │                 │      
    │ { planId, url }│                 │                 │      
    │<───────────────│                 │                 │      
```

### Collaborative Feedback Flow

```
┌────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐
│ Agent  │   │MCP Server │   │ Author's │   │ Peer's   │
│        │   │ (loro)    │   │ Browser  │   │ Browser  │
└───┬────┘   └─────┬─────┘   └────┬─────┘   └────┬─────┘
    │              │              │              │      
    │              │              │   Add        │      
    │              │              │   annotation │      
    │              │              │<─────────────│      
    │              │              │              │      
    │              │    CRDT sync │              │      
    │              │<─────────────│              │      
    │              │              │              │      
    │              │  CRDT sync   │              │      
    │              │─────────────>│              │      
    │              │              │              │      
    │              │              │  CRDT sync   │      
    │              │              │─────────────>│      
    │              │              │              │      
    │   Observe    │              │              │      
    │   change     │              │              │      
    │<─────────────│              │              │      
    │              │              │              │      
    │  Address     │              │              │      
    │  feedback    │              │              │      
    │─────────────>│              │              │      
    │              │              │              │      
    │              │  CRDT sync   │              │      
    │              │─────────────>│─────────────>│      
    │              │              │              │      
    │              │    (All peers see update)   │      
```

---

## Activity Diagram: End-to-End Workflow

```
                    ┌─────────────────┐
                    │     START       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Agent generates │
                    │ implementation  │
                    │ plan + artifacts│
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ MCP Server:                  │
              │ • Stores plan in loro doc    │
              │ • Commits to orphan branch   │
              │ • Joins WebRTC mesh          │
              │ • Opens browser with URL     │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Author shares   │
                    │ URL with peer   │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Peer opens URL:              │
              │ • Tries to join WebRTC mesh  │
              │ • Falls back to static JSON  │
              │ • Sees plan + artifacts      │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Collaborative Review:        │
              │ • Peer adds annotations      │
              │ • CRDT syncs to all peers    │
              │ • Agent sees feedback        │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Review complete │───── No ─────┐
                    │ ?               │              │
                    └────────┬────────┘              │
                             │ Yes                   │
                             ▼                       │
                    ┌─────────────────┐              │
                    │ Agent addresses │              │
                    │ feedback        │◄─────────────┘
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │      END        │
                    └─────────────────┘
```

---

## Data Model

```javascript
{
  "plan": {
    "id": "abc123",
    "pr": 123,
    "branch": "feature/add-auth",
    "title": "Implementation Plan",
    "content": "...",
    "steps": [
      { "id": "step-1", "title": "...", "description": "..." }
    ],
    "status": "pending_review" | "approved" | "changes_requested",
    "artifacts": [
      {
        "type": "screenshot",
        "url": "https://raw.githubusercontent.com/.../screenshot.png",
        "hash": "sha256:..."
      },
      {
        "type": "test_results",
        "url": "https://raw.githubusercontent.com/.../results.json"
      }
    ],
    "annotations": [
      {
        "id": "ann-1",
        "stepId": "step-1",
        "author": "peer-id",
        "type": "question" | "concern" | "suggestion" | "approval",
        "content": "...",
        "timestamp": 1234567890
      }
    ],
    "review": {
      "verdict": "approved" | "changes_requested",
      "summary": "...",
      "timestamp": 1234567890
    }
  }
}
```

---

## loro-extended

Using [loro-extended](https://github.com/anthropics/loro-extended) instead of Yjs + y-webrtc:

- Built-in adapters: SSE, WebSocket, WebRTC data channels
- No Node.js polyfill hacks needed (unlike y-webrtc which requires `@roamhq/wrtc` and global WebSocket polyfills)
- Supports schemas, network sync, persistence, reactivity out of box
- Examples include WebRTC video conferencing, collaborative chat with AI streaming

---

## Deployment Model

### Company-Internal Installation

1. Company installs MCP server locally (Node.js)
2. Server connects to their GitHub repos using existing PAT
3. Artifacts stored in same repo (orphan branch)
4. Static UI hosted on their GitHub Pages
5. No external services required—fully self-contained

### Plan URL Pattern

```
https://{org}.github.io/{repo}/plan?repo={org}/{project}&pr={N}&plan={id}
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| NAT/firewall blocking | Low | STUN servers handle most cases. Pair programming typically on same network. TURN server optional for edge cases. |
| Signaling server downtime | Low | loro-extended supports multiple signaling servers. Self-hosting is trivial. |
| MCP sampling not supported | Medium | Use loro observers + explicit 'submit review' action. Agent polls or watches for status changes. |

---

## Open Questions

- Signaling server: use public STUN/TURN or self-host?
- Plan approval workflow: require N approvals before merge?
- Artifact size limits: enforce max file sizes?
- Hash verification: verify artifact integrity on load?

---

## Repository Name

Recommended: **peer-plan**

Punchy, captures both P2P nature and plan focus.