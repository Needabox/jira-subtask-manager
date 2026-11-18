import { sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import {
  buildJiraAuthHeaderFromSession,
  buildJiraBaseUrlFromSession,
  fetchAtlassianAccessibleResources,
  refreshOAuthAccessToken,
  type AccessibleResource,
} from '../_lib/jiraOAuth.js';
import {
  clearSessionCookies,
  getSessionFromRequest,
  setSessionCookies,
  type SessionPayload,
} from '../_lib/session.js';

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 200, { isConnected: false });
    return;
  }

  let refreshedSession: SessionPayload | null = null;

  // Proactive OAuth token refresh if near expiry (< 60s)
  if (
    session.authMode === 'oauth' &&
    session.refreshToken &&
    session.tokenExpiresAt &&
    session.tokenExpiresAt - Date.now() < 60_000
  ) {
    try {
      const refreshed = await refreshOAuthAccessToken(session.refreshToken);
      refreshedSession = {
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
      };
      session = refreshedSession;
    } catch {
      clearSessionCookies(req, res);
      sendJson(res, 200, { isConnected: false, sessionExpired: true });
      return;
    }
  }

  const fetchMyself = async (sess: SessionPayload) => {
    const baseUrl = buildJiraBaseUrlFromSession(sess);
    const authHeader = buildJiraAuthHeaderFromSession(sess);
    return fetch(`${baseUrl}/myself`, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });
  };

  try {
    let jiraRes = await fetchMyself(session);

    // Retry once with OAuth refresh if 401
    if (jiraRes.status === 401 && session.authMode === 'oauth' && session.refreshToken) {
      try {
        const refreshed = await refreshOAuthAccessToken(session.refreshToken);
        refreshedSession = {
          ...session,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt: refreshed.tokenExpiresAt,
        };
        session = refreshedSession;
        jiraRes = await fetchMyself(session);
      } catch {
        clearSessionCookies(req, res);
        sendJson(res, 200, { isConnected: false, sessionExpired: true });
        return;
      }
    }

    if (jiraRes.status === 401 || jiraRes.status === 403) {
      clearSessionCookies(req, res);
      sendJson(res, 200, { isConnected: false, sessionExpired: true });
      return;
    }

    if (!jiraRes.ok) {
      sendJson(res, 200, { isConnected: false });
      return;
    }

    if (refreshedSession) {
      setSessionCookies(req, res, refreshedSession);
    }

    const user = await jiraRes.json();

    let availableSites: Array<{ id: string; name: string; url: string; avatarUrl?: string }> = [];
    if (session.authMode === 'oauth' && session.accessToken) {
      try {
        const resources: AccessibleResource[] = await fetchAtlassianAccessibleResources(session.accessToken);
        availableSites = resources.map((r) => ({
          id: r.id,
          name: r.name,
          url: r.url.replace(/\/+$/, ''),
          avatarUrl: r.avatarUrl,
        }));
      } catch {
        // Non-fatal
      }
    }

    sendJson(res, 200, {
      isConnected: true,
      authMode: session.authMode,
      siteUrl: session.siteUrl,
      cloudId: session.cloudId || '',
      user,
      availableSites,
    });
  } catch {
    sendJson(res, 200, { isConnected: false });
  }
}
