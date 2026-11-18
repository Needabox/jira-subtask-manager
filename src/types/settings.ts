import { JiraUser } from "./jira";

export type AuthMode = "oauth" | "api_token";

export interface JiraConnectionState {
  isConnected: boolean;
  authMode: AuthMode;
  siteUrl: string;
  cloudId: string;
  user: JiraUser | null;
  // Tokens are kept in memory or session storage only, never in permanent localStorage
  accessToken?: string;
  apiToken?: string;
  email?: string;
  connectedAt?: string;
}

export interface AppSettings {
  subtaskIssueTypeName: string; // e.g. "Sub-task" or "Subtask"
  subtaskIssueTypeId?: string;
  startDateCustomFieldId: string; // e.g. "customfield_10015" or empty for auto-detect
  startDateCustomFieldName?: string;
  defaultConcurrency: number; // 1 to 5, default 3
  duplicateDetectionBehavior: "warn_and_ask" | "always_skip" | "always_import";
  useViteProxy: boolean; // helpful toggle for local dev
}

export const DEFAULT_SETTINGS: AppSettings = {
  subtaskIssueTypeName: "Sub-task",
  startDateCustomFieldId: "",
  defaultConcurrency: 3,
  duplicateDetectionBehavior: "warn_and_ask",
  useViteProxy: false,
};

