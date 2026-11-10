import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile } from '@/services/excel/parser';
import { generateExcelTemplate } from '@/services/excel/template';
import { REQUIRED_EXCEL_HEADERS } from '@/types/excel';

describe('Excel Parser & Template Generator', () => {
  it('generated template has exact 12 headers in exact order', async () => {
    const templateBlob = generateExcelTemplate();
    const arrayBuffer = await templateBlob.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const headers = json[0];
    expect(headers.length).toBe(12);
    for (let i = 0; i < REQUIRED_EXCEL_HEADERS.length; i++) {
      expect(headers[i]).toBe(REQUIRED_EXCEL_HEADERS[i]);
    }
  });

  it('parses generated template successfully with sample rows', async () => {
    const templateBlob = generateExcelTemplate();
    const arrayBuffer = await templateBlob.arrayBuffer();
    const res = parseExcelFile(arrayBuffer, 'template.xlsx', arrayBuffer.byteLength);

    expect(res.headerErrors.length).toBe(0);
    expect(res.totalRows).toBe(2);
    expect(res.rows[0].storyKey).toBe('PROJ-101');
    expect(res.rows[0].summary).toBe('Implement authentication UI');
    expect(res.rows[0].validationStatus).toBe('VALID');
  });

  it('detects altered or misplaced headers', () => {
    const invalidHeaders = [
      'Subtask (Summary)', // Swapped!
      'Story Key',
      ...REQUIRED_EXCEL_HEADERS.slice(2),
    ];

    const data = [invalidHeaders, ['PROJ-1', 'Test', 'user@domain.com']];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'invalid_headers.xlsx', 1000);
    expect(res.headerErrors.length).toBeGreaterThan(0);
    expect(res.headerErrors[0]).toContain('expected "Story Key"');
  });

  it('strictly ignores Estimasi (jam) without affecting validation', () => {
    const headers = [...REQUIRED_EXCEL_HEADERS];
    const rowWithWeirdEstimation = [
      'PROJ-200',
      'Task with high estimation',
      'user@company.com',
      '2026-11-01',
      '2026-11-05',
      '9999999999 abc! invalid number format', // Weird value in Estimasi (jam)
      'reporter@company.com',
      'Backend',
      '',
      '',
      'High',
      '',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, rowWithWeirdEstimation]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'test.xlsx', 1000);
    expect(res.totalRows).toBe(1);
    // Even though Estimasi has invalid string, the row is VALID because Estimasi is ignored
    expect(res.rows[0].validationStatus).toBe('VALID');
    expect(res.rows[0].validationErrors.length).toBe(0);
  });

  it('skips entirely empty rows correctly', () => {
    const headers = [...REQUIRED_EXCEL_HEADERS];
    const data = [
      headers,
      ['PROJ-1', 'Subtask 1', 'user@co.com', '2026-11-01', '2026-11-02', '4', 'rep@co.com', 'UI', '', '', 'Low', ''],
      ['', '', '', '', '', '', '', '', '', '', '', ''], // empty row
      ['', null, undefined, '   ', '', '', '', '', '', '', '', ''], // whitespace row
      ['PROJ-1', 'Subtask 2', 'user@co.com', '2026-11-03', '2026-11-04', '2', 'rep@co.com', 'UI', '', '', 'Low', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const res = parseExcelFile(buffer, 'test_empty.xlsx', 1000);
    expect(res.totalRows).toBe(2);
    expect(res.rows[0].summary).toBe('Subtask 1');
    expect(res.rows[1].summary).toBe('Subtask 2');
  });
});
