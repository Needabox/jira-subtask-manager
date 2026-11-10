import * as XLSX from 'xlsx';
import { REQUIRED_EXCEL_HEADERS, ParsedSubtaskRow, ExcelParseResult } from '@/types/excel';
import { parseExcelDate } from '@/utils/dates';

export function parseExcelFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): ExcelParseResult {
  const result: ExcelParseResult = {
    fileName,
    fileSize,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    rows: [],
    headerErrors: [],
    parsingErrors: [],
  };

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  } catch (err: unknown) {
    result.parsingErrors.push(`Failed to read Excel file: ${err instanceof Error ? err.message : 'Invalid format'}`);
    return result;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    result.parsingErrors.push('The Excel workbook contains no sheets.');
    return result;
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    result.parsingErrors.push('The selected worksheet is empty.');
    return result;
  }

  // Convert worksheet to array of arrays (raw string/dates/numbers)
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawData.length === 0) {
    result.parsingErrors.push('The worksheet contains no data rows.');
    return result;
  }

  // 1. Validate Header Row
  const rawHeaders = (rawData[0] || []).map((h) => String(h || '').trim());

  // Check count and order
  const headerErrors: string[] = [];
  for (let i = 0; i < REQUIRED_EXCEL_HEADERS.length; i++) {
    const expected = REQUIRED_EXCEL_HEADERS[i];
    const actual = rawHeaders[i];
    if (actual !== expected) {
      headerErrors.push(
        `Column ${i + 1}: expected "${expected}", but found "${actual || '(empty)'}"`
      );
    }
  }

  if (rawHeaders.length > REQUIRED_EXCEL_HEADERS.length) {
    headerErrors.push(
      `File has ${rawHeaders.length} columns, but expected exactly ${REQUIRED_EXCEL_HEADERS.length}`
    );
  }

  if (headerErrors.length > 0) {
    result.headerErrors = headerErrors;
    result.parsingErrors.push('Excel headers do not match the required template.');
    return result;
  }

  // 2. Process Data Rows (starting from index 1)
  const parsedRows: ParsedSubtaskRow[] = [];

  for (let rowIndex = 1; rowIndex < rawData.length; rowIndex++) {
    const row = rawData[rowIndex];
    if (!row || row.length === 0) continue;

    // Check if entire row is empty
    const isEntirelyEmpty = row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
    if (isEntirelyEmpty) continue;

    const rowNumber = rowIndex + 1; // 1-indexed row in Excel
    const errors: string[] = [];

    // Extract columns strictly by position
    const storyKeyRaw = String(row[0] ?? '').trim();
    const summaryRaw = String(row[1] ?? '').trim();
    const assigneeRaw = String(row[2] ?? '').trim();
    const startDateRaw = row[3];
    const dueDateRaw = row[4];
    // row[5] is "Estimasi (jam)" -> completely ignored
    const reporterRaw = String(row[6] ?? '').trim();
    const component1Raw = String(row[7] ?? '').trim();
    const component2Raw = String(row[8] ?? '').trim();
    const component3Raw = String(row[9] ?? '').trim();
    const priorityRaw = String(row[10] ?? '').trim();
    const descriptionRaw = String(row[11] ?? '').trim();

    // Syntax validation for required fields
    if (!storyKeyRaw) {
      errors.push('Story Key is required');
    } else if (!/^[A-Z0-9]+-\d+$/i.test(storyKeyRaw)) {
      errors.push(`Story Key "${storyKeyRaw}" is not a valid Jira issue key format (e.g. PROJ-123)`);
    }

    if (!summaryRaw) {
      errors.push('Subtask (Summary) is required');
    } else if (summaryRaw.length > 255) {
      errors.push('Subtask (Summary) exceeds maximum length of 255 characters');
    }

    if (!assigneeRaw) {
      errors.push('Assignee is required');
    }

    if (!reporterRaw) {
      errors.push('Reporter is required');
    }

    if (!component1Raw) {
      errors.push('Component 1 is required');
    }

    if (!priorityRaw) {
      errors.push('Priority is required');
    }

    // Date parsing
    const parsedStart = parseExcelDate(startDateRaw);
    let startDateFormatted = '';
    if (parsedStart.error || !parsedStart.isoDate) {
      errors.push(`Start Date: ${parsedStart.error || 'Invalid date'}`);
    } else {
      startDateFormatted = parsedStart.isoDate;
    }

    const parsedDue = parseExcelDate(dueDateRaw);
    let dueDateFormatted = '';
    if (parsedDue.error || !parsedDue.isoDate) {
      errors.push(`Due Date: ${parsedDue.error || 'Invalid date'}`);
    } else {
      dueDateFormatted = parsedDue.isoDate;
    }

    // Start Date <= Due Date check
    if (startDateFormatted && dueDateFormatted) {
      if (startDateFormatted > dueDateFormatted) {
        errors.push(`Start Date (${startDateFormatted}) cannot be after Due Date (${dueDateFormatted})`);
      }
    }

    const parsedRow: ParsedSubtaskRow = {
      rowNumber,
      storyKey: storyKeyRaw.toUpperCase(),
      summary: summaryRaw,
      assigneeInput: assigneeRaw,
      startDate: startDateFormatted,
      dueDate: dueDateFormatted,
      reporterInput: reporterRaw,
      component1: component1Raw,
      component2: component2Raw || undefined,
      component3: component3Raw || undefined,
      priority: priorityRaw,
      description: descriptionRaw || undefined,
      validationStatus: errors.length > 0 ? 'INVALID' : 'VALID',
      validationErrors: errors,
    };

    parsedRows.push(parsedRow);
  }

  result.rows = parsedRows;
  result.totalRows = parsedRows.length;
  result.validRows = parsedRows.filter((r) => r.validationStatus === 'VALID').length;
  result.invalidRows = parsedRows.filter((r) => r.validationStatus === 'INVALID').length;
  result.duplicateRows = 0;

  return result;
}
