import { ParsedSubtaskRow } from '@/types/excel';
import { jiraIssues } from '../jira/issues';
import { jiraProjects } from '../jira/projects';
import { jiraUsers } from '../jira/users';
import { JiraIssue } from '@/types/jira';

export interface ValidationProgressCallback {
  (current: number, total: number, currentRowKey?: string): void;
}

export async function validateRowsWithJira(
  rows: ParsedSubtaskRow[],
  onProgress?: ValidationProgressCallback
): Promise<ParsedSubtaskRow[]> {
  const validatedRows: ParsedSubtaskRow[] = [];
  const parentCache = new Map<string, { isValid: boolean; issue?: JiraIssue; errorMessage?: string }>();
  const priorities = await jiraProjects.getPriorities();

  for (let i = 0; i < rows.length; i++) {
    const row = { ...rows[i] };
    const errors = [...row.validationErrors];

    if (onProgress) {
      onProgress(i + 1, rows.length, row.storyKey);
    }

    // Extract project key from Story Key (e.g. PROJ from PROJ-101)
    const projectKeyMatch = row.storyKey.match(/^([A-Z0-9]+)-\d+$/i);
    const projectKey = projectKeyMatch ? projectKeyMatch[1].toUpperCase() : '';

    if (!projectKey) {
      errors.push(`Invalid Story Key format: "${row.storyKey}"`);
      row.validationStatus = 'INVALID';
      row.validationErrors = errors;
      validatedRows.push(row);
      continue;
    }

    row.resolvedProjectKey = projectKey;

    // 1. Verify Parent Story
    let parentCheck = parentCache.get(row.storyKey);
    if (!parentCheck) {
      parentCheck = await jiraIssues.verifyParentStory(row.storyKey);
      parentCache.set(row.storyKey, parentCheck);
    }

    if (!parentCheck.isValid) {
      errors.push(parentCheck.errorMessage || `Story "${row.storyKey}" not found in Jira.`);
    }

    const parentIssue = parentCheck.issue;

    // 2. Duplicate Detection
    // Check if a subtask with identical summary already exists under this parent
    if (parentIssue && parentIssue.fields.subtasks && parentIssue.fields.subtasks.length > 0) {
      const cleanSummary = row.summary.trim().toLowerCase();
      const existingSubtask = parentIssue.fields.subtasks.find(
        (st) => st.fields.summary.trim().toLowerCase() === cleanSummary
      );

      if (existingSubtask) {
        row.duplicateInfo = {
          existingKey: existingSubtask.key,
          existingSummary: existingSubtask.fields.summary,
          existingStatus: existingSubtask.fields.status.name,
        };
        // Mark as DUPLICATE if no other fatal syntax errors
        if (errors.length === 0) {
          row.validationStatus = 'DUPLICATE';
        }
      }
    }

    // 3. Resolve Assignee
    if (row.assigneeInput) {
      const assigneeRes = await jiraUsers.resolveUser(projectKey, row.assigneeInput);
      if (assigneeRes.isAmbiguous) {
        const matchesStr = assigneeRes.allMatches.map((m) => `${m.displayName} (${m.emailAddress || 'no email'})`).join(', ');
        errors.push(`Assignee "${row.assigneeInput}" is ambiguous. Matches: ${matchesStr}`);
      } else if (!assigneeRes.user) {
        errors.push(`Assignee "${row.assigneeInput}" not found or not assignable to project ${projectKey}`);
      } else {
        row.resolvedAssigneeId = assigneeRes.user.accountId;
        row.resolvedAssigneeName = assigneeRes.user.displayName;
      }
    }

    // 4. Resolve Reporter
    if (row.reporterInput) {
      const reporterRes = await jiraUsers.resolveUser(projectKey, row.reporterInput);
      if (reporterRes.isAmbiguous) {
        const matchesStr = reporterRes.allMatches.map((m) => `${m.displayName} (${m.emailAddress || 'no email'})`).join(', ');
        errors.push(`Reporter "${row.reporterInput}" is ambiguous. Matches: ${matchesStr}`);
      } else if (!reporterRes.user) {
        errors.push(`Reporter "${row.reporterInput}" not found in Jira`);
      } else {
        row.resolvedReporterId = reporterRes.user.accountId;
        row.resolvedReporterName = reporterRes.user.displayName;
      }
    }

    // 5. Validate Components against Target Project
    try {
      const projectComponents = await jiraProjects.getProjectComponents(projectKey);
      const matchedCompIds: string[] = [];

      const validateComp = (compName: string, isRequired: boolean, label: string) => {
        if (!compName) {
          if (isRequired) errors.push(`${label} is required`);
          return;
        }

        const match = projectComponents.find(
          (c) => c.name.toLowerCase() === compName.trim().toLowerCase()
        );
        if (match) {
          matchedCompIds.push(match.id);
        } else {
          const available = projectComponents.map((c) => c.name).join(', ') || 'none';
          errors.push(
            `${label} "${compName}" does not exist in project ${projectKey}. Available: [${available}]`
          );
        }
      };

      validateComp(row.component1, true, 'Component 1');
      if (row.component2) validateComp(row.component2, false, 'Component 2');
      if (row.component3) validateComp(row.component3, false, 'Component 3');

      row.resolvedComponentIds = matchedCompIds;
    } catch {
      errors.push(`Failed to retrieve components for project ${projectKey}`);
    }

    // 6. Validate Priority
    if (row.priority) {
      const cleanPriority = row.priority.trim().toLowerCase();
      const matchPriority = priorities.find(
        (p) => p.name.toLowerCase() === cleanPriority
      );
      if (matchPriority) {
        row.resolvedPriorityId = matchPriority.id;
      } else {
        const available = priorities.map((p) => p.name).join(', ');
        errors.push(
          `Priority "${row.priority}" is not valid in Jira. Available: [${available}]`
        );
      }
    }

    // Final Status Assignment
    row.validationErrors = errors;
    if (errors.length > 0) {
      row.validationStatus = 'INVALID';
    } else if (row.duplicateInfo) {
      row.validationStatus = 'DUPLICATE';
    } else {
      row.validationStatus = 'VALID';
    }

    validatedRows.push(row);
  }

  return validatedRows;
}
