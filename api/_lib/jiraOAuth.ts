import type { SessionPayload } from './session.js';

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export interface AccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

export function getOAuthCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.JIRA_OAUTH_CLIENT_ID || process.env.VITE_JIRA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JIRA_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken?: string; tokenExpiresAt: number }> {
  const creds = getOAuthCredentials();
  if (!creds) {
    throw new Error('OAuth 2.0 is not configured on the server (JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET missing).');
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<OAuthTokenResponse> & {
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `OAuth token exchange failed (${response.status})`);
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + expiresInSec * 1000,
  };
}

export async function refreshOAuthAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; tokenExpiresAt: number }> {
  const creds = getOAuthCredentials();
  if (!creds) {
    throw new Error('OAuth credentials are missing on the server.');
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<OAuthTokenResponse> & {
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `OAuth token refresh failed (${response.status})`);
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    tokenExpiresAt: Date.now() + expiresInSec * 1000,
  };
}

export async function fetchAtlassianAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch accessible Jira sites (${response.status})`);
  }

  const resources = (await response.json()) as AccessibleResource[];
  return Array.isArray(resources) ? resources : [];
}

export function buildJiraBaseUrlFromSession(session: SessionPayload): string {
  if (session.authMode === 'oauth' && session.cloudId) {
    return `https://api.atlassian.com/ex/jira/${session.cloudId}/rest/api/3`;
  }
  return `${session.siteUrl}/rest/api/3`;
}

export function buildJiraAuthHeaderFromSession(session: SessionPayload): string {
  if (session.authMode === 'oauth' && session.accessToken) {
    return `Bearer ${session.accessToken}`;
  }
  if (session.email && session.apiToken) {
    const basic = Buffer.from(`${session.email}:${session.apiToken}`, 'utf8').toString('base64');
    return `Basic ${basic}`;
  }
  throw new Error('Invalid session credentials');
}
