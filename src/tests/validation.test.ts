import { describe, it, expect } from 'vitest';
import { parseExcelFile } from '@/services/excel/parser';
import { REQUIRED_EXCEL_HEADERS } from '@/types/excel';
import * as XLSX from 'xlsx';

describe('Row Validation Rules', () => {
  it('flags invalid Story Key format', () => {
    const headers = [...REQUIRED_EXCEL_HEADERS];
    const invalidRow = [
      'INVALID_KEY_NO_DASH',
      'Valid summary',
      'user@company.com',
      '2026-11-01',
      '2026-11-02',
      '1',
      'rep@company.com',
      'Component',
      '',
      '',
      'High',
      '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, invalidRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'test.xlsx', 1000);
    expect(res.rows[0].validationStatus).toBe('INVALID');
    expect(res.rows[0].validationErrors.some((e) => e.includes('not a valid Jira issue key'))).toBe(true);
  });

  it('flags missing required fields (Assignee, Reporter, Component 1, Priority)', () => {
    const headers = [...REQUIRED_EXCEL_HEADERS];
    const missingFieldsRow = [
      'PROJ-1',
      'Valid summary',
      '', // Missing Assignee
      '2026-11-01',
      '2026-11-02',
      '1',
      '', // Missing Reporter
      '', // Missing Component 1
      '',
      '',
      '', // Missing Priority
      '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, missingFieldsRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'test.xlsx', 1000);
    expect(res.rows[0].validationStatus).toBe('INVALID');
    expect(res.rows[0].validationErrors.some((e) => e.includes('Assignee is required'))).toBe(true);
    expect(res.rows[0].validationErrors.some((e) => e.includes('Reporter is required'))).toBe(true);
    expect(res.rows[0].validationErrors.some((e) => e.includes('Component 1 is required'))).toBe(true);
    expect(res.rows[0].validationErrors.some((e) => e.includes('Priority is required'))).toBe(true);
  });

  it('flags error when Start Date is after Due Date', () => {
    const headers = [...REQUIRED_EXCEL_HEADERS];
    const badDateRow = [
      'PROJ-1',
      'Valid summary',
      'user@co.com',
      '2026-11-20', // Start Date after Due Date
      '2026-11-10', // Due Date
      '1',
      'rep@co.com',
      'Frontend',
      '',
      '',
      'High',
      '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, badDateRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'test.xlsx', 1000);
    expect(res.rows[0].validationStatus).toBe('INVALID');
    expect(res.rows[0].validationErrors.some((e) => e.includes('cannot be after Due Date'))).toBe(true);
  });
});

