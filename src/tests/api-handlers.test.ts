import { describe, it, expect } from 'vitest';
import configHandler from '../../api/auth/config';
import sessionHandler from '../../api/auth/session';
import logoutHandler from '../../api/auth/logout';
import jiraProxyHandler from '../../api/jira';
import { encryptSessionPayload } from '../../api/_lib/session';
import type { NodeRequest, NodeResponse } from '../../api/_lib/http';

function createMockRes() {
  const headers: Record<string, string | string[]> = {};
  let body = '';
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | string[]) {
      headers[name] = value;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
    },
  } as unknown as NodeResponse;

  return {
    res,
    getResult: () => ({
      status: res.statusCode,
      headers,
      json: body ? JSON.parse(body) : null,
      rawBody: body,
    }),
  };
}

describe('Vercel Serverless API Handlers', () => {
  it('GET /api/auth/config returns capability flags without exposing secrets', async () => {
    const prevClientId = process.env.JIRA_OAUTH_CLIENT_ID;
    const prevClientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
    process.env.JIRA_OAUTH_CLIENT_ID = 'pub_client_123';
    process.env.JIRA_OAUTH_CLIENT_SECRET = 'super_secret_should_never_leak';

    try {
      const req = { method: 'GET', headers: {} } as unknown as NodeRequest;
      const { res, getResult } = createMockRes();

      await configHandler(req, res);
      const result = getResult();

      expect(result.status).toBe(200);
      expect(result.json.oauthConfigured).toBe(true);
      expect(result.json.oauthClientId).toBe('pub_client_123');
      expect(result.rawBody).not.toContain('super_secret_should_never_leak');
      expect(result.headers['Cache-Control']).toContain('no-store');
    } finally {
      if (prevClientId === undefined) delete process.env.JIRA_OAUTH_CLIENT_ID;
      else process.env.JIRA_OAUTH_CLIENT_ID = prevClientId;

      if (prevClientSecret === undefined) delete process.env.JIRA_OAUTH_CLIENT_SECRET;
      else process.env.JIRA_OAUTH_CLIENT_SECRET = prevClientSecret;
    }
  });

  it('GET /api/auth/session returns isConnected: false when no cookie exists', async () => {
    const req = { method: 'GET', headers: {} } as unknown as NodeRequest;
    const { res, getResult } = createMockRes();

    await sessionHandler(req, res);
    const result = getResult();

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ isConnected: false });
  });

  it('POST /api/auth/logout clears session cookies', async () => {
    const req = { method: 'POST', headers: {} } as unknown as NodeRequest;
    const { res, getResult } = createMockRes();

    await logoutHandler(req, res);
    const result = getResult();

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });
    expect(Array.isArray(result.headers['Set-Cookie'])).toBe(true);
    expect((result.headers['Set-Cookie'] as string[])[0]).toContain('Max-Age=0');
  });

  it('/api/jira rejects unauthenticated requests with 401', async () => {
    const req = {
      method: 'GET',
      url: '/api/jira?endpoint=%2Fmyself',
      headers: {},
    } as unknown as NodeRequest;
    const { res, getResult } = createMockRes();

    await jiraProxyHandler(req, res);
    const result = getResult();

    expect(result.status).toBe(401);
  });

  it('/api/jira rejects SSRF / invalid endpoint even with valid session cookie', async () => {
    const prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test_secret_at_least_32_characters_long';

    try {
      const encrypted = encryptSessionPayload(
        {
          authMode: 'api_token',
          siteUrl: 'https://demo.atlassian.net',
          email: 'user@demo.com',
          apiToken: 'token123',
          sessionExpiresAt: Date.now() + 60_000,
        },
        process.env.SESSION_SECRET
      );

      const req = {
        method: 'GET',
        url: '/api/jira?endpoint=' + encodeURIComponent('//evil.com/steal'),
        headers: {
          cookie: `jira_session=${encodeURIComponent(encrypted)}`,
        },
      } as unknown as NodeRequest;
      const { res, getResult } = createMockRes();

      await jiraProxyHandler(req, res);
      const result = getResult();

      expect(result.status).toBe(400);
      expect(result.json.error).toContain('Invalid Jira endpoint');
    } finally {
      if (prevSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSecret;
    }
  });
});
