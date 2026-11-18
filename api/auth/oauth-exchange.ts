import { readJsonBody, sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import {
  exchangeCodeForTokens,
  fetchAtlassianAccessibleResources,
  getOAuthCredentials,
} from '../_lib/jiraOAuth.js';
import { getSessionSecret, setSessionCookies } from '../_lib/session.js';

interface OAuthExchangeBody {
  code?: string;
  redirectUri?: string;
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!getSessionSecret()) {
    sendJson(res, 500, {
      error: 'SESSION_SECRET is not configured in Vercel Environment Variables.',
    });
    return;
  }

  if (!getOAuthCredentials()) {
    sendJson(res, 500, {
      error: 'OAuth 2.0 is not configured on the server (JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET missing).',
    });
    return;
  }

  let body: OAuthExchangeBody;
  try {
    body = await readJsonBody<OAuthExchangeBody>(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const code = (body.code || '').trim();
  const redirectUri = (body.redirectUri || '').trim();

  if (!code || !redirectUri) {
    sendJson(res, 400, { error: 'Missing OAuth authorization code or redirectUri.' });
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const resources = await fetchAtlassianAccessibleResources(tokens.accessToken);

    if (resources.length === 0) {
      sendJson(res, 403, { error: 'No accessible Jira Cloud sites found for this Atlassian account.' });
      return;
    }

    const primarySite = resources[0];
    const myselfRes = await fetch(
      `https://api.atlassian.com/ex/jira/${primarySite.id}/rest/api/3/myself`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!myselfRes.ok) {
      sendJson(res, myselfRes.status, {
        error: `Failed to retrieve Jira user profile (${myselfRes.status}).`,
      });
      return;
    }

    const user = await myselfRes.json();

    setSessionCookies(req, res, {
      authMode: 'oauth',
      siteUrl: primarySite.url.replace(/\/+$/, ''),
      cloudId: primarySite.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    });

    sendJson(res, 200, {
      isConnected: true,
      authMode: 'oauth',
      siteUrl: primarySite.url.replace(/\/+$/, ''),
      cloudId: primarySite.id,
      user,
      availableSites: resources.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url.replace(/\/+$/, ''),
        avatarUrl: r.avatarUrl,
      })),
    });
  } catch (err: unknown) {
    sendJson(res, 400, {
      error: err instanceof Error ? err.message : 'OAuth exchange failed.',
    });
  }
}
