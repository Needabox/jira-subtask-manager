import { sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import { getOAuthCredentials } from '../_lib/jiraOAuth.js';
import { getSessionSecret, isProductionRuntime } from '../_lib/session.js';

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const oauthCreds = getOAuthCredentials();
  const hasSessionSecret = Boolean(getSessionSecret());

  sendJson(res, 200, {
    hasSessionSecret,
    oauthConfigured: Boolean(oauthCreds),
    oauthClientId: oauthCreds?.clientId ?? null,
    isProduction: isProductionRuntime(),
  });
}
