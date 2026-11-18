import { JiraHttpClient } from './client';
import { jiraAuth } from './auth';
import { JiraProject, JiraComponent, JiraPriority, JiraIssueType } from '@/types/jira';

const projectCache = new Map<string, JiraProject>();
const componentsCache = new Map<string, JiraComponent[]>();
const issueTypesCache = new Map<string, JiraIssueType[]>();
let prioritiesCache: JiraPriority[] | null = null;
let cachedEpoch = -1;

function ensureEpochCache() {
  const epoch = jiraAuth.getSessionEpoch();
  if (epoch !== cachedEpoch) {
    projectCache.clear();
    componentsCache.clear();
    issueTypesCache.clear();
    prioritiesCache = null;
    cachedEpoch = epoch;
  }
}

export const jiraProjects = {
  async getProject(projectKey: string): Promise<JiraProject> {
    ensureEpochCache();
    const key = projectKey.toUpperCase();
    if (projectCache.has(key)) {
      return projectCache.get(key)!;
    }

    const project = await JiraHttpClient.get<JiraProject>(`/project/${key}`);
    projectCache.set(key, project);
    return project;
  },

  async getProjectComponents(projectKey: string): Promise<JiraComponent[]> {
    ensureEpochCache();
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
    ensureEpochCache();
    const key = projectKey.toUpperCase();
    if (issueTypesCache.has(key)) {
      return issueTypesCache.get(key)!;
    }

    try {
      const response = await JiraHttpClient.get<{ values?: JiraIssueType[]; issueTypes?: JiraIssueType[] }>(
        `/issue/createmeta/${key}/issuetypes`
      );
      const types = response.values || response.issueTypes || [];
      issueTypesCache.set(key, types);
      return types;
    } catch {
      const project = await this.getProject(key);
      const types = (project as unknown as { issueTypes?: JiraIssueType[] }).issueTypes || [];
      issueTypesCache.set(key, types);
      return types;
    }
  },

  async getSubtaskIssueType(projectKey: string, configuredName?: string): Promise<JiraIssueType | null> {
    const types = await this.getProjectIssueTypes(projectKey);
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
    ensureEpochCache();
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
