export const REQUIRED_EXCEL_HEADERS = [
  "Story Key",
  "Subtask (Summary)",
  "Assignee (nama/email)",
  "Start Date",
  "Due Date",
  "Estimasi (jam)",
  "Reporter (nama/email)",
  "Component 1",
  "Component 2",
  "Component 3",
  "Priority",
  "Deskripsi (opsional)",
] as const;

export type ExcelHeader = typeof REQUIRED_EXCEL_HEADERS[number];

export interface RawExcelRow {
  "Story Key"?: unknown;
  "Subtask (Summary)"?: unknown;
  "Assignee (nama/email)"?: unknown;
  "Start Date"?: unknown;
  "Due Date"?: unknown;
  "Estimasi (jam)"?: unknown;
  "Reporter (nama/email)"?: unknown;
  "Component 1"?: unknown;
  "Component 2"?: unknown;
  "Component 3"?: unknown;
  "Priority"?: unknown;
  "Deskripsi (opsional)"?: unknown;
  [key: string]: unknown;
}

export type RowValidationStatus = "VALID" | "INVALID" | "DUPLICATE";

export interface ParsedSubtaskRow {
  rowNumber: number; // 1-indexed row number in the Excel sheet
  storyKey: string;
  summary: string;
  assigneeInput: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  reporterInput: string;
  component1: string;
  component2?: string;
  component3?: string;
  priority: string;
  description?: string;
  // Resolved Jira Metadata
  resolvedProjectKey?: string;
  resolvedAssigneeId?: string;
  resolvedAssigneeName?: string;
  resolvedReporterId?: string;
  resolvedReporterName?: string;
  resolvedPriorityId?: string;
  resolvedComponentIds?: string[];
  // Validation Info
  validationStatus: RowValidationStatus;
  validationErrors: string[];
  validationWarnings?: string[];
  // Duplicate Information
  duplicateInfo?: {
    existingKey: string;
    existingSummary: string;
    existingStatus: string;
  };
  // User override decision for duplicates
  duplicateAction?: "SKIP" | "IMPORT_ANYWAY";
}

export interface ExcelParseResult {
  fileName: string;
  fileSize: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ParsedSubtaskRow[];
  headerErrors: string[];
  parsingErrors: string[];
}

