import { JiraUser } from "./jira";

export type AuthMode = "oauth" | "api_token";

export interface JiraSiteOption {
  id: string;
  name: string;
  url: string;
  avatarUrl?: string;
}

export interface JiraConnectionState {
  isConnected: boolean;
  isInitializing: boolean;
  authMode: AuthMode;
  siteUrl: string;
  cloudId: string;
  user: JiraUser | null;
  availableSites?: JiraSiteOption[];
  connectedAt?: string;
  sessionExpired?: boolean;
}

export interface ServerAuthConfig {
  hasSessionSecret: boolean;
  oauthConfigured: boolean;
  oauthClientId: string | null;
  isProduction: boolean;
}

export interface AppSettings {
  subtaskIssueTypeName: string; // e.g. "Sub-task" or "Subtask"
  subtaskIssueTypeId?: string;
  startDateCustomFieldId: string; // e.g. "customfield_10015" or empty for auto-detect
  startDateCustomFieldName?: string;
  defaultConcurrency: number; // 1 to 5, default 3
  duplicateDetectionBehavior: "warn_and_ask" | "always_skip" | "always_import";
}

export const DEFAULT_SETTINGS: AppSettings = {
  subtaskIssueTypeName: "Sub-task",
  startDateCustomFieldId: "",
  defaultConcurrency: 3,
  duplicateDetectionBehavior: "warn_and_ask",
};
