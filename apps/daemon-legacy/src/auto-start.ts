/**
 * Auto-start configuration for Shipyard daemon
 *
 * Sets up OS-level configuration to auto-start the daemon on machine boot.
 * This ensures the daemon survives reboots without MCP needing to respawn it.
 *
 * Note: Auto-start is only configured for the main worktree (~/.shipyard).
 * Feature worktrees are transient and don't need boot persistence.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { daemonConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Checks if this is the main worktree (vs a feature worktree).
 * Feature worktrees use paths like ~/.shipyard-wt-<name>
 */
function isMainWorktree(): boolean {
  const stateDir = daemonConfig.SHIPYARD_STATE_DIR;
  const basename = stateDir.split('/').pop() || '';
  return !basename.startsWith('.shipyard-wt-');
}

/**
 * Gets the path to the daemon executable (the entry point that should be started)
 */
function getDaemonExecutablePath(): string {
	const currentFile = import.meta.url;
	/** Use URL constructor to properly decode the path (handles %20 spaces, etc.) */
	const currentPath = decodeURIComponent(new URL(currentFile).pathname);
	const daemonPath = join(dirname(currentPath), 'index.js');

	return daemonPath;
}

/**
 * Gets the path to the Node.js executable
 */
function getNodeExecutablePath(): string {
	return process.execPath;
}

/**
 * macOS: Set up LaunchAgent to auto-start daemon on boot
 */
async function setupMacOS(): Promise<boolean> {
	try {
		const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.shipyard.daemon.plist');
		const daemonPath = getDaemonExecutablePath();
		const nodePath = getNodeExecutablePath();

		/** Get user ID (only available on POSIX systems) */
		const uid = process.getuid?.();
		if (uid === undefined) {
			logger.error('Cannot get user ID - process.getuid() not available');
			return false;
		}

		const launchAgentsDir = dirname(plistPath);
		if (!existsSync(launchAgentsDir)) {
			mkdirSync(launchAgentsDir, { recursive: true });
		}

		const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.shipyard.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${daemonPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${join(homedir(), '.shipyard', 'daemon-stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(homedir(), '.shipyard', 'daemon-stderr.log')}</string>
</dict>
</plist>`;

		writeFileSync(plistPath, plistContent, 'utf-8');

		try {
			execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`, {
				stdio: 'ignore',
			});
		} catch (err) {
			logger.debug({ err }, 'Bootstrap failed, attempting reload');
			try {
				execSync(`launchctl bootout gui/${uid}/com.shipyard.daemon`, {
					stdio: 'ignore',
				});
			} catch {}
			execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`, {
				stdio: 'ignore',
			});
		}

		return true;
	} catch (err) {
		logger.error({ err }, 'Failed to set up macOS auto-start');
		return false;
	}
}

/**
 * Windows: Add registry entry to auto-start daemon on boot
 */
async function setupWindows(): Promise<boolean> {
	try {
		const daemonPath = getDaemonExecutablePath();
		const nodePath = getNodeExecutablePath();

		const command = `"${nodePath}" "${daemonPath}"`;
		execSync(
			`powershell -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ShipyardDaemon' -Value '${command.replace(/'/g, "''")}'"`
		);

		return true;
	} catch (err) {
		logger.error({ err }, 'Failed to set up Windows auto-start');
		return false;
	}
}

/**
 * Linux: Create systemd user service to auto-start daemon on boot
 */
async function setupLinux(): Promise<boolean> {
	try {
		const daemonPath = getDaemonExecutablePath();
		const nodePath = getNodeExecutablePath();
		const systemdDir = join(homedir(), '.config', 'systemd', 'user');
		const servicePath = join(systemdDir, 'shipyard-daemon.service');

		if (!existsSync(systemdDir)) {
			mkdirSync(systemdDir, { recursive: true });
		}

		const serviceContent = `[Unit]
Description=Shipyard Agent Launcher Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${daemonPath}
Restart=on-failure
RestartSec=5s
StandardOutput=append:${join(homedir(), '.shipyard', 'daemon-stdout.log')}
StandardError=append:${join(homedir(), '.shipyard', 'daemon-stderr.log')}

[Install]
WantedBy=default.target
`;

		writeFileSync(servicePath, serviceContent, 'utf-8');

		execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
		execSync('systemctl --user enable shipyard-daemon.service', { stdio: 'ignore' });
		execSync('systemctl --user start shipyard-daemon.service', { stdio: 'ignore' });

		return true;
	} catch (err) {
		logger.error({ err }, 'Failed to set up Linux auto-start');
		return false;
	}
}

/**
 * Sets up OS-level auto-start for the daemon.
 * Returns true if successful, false otherwise.
 *
 * Skips setup for feature worktrees (transient, don't need boot persistence).
 */
export async function setupAutoStart(): Promise<boolean> {
	if (!isMainWorktree()) {
		logger.info({ stateDir: daemonConfig.SHIPYARD_STATE_DIR }, 'Skipping auto-start setup for feature worktree');
		return false;
	}

	const platform = process.platform;

	logger.info({ platform }, 'Setting up auto-start');

	try {
		if (platform === 'darwin') {
			return await setupMacOS();
		}
		if (platform === 'win32') {
			return await setupWindows();
		}
		if (platform === 'linux') {
			return await setupLinux();
		}

		logger.warn({ platform }, 'Unsupported platform for auto-start');
		return false;
	} catch (err) {
		logger.error({ err }, 'Failed to set up auto-start');
		return false;
	}
}

/**
 * macOS: Check if LaunchAgent is configured
 */
function isAutoStartConfiguredMacOS(): boolean {
	try {
		const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.shipyard.daemon.plist');
		if (!existsSync(plistPath)) {
			return false;
		}

		const output = execSync('launchctl list', { encoding: 'utf-8' });
		return output.includes('com.shipyard.daemon');
	} catch {
		return false;
	}
}

/**
 * Windows: Check if registry entry exists
 */
function isAutoStartConfiguredWindows(): boolean {
	try {
		const output = execSync(
			"powershell -Command \"Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ShipyardDaemon' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ShipyardDaemon\"",
			{ encoding: 'utf-8' }
		);
		return output.trim().length > 0;
	} catch {
		return false;
	}
}

/**
 * Linux: Check if systemd service is enabled
 */
function isAutoStartConfiguredLinux(): boolean {
	try {
		const output = execSync('systemctl --user is-enabled shipyard-daemon.service 2>/dev/null', {
			encoding: 'utf-8',
		});
		return output.trim() === 'enabled';
	} catch {
		return false;
	}
}

/**
 * Checks if auto-start is already configured for the current platform.
 */
export async function isAutoStartConfigured(): Promise<boolean> {
	const platform = process.platform;

	try {
		if (platform === 'darwin') {
			return isAutoStartConfiguredMacOS();
		}
		if (platform === 'win32') {
			return isAutoStartConfiguredWindows();
		}
		if (platform === 'linux') {
			return isAutoStartConfiguredLinux();
		}

		return false;
	} catch (err) {
		logger.error({ err }, 'Failed to check auto-start configuration');
		return false;
	}
}

/**
 * macOS: Remove LaunchAgent
 */
async function removeMacOS(): Promise<void> {
	try {
		const uid = process.getuid?.();

		if (uid !== undefined) {
			try {
				execSync(`launchctl bootout gui/${uid}/com.shipyard.daemon`, {
					stdio: 'ignore',
				});
			} catch {}
		}

		const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.shipyard.daemon.plist');
		if (existsSync(plistPath)) {
			unlinkSync(plistPath);
		}
	} catch (err) {
		logger.error({ err }, 'Failed to remove macOS auto-start');
	}
}

/**
 * Windows: Remove registry entry
 */
async function removeWindows(): Promise<void> {
	try {
		execSync(
			"powershell -Command \"Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ShipyardDaemon' -ErrorAction SilentlyContinue\"",
			{ stdio: 'ignore' }
		);
	} catch (err) {
		logger.error({ err }, 'Failed to remove Windows auto-start');
	}
}

/**
 * Linux: Remove systemd service
 */
async function removeLinux(): Promise<void> {
	try {
		try {
			execSync('systemctl --user stop shipyard-daemon.service', { stdio: 'ignore' });
			execSync('systemctl --user disable shipyard-daemon.service', { stdio: 'ignore' });
		} catch {}

		const servicePath = join(homedir(), '.config', 'systemd', 'user', 'shipyard-daemon.service');
		if (existsSync(servicePath)) {
			unlinkSync(servicePath);
		}

		execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
	} catch (err) {
		logger.error({ err }, 'Failed to remove Linux auto-start');
	}
}

/**
 * Removes OS-level auto-start configuration for the daemon.
 */
export async function removeAutoStart(): Promise<void> {
	const platform = process.platform;

	logger.info({ platform }, 'Removing auto-start');

	try {
		if (platform === 'darwin') {
			await removeMacOS();
		} else if (platform === 'win32') {
			await removeWindows();
		} else if (platform === 'linux') {
			await removeLinux();
		}
	} catch (err) {
		logger.error({ err }, 'Failed to remove auto-start');
	}
}
