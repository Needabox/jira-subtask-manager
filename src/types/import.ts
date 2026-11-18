export type ExecutionRowStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "DUPLICATE"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export interface ImportRowResult {
  id?: number;
  sessionId: string;
  rowNumber: number;
  storyKey: string;
  summary: string;
  status: ExecutionRowStatus;
  jiraKey?: string;
  jiraUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetail?: string;
  timestamp: string;
  // Raw fields to enable full fidelity export of failed rows
  assigneeInput?: string;
  startDate?: string;
  dueDate?: string;
  estimasiJam?: string;
  reporterInput?: string;
  component1?: string;
  component2?: string;
  component3?: string;
  priority?: string;
  description?: string;
}

export interface ImportSession {
  id: string; // UUID or timestamp based
  fileName: string;
  projectKeys: string[];
  importDate: string; // ISO string
  totalRows: number;
  validRows: number;
  selectedRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  skippedRows: number;
  status: "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "FAILED";
}

export interface ImportProgress {
  sessionId: string;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  currentStoryKey?: string;
  currentSummary?: string;
  isComplete: boolean;
}

