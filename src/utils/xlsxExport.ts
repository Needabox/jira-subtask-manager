import * as XLSX from 'xlsx';
import { REQUIRED_EXCEL_HEADERS } from '@/types/excel';
import { ImportRowResult } from '@/types/import';

export function exportFailedRowsToExcel(failedRows: ImportRowResult[], originalFileName: string): void {
  const exportHeaders = [
    ...REQUIRED_EXCEL_HEADERS,
    'Import Status',
    'Error',
    'Error Detail',
  ];

  const exportData: unknown[][] = [exportHeaders];

  for (const row of failedRows) {
    exportData.push([
      row.storyKey || '',
      row.summary || '',
      row.assigneeInput || '',
      row.startDate || '',
      row.dueDate || '',
      row.estimasiJam || '',
      row.reporterInput || '',
      row.component1 || '',
      row.component2 || '',
      row.component3 || '',
      row.priority || '',
      row.description || '',
      row.status || 'FAILED',
      row.errorMessage || 'Creation failed',
      row.errorDetail || '',
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(exportData);

  worksheet['!cols'] = [
    { wch: 14 }, // Story Key
    { wch: 35 }, // Subtask
    { wch: 26 }, // Assignee
    { wch: 14 }, // Start Date
    { wch: 14 }, // Due Date
    { wch: 15 }, // Estimasi
    { wch: 26 }, // Reporter
    { wch: 18 }, // Component 1
    { wch: 18 }, // Component 2
    { wch: 18 }, // Component 3
    { wch: 12 }, // Priority
    { wch: 35 }, // Deskripsi
    { wch: 15 }, // Import Status
    { wch: 35 }, // Error
    { wch: 45 }, // Error Detail
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Failed_Subtasks');

  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const downloadName = `${baseName}_failed_${timestamp}.xlsx`;

  XLSX.writeFile(workbook, downloadName);
}

