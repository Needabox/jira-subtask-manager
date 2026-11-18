import { ParsedSubtaskRow } from '@/types/excel';
import { ImportSession, ImportRowResult, ImportProgress } from '@/types/import';
import { jiraIssues } from '../jira/issues';
import { jiraProjects } from '../jira/projects';
import { jiraFields } from '../jira/fields';
import { historyRepo } from '../storage/historyRepo';
import { settingsRepo } from '../storage/settingsRepo';
import { jiraAuth } from '../jira/auth';

export interface ExecuteImportOptions {
  fileName: string;
  rows: ParsedSubtaskRow[];
  onProgress?: (progress: ImportProgress) => void;
  onRowComplete?: (result: ImportRowResult) => void;
}

export async function executeSubtaskImport(options: ExecuteImportOptions): Promise<ImportSession> {
  const { fileName, rows, onProgress, onRowComplete } = options;
  const settings = await settingsRepo.getSettings();
  const concurrency = Math.max(1, Math.min(settings.defaultConcurrency || 3, 5));
  const sessionId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Determine eligible rows
  // Only VALID rows or DUPLICATE rows explicitly set to 'IMPORT_ANYWAY'
  const eligibleRows = rows.filter((r) => {
    if (r.validationStatus === 'VALID') return true;
    if (r.validationStatus === 'DUPLICATE' && r.duplicateAction === 'IMPORT_ANYWAY') return true;
    return false;
  });

  const distinctProjectKeys = Array.from(
    new Set(rows.map((r) => r.resolvedProjectKey || '').filter(Boolean))
  );

  const session: ImportSession = {
    id: sessionId,
    fileName,
    projectKeys: distinctProjectKeys,
    importDate: new Date().toISOString(),
    totalRows: rows.length,
    validRows: rows.filter((r) => r.validationStatus === 'VALID').length,
    selectedRows: eligibleRows.length,
    successfulRows: 0,
    failedRows: 0,
    duplicateRows: rows.filter((r) => r.validationStatus === 'DUPLICATE').length,
    skippedRows: 0,
    status: 'IN_PROGRESS',
  };

  await historyRepo.saveSession(session);

  const results: ImportRowResult[] = [];
  let processedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Track skipped rows immediately
  for (const row of rows) {
    const isEligible = eligibleRows.includes(row);
    if (!isEligible) {
      skippedCount++;
      const skippedResult: ImportRowResult = {
        sessionId,
        rowNumber: row.rowNumber,
        storyKey: row.storyKey,
        summary: row.summary,
        status: row.validationStatus === 'INVALID' ? 'INVALID' : 'SKIPPED',
        errorCode: row.validationStatus === 'INVALID' ? 'VALIDATION_FAILED' : 'SKIPPED_BY_USER',
        errorMessage: row.validationErrors.join('; ') || 'Row skipped from import',
        timestamp: new Date().toISOString(),
        assigneeInput: row.assigneeInput,
        startDate: row.startDate,
        dueDate: row.dueDate,
        reporterInput: row.reporterInput,
        component1: row.component1,
        component2: row.component2,
        component3: row.component3,
        priority: row.priority,
        description: row.description,
      };
      results.push(skippedResult);
      if (onRowComplete) onRowComplete(skippedResult);
    }
  }

  // Pre-fetch Subtask issue type and Start Date field for each project
  const projectConfigCache = new Map<
    string,
    { subtaskTypeId: string; startDateFieldId: string | null }
  >();

  for (const pKey of distinctProjectKeys) {
    const subtaskType = await jiraProjects.getSubtaskIssueType(
      pKey,
      settings.subtaskIssueTypeName
    );
    const startFieldRes = await jiraFields.resolveStartDateField(
      pKey,
      subtaskType?.id
    );

    projectConfigCache.set(pKey, {
      subtaskTypeId: subtaskType?.id || '',
      startDateFieldId: startFieldRes.fieldId,
    });
  }

  // Controlled concurrency queue
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < eligibleRows.length) {
      const index = currentIndex++;
      const row = eligibleRows[index];
      const pKey = row.resolvedProjectKey || '';
      const config = projectConfigCache.get(pKey);

      const rowResult: ImportRowResult = {
        sessionId,
        rowNumber: row.rowNumber,
        storyKey: row.storyKey,
        summary: row.summary,
        status: 'PROCESSING',
        timestamp: new Date().toISOString(),
        assigneeInput: row.assigneeInput,
        startDate: row.startDate,
        dueDate: row.dueDate,
        reporterInput: row.reporterInput,
        component1: row.component1,
        component2: row.component2,
        component3: row.component3,
        priority: row.priority,
        description: row.description,
      };

      try {
        if (!config?.subtaskTypeId) {
          throw new Error(
            `Could not resolve Subtask issue type for project "${pKey}". Check Jira settings.`
          );
        }

        if (!row.resolvedAssigneeId) {
          throw new Error(`Assignee "${row.assigneeInput}" could not be resolved to a Jira account ID.`);
        }

        // Execute Subtask Creation
        const res = await jiraIssues.createSubtask({
          projectKey: pKey,
          parentKey: row.storyKey,
          subtaskTypeId: config.subtaskTypeId,
          summary: row.summary,
          assigneeAccountId: row.resolvedAssigneeId,
          reporterAccountId: row.resolvedReporterId,
          priorityId: row.resolvedPriorityId,
          dueDate: row.dueDate,
          startDate: row.startDate,
          startDateFieldId: config.startDateFieldId || undefined,
          componentIds: row.resolvedComponentIds,
          description: row.description,
        });

        const authState = jiraAuth.getState();
        const siteBase = authState.siteUrl || `https://${pKey}.atlassian.net`;
        const jiraUrl = `${siteBase}/browse/${res.key}`;

        rowResult.status = 'SUCCESS';
        rowResult.jiraKey = res.key;
        rowResult.jiraUrl = jiraUrl;
        successfulCount++;
      } catch (err: unknown) {
        rowResult.status = 'FAILED';
        rowResult.errorCode = 'CREATION_FAILED';
        rowResult.errorMessage = err instanceof Error ? err.message : 'Unknown Jira API error';
        rowResult.errorDetail = String(err);
        failedCount++;
      }

      processedCount++;
      results.push(rowResult);

      if (onRowComplete) {
        onRowComplete(rowResult);
      }

      if (onProgress) {
        onProgress({
          sessionId,
          total: rows.length,
          processed: processedCount + skippedCount,
          successful: successfulCount,
          failed: failedCount,
          skipped: skippedCount,
          currentStoryKey: row.storyKey,
          currentSummary: row.summary,
          isComplete: processedCount >= eligibleRows.length,
        });
      }
    }
  }

  // Run concurrency workers
  const workers = Array.from({ length: Math.min(concurrency, eligibleRows.length) }, () => worker());
  await Promise.all(workers);

  // Update final session state
  session.successfulRows = successfulCount;
  session.failedRows = failedCount;
  session.skippedRows = skippedCount;
  session.status = failedCount === 0 ? 'COMPLETED' : successfulCount > 0 ? 'PARTIAL' : 'FAILED';

  // Persist all rows and session in IndexedDB
  await historyRepo.saveRows(results);
  await historyRepo.saveSession(session);

  return session;
}

