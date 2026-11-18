import type { IncomingMessage, ServerResponse } from 'node:http';

export type NodeRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type NodeResponse = ServerResponse;

export function sendJson(res: NodeResponse, status: number, data: unknown, extraHeaders?: Record<string, string | string[]>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  }

  res.end(JSON.stringify(data));
}

export async function readJsonBody<T = Record<string, unknown>>(req: NodeRequest): Promise<T> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body) as T;
    }
    return req.body as T;
  }

  const MAX_BYTES = 1024 * 1024; // 1 MB limit for auth/jira API payloads
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BYTES) {
      throw new Error('Request payload too large');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

export function getQueryParam(req: NodeRequest, key: string): string | null {
  if (req.query && req.query[key] !== undefined) {
    const val = req.query[key];
    return Array.isArray(val) ? val[0] ?? null : val;
  }

  const urlStr = req.url || '/';
  const parsed = new URL(urlStr, 'http://localhost');
  return parsed.searchParams.get(key);
}

export function isHttpsRequest(req: NodeRequest): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  if (process.env.VERCEL === '1') {
    return true;
  }
  return false;
}
