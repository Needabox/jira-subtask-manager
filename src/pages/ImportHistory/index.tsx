import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { historyRepo } from '@/services/storage/historyRepo';
import { ImportSession } from '@/types/import';
import { exportFailedRowsToExcel } from '@/utils/xlsxExport';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const ImportHistoryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<ImportSession | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'SKIPPED'>('ALL');

  // Fetch all import sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['importSessions'],
    queryFn: () => historyRepo.getSessions(),
  });

  // Fetch rows for selected session
  const { data: sessionRows = [], isLoading: isRowsLoading } = useQuery({
    queryKey: ['sessionRows', selectedSession?.id],
    queryFn: () => (selectedSession ? historyRepo.getRowsBySessionId(selectedSession.id) : []),
    enabled: Boolean(selectedSession),
  });

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => historyRepo.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historyStats'] });
      if (selectedSession) setSelectedSession(null);
    },
  });

  const handleExportFailed = async (session: ImportSession) => {
    const failedRows = await historyRepo.getFailedRows(session.id);
    if (failedRows.length === 0) {
      alert('There are no failed rows to export for this session.');
      return;
    }
    exportFailedRowsToExcel(failedRows, session.fileName);
  };

  const filteredRows = sessionRows.filter((r) => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Import History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audit logs of past Excel bulk import operations stored locally in your browser (IndexedDB).
          </p>
        </div>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Import Date</TableHead>
                <TableHead className="min-w-[200px]">File Name</TableHead>
                <TableHead className="w-24">Projects</TableHead>
                <TableHead className="w-24 text-center">Total Rows</TableHead>
                <TableHead className="w-24 text-center">Success</TableHead>
                <TableHead className="w-24 text-center">Failed</TableHead>
                <TableHead className="w-24 text-center">Status</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-xs text-muted-foreground">
                    Loading history...
                  </TableCell>
                </TableRow>
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40 text-center text-xs text-muted-foreground space-y-2">
                    <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p>No import sessions recorded yet.</p>
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(parseISO(session.importDate), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell className="text-xs font-medium max-w-[220px] truncate" title={session.fileName}>
                      {session.fileName}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {session.projectKeys.length > 0 ? session.projectKeys.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-center font-bold">{session.totalRows}</TableCell>
                    <TableCell className="text-xs text-center font-semibold text-emerald-600 dark:text-emerald-400">
                      {session.successfulRows}
                    </TableCell>
                    <TableCell className="text-xs text-center font-semibold text-destructive">
                      {session.failedRows}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          session.status === 'COMPLETED'
                            ? 'success'
                            : session.status === 'PARTIAL'
                            ? 'warning'
                            : 'destructive'
                        }
                        className="text-[10px]"
                      >
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setSelectedSession(session);
                            setStatusFilter('ALL');
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Details</span>
                        </Button>

                        {session.failedRows > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleExportFailed(session)}
                            title="Export Failed Rows as Excel"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Export Failed</span>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete session "${session.fileName}" from history?`)) {
                              deleteMutation.mutate(session.id);
                            }
                          }}
                          title="Delete Session"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Session Details Modal */}
      {selectedSession && (
        <Dialog open={Boolean(selectedSession)} onOpenChange={() => setSelectedSession(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <span>{selectedSession.fileName}</span>
                    <Badge
                      variant={
                        selectedSession.status === 'COMPLETED'
                          ? 'success'
                          : selectedSession.status === 'PARTIAL'
                          ? 'warning'
                          : 'destructive'
                      }
                      className="text-xs"
                    >
                      {selectedSession.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs font-mono mt-0.5">
                    Imported on {format(parseISO(selectedSession.importDate), 'dd MMMM yyyy, HH:mm:ss')}
                  </DialogDescription>
                </div>

                {selectedSession.failedRows > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleExportFailed(selectedSession)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export {selectedSession.failedRows} Failed Rows</span>
                  </Button>
                )}
              </div>
            </DialogHeader>

            {/* Filter buttons */}
            <div className="flex items-center gap-2 py-2 border-b text-xs">
              <Button
                variant={statusFilter === 'ALL' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setStatusFilter('ALL')}
              >
                All Rows ({sessionRows.length})
              </Button>
              <Button
                variant={statusFilter === 'SUCCESS' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs text-emerald-600 dark:text-emerald-400"
                onClick={() => setStatusFilter('SUCCESS')}
              >
                Successful ({selectedSession.successfulRows})
              </Button>
              <Button
                variant={statusFilter === 'FAILED' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs text-destructive"
                onClick={() => setStatusFilter('FAILED')}
              >
                Failed ({selectedSession.failedRows})
              </Button>
              <Button
                variant={statusFilter === 'SKIPPED' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setStatusFilter('SKIPPED')}
              >
                Skipped ({selectedSession.skippedRows})
              </Button>
            </div>

            {/* Rows Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">Row</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24">Parent</TableHead>
                    <TableHead className="min-w-[180px]">Summary</TableHead>
                    <TableHead className="w-28">Created Jira Key</TableHead>
                    <TableHead className="min-w-[200px]">Error / Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isRowsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground">
                        Loading row logs...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground">
                        No rows found with status &quot;{statusFilter}&quot;.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r, i) => (
                      <TableRow key={r.id || i}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {r.rowNumber}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === 'SUCCESS'
                                ? 'success'
                                : r.status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {r.storyKey}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]" title={r.summary}>
                          {r.summary}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.jiraKey ? (
                            r.jiraUrl ? (
                              <a
                                href={r.jiraUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-bold"
                              >
                                <span>{r.jiraKey}</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span>{r.jiraKey}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[240px] truncate" title={r.errorMessage}>
                          {r.errorMessage || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="pt-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedSession(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
