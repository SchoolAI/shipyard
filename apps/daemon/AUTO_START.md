# Daemon Auto-Start Implementation

This document describes the automatic OS-level auto-start configuration for the Shipyard daemon.

## Overview

The daemon now automatically configures itself to start on machine boot using OS-native mechanisms. This ensures the daemon survives reboots without requiring the MCP to manually respawn it.

## Architecture

### Flow

1. **MCP Server Starts** → Calls `ensureDaemonRunning()` in `daemon-launcher.ts`
2. **Check if daemon is running** → If yes, skip setup
3. **Check if auto-start is configured** → If no, configure it
4. **Configure auto-start** → Create OS-specific config (LaunchAgent/Registry/systemd)
5. **Spawn daemon** → Start daemon immediately (first time or if not running)

### Key Components

- **`apps/daemon/src/auto-start.ts`** - Platform-specific auto-start configuration
  - `setupAutoStart()` - Configure OS to auto-start daemon
  - `isAutoStartConfigured()` - Check if already configured
  - `removeAutoStart()` - Clean up auto-start config

- **`apps/server/src/daemon-launcher.ts`** - MCP integration
  - Modified `ensureDaemonRunning()` to check and setup auto-start

- **`apps/daemon/cli.js`** - Manual control tool
  - `status` - Check auto-start status
  - `setup` - Enable auto-start
  - `remove` - Disable auto-start

## Platform Implementation

### macOS (LaunchAgent)

**Location:** `~/Library/LaunchAgents/com.shipyard.daemon.plist`

**Features:**
- Runs at user login (`RunAtLoad: true`)
- Restarts on failure (`KeepAlive.SuccessfulExit: false`)
- Logs to `~/.shipyard/daemon-stdout.log` and `daemon-stderr.log`

**Commands:**
```bash
# Load
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shipyard.daemon.plist

# Unload
launchctl bootout gui/$(id -u)/com.shipyard.daemon

# Start/stop
launchctl kickstart gui/$(id -u)/com.shipyard.daemon
launchctl kill SIGTERM gui/$(id -u)/com.shipyard.daemon

# Check status
launchctl list | grep shipyard
```

### Windows (Registry)

**Location:** `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

**Key:** `ShipyardDaemon`

**Value:** `"C:\path\to\node.exe" "C:\path\to\daemon\index.js"`

**Commands:**
```powershell
# Check
Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ShipyardDaemon'

# Remove
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ShipyardDaemon'
```

### Linux (systemd user service)

**Location:** `~/.config/systemd/user/shipyard-daemon.service`

**Features:**
- Starts at user session start (`WantedBy: default.target`)
- Restarts on failure (`Restart: on-failure`)
- Logs to `~/.shipyard/daemon-stdout.log` and `daemon-stderr.log`

**Commands:**
```bash
# Enable (start on boot)
systemctl --user enable shipyard-daemon.service

# Disable
systemctl --user disable shipyard-daemon.service

# Start/stop
systemctl --user start shipyard-daemon.service
systemctl --user stop shipyard-daemon.service

# Check status
systemctl --user status shipyard-daemon.service
```

## Testing

### Manual Testing

1. **Setup auto-start:**
   ```bash
   cd apps/daemon
   node cli.js setup
   ```

2. **Verify configuration:**
   ```bash
   node cli.js status

   # macOS
   launchctl list | grep shipyard

   # Linux
   systemctl --user is-enabled shipyard-daemon.service
   ```

3. **Test daemon starts:**
   ```bash
   # macOS
   launchctl kickstart gui/$(id -u)/com.shipyard.daemon

   # Linux
   systemctl --user start shipyard-daemon.service
   ```

4. **Verify health:**
   ```bash
   curl http://localhost:56609/health
   # OR
   curl http://localhost:49548/health
   ```

5. **Check logs:**
   ```bash
   cat ~/.shipyard/daemon-stdout.log
   cat ~/.shipyard/daemon-stderr.log
   ```

6. **Clean up:**
   ```bash
   node cli.js remove
   ```

### Reboot Testing

1. Setup auto-start
2. Reboot machine
3. Verify daemon is running:
   ```bash
   curl http://localhost:56609/health
   ```

## Troubleshooting

### macOS: Daemon not starting

1. Check if loaded:
   ```bash
   launchctl list | grep shipyard
   ```

2. Check logs:
   ```bash
   cat ~/.shipyard/daemon-stderr.log
   ```

3. Try manual kickstart:
   ```bash
   launchctl kickstart gui/$(id -u)/com.shipyard.daemon
   ```

4. Verify plist syntax:
   ```bash
   plutil -lint ~/Library/LaunchAgents/com.shipyard.daemon.plist
   ```

### Linux: Service not starting

1. Check service status:
   ```bash
   systemctl --user status shipyard-daemon.service
   ```

2. Check logs:
   ```bash
   journalctl --user -u shipyard-daemon.service
   cat ~/.shipyard/daemon-stderr.log
   ```

3. Reload systemd:
   ```bash
   systemctl --user daemon-reload
   ```

### Windows: Not running on boot

1. Check registry:
   ```powershell
   Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ShipyardDaemon'
   ```

2. Try running manually:
   ```powershell
   node C:\path\to\daemon\dist\index.js
   ```

## Implementation Notes

### Path Resolution

The daemon path is resolved using `import.meta.url` to find the current module, then navigating to `index.js` in the same directory. This works in both development and production:

- **Development:** `/path/to/apps/daemon/dist/index.js`
- **Production:** `/path/to/node_modules/shipyard/dist/index.js`

The path is decoded using `decodeURIComponent()` to handle spaces and special characters.

### Node Executable Path

Uses `process.execPath` to get the full path to the Node.js binary. This ensures the correct Node version is used even if the user has multiple Node installations (nvm, fnm, etc.).

### Graceful Degradation

If auto-start setup fails (permissions, unsupported platform, etc.), the MCP falls back to manual daemon spawning. The daemon still works, but won't survive reboots.

### Idempotency

Calling `setupAutoStart()` multiple times is safe - it checks if already configured and skips setup if so. The MCP checks on every startup, ensuring auto-start stays configured.

## Future Improvements

- [ ] Add support for FreeBSD/OpenBSD (rc.d scripts)
- [ ] Add Windows Task Scheduler support (more reliable than registry)
- [ ] Add auto-update mechanism for daemon path changes
- [ ] Add user notification when auto-start is configured
- [ ] Add `--no-auto-start` flag to disable automatic setup

## Security Considerations

- Auto-start runs with **user privileges only** (no sudo/admin required)
- Logs are written to user's home directory (`~/.shipyard/`)
- Configuration files are user-owned and writable
- Daemon only listens on `localhost` (not externally accessible)
- Lock files prevent multiple daemon instances
