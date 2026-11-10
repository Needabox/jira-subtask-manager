export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: Record<string, string>;
  active?: boolean;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraComponent {
  id: string;
  name: string;
  description?: string;
  project?: string;
  projectId?: number;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  iconUrl?: string;
  description?: string;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  orderable?: boolean;
  navigable?: boolean;
  searchable?: boolean;
  clauseNames?: string[];
  schema?: {
    type: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
}

export interface JiraStatusCategory {
  id: number;
  key: 'new' | 'indeterminate' | 'done' | string;
  name: string;
  colorName?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: JiraStatusCategory;
  description?: string;
  iconUrl?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype?: JiraIssueType;
    priority?: JiraPriority;
    duedate?: string | null;
    created: string;
    updated?: string;
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    parent?: {
      id: string;
      key: string;
      fields?: {
        summary: string;
        issuetype?: JiraIssueType;
      };
    };
    subtasks?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: JiraStatus;
        priority?: JiraPriority;
      };
    }>;
    components?: JiraComponent[];
    project?: JiraProject;
    [key: string]: unknown;
  };
}

export interface JiraAccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

export interface JiraCreateIssuePayload {
  fields: {
    project: { key: string } | { id: string };
    parent: { key: string };
    issuetype: { id: string } | { name: string };
    summary: string;
    assignee?: { accountId: string };
    reporter?: { accountId: string };
    priority?: { id: string } | { name: string };
    duedate?: string;
    components?: Array<{ id: string }>;
    description?: unknown; // ADF object or string depending on API
    [customFieldKey: string]: unknown;
  };
}
