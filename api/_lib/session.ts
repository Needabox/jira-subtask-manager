import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { isHttpsRequest, type NodeRequest, type NodeResponse } from './http.js';

export const SESSION_COOKIE_NAME = 'jira_session';
const MAX_CHUNK_LENGTH = 3500;
const MAX_CHUNK_COUNT = 8;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours server-side hard cap

export interface SessionPayload {
  authMode: 'oauth' | 'api_token';
  siteUrl: string;
  cloudId?: string;
  email?: string;
  apiToken?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  sessionExpiresAt: number;
}

const globalDevSecretHolder = globalThis as unknown as {
  __JIRA_DEV_SESSION_SECRET__?: string;
};

export function isProductionRuntime(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

export function getSessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }

  if (isProductionRuntime()) {
    return null;
  }

  // Ephemeral random secret strictly for local non-production Vite dev server
  if (!globalDevSecretHolder.__JIRA_DEV_SESSION_SECRET__) {
    globalDevSecretHolder.__JIRA_DEV_SESSION_SECRET__ = crypto.randomBytes(32).toString('hex');
  }
  return globalDevSecretHolder.__JIRA_DEV_SESSION_SECRET__;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSessionPayload(payload: SessionPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const compressed = zlib.deflateRawSync(Buffer.from(json, 'utf8'));
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSessionPayload(token: string, secret: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      return null;
    }

    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const encrypted = Buffer.from(parts[3], 'base64url');

    if (iv.length !== 12 || authTag.length !== 16) {
      return null;
    }

    const key = deriveKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const json = zlib.inflateRawSync(compressed).toString('utf8');
    const parsed = JSON.parse(json) as SessionPayload;

    if (!parsed || typeof parsed.sessionExpiresAt !== 'number') {
      return null;
    }

    if (Date.now() > parsed.sessionExpiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = pair.slice(0, eqIndex).trim();
    const val = pair.slice(eqIndex + 1).trim();
    try {
      result[name] = decodeURIComponent(val);
    } catch {
      result[name] = val;
    }
  }
  return result;
}

export function getSessionFromRequest(req: NodeRequest): SessionPayload | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const cookies = parseCookies(req.headers.cookie);

  let rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    // Reassemble chunked cookies if present
    const chunks: string[] = [];
    for (let i = 0; i < MAX_CHUNK_COUNT; i++) {
      const chunk = cookies[`${SESSION_COOKIE_NAME}.${i}`];
      if (!chunk) break;
      chunks.push(chunk);
    }
    if (chunks.length > 0) {
      rawToken = chunks.join('');
    }
  }

  if (!rawToken) return null;
  return decryptSessionPayload(rawToken, secret);
}

function formatCookieAttributes(isSecure: boolean, maxAge?: number): string {
  const attrs = ['HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (isSecure) {
    attrs.push('Secure');
  }
  if (typeof maxAge === 'number') {
    attrs.push(`Max-Age=${maxAge}`);
  }
  return attrs.join('; ');
}

export function setSessionCookies(
  req: NodeRequest,
  res: NodeResponse,
  payloadInput: Omit<SessionPayload, 'sessionExpiresAt'> & { sessionExpiresAt?: number }
): void {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured in environment variables.');
  }

  const payload: SessionPayload = {
    ...payloadInput,
    sessionExpiresAt: payloadInput.sessionExpiresAt ?? Date.now() + SESSION_TTL_MS,
  };

  const encrypted = encryptSessionPayload(payload, secret);
  const isSecure = isHttpsRequest(req);
  const attrs = formatCookieAttributes(isSecure);
  const clearAttrs = formatCookieAttributes(isSecure, 0);

  const setCookies: string[] = [];

  if (encrypted.length <= MAX_CHUNK_LENGTH) {
    setCookies.push(`${SESSION_COOKIE_NAME}=${encodeURIComponent(encrypted)}; ${attrs}`);
    // Clear any stale chunks from previous sessions
    for (let i = 0; i < MAX_CHUNK_COUNT; i++) {
      setCookies.push(`${SESSION_COOKIE_NAME}.${i}=; ${clearAttrs}`);
    }
  } else {
    // Clear main single cookie
    setCookies.push(`${SESSION_COOKIE_NAME}=; ${clearAttrs}`);
    const totalChunks = Math.ceil(encrypted.length / MAX_CHUNK_LENGTH);
    for (let i = 0; i < MAX_CHUNK_COUNT; i++) {
      if (i < totalChunks) {
        const chunk = encrypted.slice(i * MAX_CHUNK_LENGTH, (i + 1) * MAX_CHUNK_LENGTH);
        setCookies.push(`${SESSION_COOKIE_NAME}.${i}=${encodeURIComponent(chunk)}; ${attrs}`);
      } else {
        setCookies.push(`${SESSION_COOKIE_NAME}.${i}=; ${clearAttrs}`);
      }
    }
  }

  res.setHeader('Set-Cookie', setCookies);
}

export function clearSessionCookies(req: NodeRequest, res: NodeResponse): void {
  const isSecure = isHttpsRequest(req);
  const clearAttrs = formatCookieAttributes(isSecure, 0);
  const setCookies: string[] = [`${SESSION_COOKIE_NAME}=; ${clearAttrs}`];
  for (let i = 0; i < MAX_CHUNK_COUNT; i++) {
    setCookies.push(`${SESSION_COOKIE_NAME}.${i}=; ${clearAttrs}`);
  }
  res.setHeader('Set-Cookie', setCookies);
}
