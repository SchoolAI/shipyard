const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export class SlowDownError extends Error {
  constructor() {
    super('slow_down');
    this.name = 'SlowDownError';
  }
}

export class ExpiredTokenError extends Error {
  constructor() {
    super('Device code has expired. Please restart the authentication flow.');
    this.name = 'ExpiredTokenError';
  }
}

export class AccessDeniedError extends Error {
  constructor() {
    super('GitHub authentication was denied. Please try again.');
    this.name = 'AccessDeniedError';
  }
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start device flow: ${response.status}`);
  }

  return response.json();
}

export async function pollForToken(deviceCode: string): Promise<AccessTokenResponse | null> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to poll for token: ${response.status}`);
  }

  const data = await response.json();

  if (data.error === 'authorization_pending') {
    return null;
  }

  if (data.error === 'slow_down') {
    throw new SlowDownError();
  }

  if (data.error === 'expired_token') {
    throw new ExpiredTokenError();
  }

  if (data.error === 'access_denied') {
    throw new AccessDeniedError();
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data;
}

export async function getGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token is invalid or has been revoked');
    }
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  return response.json();
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await getGitHubUser(token);
    return true;
  } catch {
    return false;
  }
}
