import {
  loadEnv,
  logger
} from "./chunk-GSGLHRWX.js";

// src/server-identity.ts
import { execSync as execSync2 } from "child_process";

// src/config/env/github.ts
import { execSync } from "child_process";
import { z } from "zod";
function getTokenFromGhCli() {
  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
      // Suppress stderr
    }).trim();
    if (token) {
      return token;
    }
  } catch {
  }
  return null;
}
var schema = z.object({
  GITHUB_USERNAME: z.string().optional(),
  GITHUB_TOKEN: z.string().optional().transform((val) => val || getTokenFromGhCli() || null),
  SHIPYARD_ARTIFACTS: z.string().optional().transform((val) => {
    if (!val) return true;
    const setting = val.toLowerCase();
    return setting !== "disabled" && setting !== "false" && setting !== "0";
  })
});
var githubConfig = loadEnv(schema);

// src/server-identity.ts
var cachedUsername = null;
var usernameResolved = false;
var cachedRepoName = null;
function getRepositoryFullName() {
  if (cachedRepoName !== null) {
    return cachedRepoName || null;
  }
  try {
    const repoName = execSync2("gh repo view --json nameWithOwner --jq .nameWithOwner", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (!repoName) {
      cachedRepoName = "";
      return null;
    }
    cachedRepoName = repoName;
    return cachedRepoName;
  } catch {
    cachedRepoName = "";
    return null;
  }
}
async function getGitHubUsername() {
  if (usernameResolved && cachedUsername) {
    return cachedUsername;
  }
  if (githubConfig.GITHUB_USERNAME) {
    cachedUsername = githubConfig.GITHUB_USERNAME;
    usernameResolved = true;
    logger.info({ username: cachedUsername }, "Using GITHUB_USERNAME from env");
    return cachedUsername;
  }
  if (githubConfig.GITHUB_TOKEN) {
    const username = await getUsernameFromToken(githubConfig.GITHUB_TOKEN);
    if (username) {
      cachedUsername = username;
      usernameResolved = true;
      logger.info({ username }, "Resolved username from GITHUB_TOKEN via API");
      return cachedUsername;
    }
  }
  const cliUsername = getUsernameFromCLI();
  if (cliUsername) {
    cachedUsername = cliUsername;
    usernameResolved = true;
    logger.info({ username: cliUsername }, "Resolved username from gh CLI");
    return cachedUsername;
  }
  const gitUsername = getUsernameFromGitConfig();
  if (gitUsername) {
    cachedUsername = gitUsername;
    usernameResolved = true;
    logger.warn({ username: gitUsername }, "Using git config user.name (UNVERIFIED)");
    return cachedUsername;
  }
  const osUsername = process.env.USER || process.env.USERNAME;
  if (osUsername) {
    cachedUsername = osUsername.replace(/[^a-zA-Z0-9_-]/g, "_");
    usernameResolved = true;
    logger.warn(
      { username: cachedUsername, original: osUsername },
      "Using sanitized OS username (UNVERIFIED)"
    );
    return cachedUsername;
  }
  usernameResolved = true;
  throw new Error(
    'GitHub username required but could not be determined.\n\nConfigure ONE of:\n1. GITHUB_USERNAME=your-username (explicit)\n2. GITHUB_TOKEN=ghp_xxx (will fetch from API)\n3. gh auth login (uses CLI)\n4. git config --global user.name "your-username"\n5. Set USER or USERNAME environment variable\n\nFor remote agents: Use option 1 or 2'
  );
}
async function getUsernameFromToken(token) {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "shipyard-mcp-server"
      },
      signal: AbortSignal.timeout(5e3)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user.login || null;
  } catch (error) {
    logger.debug({ error }, "GitHub API failed");
    return null;
  }
}
function getUsernameFromCLI() {
  try {
    const username = execSync2("gh api user --jq .login", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return username || null;
  } catch {
    return null;
  }
}
function getUsernameFromGitConfig() {
  try {
    const username = execSync2("git config user.name", {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return username || null;
  } catch {
    return null;
  }
}

export {
  githubConfig,
  getRepositoryFullName,
  getGitHubUsername
};
