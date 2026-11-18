import net from 'node:net';

export function validateJiraSiteUrl(rawUrl: string): { valid: boolean; normalized?: string; error?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Jira Site URL is required.' };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { valid: false, error: 'Invalid Jira Site URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Jira Site URL must use HTTPS.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Jira Site URL must not contain embedded credentials.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    !hostname.includes('.') ||
    net.isIP(hostname) !== 0
  ) {
    return { valid: false, error: 'Invalid Jira Cloud hostname.' };
  }

  return {
    valid: true,
    normalized: `https://${parsed.host}`,
  };
}

export function validateJiraEndpoint(rawEndpoint: string | null): { valid: boolean; clean?: string; error?: string } {
  if (!rawEndpoint) {
    return { valid: false, error: 'Missing Jira REST API endpoint.' };
  }

  const endpoint = rawEndpoint.trim();
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    return { valid: false, error: 'Invalid Jira endpoint path.' };
  }

  if (
    endpoint.includes('://') ||
    endpoint.includes('\\') ||
    endpoint.includes('@') ||
    endpoint.includes('..') ||
    /[\r\n]/.test(endpoint)
  ) {
    return { valid: false, error: 'Invalid characters in Jira endpoint.' };
  }

  return { valid: true, clean: endpoint };
}
