import {
  getQueryParam,
  readJsonBody,
  sendJson,
  type NodeRequest,
  type NodeResponse,
} from './_lib/http.js';
import {
  buildJiraAuthHeaderFromSession,
  buildJiraBaseUrlFromSession,
  refreshOAuthAccessToken,
} from './_lib/jiraOAuth.js';
import {
  clearSessionCookies,
  getSessionFromRequest,
  setSessionCookies,
  type SessionPayload,
} from './_lib/session.js';
import { validateJiraEndpoint } from './_lib/validation.js';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    sendJson(res, 405, { error: `Method ${method} not allowed` });
    return;
  }

  let session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: 'Not authenticated with Jira. Please connect in Settings.' });
    return;
  }

  const rawEndpoint = getQueryParam(req, 'endpoint');
  const endpointCheck = validateJiraEndpoint(rawEndpoint);
  if (!endpointCheck.valid || !endpointCheck.clean) {
    sendJson(res, 400, { error: endpointCheck.error || 'Invalid Jira endpoint.' });
    return;
  }

  let forwardBody: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    try {
      const parsedBody = await readJsonBody(req);
      if (parsedBody && Object.keys(parsedBody).length > 0) {
        forwardBody = JSON.stringify(parsedBody);
      }
    } catch (err: unknown) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : 'Invalid request payload',
      });
      return;
    }
  }

  let refreshedSession: SessionPayload | null = null;

  // Proactive refresh when OAuth access token expires in < 60s
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
      sendJson(res, 401, { error: 'Jira OAuth session expired. Please reconnect in Settings.' });
      return;
    }
  }

  const forwardToJira = async (sess: SessionPayload): Promise<Response> => {
    const baseUrl = buildJiraBaseUrlFromSession(sess);
    const authHeader = buildJiraAuthHeaderFromSession(sess);
    const targetUrl = `${baseUrl}${endpointCheck.clean}`;

    return fetch(targetUrl, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: forwardBody,
    });
  };

  try {
    let jiraRes = await forwardToJira(session);

    // Retry once on 401 if OAuth refresh token exists
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
        jiraRes = await forwardToJira(session);
      } catch {
        clearSessionCookies(req, res);
        sendJson(res, 401, { error: 'Jira OAuth session expired. Please reconnect in Settings.' });
        return;
      }
    }

    if (jiraRes.status === 401) {
      clearSessionCookies(req, res);
    } else if (refreshedSession) {
      setSessionCookies(req, res, refreshedSession);
    }

    const retryAfter = jiraRes.headers.get('Retry-After');
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
    }

    res.statusCode = jiraRes.status;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (jiraRes.status === 204) {
      res.end();
      return;
    }

    const contentType = jiraRes.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    const textBody = await jiraRes.text();
    res.end(textBody);
  } catch (err: unknown) {
    sendJson(res, 502, {
      error: err instanceof Error ? `Jira proxy request failed: ${err.message}` : 'Jira proxy request failed',
    });
  }
}
