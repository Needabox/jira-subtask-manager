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
  startAt?: number;
  maxResults?: number;
  projectKey?: string;
  statusCategory?: string; // 'new' | 'indeterminate' | 'done'
  priorityName?: string;
  searchQuery?: string;
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
   * Strictly READ-ONLY retrieval of assigned subtasks for currentUser()
   */
  async getMyAssignedSubtasks(filter: MyAssignedTasksFilter = {}): Promise<{
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
  }> {
    const {
      startAt = 0,
      maxResults = 25,
      projectKey,
      statusCategory,
      priorityName,
      searchQuery,
    } = filter;

    // Build JQL query
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

    const jql = `${jqlParts.join(' AND ')} ORDER BY duedate ASC, created DESC`;

    const body = {
      jql,
      startAt,
      maxResults,
      fields: [
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
      ],
    };

    return JiraHttpClient.post<{
      issues: JiraIssue[];
      total: number;
      startAt: number;
      maxResults: number;
    }>('/search', body);
  },
};

