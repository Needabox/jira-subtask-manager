import { describe, it, expect } from 'vitest';
import {
  encryptSessionPayload,
  decryptSessionPayload,
  setSessionCookies,
  getSessionFromRequest,
  clearSessionCookies,
} from '../../api/_lib/session';
import { validateJiraSiteUrl, validateJiraEndpoint } from '../../api/_lib/validation';
import type { NodeRequest, NodeResponse } from '../../api/_lib/http';

describe('Serverless Security: Session Encryption, Cookie Chunking & SSRF Validation', () => {
  const secret = 'test_super_secret_key_for_aes_256_gcm_32_bytes';

  it('encrypts and decrypts session payloads accurately', () => {
    const token = encryptSessionPayload(
      {
        authMode: 'api_token',
        siteUrl: 'https://demo.atlassian.net',
        email: 'dev@demo.com',
        apiToken: 'ATATT3xFfGF0_secret_token',
        sessionExpiresAt: Date.now() + 60_000,
      },
      secret
    );

    expect(token.startsWith('v1.')).toBe(true);
    const decoded = decryptSessionPayload(token, secret);
    expect(decoded).not.toBeNull();
    expect(decoded?.siteUrl).toBe('https://demo.atlassian.net');
    expect(decoded?.apiToken).toBe('ATATT3xFfGF0_secret_token');
  });

  it('rejects tampered tokens or wrong secrets', () => {
    const token = encryptSessionPayload(
      {
        authMode: 'api_token',
        siteUrl: 'https://demo.atlassian.net',
        email: 'dev@demo.com',
        apiToken: 'secret',
        sessionExpiresAt: Date.now() + 60_000,
      },
      secret
    );

    expect(decryptSessionPayload(token, 'wrong_secret_1234567890')).toBeNull();
    expect(decryptSessionPayload(token.slice(0, -2) + 'xx', secret)).toBeNull();
  });

  it('rejects expired session payloads', () => {
    const token = encryptSessionPayload(
      {
        authMode: 'api_token',
        siteUrl: 'https://demo.atlassian.net',
        email: 'dev@demo.com',
        apiToken: 'secret',
        sessionExpiresAt: Date.now() - 1000,
      },
      secret
    );

    expect(decryptSessionPayload(token, secret)).toBeNull();
  });

  it('chunks and reassembles oversized OAuth payloads exceeding 4KB cookie limit', () => {
    const prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = secret;

    try {
      // Simulate a very large uncompressible-like random token (~5000 bytes)
      const largeRandomToken = Array.from({ length: 5000 }, (_, i) =>
        String.fromCharCode(65 + ((i * 37) % 26)) + ((i * 13) % 10)
      ).join('');

      const capturedHeaders: Record<string, string | string[]> = {};
      const mockReq = {
        headers: { 'x-forwarded-proto': 'https' },
      } as unknown as NodeRequest;
      const mockRes = {
        setHeader(name: string, value: string | string[]) {
          capturedHeaders[name] = value;
        },
      } as unknown as NodeResponse;

      setSessionCookies(mockReq, mockRes, {
        authMode: 'oauth',
        siteUrl: 'https://enterprise.atlassian.net',
        cloudId: 'cloud-123',
        accessToken: largeRandomToken,
        refreshToken: largeRandomToken,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      const setCookies = capturedHeaders['Set-Cookie'] as string[];
      expect(Array.isArray(setCookies)).toBe(true);

      // Extract non-empty cookie pairs to simulate browser sending Cookie header back
      const cookiePairs = setCookies
        .map((c) => c.split(';')[0])
        .filter((pair) => !pair.endsWith('='))
        .join('; ');

      const readReq = {
        headers: { cookie: cookiePairs },
      } as unknown as NodeRequest;

      const restored = getSessionFromRequest(readReq);
      expect(restored).not.toBeNull();
      expect(restored?.cloudId).toBe('cloud-123');
      expect(restored?.accessToken).toBe(largeRandomToken);

      // Verify clearSessionCookies clears cookies
      clearSessionCookies(mockReq, mockRes);
      const cleared = capturedHeaders['Set-Cookie'] as string[];
      expect(cleared.every((c) => c.includes('Max-Age=0'))).toBe(true);
    } finally {
      if (prevSecret === undefined) {
        delete process.env.SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET = prevSecret;
      }
    }
  });

  it('validates Jira Site URLs and blocks SSRF targets', () => {
    expect(validateJiraSiteUrl('https://acme.atlassian.net/jira/your-work')).toEqual({
      valid: true,
      normalized: 'https://acme.atlassian.net',
    });
    expect(validateJiraSiteUrl('acme.atlassian.net')).toEqual({
      valid: true,
      normalized: 'https://acme.atlassian.net',
    });

    // Reject insecure or internal SSRF targets
    expect(validateJiraSiteUrl('http://acme.atlassian.net').valid).toBe(false);
    expect(validateJiraSiteUrl('https://localhost:3000').valid).toBe(false);
    expect(validateJiraSiteUrl('https://127.0.0.1').valid).toBe(false);
    expect(validateJiraSiteUrl('https://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(validateJiraSiteUrl('https://user:pass@acme.atlassian.net').valid).toBe(false);
    expect(validateJiraSiteUrl('https://jira.internal').valid).toBe(false);
  });

  it('validates Jira REST endpoints and blocks path traversal / external URLs', () => {
    expect(validateJiraEndpoint('/myself')).toEqual({ valid: true, clean: '/myself' });
    expect(validateJiraEndpoint('/user/assignable/search?project=PROJ&query=a')).toEqual({
      valid: true,
      clean: '/user/assignable/search?project=PROJ&query=a',
    });

    expect(validateJiraEndpoint('//evil.com/steal').valid).toBe(false);
    expect(validateJiraEndpoint('https://evil.com').valid).toBe(false);
    expect(validateJiraEndpoint('/issue/../../etc/passwd').valid).toBe(false);
    expect(validateJiraEndpoint('/issue/@evil.com').valid).toBe(false);
    expect(validateJiraEndpoint(null).valid).toBe(false);
  });
});
