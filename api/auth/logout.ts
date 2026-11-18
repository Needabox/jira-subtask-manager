import { sendJson, type NodeRequest, type NodeResponse } from '../_lib/http.js';
import { clearSessionCookies } from '../_lib/session.js';

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  clearSessionCookies(req, res);
  sendJson(res, 200, { ok: true });
}
