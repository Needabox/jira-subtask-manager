import { JiraHttpClient } from './client';
import { JiraUser } from '@/types/jira';

// In-memory cache for user lookup: "projectKey:query" -> JiraUser | null
const userLookupCache = new Map<string, JiraUser | null>();

export const jiraUsers = {
  async getMyself(): Promise<JiraUser> {
    return JiraHttpClient.get<JiraUser>('/myself');
  },

  async searchAssignableUsers(projectKey: string, query: string): Promise<JiraUser[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const params = new URLSearchParams({
      project: projectKey,
      query: trimmed,
      maxResults: '10',
    });

    try {
      const results = await JiraHttpClient.get<JiraUser[]>(`/user/assignable/search?${params.toString()}`);
      return results || [];
    } catch {
      return [];
    }
  },

  /**
   * Resolves a user (by name or email) for a specific project.
   * Uses in-memory caching to avoid redundant API requests during bulk imports.
   */
  async resolveUser(projectKey: string, query: string): Promise<{
    user: JiraUser | null;
    isAmbiguous: boolean;
    allMatches: JiraUser[];
  }> {
    const cacheKey = `${projectKey.toUpperCase()}:${query.trim().toLowerCase()}`;
    if (userLookupCache.has(cacheKey)) {
      const cached = userLookupCache.get(cacheKey);
      return {
        user: cached || null,
        isAmbiguous: false,
        allMatches: cached ? [cached] : [],
      };
    }

    const matches = await this.searchAssignableUsers(projectKey, query);

    if (matches.length === 0) {
      userLookupCache.set(cacheKey, null);
      return { user: null, isAmbiguous: false, allMatches: [] };
    }

    // Exact email match check
    const cleanQuery = query.trim().toLowerCase();
    const exactEmail = matches.find((u) => u.emailAddress?.toLowerCase() === cleanQuery);
    if (exactEmail) {
      userLookupCache.set(cacheKey, exactEmail);
      return { user: exactEmail, isAmbiguous: false, allMatches: matches };
    }

    // Exact display name match check
    const exactName = matches.filter((u) => u.displayName.toLowerCase() === cleanQuery);
    if (exactName.length === 1) {
      userLookupCache.set(cacheKey, exactName[0]);
      return { user: exactName[0], isAmbiguous: false, allMatches: matches };
    }

    // If only one user returned from Jira search
    if (matches.length === 1) {
      userLookupCache.set(cacheKey, matches[0]);
      return { user: matches[0], isAmbiguous: false, allMatches: matches };
    }

    // Multiple matches and no exact match -> Ambiguous
    return {
      user: null,
      isAmbiguous: true,
      allMatches: matches,
    };
  },

  clearCache() {
    userLookupCache.clear();
  },
};

