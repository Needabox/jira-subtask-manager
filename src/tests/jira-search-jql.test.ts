import { describe, it, expect, vi, afterEach } from 'vitest';
import { jiraIssues } from '@/services/jira/issues';
import { JiraHttpClient } from '@/services/jira/client';

describe('Jira Cloud Search Migration (CHANGE-2046 /rest/api/3/search/jql)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /search/jql without startAt and handles nextPageToken + approximate-count', async () => {
    const postSpy = vi.spyOn(JiraHttpClient, 'post').mockImplementation(async (endpoint, body) => {
      if (endpoint === '/search/jql') {
        const payload = body as Record<string, unknown>;
        expect(payload).not.toHaveProperty('startAt');
        expect(payload.jql).toContain('assignee = currentUser()');
        expect(payload.jql).toContain('issuetype in subTaskIssueTypes()');
        expect(Array.isArray(payload.fields)).toBe(true);
        return {
          issues: [{ id: '1', key: 'PROJ-10', self: '', fields: { summary: 'Subtask 1' } }],
          nextPageToken: 'cursor_abc_123',
          isLast: false,
        };
      }
      if (endpoint === '/search/approximate-count') {
        const payload = body as Record<string, unknown>;
        expect(String(payload.jql)).not.toContain('ORDER BY');
        return { count: 42 };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    const res = await jiraIssues.getMyAssignedSubtasks({
      maxResults: 25,
      includeCount: true,
      statusCategory: 'indeterminate',
    });

    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(res.issues).toHaveLength(1);
    expect(res.nextPageToken).toBe('cursor_abc_123');
    expect(res.isLast).toBe(false);
    expect(res.totalCount).toBe(42);
  });

  it('forwards nextPageToken on subsequent pages and skips approximate-count', async () => {
    const postSpy = vi.spyOn(JiraHttpClient, 'post').mockImplementation(async (endpoint, body) => {
      expect(endpoint).toBe('/search/jql');
      const payload = body as Record<string, unknown>;
      expect(payload.nextPageToken).toBe('cursor_page_2');
      expect(payload).not.toHaveProperty('startAt');
      return {
        issues: [{ id: '2', key: 'PROJ-11', self: '', fields: { summary: 'Subtask 2' } }],
        isLast: true,
      };
    });

    const res = await jiraIssues.getMyAssignedSubtasks({
      nextPageToken: 'cursor_page_2',
      maxResults: 25,
      includeCount: true,
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(res.isLast).toBe(true);
    expect(res.nextPageToken).toBeUndefined();
  });

  it('still returns issues if approximate-count fails', async () => {
    vi.spyOn(JiraHttpClient, 'post').mockImplementation(async (endpoint) => {
      if (endpoint === '/search/jql') {
        return {
          issues: [{ id: '1', key: 'PROJ-1', self: '', fields: { summary: 'Test' } }],
          isLast: true,
        };
      }
      throw new Error('approximate-count unavailable');
    });

    const res = await jiraIssues.getMyAssignedSubtasks({ includeCount: true });
    expect(res.issues).toHaveLength(1);
    expect(res.totalCount).toBeUndefined();
  });

  it('paginates getAllMyAssignedSubtasks across multiple nextPageToken pages', async () => {
    let callCount = 0;
    vi.spyOn(JiraHttpClient, 'post').mockImplementation(async (_endpoint, body) => {
      callCount++;
      const payload = body as Record<string, unknown>;
      if (callCount === 1) {
        expect(payload.nextPageToken).toBeUndefined();
        return {
          issues: [{ id: '1', key: 'PROJ-1', self: '', fields: { summary: 'A' } }],
          nextPageToken: 'tok_2',
          isLast: false,
        };
      }
      expect(payload.nextPageToken).toBe('tok_2');
      return {
        issues: [{ id: '2', key: 'PROJ-2', self: '', fields: { summary: 'B' } }],
        isLast: true,
      };
    });

    const all = await jiraIssues.getAllMyAssignedSubtasks();
    expect(callCount).toBe(2);
    expect(all.map((i) => i.key)).toEqual(['PROJ-1', 'PROJ-2']);
  });
});
