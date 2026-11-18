import { readJsonBody, sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import { getSessionSecret, setSessionCookies } from '../_lib/session.js';
import { validateJiraSiteUrl } from '../_lib/validation.js';

interface TokenLoginBody {
  siteUrl?: string;
  email?: string;
  apiToken?: string;
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

  let body: TokenLoginBody;
  try {
    body = await readJsonBody<TokenLoginBody>(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const siteCheck = validateJiraSiteUrl(body.siteUrl || '');
  if (!siteCheck.valid || !siteCheck.normalized) {
    sendJson(res, 400, { error: siteCheck.error || 'Invalid Jira Site URL.' });
    return;
  }

  const email = (body.email || '').trim();
  const apiToken = (body.apiToken || '').trim();

  if (!email || !apiToken) {
    sendJson(res, 400, { error: 'Atlassian Email and API Token are required.' });
    return;
  }

  // Verify credentials directly against Jira Cloud /myself from server side
  const basicAuth = Buffer.from(`${email}:${apiToken}`, 'utf8').toString('base64');

  try {
    const jiraRes = await fetch(`${siteCheck.normalized}/rest/api/3/myself`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json',
      },
    });

    if (!jiraRes.ok) {
      const errData = (await jiraRes.json().catch(() => ({}))) as {
        message?: string;
        errorMessages?: string[];
      };
      const msg =
        jiraRes.status === 401
          ? 'Invalid Jira email or API token.'
          : jiraRes.status === 403
          ? 'Access denied by Jira. Check your account permissions.'
          : errData.errorMessages?.[0] || errData.message || `Jira returned status ${jiraRes.status}`;

      sendJson(res, jiraRes.status === 401 ? 401 : 400, { error: msg });
      return;
    }

    const user = await jiraRes.json();

    // Encrypt credentials in stateless HttpOnly cookie
    setSessionCookies(req, res, {
      authMode: 'api_token',
      siteUrl: siteCheck.normalized,
      email,
      apiToken,
    });

    sendJson(res, 200, {
      isConnected: true,
      authMode: 'api_token',
      siteUrl: siteCheck.normalized,
      cloudId: '',
      user,
    });
  } catch (err: unknown) {
    sendJson(res, 502, {
      error: err instanceof Error ? `Unable to reach Jira site: ${err.message}` : 'Unable to reach Jira site.',
    });
  }
}
