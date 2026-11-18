import { JiraConnectionState, JiraSiteOption, ServerAuthConfig } from '@/types/settings';
import { JiraUser } from '@/types/jira';

const OAUTH_STATE_KEY = 'jira_oauth_csrf_state';

interface SessionApiResponse {
  isConnected: boolean;
  authMode?: 'oauth' | 'api_token';
  siteUrl?: string;
  cloudId?: string;
  user?: JiraUser | null;
  availableSites?: JiraSiteOption[];
  sessionExpired?: boolean;
  error?: string;
}

class JiraAuthService {
  private state: JiraConnectionState = {
    isConnected: false,
    isInitializing: true,
    authMode: 'api_token',
    siteUrl: '',
    cloudId: '',
    user: null,
    availableSites: [],
  };

  private listeners: Array<(state: JiraConnectionState) => void> = [];
  private initPromise: Promise<void> | null = null;
  private sessionEpoch = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPromise = this.restoreSession();
    } else {
      this.state.isInitializing = false;
    }
  }

  private setState(next: JiraConnectionState) {
    if (
      next.isConnected !== this.state.isConnected ||
      next.siteUrl !== this.state.siteUrl ||
      next.cloudId !== this.state.cloudId
    ) {
      this.sessionEpoch++;
    }
    this.state = next;
    this.notify();
  }

  public getSessionEpoch(): number {
    return this.sessionEpoch;
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  public subscribe(callback: (state: JiraConnectionState) => void): () => void {
    this.listeners.push(callback);
    callback({ ...this.state });
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public getState(): JiraConnectionState {
    return { ...this.state };
  }

  public isConnected(): boolean {
    return this.state.isConnected && Boolean(this.state.cloudId || this.state.siteUrl);
  }

  public async waitUntilReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  public async getServerConfig(): Promise<ServerAuthConfig> {
    const res = await fetch('/api/auth/config', {
      method: 'GET',
      credentials: 'same-origin',
    });

    if (!res.ok) {
      throw new Error('Failed to load server authentication configuration.');
    }

    return res.json();
  }

  public async restoreSession(): Promise<void> {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        this.setState({
          isConnected: false,
          isInitializing: false,
          authMode: 'api_token',
          siteUrl: '',
          cloudId: '',
          user: null,
          availableSites: [],
        });
        return;
      }

      const data = (await res.json()) as SessionApiResponse;
      if (data.isConnected && data.user) {
        this.setState({
          isConnected: true,
          isInitializing: false,
          authMode: data.authMode || 'api_token',
          siteUrl: data.siteUrl || '',
          cloudId: data.cloudId || '',
          user: data.user,
          availableSites: data.availableSites || [],
          connectedAt: new Date().toISOString(),
          sessionExpired: false,
        });
      } else {
        this.setState({
          isConnected: false,
          isInitializing: false,
          authMode: 'api_token',
          siteUrl: '',
          cloudId: '',
          user: null,
          availableSites: [],
          sessionExpired: Boolean(data.sessionExpired),
        });
      }
    } catch {
      this.setState({
        isConnected: false,
        isInitializing: false,
        authMode: 'api_token',
        siteUrl: '',
        cloudId: '',
        user: null,
        availableSites: [],
      });
    }
  }

  public async connectWithApiToken(params: {
    siteUrl: string;
    email: string;
    apiToken: string;
  }): Promise<JiraConnectionState> {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl: params.siteUrl.trim(),
        email: params.email.trim(),
        apiToken: params.apiToken.trim(),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as SessionApiResponse;

    if (!res.ok || !data.isConnected || !data.user) {
      throw new Error(data.error || `Connection failed (${res.status})`);
    }

    const nextState: JiraConnectionState = {
      isConnected: true,
      isInitializing: false,
      authMode: 'api_token',
      siteUrl: data.siteUrl || '',
      cloudId: '',
      user: data.user,
      availableSites: [],
      connectedAt: new Date().toISOString(),
      sessionExpired: false,
    };
    this.setState(nextState);
    return nextState;
  }

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
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  public startOAuthRedirect(clientId: string, redirectUri: string): void {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const state = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    window.location.href = this.getOAuthAuthorizeUrl(clientId, redirectUri, state);
  }

  public async completeOAuthCallback(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<JiraConnectionState> {
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    if (!expectedState || expectedState !== params.state) {
      throw new Error('OAuth state verification failed (possible CSRF or stale login tab). Please try connecting again.');
    }

    const res = await fetch('/api/auth/oauth-exchange', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: params.code,
        redirectUri: params.redirectUri,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as SessionApiResponse;
    if (!res.ok || !data.isConnected || !data.user) {
      throw new Error(data.error || `OAuth authorization exchange failed (${res.status})`);
    }

    const nextState: JiraConnectionState = {
      isConnected: true,
      isInitializing: false,
      authMode: 'oauth',
      siteUrl: data.siteUrl || '',
      cloudId: data.cloudId || '',
      user: data.user,
      availableSites: data.availableSites || [],
      connectedAt: new Date().toISOString(),
      sessionExpired: false,
    };
    this.setState(nextState);
    return nextState;
  }

  public async selectOAuthSite(cloudId: string): Promise<JiraConnectionState> {
    const res = await fetch('/api/auth/select-site', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cloudId }),
    });

    const data = (await res.json().catch(() => ({}))) as SessionApiResponse;
    if (!res.ok || !data.isConnected || !data.user) {
      throw new Error(data.error || 'Failed to switch Jira site.');
    }

    const nextState: JiraConnectionState = {
      isConnected: true,
      isInitializing: false,
      authMode: 'oauth',
      siteUrl: data.siteUrl || '',
      cloudId: data.cloudId || '',
      user: data.user,
      availableSites: data.availableSites || [],
      connectedAt: new Date().toISOString(),
      sessionExpired: false,
    };
    this.setState(nextState);
    return nextState;
  }

  public markSessionExpired(): void {
    this.setState({
      isConnected: false,
      isInitializing: false,
      authMode: 'api_token',
      siteUrl: '',
      cloudId: '',
      user: null,
      availableSites: [],
      sessionExpired: true,
    });
  }

  public async disconnect(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Clear local state regardless of network failure
    }

    sessionStorage.removeItem(OAUTH_STATE_KEY);
    this.setState({
      isConnected: false,
      isInitializing: false,
      authMode: 'api_token',
      siteUrl: '',
      cloudId: '',
      user: null,
      availableSites: [],
      connectedAt: undefined,
      sessionExpired: false,
    });
  }
}

export const jiraAuth = new JiraAuthService();
