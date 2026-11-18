import { JiraHttpClient } from './client';
import { jiraAuth } from './auth';
import { JiraField } from '@/types/jira';
import { settingsRepo } from '../storage/settingsRepo';

let allFieldsCache: JiraField[] | null = null;
let cachedEpoch = -1;

export const jiraFields = {
  async getAllFields(): Promise<JiraField[]> {
    const epoch = jiraAuth.getSessionEpoch();
    if (epoch !== cachedEpoch) {
      allFieldsCache = null;
      cachedEpoch = epoch;
    }

    if (allFieldsCache) {
      return allFieldsCache;
    }

    try {
      const fields = await JiraHttpClient.get<JiraField[]>('/field');
      allFieldsCache = fields || [];
      return allFieldsCache;
    } catch {
      return [];
    }
  },

  /**
   * Resolves the Start Date custom field ID.
   * Priority:
   * 1. Stored user setting (if explicitly configured)
   * 2. Auto-discovery from field definitions
   */
  async resolveStartDateField(projectKey?: string, issueTypeId?: string): Promise<{
    fieldId: string | null;
    fieldName: string | null;
    allCandidates: JiraField[];
  }> {
    const settings = await settingsRepo.getSettings();
    const fields = await this.getAllFields();

    // Find date fields matching "Start date" or "Tanggal Mulai"
    const dateCandidates = fields.filter((f) => {
      const name = f.name.toLowerCase();
      const isDateType =
        f.schema?.type === 'date' ||
        f.schema?.custom?.includes('datepicker') ||
        f.schema?.system === 'startDate';

      return (
        name.includes('start date') ||
        name.includes('startdate') ||
        name.includes('tanggal mulai') ||
        name === 'start' ||
        f.id === 'startDate' ||
        isDateType
      );
    });

    // Check user configured field
    if (settings.startDateCustomFieldId) {
      const configured = fields.find((f) => f.id === settings.startDateCustomFieldId);
      if (configured) {
        return {
          fieldId: configured.id,
          fieldName: configured.name,
          allCandidates: dateCandidates,
        };
      }
    }

    // Try finding in project createmeta if projectKey and issueTypeId are provided
    if (projectKey && issueTypeId) {
      try {
        const createmeta = await JiraHttpClient.get<{
          values?: Array<{ fieldId: string; name: string; schema?: JiraField['schema'] }>;
          fields?: Record<string, { fieldId: string; name: string; schema?: JiraField['schema'] }>;
        }>(`/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`);

        const metaFields = createmeta.values || (createmeta.fields ? Object.values(createmeta.fields) : []);
        const metaStartDate = metaFields.find((f) => {
          const name = f.name.toLowerCase();
          return (
            name.includes('start date') ||
            name.includes('tanggal mulai') ||
            f.fieldId === 'startDate'
          );
        });

        if (metaStartDate) {
          return {
            fieldId: metaStartDate.fieldId,
            fieldName: metaStartDate.name,
            allCandidates: dateCandidates,
          };
        }
      } catch {
        // Fallback to global fields
      }
    }

    // Best candidate from global fields: exact "Start date"
    const exactStart = dateCandidates.find(
      (f) => f.name.toLowerCase() === 'start date' || f.name.toLowerCase() === 'startdate'
    );
    if (exactStart) {
      return {
        fieldId: exactStart.id,
        fieldName: exactStart.name,
        allCandidates: dateCandidates,
      };
    }

    // Second best: contains "start" and is custom
    const partialMatch = dateCandidates.find(
      (f) => f.name.toLowerCase().includes('start') && f.custom
    );
    if (partialMatch) {
      return {
        fieldId: partialMatch.id,
        fieldName: partialMatch.name,
        allCandidates: dateCandidates,
      };
    }

    return {
      fieldId: null,
      fieldName: null,
      allCandidates: dateCandidates,
    };
  },

  clearCache() {
    allFieldsCache = null;
  },
};

