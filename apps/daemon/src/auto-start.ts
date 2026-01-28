/**
 * Auto-start configuration for Shipyard daemon
 *
 * Sets up OS-level configuration to auto-start the daemon on machine boot.
 * This ensures the daemon survives reboots without MCP needing to respawn it.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Gets the path to the daemon executable (the entry point that should be started)
 */
function getDaemonExecutablePath(): string {
	// In production: /path/to/node_modules/@shipyard/daemon/dist/index.js
	// In development: /path/to/apps/daemon/dist/index.js

	// Try to find the daemon index.js relative to this auto-start module
	// This module will be at: apps/daemon/dist/auto-start.js
	// We want: apps/daemon/dist/index.js
	const currentFile = import.meta.url;
	// Use URL constructor to properly decode the path (handles %20 spaces, etc.)
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

		// Get user ID (only available on POSIX systems)
		const uid = process.getuid?.();
		if (uid === undefined) {
			console.error('Cannot get user ID - process.getuid() not available');
			return false;
		}

		// Create LaunchAgents directory if it doesn't exist
		const launchAgentsDir = dirname(plistPath);
		if (!existsSync(launchAgentsDir)) {
			mkdirSync(launchAgentsDir, { recursive: true });
		}

		// Create plist file
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

		// Load the LaunchAgent (starts it now and on future boots)
		try {
			execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`, {
				stdio: 'ignore',
			});
		} catch (err) {
			// If already loaded, unload and reload
			try {
				execSync(`launchctl bootout gui/${uid}/com.shipyard.daemon`, {
					stdio: 'ignore',
				});
			} catch {
				// Ignore bootout errors (may not be loaded)
			}
			execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`, {
				stdio: 'ignore',
			});
		}

		return true;
	} catch (err) {
		console.error('Failed to set up macOS auto-start:', err);
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

		// Add to Windows startup registry
		const command = `"${nodePath}" "${daemonPath}"`;
		execSync(
			`powershell -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ShipyardDaemon' -Value '${command.replace(/'/g, "''")}'"`
		);

		return true;
	} catch (err) {
		console.error('Failed to set up Windows auto-start:', err);
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

		// Create systemd user directory if it doesn't exist
		if (!existsSync(systemdDir)) {
			mkdirSync(systemdDir, { recursive: true });
		}

		// Create service file
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

		// Reload systemd and enable the service
		execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
		execSync('systemctl --user enable shipyard-daemon.service', { stdio: 'ignore' });
		execSync('systemctl --user start shipyard-daemon.service', { stdio: 'ignore' });

		return true;
	} catch (err) {
		console.error('Failed to set up Linux auto-start:', err);
		return false;
	}
}

/**
 * Sets up OS-level auto-start for the daemon.
 * Returns true if successful, false otherwise.
 */
export async function setupAutoStart(): Promise<boolean> {
	const platform = process.platform;

	console.log(`Setting up auto-start for platform: ${platform}`);

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

		console.warn(`Unsupported platform for auto-start: ${platform}`);
		return false;
	} catch (err) {
		console.error('Failed to set up auto-start:', err);
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

		// Check if service is loaded
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
		console.error('Failed to check auto-start configuration:', err);
		return false;
	}
}

/**
 * macOS: Remove LaunchAgent
 */
async function removeMacOS(): Promise<void> {
	try {
		// Get user ID (only available on POSIX systems)
		const uid = process.getuid?.();

		// Unload the service (only if we can get the uid)
		if (uid !== undefined) {
			try {
				execSync(`launchctl bootout gui/${uid}/com.shipyard.daemon`, {
					stdio: 'ignore',
				});
			} catch {
				// Ignore errors (may not be loaded)
			}
		}

		// Remove plist file
		const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.shipyard.daemon.plist');
		if (existsSync(plistPath)) {
			unlinkSync(plistPath);
		}
	} catch (err) {
		console.error('Failed to remove macOS auto-start:', err);
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
		console.error('Failed to remove Windows auto-start:', err);
	}
}

/**
 * Linux: Remove systemd service
 */
async function removeLinux(): Promise<void> {
	try {
		// Stop and disable the service
		try {
			execSync('systemctl --user stop shipyard-daemon.service', { stdio: 'ignore' });
			execSync('systemctl --user disable shipyard-daemon.service', { stdio: 'ignore' });
		} catch {
			// Ignore errors (may not be running/enabled)
		}

		// Remove service file
		const servicePath = join(homedir(), '.config', 'systemd', 'user', 'shipyard-daemon.service');
		if (existsSync(servicePath)) {
			unlinkSync(servicePath);
		}

		// Reload systemd
		execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
	} catch (err) {
		console.error('Failed to remove Linux auto-start:', err);
	}
}

/**
 * Removes OS-level auto-start configuration for the daemon.
 */
export async function removeAutoStart(): Promise<void> {
	const platform = process.platform;

	console.log(`Removing auto-start for platform: ${platform}`);

	try {
		if (platform === 'darwin') {
			await removeMacOS();
		} else if (platform === 'win32') {
			await removeWindows();
		} else if (platform === 'linux') {
			await removeLinux();
		}
	} catch (err) {
		console.error('Failed to remove auto-start:', err);
	}
}
