import { readJsonBody, sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import { fetchAtlassianAccessibleResources } from '../_lib/jiraOAuth.js';
import { getSessionFromRequest, setSessionCookies } from '../_lib/session.js';

interface SelectSiteBody {
  cloudId?: string;
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session || session.authMode !== 'oauth' || !session.accessToken) {
    sendJson(res, 401, { error: 'Active OAuth session required.' });
    return;
  }

  let body: SelectSiteBody;
  try {
    body = await readJsonBody<SelectSiteBody>(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const targetCloudId = (body.cloudId || '').trim();
  if (!targetCloudId) {
    sendJson(res, 400, { error: 'cloudId is required.' });
    return;
  }

  try {
    const resources = await fetchAtlassianAccessibleResources(session.accessToken);
    const chosen = resources.find((r) => r.id === targetCloudId);
    if (!chosen) {
      sendJson(res, 403, { error: 'Selected Jira Cloud site is not accessible.' });
      return;
    }

    const myselfRes = await fetch(
      `https://api.atlassian.com/ex/jira/${chosen.id}/rest/api/3/myself`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!myselfRes.ok) {
      sendJson(res, myselfRes.status, { error: 'Failed to switch Jira Cloud site.' });
      return;
    }

    const user = await myselfRes.json();
    const cleanUrl = chosen.url.replace(/\/+$/, '');

    setSessionCookies(req, res, {
      ...session,
      cloudId: chosen.id,
      siteUrl: cleanUrl,
    });

    sendJson(res, 200, {
      isConnected: true,
      authMode: 'oauth',
      siteUrl: cleanUrl,
      cloudId: chosen.id,
      user,
      availableSites: resources.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url.replace(/\/+$/, ''),
        avatarUrl: r.avatarUrl,
      })),
    });
  } catch (err: unknown) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Failed to switch site.',
    });
  }
}
