# Terminal Portal: Browser-Based Terminal via PTY

**Created:** 2026-02-12
**Status:** Research Complete / Not Started
**Scope:** Portal the user's real terminal (login shell with full profile) into the browser from the daemon

---

## Executive Summary

Spawn the user's default shell (`$SHELL --login`) in a PTY on the daemon, relay I/O over WebSocket to xterm.js in the browser. The user gets their full shell environment — aliases, PATH, prompt, everything — rendered in the web app's terminal panel.

**Verdict:** Technically feasible. ~400-500 LOC. Depends on daemon becoming a persistent server first.

---

## Architecture

```
Browser (xterm.js)  <-- WebSocket -->  Daemon (Bun.serve)  <-- PTY -->  User's login shell
  @xterm/xterm           wss://localhost:PORT/ws/terminal      Bun.spawn({ terminal })
  @xterm/addon-fit       + auth token + origin check           $SHELL --login
```

### How the User's Shell Loads

```typescript
const shell = process.env.SHELL || '/bin/zsh';
const proc = Bun.spawn([shell, '--login'], {
  cwd: taskWorkingDirectory,
  env: process.env,
  terminal: {
    cols: 80,
    rows: 24,
    data(chunk) { ws.send(chunk); },
  },
});
```

- `$SHELL` resolves to the user's configured default shell (zsh, bash, fish)
- `--login` loads their full profile: `~/.zshrc`, `~/.bash_profile`, `~/.config/fish/config.fish`
- `process.env` inherits the daemon's environment (which has the user's PATH, nvm, pyenv, etc.)
- Result: identical to opening a new tab in iTerm2/Terminal.app/Alacritty

### Shell Profile Loading by Shell

| Shell | `--login` loads | Interactive loads | User gets |
|-------|----------------|-------------------|-----------|
| zsh | `~/.zprofile` then `~/.zshrc` | `~/.zshrc` | Full environment + aliases |
| bash | `~/.bash_profile` (NOT `~/.bashrc` unless sourced) | `~/.bashrc` | Full environment |
| fish | `~/.config/fish/config.fish` | Same | Full environment |

---

## Prerequisites (Must Exist First)

1. **Daemon server mode** — The daemon must become a long-running `Bun.serve()` process with WebSocket support. Today it's a CLI that runs one session and exits.
2. **Browser-to-daemon connectivity** — WebSocket or Loro sync connection must be established first.

---

## Security Requirements (Non-Negotiable)

These are mandatory. Without them, any website the user visits can execute commands on their machine via cross-site WebSocket hijacking.

| Requirement | Implementation |
|-------------|----------------|
| Bind localhost only | `Bun.serve({ hostname: '127.0.0.1' })` — never `0.0.0.0` |
| Auth token | Generate 32-byte random token at startup, write to `~/.shipyard/terminal-session.json` (mode `0600`) |
| Token on connect | Require token as WS query param: `ws://localhost:PORT/ws/terminal?token=<random>` |
| Origin validation | Reject WebSocket upgrades from any origin other than the app's dev server |
| Ephemeral port | Use port 0 (OS-assigned), write chosen port to the session file |
| Connection limit | Max 1 concurrent WebSocket per PTY session |

**Precedent:** code-server, ttyd, and JupyterLab all use the same pattern (random token + origin check).

---

## Technical Details

### Dependencies

| Package | Side | Size | Purpose |
|---------|------|------|---------|
| `@xterm/xterm` | Browser | ~265 KB | Terminal renderer |
| `@xterm/addon-fit` | Browser | ~5 KB | Auto-resize terminal to container |
| (none) | Daemon | 0 | Bun.spawn({ terminal }) is built-in since v1.3.5 |

### Estimated LOC

| Component | LOC |
|-----------|-----|
| PTY spawn + resize + cleanup | 80 |
| WebSocket route + auth | 100 |
| Backpressure / flow control | 50 |
| xterm.js React component | 80 |
| Error states + reconnection | 80 |
| **Total** | **~400** |

### Backpressure Strategy

Terminal output can be bursty (build tools, `cat` large files). Without flow control, the browser tab freezes.

```
PTY stdout → check ws.getBufferedAmount() → if < threshold: ws.send(chunk)
                                           → if >= threshold: pause PTY read, resume when buffer drains

Browser → xterm.js write(data, callback) → callback fires when rendered → signal daemon to send more
```

### xterm.js React Lifecycle

To avoid the known `dispose()` memory leak (charAtlasCache retains refs):
- **Don't dispose on panel close** — hide the canvas element, reattach on reopen
- Only dispose when the terminal session truly ends or the component unmounts permanently

---

## Known Limitations (Accepted)

| Limitation | Severity | Notes |
|------------|----------|-------|
| POSIX only (no Windows) | Accepted | Bun PTY is macOS/Linux only. Fine for current user base. |
| Localhost only | Accepted | Remote peers (WebRTC) cannot see the terminal. Fine for v1. |
| No tmux/screen nesting | Accepted | Nested PTYs cause escape sequence conflicts. Document it. |
| Bun PTY is young | Accepted | Known line-buffering bug (~10% of the time). May hit edge cases. |
| No tabs/splits/search/themes | By design | Scope cap. One terminal, one session. We are not building a terminal emulator. |

---

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cross-site WebSocket hijacking | **Critical** | Auth token + origin check (see Security section) |
| xterm.js dispose() memory leak | High | Don't dispose on panel toggle — hide/reattach instead |
| Output flood freezes browser | High | Backpressure via write callback + buffered amount check |
| Bun PTY API instability | Medium | API is undocumented; could change without deprecation notice |
| Orphaned PTY on daemon crash | Low | Same as VS Code. User can `pkill` if needed. |
| PATH missing if daemon started at boot | Medium | Document: daemon should be started from an interactive shell |

---

## Council Deliberation Summary (2026-02-12)

Four personas reviewed independently:

| Persona | Verdict | Key Concern |
|---------|---------|-------------|
| Security Engineer | Modify | CSWSH is critical — mandatory auth token + origin check |
| Systems Architect | Approve (sequenced) | Daemon must become a server first |
| Devil's Advocate | Modify | Bun PTY too new, scope creep risk, 130 LOC is fantasy |
| Pragmatist | Defer | Build daemon server + chat connectivity first |

**Consensus:** Feasible and worth building, but not yet. Daemon server mode is the prerequisite.

---

## Implementation Sequence

```
Phase 0: Daemon Server Mode          ← PREREQUISITE (separate work)
  └─ Bun.serve() + WebSocket + Loro sync

Phase 1: Terminal Portal              ← THIS WHIP
  ├─ 1a: Security layer (token + origin check)
  ├─ 1b: PTY spawn + WebSocket route
  ├─ 1c: xterm.js React component
  └─ 1d: Backpressure + error handling

Phase 2: Agent Activity Feed          ← SEPARATE WHIP (future)
  └─ Stream SDK messages to terminal panel as structured feed
```

---

## Files That Will Change

| File | Change |
|------|--------|
| `apps/daemon/src/` (new) | WebSocket server, PTY manager, auth module |
| `apps/web/src/components/panels/terminal-panel.tsx` | Replace placeholder with xterm.js |
| `apps/web/package.json` | Add `@xterm/xterm`, `@xterm/addon-fit` |
| `~/.shipyard/terminal-session.json` | Runtime auth file (port + token) |

---

## References

- [Bun v1.3.5 Terminal API](https://bun.com/blog/bun-v1.3.5)
- [xterm.js](https://xtermjs.org/) — `@xterm/xterm` (not deprecated `xterm`)
- [xterm.js dispose leak](https://github.com/xtermjs/xterm.js/issues/1518)
- [Bun PTY line-buffering bug](https://github.com/oven-sh/bun/issues/22785)
- [code-server auth pattern](https://coder.com/docs/code-server)
- [ttyd](https://github.com/tsl0922/ttyd) — reference for terminal-over-WebSocket

---

*Last updated: 2026-02-12*
