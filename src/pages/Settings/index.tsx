import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { jiraAuth } from '@/services/jira/auth';
import { jiraFields } from '@/services/jira/fields';
import { settingsRepo } from '@/services/storage/settingsRepo';
import { AppSettings, DEFAULT_SETTINGS, ServerAuthConfig } from '@/types/settings';
import { JiraField } from '@/types/jira';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sliders,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Save,
  Globe,
  Loader2,
  Lock,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    isConnected,
    isInitializing,
    user,
    siteUrl,
    cloudId,
    authMode,
    availableSites,
    sessionExpired,
    disconnect,
  } = useJiraAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Server capability config
  const [serverConfig, setServerConfig] = useState<ServerAuthConfig | null>(null);

  // App Settings state
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // Field candidates for Start Date
  const [availableFields, setAvailableFields] = useState<JiraField[]>([]);
  const [isScanningFields, setIsScanningFields] = useState(false);

  // Connection Form State (submitted directly to server proxy, never saved in browser storage)
  const [siteInput, setSiteInput] = useState(siteUrl || '');
  const [emailInput, setEmailInput] = useState('');
  const [apiTokenInput, setApiTokenInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingSite, setIsSwitchingSite] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // OAuth callback guard (prevents React StrictMode double invocation on single-use code)
  const handledOAuthCodeRef = useRef<string | null>(null);
  const oauthRedirectUri = `${window.location.origin}/settings`;

  // Load server config & stored settings on mount
  useEffect(() => {
    jiraAuth
      .getServerConfig()
      .then(setServerConfig)
      .catch(() => setServerConfig(null));

    settingsRepo.getSettings().then((s) => {
      setSettings(s);
    });
  }, []);

  // Handle Atlassian OAuth 2.0 (3LO) callback parameters (?code=...&state=...)
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');
    const oauthErrorDesc = searchParams.get('error_description');

    if (oauthError) {
      setConnectionError(oauthErrorDesc || `Atlassian authorization failed: ${oauthError}`);
      setSearchParams({}, { replace: true });
      return;
    }

    if (code && state) {
      if (handledOAuthCodeRef.current === code) {
        return;
      }
      handledOAuthCodeRef.current = code;

      setIsConnecting(true);
      setConnectionError(null);
      setSearchParams({}, { replace: true });

      jiraAuth
        .completeOAuthCallback({
          code,
          state,
          redirectUri: oauthRedirectUri,
        })
        .then(() => {
          setIsConnecting(false);
        })
        .catch((err: unknown) => {
          setConnectionError(
            err instanceof Error ? err.message : 'OAuth login verification failed.'
          );
          setIsConnecting(false);
        });
    }
  }, [searchParams, setSearchParams, oauthRedirectUri]);

  // Scan fields when connected
  useEffect(() => {
    if (isConnected) {
      setIsScanningFields(true);
      jiraFields
        .getAllFields()
        .then((fields) => {
          setAvailableFields(fields);
          setIsScanningFields(false);
        })
        .catch(() => {
          setIsScanningFields(false);
        });
    } else {
      setAvailableFields([]);
    }
  }, [isConnected, cloudId, siteUrl]);

  // Handle API Token connection via server-side encrypted HttpOnly cookie
  const handleConnectApiToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteInput.trim() || !emailInput.trim() || !apiTokenInput.trim()) {
      setConnectionError('All fields (Site URL, Email, API Token) are required.');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      await jiraAuth.connectWithApiToken({
        siteUrl: siteInput.trim(),
        email: emailInput.trim(),
        apiToken: apiTokenInput.trim(),
      });

      // Clear sensitive input immediately from React memory
      setApiTokenInput('');
      setEmailInput('');
      setIsConnecting(false);
    } catch (err: unknown) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Failed to connect. Please check your Jira Site URL, Email, and API Token.'
      );
      setIsConnecting(false);
    }
  };

  // Switch Jira site for multi-site OAuth accounts
  const handleSiteChange = async (newCloudId: string) => {
    if (!newCloudId || newCloudId === cloudId) return;
    setIsSwitchingSite(true);
    setConnectionError(null);
    try {
      await jiraAuth.selectOAuthSite(newCloudId);
      jiraFields.clearCache();
    } catch (err: unknown) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to switch Jira site.');
    } finally {
      setIsSwitchingSite(false);
    }
  };

  // Handle Save App Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await settingsRepo.saveSettings(settings);
      setSettingsSavedSuccess(true);
      setTimeout(() => setSettingsSavedSuccess(false), 3000);
    } catch (e) {
      alert('Failed to save settings: ' + String(e));
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Auto-detect Start Date Field
  const handleAutoDetectStartDate = async () => {
    setIsScanningFields(true);
    try {
      const res = await jiraFields.resolveStartDateField();
      if (res.fieldId) {
        setSettings((prev) => ({
          ...prev,
          startDateCustomFieldId: res.fieldId || '',
          startDateCustomFieldName: res.fieldName || '',
        }));
      } else {
        alert('Could not automatically determine Start Date field. Please select one manually from the list.');
      }
    } finally {
      setIsScanningFields(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings & Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Jira Cloud connection, field mappings, and bulk import execution parameters.
        </p>
      </div>

      {/* Warning if deployed in production without SESSION_SECRET */}
      {serverConfig && !serverConfig.hasSessionSecret && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Server Environment Configuration Required</AlertTitle>
          <AlertDescription className="text-xs space-y-1 mt-1">
            <p>
              <code className="font-mono bg-destructive/15 px-1 rounded">SESSION_SECRET</code> is not configured in
              Vercel Environment Variables. Encrypted <code className="font-mono">HttpOnly</code> session cookies cannot be
              issued until it is added.
            </p>
            <p className="text-muted-foreground">
              Add <code className="font-mono">SESSION_SECRET</code> (at least 32 random characters, e.g. from{' '}
              <code className="font-mono">openssl rand -hex 32</code>) in Vercel Project Settings → Environment Variables,
              then redeploy.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {sessionExpired && !isConnected && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Jira Session Expired or Revoked</AlertTitle>
          <AlertDescription className="text-xs">
            Your Jira session is no longer valid. Please reconnect below to continue importing or viewing tasks.
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Jira Connection Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Jira Cloud Connection</CardTitle>
            </div>
            <Badge
              variant={isInitializing ? 'outline' : isConnected ? 'success' : 'destructive'}
              className="gap-1.5 py-1 px-2.5"
            >
              {isInitializing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : isConnected ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Connected ({authMode.toUpperCase()})</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  <span>Disconnected</span>
                </>
              )}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            All Jira requests route through a stateless same-origin serverless proxy using AES-256-GCM encrypted{' '}
            <code className="font-mono">HttpOnly</code> cookies. Tokens are never readable by client JavaScript or stored in{' '}
            <code className="font-mono">localStorage</code> / <code className="font-mono">sessionStorage</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConnecting && !isConnected ? (
            <div className="p-8 text-center space-y-3 border rounded-xl bg-muted/20">
              <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
              <div className="text-sm font-medium">Completing secure Jira authentication...</div>
              <p className="text-xs text-muted-foreground">
                Verifying credentials and establishing encrypted HttpOnly session.
              </p>
            </div>
          ) : isConnected && user ? (
            <div className="space-y-4">
              {connectionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="text-xs">{connectionError}</AlertDescription>
                </Alert>
              )}

              <div className="p-4 rounded-xl border bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {user.avatarUrls?.['48x48'] ? (
                    <img
                      src={user.avatarUrls['48x48']}
                      alt={user.displayName}
                      className="h-12 w-12 rounded-full border border-border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-base">
                      {user.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold text-sm">{user.displayName}</h4>
                    <p className="text-xs text-muted-foreground">{user.emailAddress || 'No email shared'}</p>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      Account ID: {user.accountId}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect()}
                    className="text-xs gap-1.5 text-destructive hover:text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Disconnect</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border bg-card space-y-1.5">
                  <span className="text-muted-foreground block text-[11px]">Jira Cloud Site</span>
                  {authMode === 'oauth' && availableSites && availableSites.length > 1 ? (
                    <Select
                      value={cloudId}
                      disabled={isSwitchingSite}
                      onChange={(e) => handleSiteChange(e.target.value)}
                      className="text-xs h-8"
                    >
                      {availableSites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.url.replace(/^https?:\/\//, '')})
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="font-semibold font-mono text-primary block truncate">{siteUrl}</span>
                  )}
                </div>

                <div className="p-3 rounded-lg border bg-card">
                  <span className="text-muted-foreground block text-[11px]">Session Security</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Encrypted HttpOnly Cookie (Zero Browser Token Exposure)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Tabs defaultValue={serverConfig?.oauthConfigured ? 'oauth' : 'api_token'}>
              <TabsList className="mb-4">
                <TabsTrigger value="oauth" className="text-xs">
                  OAuth 2.0 (3LO) {serverConfig?.oauthConfigured ? '✓ Ready' : ''}
                </TabsTrigger>
                <TabsTrigger value="api_token" className="text-xs">
                  Jira API Token (Proxied)
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: OAuth 2.0 (3LO) */}
              <TabsContent value="oauth" className="space-y-4">
                {connectionError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Connection Failed</AlertTitle>
                    <AlertDescription className="text-xs">{connectionError}</AlertDescription>
                  </Alert>
                )}

                <div className="p-4 rounded-lg border bg-muted/20 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <Lock className="h-4 w-4 text-primary" />
                      <span>Atlassian OAuth 2.0 (3LO) Flow</span>
                    </div>
                    <Badge variant={serverConfig?.oauthConfigured ? 'success' : 'warning'} className="text-[10px]">
                      {serverConfig?.oauthConfigured ? 'Server Configured' : 'Env Config Needed'}
                    </Badge>
                  </div>

                  {serverConfig?.oauthConfigured && serverConfig.oauthClientId ? (
                    <div className="space-y-3">
                      <p className="text-muted-foreground leading-relaxed text-[11px]">
                        OAuth 2.0 (3LO) is configured on the server. Clicking authorize redirects you to Atlassian to
                        grant scoped Jira access; the server exchanges the code safely using{' '}
                        <code className="font-mono bg-muted px-1 rounded">JIRA_OAUTH_CLIENT_SECRET</code> and stores the
                        token in an encrypted <code className="font-mono bg-muted px-1 rounded">HttpOnly</code> cookie.
                      </p>
                      <Button
                        variant="jira"
                        size="sm"
                        className="text-xs gap-1.5"
                        disabled={!serverConfig.hasSessionSecret}
                        onClick={() => {
                          jiraAuth.startOAuthRedirect(serverConfig.oauthClientId!, oauthRedirectUri);
                        }}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Authorize with Atlassian</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                      <p>
                        To enable OAuth 2.0 (3LO) in production on Vercel without exposing{' '}
                        <code className="font-mono text-foreground">client_secret</code> to browsers:
                      </p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>
                          Create an OAuth 2.0 (3LO) app in the{' '}
                          <a
                            href="https://developer.atlassian.com/console/myapps"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            Atlassian Developer Console
                          </a>{' '}
                          with scopes{' '}
                          <code className="bg-muted px-1 py-0.5 rounded">
                            read:jira-work write:jira-work read:jira-user read:me offline_access
                          </code>
                          .
                        </li>
                        <li>
                          Set the Callback URL in Atlassian Console to:{' '}
                          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono select-all">
                            {oauthRedirectUri}
                          </code>
                        </li>
                        <li>
                          Add <code className="bg-muted px-1 rounded font-mono">JIRA_OAUTH_CLIENT_ID</code>,{' '}
                          <code className="bg-muted px-1 rounded font-mono">JIRA_OAUTH_CLIENT_SECRET</code>, and{' '}
                          <code className="bg-muted px-1 rounded font-mono">SESSION_SECRET</code> in Vercel Environment
                          Variables (or <code className="bg-muted px-1 rounded font-mono">.env.local</code> for local dev).
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 2: API Token */}
              <TabsContent value="api_token" className="space-y-4">
                <form onSubmit={handleConnectApiToken} className="space-y-4">
                  {connectionError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Connection Failed</AlertTitle>
                      <AlertDescription className="text-xs">{connectionError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Jira Site URL</label>
                    <Input
                      placeholder="https://your-company.atlassian.net"
                      value={siteInput}
                      onChange={(e) => setSiteInput(e.target.value)}
                      className="text-xs"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      The HTTPS base URL of your Atlassian Cloud site. Requests are proxied server-side to avoid CORS.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Atlassian Email</label>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        className="text-xs"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Atlassian API Token</label>
                      <Input
                        type="password"
                        placeholder="Paste your Jira API token"
                        value={apiTokenInput}
                        onChange={(e) => setApiTokenInput(e.target.value)}
                        className="text-xs font-mono"
                        required
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Generate at{' '}
                        <a
                          href="https://id.atlassian.com/manage-profile/security/api-tokens"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          id.atlassian.com
                        </a>
                      </p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="jira"
                    disabled={isConnecting || Boolean(serverConfig && !serverConfig.hasSessionSecret)}
                    className="w-full sm:w-auto text-xs gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Verifying credentials with Jira...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        <span>Connect to Jira Cloud</span>
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* 2. Import Configuration Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center space-x-2">
            <Sliders className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Import & Field Configuration</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Fine-tune Jira issue types, custom fields, duplicate handling, and request concurrency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subtask Issue Type Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Subtask Issue Type Name</label>
            <Input
              value={settings.subtaskIssueTypeName}
              onChange={(e) =>
                setSettings({ ...settings, subtaskIssueTypeName: e.target.value })
              }
              placeholder="Sub-task"
              className="text-xs max-w-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Default is &quot;Sub-task&quot;. The system matches this against the project&apos;s configured issue types.
            </p>
          </div>

          {/* Start Date Custom Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold">Start Date Field</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={handleAutoDetectStartDate}
                disabled={!isConnected || isScanningFields}
              >
                <RefreshCw className={`h-3 w-3 ${isScanningFields ? 'animate-spin' : ''}`} />
                <span>Auto-detect Start Date Field</span>
              </Button>
            </div>

            {availableFields.length > 0 ? (
              <Select
                value={settings.startDateCustomFieldId}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const field = availableFields.find((f) => f.id === selectedId);
                  setSettings({
                    ...settings,
                    startDateCustomFieldId: selectedId,
                    startDateCustomFieldName: field?.name || '',
                  });
                }}
                className="text-xs max-w-md"
              >
                <option value="">(Auto-detect on import)</option>
                {availableFields
                  .filter((f) => {
                    const n = f.name.toLowerCase();
                    return (
                      n.includes('start') ||
                      n.includes('tanggal') ||
                      f.schema?.type === 'date'
                    );
                  })
                  .map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name} ({field.id})
                    </option>
                  ))}
              </Select>
            ) : (
              <Input
                value={settings.startDateCustomFieldId}
                onChange={(e) =>
                  setSettings({ ...settings, startDateCustomFieldId: e.target.value })
                }
                placeholder="e.g. customfield_10015 (Leave empty for auto-detect)"
                className="text-xs max-w-md font-mono"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Jira Cloud uses custom fields for Start Date (unlike standard &quot;duedate&quot;).
            </p>
          </div>

          {/* Import Concurrency */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">
              Import Concurrency: {settings.defaultConcurrency} parallel requests
            </label>
            <div className="flex items-center gap-3 max-w-xs">
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={settings.defaultConcurrency}
                onChange={(e) =>
                  setSettings({ ...settings, defaultConcurrency: parseInt(e.target.value, 10) })
                }
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-xs font-mono font-bold w-6">{settings.defaultConcurrency}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Limits concurrent requests to Jira Cloud to respect rate limits and avoid HTTP 429 throttling.
            </p>
          </div>

          {/* Duplicate Detection Behavior */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Duplicate Detection Default Behavior</label>
            <Select
              value={settings.duplicateDetectionBehavior}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  duplicateDetectionBehavior: e.target.value as AppSettings['duplicateDetectionBehavior'],
                })
              }
              className="text-xs max-w-sm"
            >
              <option value="warn_and_ask">Warn and ask for each row (Recommended)</option>
              <option value="always_skip">Always skip duplicate subtasks</option>
              <option value="always_import">Import anyway by default</option>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              A duplicate is flagged when an existing subtask under the parent Story shares the same Summary.
            </p>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <Button
              variant="jira"
              size="sm"
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="gap-1.5 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSavingSettings ? 'Saving...' : 'Save Settings'}</span>
            </Button>
            {settingsSavedSuccess && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
                ✓ Settings saved to browser storage.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
