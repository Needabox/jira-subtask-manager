import { describe, it, expect } from 'vitest';
import { parseExcelDate, isStartDateAfterDueDate, isTaskOverdue } from '@/utils/dates';

describe('Date Utilities & Overdue Logic', () => {
  it('parses ISO date string correctly', () => {
    const res = parseExcelDate('2026-11-15');
    expect(res.isoDate).toBe('2026-11-15');
    expect(res.error).toBeUndefined();
  });

  it('parses slash date formats correctly', () => {
    const res1 = parseExcelDate('2026/11/15');
    expect(res1.isoDate).toBe('2026-11-15');

    const res2 = parseExcelDate('15/11/2026');
    expect(res2.isoDate).toBe('2026-11-15');
  });

  it('parses Excel numeric serial dates correctly', () => {
    const res = parseExcelDate(45245);
    expect(typeof res.isoDate).toBe('string');
    expect(res.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('detects when start date is after due date', () => {
    expect(isStartDateAfterDueDate('2026-11-20', '2026-11-15')).toBe(true);
    expect(isStartDateAfterDueDate('2026-11-15', '2026-11-20')).toBe(false);
    expect(isStartDateAfterDueDate('2026-11-15', '2026-11-15')).toBe(false);
  });

  it('calculates overdue tasks correctly', () => {
    // Past date not completed -> overdue
    expect(isTaskOverdue('2020-01-01', 'indeterminate')).toBe(true);
    expect(isTaskOverdue('2020-01-01', 'new')).toBe(true);

    // Past date but statusCategory is "done" -> not overdue
    expect(isTaskOverdue('2020-01-01', 'done')).toBe(false);

    // Future date -> not overdue
    expect(isTaskOverdue('2099-01-01', 'new')).toBe(false);

    // Null/empty date -> not overdue
    expect(isTaskOverdue(null, 'new')).toBe(false);
    expect(isTaskOverdue('', 'new')).toBe(false);
  });
});
