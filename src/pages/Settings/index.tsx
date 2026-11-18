import React, { useState, useEffect } from 'react';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { jiraAuth } from '@/services/jira/auth';
import { jiraFields } from '@/services/jira/fields';
import { jiraUsers } from '@/services/jira/users';
import { settingsRepo } from '@/services/storage/settingsRepo';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';
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
  const { isConnected, user, siteUrl, authMode, disconnect } = useJiraAuth();

  // App Settings state
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // Field candidates for Start Date
  const [availableFields, setAvailableFields] = useState<JiraField[]>([]);
  const [isScanningFields, setIsScanningFields] = useState(false);

  // Connection Form State (Session-only, zero credential storage in localStorage)
  const [siteInput, setSiteInput] = useState(siteUrl || '');
  const [emailInput, setEmailInput] = useState('');
  const [apiTokenInput, setApiTokenInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // OAuth Form State
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthRedirectUri, setOauthRedirectUri] = useState(window.location.origin + '/settings');

  // Load stored settings on mount
  useEffect(() => {
    settingsRepo.getSettings().then((s) => {
      setSettings(s);
    });
  }, []);

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
    }
  }, [isConnected]);

  // Handle API Token connection
  const handleConnectApiToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteInput.trim() || !emailInput.trim() || !apiTokenInput.trim()) {
      setConnectionError('All fields (Site URL, Email, API Token) are required.');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      // Temporarily set credentials in session to test /myself
      jiraAuth.setApiTokenConnection({
        siteUrl: siteInput.trim(),
        email: emailInput.trim(),
        apiToken: apiTokenInput.trim(),
        user: { accountId: '', displayName: 'Connecting...' },
      });

      // Fetch authenticated user to verify credentials
      const currentUser = await jiraUsers.getMyself();

      // Update auth state with verified user
      jiraAuth.setApiTokenConnection({
        siteUrl: siteInput.trim(),
        email: emailInput.trim(),
        apiToken: apiTokenInput.trim(),
        user: currentUser,
      });

      // Clear input fields from memory
      setApiTokenInput('');
      setIsConnecting(false);
    } catch (err: unknown) {
      jiraAuth.disconnect();
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Failed to connect. Please check your Jira Site URL, Email, and API Token.'
      );
      setIsConnecting(false);
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

      {/* 1. Jira Connection Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Jira Cloud Connection</CardTitle>
            </div>
            <Badge variant={isConnected ? 'success' : 'destructive'} className="gap-1.5 py-1 px-2.5">
              {isConnected ? (
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
            Direct client-side authentication with Atlassian Cloud. Tokens are strictly stored in session memory and never persisted in permanent storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConnected && user ? (
            <div className="space-y-4">
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
                  <Button variant="outline" size="sm" onClick={disconnect} className="text-xs gap-1.5 text-destructive hover:text-destructive">
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Disconnect</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border bg-card">
                  <span className="text-muted-foreground block text-[11px]">Jira Cloud Site URL</span>
                  <span className="font-semibold font-mono text-primary">{siteUrl}</span>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <span className="text-muted-foreground block text-[11px]">Security Mode</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Client Session Memory Only (Zero Disk Persistence)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="api_token">
              <TabsList className="mb-4">
                <TabsTrigger value="api_token" className="text-xs">
                  Jira API Token (Direct Session)
                </TabsTrigger>
                <TabsTrigger value="oauth" className="text-xs">
                  OAuth 2.0 (3LO)
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: API Token */}
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
                      The base URL of your Atlassian Cloud site.
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

                  <Button type="submit" variant="jira" disabled={isConnecting} className="w-full sm:w-auto text-xs gap-2">
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

              {/* Tab 2: OAuth 2.0 (3LO) */}
              <TabsContent value="oauth" className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/20 space-y-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold">
                    <Lock className="h-4 w-4 text-primary" />
                    <span>Atlassian OAuth 2.0 (3LO) Flow</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    To connect via OAuth 2.0 (3LO), create an Atlassian Developer app in the{' '}
                    <a
                      href="https://developer.atlassian.com/console/myapps"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Atlassian Developer Console
                    </a>
                    , configure the OAuth 2.0 (3LO) integration with the required Jira scopes (
                    <code className="bg-muted px-1 py-0.5 rounded">read:jira-work write:jira-work read:me offline_access</code>
                    ), and register this redirect callback URL.
                  </p>

                  <div className="space-y-1.5 pt-2">
                    <label className="font-semibold block">OAuth Client ID</label>
                    <Input
                      placeholder="e.g. 9xkL21n..."
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold block">Redirect URI</label>
                    <Input
                      value={oauthRedirectUri}
                      onChange={(e) => setOauthRedirectUri(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <Button
                    variant="jira"
                    size="sm"
                    className="text-xs gap-1.5 mt-2"
                    disabled={!oauthClientId.trim()}
                    onClick={() => {
                      const authUrl = jiraAuth.getOAuthAuthorizeUrl(
                        oauthClientId.trim(),
                        oauthRedirectUri,
                        'state_' + Math.random().toString(36).substring(7)
                      );
                      window.location.href = authUrl;
                    }}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Authorize with Atlassian</span>
                  </Button>
                </div>
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

