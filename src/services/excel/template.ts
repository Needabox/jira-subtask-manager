import * as XLSX from 'xlsx';
import { REQUIRED_EXCEL_HEADERS } from '@/types/excel';

export function generateExcelTemplate(): Blob {
  // 1. Data Sheet with required headers and sample data
  const sampleData = [
    [...REQUIRED_EXCEL_HEADERS],
    [
      'PROJ-101',                     // Story Key
      'Implement authentication UI',  // Subtask (Summary)
      'john.doe@company.com',         // Assignee (nama/email)
      '2026-11-15',                   // Start Date (YYYY-MM-DD)
      '2026-11-20',                   // Due Date (YYYY-MM-DD)
      '8',                            // Estimasi (jam) - template requires it, but ignored during import
      'jane.smith@company.com',       // Reporter (nama/email)
      'Frontend',                     // Component 1 (Required)
      'UI/UX',                        // Component 2 (Optional)
      '',                             // Component 3 (Optional)
      'High',                         // Priority
      'Design and build login modal', // Deskripsi (opsional)
    ],
    [
      'PROJ-101',
      'Write unit tests for auth hooks',
      'john.doe@company.com',
      '2026-11-21',
      '2026-11-23',
      '4',
      'jane.smith@company.com',
      'Frontend',
      '',
      '',
      'Medium',
      'Cover login, logout, and token refresh scenarios',
    ],
  ];

  const dataSheet = XLSX.utils.aoa_to_sheet(sampleData);

  // Set column widths for comfortable reading
  dataSheet['!cols'] = [
    { wch: 14 }, // Story Key
    { wch: 35 }, // Subtask (Summary)
    { wch: 28 }, // Assignee (nama/email)
    { wch: 14 }, // Start Date
    { wch: 14 }, // Due Date
    { wch: 15 }, // Estimasi (jam)
    { wch: 28 }, // Reporter (nama/email)
    { wch: 18 }, // Component 1
    { wch: 18 }, // Component 2
    { wch: 18 }, // Component 3
    { wch: 12 }, // Priority
    { wch: 40 }, // Deskripsi (opsional)
  ];

  // 2. Instructions Sheet
  const instructions = [
    ['JIRA SUBTASK MANAGER — IMPORT TEMPLATE GUIDE'],
    [''],
    ['Petunjuk Pengisian:', ''],
    ['1. Jangan mengubah nama atau urutan header kolom pada sheet "Subtasks".'],
    ['2. Format Tanggal:', 'Gunakan format YYYY-MM-DD (contoh: 2026-11-15).'],
    ['3. Kolom Wajib:', 'Story Key, Subtask (Summary), Assignee, Start Date, Due Date, Reporter, Component 1, Priority.'],
    ['4. Kolom Opsional:', 'Component 2, Component 3, Deskripsi (opsional).'],
    ['5. Aturan Estimasi (jam):', 'Kolom ini WAJIB ada di template, namun nilainya diabaikan oleh sistem saat import.'],
    ['6. Assignee & Reporter:', 'Masukkan nama lengkap atau alamat email user Jira yang terdaftar.'],
    ['7. Duplicate Check:', 'Sistem akan memeriksa jika Subtask dengan summary yang sama sudah ada di parent Story.'],
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 25 }, { wch: 70 }];

  // 3. Assemble Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Subtasks');
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Petunjuk (Instructions)');

  // 4. Export as Blob
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadTemplateFile(): void {
  const blob = generateExcelTemplate();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'jira_subtask_import_template.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
