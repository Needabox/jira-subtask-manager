import React, { useState, useRef, useMemo } from 'react';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { downloadTemplateFile } from '@/services/excel/template';
import { parseExcelFile } from '@/services/excel/parser';
import { validateRowsWithJira } from '@/services/excel/validator';
import { executeSubtaskImport } from '@/services/import/executor';
import { ParsedSubtaskRow, RowValidationStatus } from '@/types/excel';
import { ImportProgress, ImportSession } from '@/types/import';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ArrowRight,
  Loader2,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type Step = 'UPLOAD' | 'PREVIEW' | 'EXECUTING' | 'RESULT';

export const ImportTasksPage: React.FC = () => {
  const { isConnected } = useJiraAuth();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('UPLOAD');

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedSubtaskRow[]>([]);

  // Preview filtering & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RowValidationStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Selected row for detail modal
  const [inspectRow, setInspectRow] = useState<ParsedSubtaskRow | null>(null);

  // Execution state
  const [execProgress, setExecProgress] = useState<ImportProgress | null>(null);
  const [completedSession, setCompletedSession] = useState<ImportSession | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Handle File Upload & Parsing
  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx')) {
      alert('Please select a valid Excel file (.xlsx format)');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);
    setHeaderErrors([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const parseResult = parseExcelFile(buffer, selectedFile.name, selectedFile.size);

      if (parseResult.headerErrors.length > 0) {
        setHeaderErrors(parseResult.headerErrors);
        setIsParsing(false);
        return;
      }

      if (parseResult.rows.length === 0) {
        setHeaderErrors(['The Excel sheet has no valid data rows to import.']);
        setIsParsing(false);
        return;
      }

      setRows(parseResult.rows);
      setCurrentStep('PREVIEW');
      setIsParsing(false);

      // Trigger Jira metadata validation if connected
      if (isConnected) {
        setIsValidating(true);
        const validated = await validateRowsWithJira(parseResult.rows, (curr, tot) => {
          setValidationProgress({ current: curr, total: tot });
        });
        setRows(validated);
        setIsValidating(false);
      }
    } catch (err: unknown) {
      setHeaderErrors([err instanceof Error ? err.message : 'Failed to parse Excel file']);
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setHeaderErrors([]);
    setCurrentStep('UPLOAD');
    setCompletedSession(null);
    setExecProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Toggle Duplicate Action (Skip vs Import Anyway)
  const toggleDuplicateAction = (rowNumber: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber === rowNumber) {
          const next = r.duplicateAction === 'IMPORT_ANYWAY' ? 'SKIP' : 'IMPORT_ANYWAY';
          return { ...r, duplicateAction: next };
        }
        return r;
      })
    );
  };

  // 2. Computed Counts
  const validCount = rows.filter((r) => r.validationStatus === 'VALID').length;
  const invalidCount = rows.filter((r) => r.validationStatus === 'INVALID').length;
  const duplicateCount = rows.filter((r) => r.validationStatus === 'DUPLICATE').length;
  const duplicateAllowedCount = rows.filter(
    (r) => r.validationStatus === 'DUPLICATE' && r.duplicateAction === 'IMPORT_ANYWAY'
  ).length;

  const totalEligibleToImport = validCount + duplicateAllowedCount;

  // Filtered rows for preview table
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.validationStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          row.storyKey.toLowerCase().includes(query) ||
          row.summary.toLowerCase().includes(query) ||
          row.assigneeInput.toLowerCase().includes(query) ||
          row.reporterInput.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // 3. Execution handler
  const handleStartImport = async () => {
    if (!file || totalEligibleToImport === 0) return;

    setCurrentStep('EXECUTING');

    try {
      const session = await executeSubtaskImport({
        fileName: file.name,
        rows,
        onProgress: (p) => {
          setExecProgress(p);
        },
      });

      setCompletedSession(session);
      setCurrentStep('RESULT');
    } catch (err: unknown) {
      alert(`Import error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Template Download */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Bulk Import Subtasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an Excel sheet (.xlsx) to create Jira Subtasks in bulk with client-side validation.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={downloadTemplateFile}
          className="gap-2 shrink-0 w-full md:w-auto border-primary/20 hover:border-primary/50 text-foreground"
        >
          <Download className="h-4 w-4 text-primary" />
          <span>Download Excel Template</span>
        </Button>
      </div>

      {!isConnected && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Jira connection is not active</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
            <span>
              You can parse Excel files, but live Jira validation and Subtask creation require an active connection.
            </span>
            <Link to="/settings" className="underline font-semibold shrink-0">
              Connect Jira
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* STEP 1: UPLOAD DROPZONE */}
      {currentStep === 'UPLOAD' && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-border rounded-xl p-6 sm:p-12 text-center bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px] sm:min-h-[300px]"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              accept=".xlsx"
              className="hidden"
            />
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
              <UploadCloud className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {isParsing ? 'Reading Excel file...' : 'Drop your Excel file here or click to browse'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Supports <span className="font-semibold">.xlsx</span> files matching the Jira Subtask Manager template.
              12 headers required. Estimasi (jam) will be preserved in template but ignored during import.
            </p>

            {isParsing && (
              <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Parsing worksheet rows...</span>
              </div>
            )}
          </div>

          {/* Header Errors Alert */}
          {headerErrors.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Excel Header Validation Failed</AlertTitle>
              <AlertDescription className="mt-2 space-y-1 text-xs">
                <p>The uploaded Excel file does not match the mandatory header specification:</p>
                <ul className="list-disc pl-5 space-y-0.5 font-mono">
                  {headerErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Button size="sm" variant="outline" onClick={downloadTemplateFile} className="gap-1.5 text-xs">
                    <Download className="h-3 w-3" />
                    <span>Download Official Template</span>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Template Info Card */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                <span>Template Header Reference</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Headers must appear in this exact order (12 columns):
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 1 (Req)</span>
                  <span className="font-semibold">Story Key</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 2 (Req)</span>
                  <span className="font-semibold">Subtask (Summary)</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 3 (Req)</span>
                  <span className="font-semibold">Assignee (nama/email)</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 4 (Req)</span>
                  <span className="font-semibold">Start Date</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 5 (Req)</span>
                  <span className="font-semibold">Due Date</span>
                </div>
                <div className="p-2 rounded border bg-amber-500/10 border-amber-500/20">
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 block font-mono">Col 6 (Ignored)</span>
                  <span className="font-semibold text-amber-800 dark:text-amber-200">Estimasi (jam)</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 7 (Req)</span>
                  <span className="font-semibold">Reporter (nama/email)</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 8 (Req)</span>
                  <span className="font-semibold">Component 1</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 9 (Opt)</span>
                  <span>Component 2</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 10 (Opt)</span>
                  <span>Component 3</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 11 (Req)</span>
                  <span className="font-semibold">Priority</span>
                </div>
                <div className="p-2 rounded border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground block font-mono">Col 12 (Opt)</span>
                  <span>Deskripsi (opsional)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 2: PREVIEW & VALIDATION TABLE */}
      {currentStep === 'PREVIEW' && (
        <div className="space-y-6">
          {/* File Meta & Action Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 rounded-xl border bg-card">
            <div className="flex items-start sm:items-center space-x-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate max-w-full">{file?.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({file ? (file.size / 1024).toFixed(1) : 0} KB)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Parsed {rows.length} rows. Estimasi (jam) is omitted from preview and import execution.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove File</span>
              </Button>

              <Button
                variant="jira"
                size="sm"
                disabled={totalEligibleToImport === 0 || isValidating || !isConnected}
                onClick={handleStartImport}
                className="gap-1.5 text-xs font-semibold"
              >
                <span>Import {totalEligibleToImport} Selected Subtasks</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Validation Status Progress Banner */}
          {isValidating && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Validating with Jira (projects, users, components, duplicates)...</span>
                  </div>
                  <span className="font-mono text-muted-foreground shrink-0">
                    {validationProgress.current} / {validationProgress.total} rows
                  </span>
                </div>
                <Progress
                  value={
                    validationProgress.total
                      ? (validationProgress.current / validationProgress.total) * 100
                      : 0
                  }
                  className="h-1.5"
                />
              </CardContent>
            </Card>
          )}

          {/* Summary Badges Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              onClick={() => setStatusFilter('ALL')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'ALL' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'bg-card'
              }`}
            >
              <div className="text-xs text-muted-foreground">Total Rows</div>
              <div className="text-xl font-bold mt-1">{rows.length}</div>
            </div>

            <div
              onClick={() => setStatusFilter('VALID')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'VALID' ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-500/5' : 'bg-card'
              }`}
            >
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-between">
                <span>Valid Rows</span>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{validCount}</div>
            </div>

            <div
              onClick={() => setStatusFilter('DUPLICATE')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'DUPLICATE' ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-500/5' : 'bg-card'
              }`}
            >
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center justify-between">
                <span>Duplicates</span>
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{duplicateCount}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {duplicateAllowedCount} set to import
              </div>
            </div>

            <div
              onClick={() => setStatusFilter('INVALID')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                statusFilter === 'INVALID' ? 'border-destructive ring-1 ring-destructive bg-destructive/5' : 'bg-card'
              }`}
            >
              <div className="text-xs text-destructive font-medium flex items-center justify-between">
                <span>Invalid Rows</span>
                <XCircle className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold text-destructive mt-1">{invalidCount}</div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Story Key, Summary, Assignee..."
                className="pl-8 text-xs h-9"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="text-xs text-muted-foreground self-end sm:self-center">
              Showing {filteredRows.length} of {rows.length} rows
            </div>
          </div>

          {/* Mobile Card Preview (< md) */}
          <div className="md:hidden space-y-3">
            {paginatedRows.length === 0 ? (
              <div className="border rounded-xl bg-card p-8 text-center text-muted-foreground text-xs">
                No rows match current filter.
              </div>
            ) : (
              paginatedRows.map((row) => (
                <Card
                  key={row.rowNumber}
                  className={
                    row.validationStatus === 'INVALID'
                      ? 'border-destructive/40 bg-destructive/5'
                      : row.validationStatus === 'DUPLICATE'
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : ''
                  }
                >
                  <CardContent className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] text-muted-foreground">#{row.rowNumber}</span>
                        <span className="font-mono text-xs font-semibold text-primary truncate">
                          {row.storyKey}
                        </span>
                      </div>
                      {row.validationStatus === 'VALID' && (
                        <Badge variant="success" className="text-[10px] shrink-0">
                          VALID
                        </Badge>
                      )}
                      {row.validationStatus === 'INVALID' && (
                        <Badge variant="destructive" className="text-[10px] shrink-0">
                          INVALID
                        </Badge>
                      )}
                      {row.validationStatus === 'DUPLICATE' && (
                        <Badge variant="warning" className="text-[10px] shrink-0">
                          DUPLICATE
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs font-semibold text-foreground break-words">{row.summary}</p>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <div className="truncate">
                        <span className="opacity-75">Assignee: </span>
                        <span className="text-foreground">{row.resolvedAssigneeName || row.assigneeInput}</span>
                      </div>
                      <div className="truncate">
                        <span className="opacity-75">Priority: </span>
                        <span className="text-foreground">{row.priority}</span>
                      </div>
                      <div className="font-mono truncate">
                        <span>{row.startDate}</span> → <span>{row.dueDate}</span>
                      </div>
                      <div className="truncate">
                        <span className="opacity-75">Comp: </span>
                        <span className="text-foreground">{row.component1}</span>
                      </div>
                    </div>

                    {row.validationErrors.length > 0 && (
                      <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 truncate">
                        {row.validationErrors[0]}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1 border-t">
                      {row.validationStatus === 'DUPLICATE' && (
                        <Button
                          variant={row.duplicateAction === 'IMPORT_ANYWAY' ? 'jira' : 'outline'}
                          size="sm"
                          className="h-7 px-2.5 text-[11px]"
                          onClick={() => toggleDuplicateAction(row.rowNumber)}
                        >
                          {row.duplicateAction === 'IMPORT_ANYWAY' ? 'Import Anyway' : 'Skip Duplicate'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-[11px]"
                        onClick={() => setInspectRow(row)}
                      >
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Desktop Preview Table (>= md) */}
          <div className="hidden md:block border rounded-xl bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">Row</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-28">Story Key</TableHead>
                  <TableHead className="min-w-[200px]">Subtask Summary</TableHead>
                  <TableHead className="w-36">Assignee</TableHead>
                  <TableHead className="w-24">Start Date</TableHead>
                  <TableHead className="w-24">Due Date</TableHead>
                  <TableHead className="w-32">Reporter</TableHead>
                  <TableHead className="w-24">Component 1</TableHead>
                  <TableHead className="w-20">Priority</TableHead>
                  <TableHead className="w-20 text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center text-muted-foreground text-xs">
                      No rows match current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={
                        row.validationStatus === 'INVALID'
                          ? 'bg-destructive/5'
                          : row.validationStatus === 'DUPLICATE'
                          ? 'bg-amber-500/5'
                          : ''
                      }
                    >
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell>
                        {row.validationStatus === 'VALID' && (
                          <Badge variant="success" className="text-[10px]">
                            VALID
                          </Badge>
                        )}
                        {row.validationStatus === 'INVALID' && (
                          <Badge variant="destructive" className="text-[10px]">
                            INVALID
                          </Badge>
                        )}
                        {row.validationStatus === 'DUPLICATE' && (
                          <Badge variant="warning" className="text-[10px]">
                            DUPLICATE
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {row.storyKey}
                      </TableCell>
                      <TableCell className="font-medium text-xs max-w-[260px] truncate" title={row.summary}>
                        {row.summary}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[140px]" title={row.assigneeInput}>
                        {row.resolvedAssigneeName || row.assigneeInput}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {row.startDate}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {row.dueDate}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]" title={row.reporterInput}>
                        {row.resolvedReporterName || row.reporterInput}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[100px]" title={row.component1}>
                        {row.component1}
                      </TableCell>
                      <TableCell className="text-xs">{row.priority}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setInspectRow(row)}
                          >
                            Details
                          </Button>
                          {row.validationStatus === 'DUPLICATE' && (
                            <Button
                              variant={row.duplicateAction === 'IMPORT_ANYWAY' ? 'jira' : 'outline'}
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => toggleDuplicateAction(row.rowNumber)}
                              title={
                                row.duplicateAction === 'IMPORT_ANYWAY'
                                  ? 'Click to Skip'
                                  : 'Click to Import Anyway'
                              }
                            >
                              {row.duplicateAction === 'IMPORT_ANYWAY' ? 'Import' : 'Skip'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border rounded-xl bg-card text-xs">
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-7 text-xs"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-7 text-xs"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: EXECUTION IN PROGRESS */}
      {currentStep === 'EXECUTING' && (
        <Card className="border-primary/30 p-6 space-y-6 text-center max-w-xl mx-auto my-12">
          <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>

          <div>
            <h2 className="text-xl font-bold">Importing Subtasks to Jira...</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Executing requests with controlled concurrency and rate limit protection.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span>
                Processed: {execProgress?.processed || 0} / {execProgress?.total || totalEligibleToImport}
              </span>
              <span>
                {Math.round(
                  ((execProgress?.processed || 0) / (execProgress?.total || 1)) * 100
                )}
                %
              </span>
            </div>
            <Progress
              value={
                execProgress?.total
                  ? ((execProgress.processed || 0) / execProgress.total) * 100
                  : 0
              }
              className="h-2"
            />
          </div>

          {execProgress?.currentStoryKey && (
            <div className="text-xs p-3 rounded-lg bg-muted text-left space-y-1">
              <div className="font-semibold text-primary font-mono">
                Parent: {execProgress.currentStoryKey}
              </div>
              <div className="truncate text-muted-foreground">
                Creating: {execProgress.currentSummary}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              Success: {execProgress?.successful || 0}
            </div>
            <div className="p-2 rounded bg-destructive/10 text-destructive font-semibold">
              Failed: {execProgress?.failed || 0}
            </div>
            <div className="p-2 rounded bg-muted text-muted-foreground font-semibold">
              Skipped: {execProgress?.skipped || 0}
            </div>
          </div>
        </Card>
      )}

      {/* STEP 4: IMPORT COMPLETED RESULT */}
      {currentStep === 'RESULT' && completedSession && (
        <Card className="border-emerald-500/30 p-6 space-y-6 max-w-2xl mx-auto my-8">
          <div className="text-center space-y-2">
            <div className="h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Import Session Completed</h2>
            <p className="text-xs text-muted-foreground">
              Results have been securely saved to IndexedDB.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="text-xs text-muted-foreground">Total Rows</div>
              <div className="text-xl font-bold mt-1">{completedSession.totalRows}</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <div className="text-xs">Successful</div>
              <div className="text-xl font-bold mt-1">{completedSession.successfulRows}</div>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive">
              <div className="text-xs">Failed</div>
              <div className="text-xl font-bold mt-1">{completedSession.failedRows}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 text-muted-foreground">
              <div className="text-xs">Skipped</div>
              <div className="text-xl font-bold mt-1">{completedSession.skippedRows}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t">
            <Link to="/history">
              <Button variant="jira" className="gap-2">
                <span>View Session in Import History</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={handleReset}>
              Import Another File
            </Button>
          </div>
        </Card>
      )}

      {/* Row Detail / Error Inspection Modal */}
      {inspectRow && (
        <Dialog open={Boolean(inspectRow)} onOpenChange={() => setInspectRow(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <span>Row {inspectRow.rowNumber} Details</span>
                <Badge
                  variant={
                    inspectRow.validationStatus === 'VALID'
                      ? 'success'
                      : inspectRow.validationStatus === 'DUPLICATE'
                      ? 'warning'
                      : 'destructive'
                  }
                  className="text-xs"
                >
                  {inspectRow.validationStatus}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs font-mono">
                Parent Story: {inspectRow.storyKey}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Subtask Summary:</span>
                <span className="font-semibold text-foreground">{inspectRow.summary}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Assignee (Input):</span>
                  <span>{inspectRow.assigneeInput}</span>
                  {inspectRow.resolvedAssigneeName && (
                    <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] font-medium">
                      ✓ Resolved: {inspectRow.resolvedAssigneeName}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Reporter (Input):</span>
                  <span>{inspectRow.reporterInput}</span>
                  {inspectRow.resolvedReporterName && (
                    <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] font-medium">
                      ✓ Resolved: {inspectRow.resolvedReporterName}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Start Date:</span>
                  <span className="font-mono">{inspectRow.startDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Due Date:</span>
                  <span className="font-mono">{inspectRow.dueDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Component 1:</span>
                  <span>{inspectRow.component1}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Priority:</span>
                  <span>{inspectRow.priority}</span>
                </div>
              </div>

              {/* Duplicate Details */}
              {inspectRow.duplicateInfo && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Existing Duplicate Subtask Detected in Jira</span>
                  </div>
                  <div className="text-[11px]">
                    Key: <span className="font-mono font-bold">{inspectRow.duplicateInfo.existingKey}</span> |
                    Status: <span className="font-medium">{inspectRow.duplicateInfo.existingStatus}</span>
                  </div>
                  <div className="text-[11px] truncate">
                    Summary: &quot;{inspectRow.duplicateInfo.existingSummary}&quot;
                  </div>
                </div>
              )}

              {/* Validation Errors */}
              {inspectRow.validationErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-xs">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Validation Errors ({inspectRow.validationErrors.length})</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {inspectRow.validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button size="sm" variant="outline" onClick={() => setInspectRow(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
