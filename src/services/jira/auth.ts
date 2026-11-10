import { JiraConnectionState } from '@/types/settings';
import { JiraAccessibleResource, JiraUser } from '@/types/jira';

// Store credentials only in memory/sessionStorage during active session.
// NEVER in localStorage or console logs.
const SESSION_AUTH_KEY = 'jira_active_session_auth';

class JiraAuthService {
  private state: JiraConnectionState = {
    isConnected: false,
    authMode: 'api_token',
    siteUrl: '',
    cloudId: '',
    user: null,
  };

  private listeners: Array<(state: JiraConnectionState) => void> = [];

  constructor() {
    this.loadFromSession();
  }

  private loadFromSession() {
    try {
      const saved = sessionStorage.getItem(SESSION_AUTH_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = {
          ...parsed,
          isConnected: Boolean(parsed.siteUrl && (parsed.accessToken || parsed.apiToken)),
        };
      }
    } catch {
      // In case sessionStorage is unavailable or corrupt
    }
  }

  private persistSession() {
    try {
      sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore
    }
    this.notify();
  }

  public subscribe(callback: (state: JiraConnectionState) => void): () => void {
    this.listeners.push(callback);
    callback(this.state);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  public getState(): JiraConnectionState {
    return { ...this.state };
  }

  public isConnected(): boolean {
    return this.state.isConnected && Boolean(this.state.cloudId || this.state.siteUrl);
  }

  public setApiTokenConnection(params: {
    siteUrl: string;
    email: string;
    apiToken: string;
    cloudId?: string;
    user: JiraUser;
  }) {
    // Normalize siteUrl
    let cleanUrl = params.siteUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    this.state = {
      isConnected: true,
      authMode: 'api_token',
      siteUrl: cleanUrl,
      cloudId: params.cloudId || '',
      user: params.user,
      email: params.email.trim(),
      apiToken: params.apiToken.trim(),
      connectedAt: new Date().toISOString(),
    };
    this.persistSession();
  }

  public setOAuthConnection(params: {
    siteUrl: string;
    cloudId: string;
    accessToken: string;
    user: JiraUser;
  }) {
    this.state = {
      isConnected: true,
      authMode: 'oauth',
      siteUrl: params.siteUrl,
      cloudId: params.cloudId,
      user: params.user,
      accessToken: params.accessToken,
      connectedAt: new Date().toISOString(),
    };
    this.persistSession();
  }

  public disconnect() {
    this.state = {
      isConnected: false,
      authMode: 'api_token',
      siteUrl: '',
      cloudId: '',
      user: null,
      accessToken: undefined,
      apiToken: undefined,
      email: undefined,
      connectedAt: undefined,
    };
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    this.notify();
  }

  /**
   * Generates standard Atlassian OAuth 2.0 (3LO) authorization URL
   */
  public getOAuthAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
    const scopes = [
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'read:me',
      'offline_access',
    ].join(' ');

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      prompt: 'consent',
    });

    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  /**
   * Fetches accessible cloud sites for OAuth token
   */
  public async fetchAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
    const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve Jira Cloud resources: ${response.statusText}`);
    }

    return response.json();
  }
}

export const jiraAuth = new JiraAuthService();
