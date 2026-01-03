> **ORIGINAL VISION DOCUMENT**
> These diagrams reflect the initial design. Some details have been refined.
> For current architecture, see [../architecture.md](../architecture.md).

---

# Peer-Plan Diagrams (Mermaid)

Render these at [mermaid.live](https://mermaid.live) or any Mermaid-compatible tool.

---

## System Architecture

```mermaid
flowchart TB
    subgraph GitHub["GitHub Repository"]
        Main[main branch<br/>code only]
        Artifacts[plan-artifacts branch<br/>orphan, never merges]
        Pages[GitHub Pages<br/>static UI]
    end
    
    subgraph Browser["Browser (Reviewers)"]
        UI[Static Site]
        Loro[loro-extended client]
    end
    
    subgraph Local["Local Machine"]
        MCP[MCP Server<br/>Node.js]
        Agent[AI Agent]
    end
    
    Agent <-->|MCP protocol| MCP
    MCP -->|push artifacts| Artifacts
    MCP <-->|WebRTC mesh| Loro
    
    UI -->|fetch plan.json| Artifacts
    UI -->|load artifacts| Artifacts
    UI <--> Loro
    
    Pages -->|serves| UI
```

---

## Sequence Diagram: Plan Creation & Artifact Upload

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant MCP as MCP Server
    participant Git as GitHub API
    participant Branch as plan-artifacts branch

    Agent->>MCP: Create implementation plan
    MCP->>MCP: Generate plan JSON
    MCP->>MCP: Capture artifacts (screenshots, test results, etc.)
    
    MCP->>Git: Check if plan-artifacts branch exists
    alt Branch doesn't exist
        MCP->>Git: Create orphan branch
    end
    
    MCP->>Branch: Commit plan.json to /pr-{pr}/plan-{id}/
    MCP->>Branch: Commit artifacts to same directory
    MCP->>Git: Push to plan-artifacts branch
    
    MCP-->>Agent: Return plan URL
```

---

## Sequence Diagram: Collaborative Review (Live)

```mermaid
sequenceDiagram
    participant R1 as Reviewer 1 (Browser)
    participant R2 as Reviewer 2 (Browser)
    participant Mesh as loro-extended Mesh
    participant GH as GitHub Raw

    R1->>GH: Fetch plan.json from plan-artifacts branch
    GH-->>R1: Return plan + artifact URLs
    R1->>Mesh: Join mesh for plan-{id}
    
    R2->>GH: Fetch plan.json
    GH-->>R2: Return plan + artifact URLs
    R2->>Mesh: Join mesh for plan-{id}
    
    Mesh-->>R1: Peer connected notification
    Mesh-->>R2: Peer connected notification
    
    R1->>Mesh: Add annotation to step 3
    Mesh-->>R2: Sync annotation (CRDT)
    
    R2->>Mesh: Reply to annotation
    Mesh-->>R1: Sync reply (CRDT)
    
    R1->>Mesh: Update status to "approved"
    Mesh-->>R2: Sync status change
```

---

## Sequence Diagram: Async Review (No Peers Online)

```mermaid
sequenceDiagram
    participant R as Reviewer (Browser)
    participant Mesh as loro-extended Mesh
    participant GH as GitHub Raw
    participant MCP as MCP Server

    R->>GH: Fetch plan.json from plan-artifacts branch
    GH-->>R: Return plan + artifact URLs
    R->>Mesh: Attempt to join mesh
    Mesh-->>R: No peers online
    
    R->>R: Display static plan view
    R->>GH: Load artifacts (images, test results)
    
    R->>R: Add annotation locally
    Note over R: Annotations stored locally until sync
    
    alt MCP server comes online later
        MCP->>Mesh: Join mesh
        Mesh-->>R: Peer connected
        R->>Mesh: Sync pending annotations
        Mesh-->>MCP: Receive annotations
        MCP->>GH: Persist updated plan.json
    end
```

---

## Activity Diagram: End-to-End Workflow

```mermaid
flowchart TD
    A[Agent starts work on feature branch] --> B[Agent generates implementation plan]
    B --> C[Agent captures artifacts as proof]
    C --> D{plan-artifacts branch exists?}
    
    D -->|No| E[Create orphan branch]
    E --> F[Commit plan + artifacts]
    D -->|Yes| F
    
    F --> G[Push to plan-artifacts branch]
    G --> H[Generate plan URL]
    H --> I[Share URL with reviewers]
    
    I --> J{Reviewers online together?}
    
    J -->|Yes| K[Live P2P collaboration via loro-extended]
    J -->|No| L[Async static view from GitHub]
    
    K --> M[Real-time annotations sync via CRDT]
    L --> N[Local annotations, sync when peers connect]
    
    M --> O{Plan approved?}
    N --> O
    
    O -->|Changes requested| P[Agent addresses feedback]
    P --> C
    
    O -->|Approved| Q[Merge feature branch]
    Q --> R[Optional: cleanup old artifacts]
```

---

## State Diagram: Plan Status

```mermaid
stateDiagram-v2
    [*] --> Draft: Agent creates plan
    Draft --> PendingReview: Agent submits for review
    
    PendingReview --> ChangesRequested: Reviewer requests changes
    PendingReview --> Approved: Reviewer approves
    
    ChangesRequested --> PendingReview: Agent addresses feedback
    
    Approved --> [*]: Merge feature branch
```

---

## Hybrid Live/Async Decision Flow

```mermaid
flowchart TD
    A[User opens plan URL] --> B{Try to join loro mesh}
    
    B -->|Peers found| C[Live collaboration mode]
    B -->|No peers| D[Fetch static JSON from GitHub]
    
    C --> E[Real-time CRDT sync]
    D --> F[Display static view]
    
    E --> G[Add annotations]
    F --> G
    
    G --> H{Peers online?}
    H -->|Yes| I[Sync immediately]
    H -->|No| J[Store locally, sync later]
    
    I --> K[All peers see update]
    J --> L[Persist to orphan branch on next sync]
```