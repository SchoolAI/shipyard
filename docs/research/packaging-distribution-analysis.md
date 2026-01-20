# Packaging and Distribution Analysis

**Date**: 2026-01-17
**Status**: Research Complete
**Decision**: Required for npm publishing and distribution

---

## Executive Summary

This document synthesizes findings from 5 parallel research agents investigating how to package and distribute Shipyard components for easy installation. The research identified **4 publishable packages** with varying readiness levels and **critical missing infrastructure** for npm publishing.

### Key Findings

1. **Hook is publish-ready** - `@shipyard/hook` has proper metadata and can be published immediately after workspace dependencies are built
2. **MCP server needs work** - Missing `files` field causes 373+ files to be published; workspace dependencies need bundling
3. **Shared packages should be published** - Both `@shipyard/schema` and `@shipyard/shared` are needed by external consumers
4. **Skill needs packaging** - Well-structured but missing ZIP creation script
5. **No publishing infrastructure** - Need Changesets, GitHub Actions workflow, and npm tokens

---

## Package Analysis

### 1. MCP Server (`@shipyard/server`)

**Current State:**
- Version: 0.1.0
- Size: 147KB bundle (36KB main + 5 chunks)
- Dependencies: 21 production packages including workspace deps
- Build: tsdown, shebang present, executable

**Critical Blockers:**
- ❌ Missing `files` field → publishes 373+ files including source code
- ❌ Workspace dependencies (`@shipyard/schema`, `@shipyard/shared`) unresolved
- ❌ No README.md for npm
- ❌ No LICENSE.md in package directory
- ❌ Missing npm metadata (repository, keywords, homepage)

**Recommended Fix:**
Bundle workspace dependencies into the server package rather than publishing them separately as dependencies. This:
- Reduces installation complexity
- Single package to maintain
- Schema/shared are internal APIs not meant for direct external use

**Installation Method:**
```bash
npx @shipyard/server
```

**Reference:** Similar to `@modelcontextprotocol/server-filesystem` pattern

---

### 2. Hook (`@shipyard/hook`)

**Current State:**
- Version: 0.1.0
- Size: 36KB single bundle (all dependencies included)
- Build: tsdown with full bundling
- Status: ✅ **FULLY READY**

**What's Working:**
- ✅ Has `files` field (dist, scripts, .claude-plugin, hooks)
- ✅ Has `prepublishOnly` script
- ✅ Has postinstall script for auto-configuration
- ✅ Proper bin entries (`shipyard-hook`, `shipyard-hook-install`)
- ✅ Plugin metadata in `.claude-plugin/`
- ✅ Single bundle includes all workspace deps

**Blocker:**
- ⚠️ Needs `@shipyard/schema` and `@shipyard/shared` built before publishing

**Installation Method:**
```bash
npm install -g @shipyard/hook
# Postinstall automatically configures Claude Code
```

---

### 3. Skill (`shipyard-skill/`)

**Current State:**
- Location: `/shipyard-skill/` directory in repo root
- Structure:
  ```
  shipyard-skill/
  ├── SKILL.md (230 lines - main instructions)
  ├── README.md (51 lines - setup guide)
  └── examples/
      └── plan-example.md (114 lines)
  ```

**Critical Issues:**
- ❌ README references `shipyard.zip` that doesn't exist
- ❌ No packaging script to create the ZIP
- ❌ README instructs users to use `npx @shipyard/server` but package not on npm

**Distribution Options:**
1. **Manual ZIP upload** (current README approach)
   - User downloads shipyard-skill.zip
   - Claude Desktop → Settings → Skills → Upload

2. **Plugin marketplace** (future)
   - Requires `.claude-plugin/plugin.json`
   - Install via `/plugin install` command

**Recommended Approach:**
- Create packaging script: `scripts/package-skill.sh`
- Host ZIP on GitHub Releases
- Keep separate from MCP server (different distribution channels)

**Reference:** `plannotator/` project in repo shows plugin structure pattern

---

### 4. Shared Packages

#### @shipyard/schema

**Current State:**
- Version: 0.1.0
- Size: 37 TypeScript source files
- Build: tsdown with subpath exports
- Exports: plan types, URL encoding, Yjs helpers, tRPC router

**What It Contains:**
- Plan metadata, artifacts, deliverables
- Thread/comment types
- tRPC AppRouter and schemas
- Yjs helper functions (100+ exports)
- URL encoding/decoding
- Hook API types

**External Dependencies:**
- @blocknote/core ^0.45.0
- @trpc/server ^11.8.1
- lz-string ^1.5.0
- nanoid ^5.1.6
- yjs ^13.6.28
- zod ^4.3.4

**Should Publish?** ✅ YES
- Hook package depends on it
- Enables ecosystem extensions
- FSL license permits publication

**Needed Changes:**
- ❌ Add `files: ["dist"]`
- ❌ Add peer dependencies (yjs, zod)
- ❌ Add README.md
- ❌ Add repository/keywords metadata

#### @shipyard/shared

**Current State:**
- Version: 0.1.0
- Size: 5 TypeScript source files
- Build: tsdown with subpath exports
- Dependencies: **ZERO** (uses Node.js crypto only)

**What It Contains:**
- `computeHash()` - SHA256 hashing
- `generateSessionToken()` - Crypto token generation
- `hashSessionToken()` - Token hashing
- `DEFAULT_REGISTRY_PORTS` - Port constants

**Should Publish?** ✅ YES
- Hook package depends on it
- Zero external dependencies
- Minimal footprint

**Needed Changes:**
- ❌ Add `files: ["dist"]`
- ❌ Add README.md
- ❌ Add repository/keywords metadata

---

## Publishing Infrastructure

### Current State

**Existing CI/CD:**
- ✅ Web app → GitHub Pages (deploy.yml)
- ✅ Signaling server → Cloudflare Workers (deploy-signaling.yml)
- ✅ OAuth worker → Cloudflare Workers (deploy-oauth-worker.yml)

**Missing for npm:**
- ❌ Changesets for version management
- ❌ GitHub Actions workflow for npm publish
- ❌ npm automation token in GitHub secrets
- ❌ Provenance attestation setup
- ❌ GitHub Releases automation

### Recommended Stack

**Version Management:** Changesets
- Industry standard for Turborepo monorepos
- Automatic version bumping + changelog generation
- Works seamlessly with pnpm workspaces
- [Reference: Turborepo Publishing Libraries](https://turborepo.dev/docs/guides/publishing-libraries)

**Publishing Strategy:** Unified Versioning
- All packages share same version (e.g., "shipyard v1.2.3")
- Simpler for users to understand
- Changesets config: `fixed: [["@shipyard/*"]]`

**Security:**
- npm provenance attestation (`--provenance` flag)
- GitHub Actions with `id-token: write` permission
- npm automation token (bypasses 2FA)

---

## Distribution Channels

### 1. npm Registry (Primary)
- **Packages**: server, hook, schema, shared
- **Installation**: `npx @shipyard/server`, `npm install -g @shipyard/hook`
- **Status**: Not published yet

### 2. MCP Server Registries
- **Smithery.ai** - 4,000+ MCP servers registered
- **Official MCP Registry** - registry.modelcontextprotocol.io
- **Status**: Submit after npm publish

### 3. Claude Code Plugin Marketplace
- **Package**: hook already has `.claude-plugin/plugin.json`
- **Status**: Ready for submission after npm publish

### 4. GitHub Releases
- **Use**: Source distribution, announcements
- **Automation**: Changesets can auto-create releases

---

## Implementation Plan

### Phase 1: Package Preparation (High Priority)

#### Server Package
1. Add `files` field to package.json:
   ```json
   { "files": ["dist", ".env.example"] }
   ```
2. Bundle workspace dependencies (change tsdown config)
3. Add README.md with installation instructions
4. Copy LICENSE.md from root
5. Add npm metadata (repository, keywords, homepage)
6. Change to named bin entry:
   ```json
   { "bin": { "mcp-server-shipyard": "./dist/index.mjs" } }
   ```

#### Schema Package
1. Add `files: ["dist"]`
2. Add peer dependencies:
   ```json
   {
     "peerDependencies": {
       "yjs": "^13.6.0",
       "zod": "^4.0.0"
     }
   }
   ```
3. Create README.md
4. Add repository/keywords metadata

#### Shared Package
1. Add `files: ["dist"]`
2. Create README.md
3. Add repository/keywords metadata

#### Hook Package
✅ Already ready - just needs workspace packages built first

#### Skill
1. Create `scripts/package-skill.sh`:
   ```bash
   #!/bin/bash
   cd shipyard-skill
   zip -r ../shipyard-skill.zip .
   ```
2. Update README.md to reference GitHub Releases
3. Remove reference to non-existent shipyard.zip

### Phase 2: Publishing Infrastructure (Critical)

1. **Install Changesets**
   ```bash
   pnpm add -Dw @changesets/cli
   pnpm changeset init
   ```

2. **Configure Unified Versioning**
   Edit `.changeset/config.json`:
   ```json
   {
     "fixed": [["@shipyard/*"]],
     "changelog": "@changesets/cli/changelog"
   }
   ```

3. **Create npm Publishing Workflow**
   File: `.github/workflows/publish.yml`
   - Trigger: push to main, manual dispatch
   - Steps: install → build → test → version → publish → release
   - Permissions: `contents: write`, `id-token: write`

4. **Add npm Token to GitHub Secrets**
   - Create npm automation token
   - Store as `NPM_TOKEN` in repository secrets

5. **Add Provenance Attestation**
   - Use `--provenance` flag in `npm publish`
   - Requires `id-token: write` permission

### Phase 3: Testing & Publishing (Before Go-Live)

1. **Dry Run**
   ```bash
   cd apps/server
   npm pack --dry-run
   # Verify only dist/ and essential files included
   ```

2. **Local Testing**
   ```bash
   pnpm --filter @shipyard/hook link --global
   shipyard-hook --help
   ```

3. **First Publish** (Manual)
   ```bash
   # Publish in order:
   npm publish packages/shared --access public --provenance
   npm publish packages/schema --access public --provenance
   npm publish apps/server --access public --provenance
   npm publish apps/hook --access public --provenance
   ```
   All packages will be under the @shipyard organization scope.

4. **Submit to Registries**
   - Smithery.ai
   - Official MCP Registry
   - Claude Code Plugin Marketplace

### Phase 4: Documentation & Polish (Post-Launch)

1. Update main README.md with installation instructions
2. Add npm version badge (Shipyard packages)
3. Update SETUP.md to use `npx @shipyard/server` installation
4. Create video walkthrough for installation
5. Add troubleshooting guide

---

## User Installation Flow (After Publishing)

### For Claude Code Users

**Step 1: Install Hook**
```bash
npm install -g @shipyard/hook
# Postinstall script automatically configures Claude Code
```

**Step 2: Add MCP Server**
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "@shipyard/server"]
    }
  }
}
```

**Step 3: Restart Claude Code**
```bash
/quit
# Then relaunch
```

**Step 4: Use**
- Ask Claude: "Create a plan to add dark mode"
- Hook intercepts plan mode exit
- Browser opens with live plan

### For Other AI Agents (Devin, Cursor, etc.)

**Step 1: Install MCP Server**
Configure MCP client to use:
```bash
npx @shipyard/server
```

**Step 2: Use MCP Tools Directly**
- `create_plan`
- `add_artifact`
- `read_plan`
- etc.

**No hook needed** - agents use MCP tools directly

---

## Cost Analysis

**One-time Setup:**
- Developer time: ~8-12 hours
  - Package prep: 4-6 hours
  - CI/CD setup: 2-3 hours
  - Testing: 2-3 hours

**Ongoing:**
- npm hosting: FREE (public packages)
- GitHub Actions: FREE (included in GitHub plan)
- Maintenance: ~1 hour per release

---

## Risk Assessment

### High Risk (Must Address)
1. **Workspace dependencies not resolved** - Blocks MCP server publishing
2. **Missing `files` field** - Would publish source code to npm
3. **No version management** - Manual versioning error-prone

### Medium Risk (Should Address)
4. **No provenance** - Supply chain security best practice
5. **No testing before publish** - Could publish broken packages
6. **Skill ZIP doesn't exist** - Blocks skill distribution

### Low Risk (Nice to Have)
7. **No automated changelog** - Manual release notes time-consuming
8. **No registry submissions** - Limits discoverability
9. **No download badges** - Less social proof

---

## Open Questions

1. **Bundle vs Publish workspace packages?**
   - Recommendation: Bundle into server (simpler)
   - Alternative: Publish separately (more flexible)

2. **Unified vs Independent versioning?**
   - Recommendation: Unified (simpler for users)
   - Alternative: Independent (more granular control)

3. **When to submit to registries?**
   - Recommendation: After first npm publish + user testing
   - Alternative: Immediately (for maximum visibility)

4. **Should we create a CLI installer?**
   - Recommendation: Not needed initially (setup is simple)
   - Alternative: Create `create-shipyard` if complexity increases

---

## Related Issues

- **#60** - Claude Cowork integration (created the skill)
- **#13** - OAuth for private repos (affects artifact storage)
- **#12** - Token-based room auth (affects WebRTC)

---

## References

### MCP Server Publishing
- [How to build your first MCP server and publish on npm](https://medium.com/@vivek888chavan/how-to-build-your-first-mcp-server-and-publish-on-npm-6b9df8264421)
- [Publish Your MCP Server To NPM](https://www.aihero.dev/publish-your-mcp-server-to-npm)
- [@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

### Monorepo Publishing
- [Publishing libraries - Turborepo](https://turborepo.dev/docs/guides/publishing-libraries)
- [Versioning and Publishing Packages - Turborepo](https://turbo.build/repo/docs/handbook/publishing-packages/versioning-and-publishing)

### Security
- [Generating provenance statements - npm](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Artifact Attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)

### Registries
- [Smithery.ai - MCP Server Registry](https://smithery.ai/)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/)

---

*Research Date: 2026-01-17*
*Agents: 5 parallel agents covering server, hook, skill, shared packages, and infrastructure*
*Total Analysis Time: ~2 hours*
