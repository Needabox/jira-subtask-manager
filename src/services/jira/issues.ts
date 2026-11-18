import { JiraHttpClient } from './client';
import { JiraIssue } from '@/types/jira';

export interface CreateSubtaskParams {
  projectKey: string;
  parentKey: string;
  subtaskTypeId: string;
  summary: string;
  assigneeAccountId: string;
  reporterAccountId?: string;
  priorityId?: string;
  dueDate: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  startDateFieldId?: string;
  componentIds?: string[];
  description?: string;
}

export interface MyAssignedTasksFilter {
  nextPageToken?: string;
  maxResults?: number;
  projectKey?: string;
  statusCategory?: string; // 'new' | 'indeterminate' | 'done'
  priorityName?: string;
  searchQuery?: string;
  includeCount?: boolean;
}

export interface JiraSearchJqlResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

export interface MyAssignedTasksResult {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast: boolean;
  totalCount?: number;
}

const ASSIGNED_TASK_FIELDS = [
  'summary',
  'status',
  'priority',
  'duedate',
  'created',
  'updated',
  'assignee',
  'reporter',
  'parent',
  'project',
  'components',
];

function buildAssignedSubtasksJql(filter: MyAssignedTasksFilter): {
  jqlWhere: string;
  jqlWithOrder: string;
} {
  const { projectKey, statusCategory, priorityName, searchQuery } = filter;

  const jqlParts: string[] = [
    'assignee = currentUser()',
    'issuetype in subTaskIssueTypes()',
  ];

  if (projectKey && projectKey.trim()) {
    jqlParts.push(`project = "${projectKey.trim().toUpperCase()}"`);
  }

  if (statusCategory && statusCategory !== 'all') {
    if (statusCategory === 'done') {
      jqlParts.push('statusCategory = Done');
    } else if (statusCategory === 'indeterminate') {
      jqlParts.push('statusCategory = "In Progress"');
    } else if (statusCategory === 'new') {
      jqlParts.push('statusCategory = "To Do"');
    }
  }

  if (priorityName && priorityName !== 'all') {
    jqlParts.push(`priority = "${priorityName.trim()}"`);
  }

  if (searchQuery && searchQuery.trim()) {
    const clean = searchQuery.trim().replace(/["\\]/g, '');
    jqlParts.push(`(summary ~ "${clean}*" OR key = "${clean.toUpperCase()}")`);
  }

  const jqlWhere = jqlParts.join(' AND ');
  return {
    jqlWhere,
    jqlWithOrder: `${jqlWhere} ORDER BY duedate ASC, created DESC`,
  };
}

export const jiraIssues = {
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const key = issueKey.trim().toUpperCase();
    return JiraHttpClient.get<JiraIssue>(
      `/issue/${key}?fields=summary,issuetype,subtasks,project,status,priority,duedate,assignee,reporter,components,created`
    );
  },

  async verifyParentStory(storyKey: string): Promise<{
    isValid: boolean;
    issue?: JiraIssue;
    errorMessage?: string;
  }> {
    try {
      const issue = await this.getIssue(storyKey);

      // Check if parent is itself a subtask (Subtask cannot be parent of another Subtask)
      if (issue.fields.issuetype?.subtask) {
        return {
          isValid: false,
          issue,
          errorMessage: `Parent issue "${storyKey}" is already a Subtask. A Subtask cannot be a parent of another Subtask.`,
        };
      }

      return { isValid: true, issue };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        isValid: false,
        errorMessage: `Story "${storyKey}" not found or inaccessible: ${msg}`,
      };
    }
  },

  async createSubtask(params: CreateSubtaskParams): Promise<{ id: string; key: string; self: string }> {
    const fieldsPayload: Record<string, unknown> = {
      project: { key: params.projectKey.toUpperCase() },
      parent: { key: params.parentKey.toUpperCase() },
      issuetype: { id: params.subtaskTypeId },
      summary: params.summary.trim(),
      assignee: { accountId: params.assigneeAccountId },
      duedate: params.dueDate,
    };

    if (params.reporterAccountId) {
      fieldsPayload.reporter = { accountId: params.reporterAccountId };
    }

    if (params.priorityId) {
      fieldsPayload.priority = { id: params.priorityId };
    }

    if (params.componentIds && params.componentIds.length > 0) {
      fieldsPayload.components = params.componentIds.map((id) => ({ id }));
    }

    // Start Date custom field mapping
    if (params.startDate && params.startDateFieldId) {
      fieldsPayload[params.startDateFieldId] = params.startDate;
    }

    // Convert plain text description to Atlassian Document Format (ADF) for Jira Cloud API v3
    if (params.description && params.description.trim()) {
      fieldsPayload.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: params.description.trim(),
              },
            ],
          },
        ],
      };
    }

    // IMPORTANT: Estimasi (jam) is intentionally omitted from fieldsPayload

    return JiraHttpClient.post<{ id: string; key: string; self: string }>('/issue', {
      fields: fieldsPayload,
    });
  },

  /**
   * Strictly READ-ONLY retrieval of assigned subtasks via Jira Cloud /rest/api/3/search/jql (CHANGE-2046)
   */
  async getMyAssignedSubtasks(filter: MyAssignedTasksFilter = {}): Promise<MyAssignedTasksResult> {
    const { nextPageToken, maxResults = 25, includeCount = false } = filter;
    const { jqlWhere, jqlWithOrder } = buildAssignedSubtasksJql(filter);

    const body: {
      jql: string;
      maxResults: number;
      fields: string[];
      nextPageToken?: string;
    } = {
      jql: jqlWithOrder,
      maxResults,
      fields: ASSIGNED_TASK_FIELDS,
    };

    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const searchPromise = JiraHttpClient.post<JiraSearchJqlResponse>('/search/jql', body);

    const countPromise =
      includeCount && !nextPageToken
        ? JiraHttpClient.post<{ count: number }>('/search/approximate-count', {
            jql: jqlWhere,
          }).catch(() => null)
        : Promise.resolve(null);

    const [searchRes, countRes] = await Promise.all([searchPromise, countPromise]);

    const issues = searchRes.issues || [];
    const hasNext = Boolean(searchRes.nextPageToken) && searchRes.isLast !== true;

    return {
      issues,
      nextPageToken: hasNext ? searchRes.nextPageToken : undefined,
      isLast: searchRes.isLast ?? !hasNext,
      totalCount: typeof countRes?.count === 'number' ? countRes.count : undefined,
    };
  },

  /**
   * Fetches all assigned subtasks across pages using nextPageToken for Dashboard summaries.
   */
  async getAllMyAssignedSubtasks(maxTotal = 500): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = [];
    let nextPageToken: string | undefined = undefined;
    const pageLimit = 100;

    while (allIssues.length < maxTotal) {
      const page = await this.getMyAssignedSubtasks({
        maxResults: Math.min(pageLimit, maxTotal - allIssues.length),
        nextPageToken,
      });

      allIssues.push(...page.issues);

      if (page.isLast || !page.nextPageToken || page.issues.length === 0) {
        break;
      }

      nextPageToken = page.nextPageToken;
    }

    return allIssues;
  },
};
