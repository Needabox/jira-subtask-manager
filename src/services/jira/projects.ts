import { JiraHttpClient } from './client';
import { JiraProject, JiraComponent, JiraPriority, JiraIssueType } from '@/types/jira';

const projectCache = new Map<string, JiraProject>();
const componentsCache = new Map<string, JiraComponent[]>();
const issueTypesCache = new Map<string, JiraIssueType[]>();
let prioritiesCache: JiraPriority[] | null = null;

export const jiraProjects = {
  async getProject(projectKey: string): Promise<JiraProject> {
    const key = projectKey.toUpperCase();
    if (projectCache.has(key)) {
      return projectCache.get(key)!;
    }

    const project = await JiraHttpClient.get<JiraProject>(`/project/${key}`);
    projectCache.set(key, project);
    return project;
  },

  async getProjectComponents(projectKey: string): Promise<JiraComponent[]> {
    const key = projectKey.toUpperCase();
    if (componentsCache.has(key)) {
      return componentsCache.get(key)!;
    }

    try {
      const components = await JiraHttpClient.get<JiraComponent[]>(`/project/${key}/components`);
      componentsCache.set(key, components || []);
      return components || [];
    } catch {
      componentsCache.set(key, []);
      return [];
    }
  },

  async getProjectIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    const key = projectKey.toUpperCase();
    if (issueTypesCache.has(key)) {
      return issueTypesCache.get(key)!;
    }

    try {
      // Fetch createmeta issue types for project
      const response = await JiraHttpClient.get<{ values?: JiraIssueType[]; issueTypes?: JiraIssueType[] }>(
        `/issue/createmeta/${key}/issuetypes`
      );
      const types = response.values || response.issueTypes || [];
      issueTypesCache.set(key, types);
      return types;
    } catch {
      // Fallback: check project.issueTypes if createmeta fails
      const project = await this.getProject(key);
      const types = (project as unknown as { issueTypes?: JiraIssueType[] }).issueTypes || [];
      issueTypesCache.set(key, types);
      return types;
    }
  },

  async getSubtaskIssueType(projectKey: string, configuredName?: string): Promise<JiraIssueType | null> {
    const types = await this.getProjectIssueTypes(projectKey);
    // Find subtask type: either matching configuredName, or subtask === true, or name matches /sub.?task/i
    if (configuredName) {
      const matchConfig = types.find(
        (t) => t.name.toLowerCase() === configuredName.toLowerCase()
      );
      if (matchConfig) return matchConfig;
    }

    const subtask = types.find((t) => t.subtask === true);
    if (subtask) return subtask;

    const nameMatch = types.find((t) => /sub.*task/i.test(t.name));
    return nameMatch || null;
  },

  async getPriorities(): Promise<JiraPriority[]> {
    if (prioritiesCache) {
      return prioritiesCache;
    }

    try {
      const priorities = await JiraHttpClient.get<JiraPriority[]>('/priority');
      prioritiesCache = priorities || [];
      return prioritiesCache;
    } catch {
      return [];
    }
  },

  clearCache() {
    projectCache.clear();
    componentsCache.clear();
    issueTypesCache.clear();
    prioritiesCache = null;
  },
};
