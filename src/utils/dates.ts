import { format, parse, isValid, isAfter, startOfDay } from 'date-fns';

/**
 * Converts an Excel serial date number (e.g. 45200) or date string into YYYY-MM-DD format.
 */
export function parseExcelDate(value: unknown): { isoDate: string | null; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { isoDate: null, error: 'Date is empty' };
  }

  // 1. If it's already a Date object (SheetJS with cellDates: true)
  if (value instanceof Date) {
    if (isValid(value)) {
      return { isoDate: format(value, 'yyyy-MM-dd') };
    }
    return { isoDate: null, error: 'Invalid Date object' };
  }

  // 2. If it's a numeric Excel serial date
  if (typeof value === 'number') {
    if (isNaN(value) || value <= 0) {
      return { isoDate: null, error: 'Invalid numeric date' };
    }
    // Excel base date: 1899-12-30 (handling Excel 1900 leap year bug)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const millis = Math.round(value * 86400000);
    const date = new Date(excelEpoch.getTime() + millis);
    if (isValid(date)) {
      return { isoDate: format(date, 'yyyy-MM-dd') };
    }
    return { isoDate: null, error: 'Unable to convert Excel serial date' };
  }

  // 3. If it's a string
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { isoDate: null, error: 'Date is empty' };
    }

    // Try parsing as ISO YYYY-MM-DD directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = parse(trimmed, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) {
        return { isoDate: trimmed };
      }
    }

    // Common alternative formats
    const candidateFormats = [
      'yyyy/MM/dd',
      'dd/MM/yyyy',
      'dd-MM-yyyy',
      'MM/dd/yyyy',
      'MM-dd-yyyy',
      'd/M/yyyy',
      'yyyy.MM.dd',
    ];

    for (const fmt of candidateFormats) {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed)) {
        return { isoDate: format(parsed, 'yyyy-MM-dd') };
      }
    }

    // Fallback to Date.parse
    const fallback = new Date(trimmed);
    if (isValid(fallback) && !isNaN(fallback.getTime())) {
      return { isoDate: format(fallback, 'yyyy-MM-dd') };
    }

    return { isoDate: null, error: `Unrecognized date format: "${trimmed}" (expected YYYY-MM-DD)` };
  }

  return { isoDate: null, error: 'Unsupported date value type' };
}

/**
 * Checks if startDate is strictly after dueDate.
 */
export function isStartDateAfterDueDate(startDate: string, dueDate: string): boolean {
  try {
    const start = parse(startDate, 'yyyy-MM-dd', new Date());
    const due = parse(dueDate, 'yyyy-MM-dd', new Date());
    if (isValid(start) && isValid(due)) {
      return isAfter(startOfDay(start), startOfDay(due));
    }
  } catch {
    // If parse fails
  }
  return false;
}

/**
 * Checks if a task is overdue:
 * Due Date < Today AND status category is not "Done".
 */
export function isTaskOverdue(dueDateStr: string | null | undefined, statusCategoryKey?: string): boolean {
  if (!dueDateStr) return false;
  if (statusCategoryKey === 'done') return false;

  try {
    const due = parse(dueDateStr, 'yyyy-MM-dd', new Date());
    if (!isValid(due)) return false;
    const today = startOfDay(new Date());
    return isAfter(today, startOfDay(due));
  } catch {
    return false;
  }
}
