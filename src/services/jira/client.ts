import { jiraAuth } from './auth';

export class JiraApiError extends Error {
  public status: number;
  public errorMessages: string[];
  public errors: Record<string, string>;

  constructor(status: number, message: string, errorMessages: string[] = [], errors: Record<string, string> = {}) {
    super(message);
    this.name = 'JiraApiError';
    this.status = status;
    this.errorMessages = errorMessages;
    this.errors = errors;
  }
}

interface RequestOptions extends RequestInit {
  retryCount?: number;
  maxRetries?: number;
}

export class JiraHttpClient {
  private static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static getBaseUrl(): string {
    const state = jiraAuth.getState();
    if (state.authMode === 'oauth' && state.cloudId) {
      return `https://api.atlassian.com/ex/jira/${state.cloudId}/rest/api/3`;
    }
    // API Token Mode
    if (state.cloudId) {
      return `https://api.atlassian.com/ex/jira/${state.cloudId}/rest/api/3`;
    }
    return `${state.siteUrl}/rest/api/3`;
  }

  private static getHeaders(): HeadersInit {
    const state = jiraAuth.getState();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (state.authMode === 'oauth' && state.accessToken) {
      headers['Authorization'] = `Bearer ${state.accessToken}`;
    } else if (state.email && state.apiToken) {
      // Basic auth
      const basic = btoa(`${state.email}:${state.apiToken}`);
      headers['Authorization'] = `Basic ${basic}`;
    }

    return headers;
  }

  public static async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { retryCount = 0, maxRetries = 3, ...fetchOptions } = options;

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers = {
      ...this.getHeaders(),
      ...(fetchOptions.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // Handle Rate Limiting (429) & Transient Server Errors (503, 504)
      if ((response.status === 429 || response.status === 503 || response.status === 504) && retryCount < maxRetries) {
        // Read Retry-After header if present, otherwise exponential backoff: (2^retry * 1000) + jitter
        const retryAfterHeader = response.headers.get('Retry-After');
        let delayMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : Math.pow(2, retryCount) * 1000 + Math.random() * 500;
        if (isNaN(delayMs) || delayMs <= 0) delayMs = 1500;

        await this.sleep(delayMs);
        return this.request<T>(endpoint, {
          ...options,
          retryCount: retryCount + 1,
        });
      }

      if (!response.ok) {
        let errorData: { errorMessages?: string[]; errors?: Record<string, string>; message?: string } = {};
        try {
          errorData = await response.json();
        } catch {
          // Response body was not JSON
        }

        const msg =
          errorData.errorMessages?.[0] ||
          (errorData.errors ? Object.values(errorData.errors)[0] : undefined) ||
          errorData.message ||
          `Jira API Request failed with status ${response.status}`;

        throw new JiraApiError(
          response.status,
          msg,
          errorData.errorMessages || [],
          errorData.errors || {}
        );
      }

      // 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof JiraApiError) {
        throw err;
      }

      // Check if transient network error and can retry
      if (retryCount < maxRetries && err instanceof TypeError && err.message.includes('fetch')) {
        await this.sleep(Math.pow(2, retryCount) * 1000);
        return this.request<T>(endpoint, {
          ...options,
          retryCount: retryCount + 1,
        });
      }

      throw new JiraApiError(
        0,
        err instanceof Error ? err.message : 'Network error or unable to connect to Jira'
      );
    }
  }

  public static get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public static post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public static put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
