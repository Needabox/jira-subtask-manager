import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { jiraIssues } from '@/services/jira/issues';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSelect, type SelectOption } from '@/components/ui/radix-select';
import { isTaskOverdue } from '@/utils/dates';
import {
  CheckSquare,
  Search,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Lock,
  Calendar,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All Statuses', dotClassName: 'bg-muted-foreground/40' },
  { value: 'new', label: 'To Do', dotClassName: 'bg-slate-400 dark:bg-slate-500' },
  { value: 'indeterminate', label: 'In Progress', dotClassName: 'bg-amber-500' },
  { value: 'done', label: 'Done', dotClassName: 'bg-emerald-500' },
];

export const MyAssignedTasksPage: React.FC = () => {
  const { isConnected, user, siteUrl, cloudId } = useJiraAuth();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusCategory, setSelectedStatusCategory] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const pageSize = 25;
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageTokens, setPageTokens] = useState<Array<string | undefined>>([undefined]);
  const [approxTotal, setApproxTotal] = useState<number | undefined>(undefined);

  const currentCursor = pageTokens[pageIndex];

  const resetPagination = () => {
    setPageIndex(0);
    setPageTokens([undefined]);
    setApproxTotal(undefined);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedStatusCategory !== 'all' ||
      startDateFilter ||
      endDateFilter ||
      overdueOnly
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setSelectedStatusCategory('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setOverdueOnly(false);
    resetPagination();
  };

  // Sorting
  const [sortField, setSortField] = useState<'duedate' | 'created' | 'key'>('duedate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Query Jira Tasks via /rest/api/3/search/jql
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'myAssignedSubtasks',
      user?.accountId,
      siteUrl,
      cloudId,
      pageIndex,
      currentCursor ?? 'first',
      pageSize,
      selectedStatusCategory,
      startDateFilter,
      endDateFilter,
      searchQuery,
    ],
    queryFn: () =>
      jiraIssues.getMyAssignedSubtasks({
        nextPageToken: currentCursor,
        maxResults: pageSize,
        statusCategory: selectedStatusCategory,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
        searchQuery,
        includeCount: pageIndex === 0,
      }),
    enabled: isConnected,
  });

  useEffect(() => {
    if (typeof data?.totalCount === 'number') {
      setApproxTotal(data.totalCount);
    }
  }, [data?.totalCount]);

  const rawIssues = data?.issues || [];
  const isLastPage = data ? data.isLast : true;
  const hasNextPage = Boolean(data?.nextPageToken) && !isLastPage;
  const approxTotalPages =
    typeof approxTotal === 'number' && approxTotal > 0
      ? Math.ceil(approxTotal / pageSize)
      : undefined;

  // Client-side filtering & sorting on current page data
  const displayedIssues = useMemo(() => {
    let result = [...rawIssues];

    if (overdueOnly) {
      result = result.filter((issue) =>
        isTaskOverdue(issue.fields.duedate, issue.fields.status.statusCategory.key)
      );
    }

    result.sort((a, b) => {
      if (sortField === 'duedate') {
        const d1 = a.fields.duedate || '9999-99-99';
        const d2 = b.fields.duedate || '9999-99-99';
        return sortOrder === 'asc' ? d1.localeCompare(d2) : d2.localeCompare(d1);
      }
      if (sortField === 'created') {
        const c1 = a.fields.created;
        const c2 = b.fields.created;
        return sortOrder === 'asc' ? c1.localeCompare(c2) : c2.localeCompare(c1);
      }
      return sortOrder === 'asc' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
    });

    return result;
  }, [rawIssues, overdueOnly, sortField, sortOrder]);

  const toggleSort = (field: 'duedate' | 'created' | 'key') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Notice */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Assigned Tasks</h1>
            <Badge variant="outline" className="gap-1 text-[11px] py-0 px-2 text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Read-Only</span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Subtasks assigned to {user?.displayName || 'you'} in Jira. Live JQL retrieval without local caching.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetPagination();
              void refetch();
            }}
            disabled={!isConnected || isFetching}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          {siteUrl && (
            <a
              href={`${siteUrl}/jira/your-work`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="jira" size="sm" className="gap-1.5 text-xs">
                <span>Open Jira Work</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {!isConnected && (
        <Card className="border-amber-400/40 bg-amber-500/10">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div className="flex items-start sm:items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-sm">
                <span className="font-semibold text-foreground">Jira is not connected. </span>
                <span className="text-muted-foreground">
                  Connect your Jira account in Settings to view your assigned Subtasks.
                </span>
              </div>
            </div>
            <Link to="/settings" className="shrink-0 w-full sm:w-auto">
              <Button size="sm" variant="jira" className="w-full sm:w-auto">
                Connect Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-6 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Summary or Key..."
                className="pl-9 pr-8 text-xs h-9 rounded-lg"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetPagination();
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    resetPagination();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status Category (Custom Radix Dropdown) */}
            <div className="lg:col-span-3">
              <CustomSelect
                ariaLabel="Filter by Status"
                value={selectedStatusCategory}
                onValueChange={(value) => {
                  setSelectedStatusCategory(value);
                  resetPagination();
                }}
                options={STATUS_FILTER_OPTIONS}
                placeholder="All Statuses"
              />
            </div>

            {/* Overdue filter */}
            <div className="lg:col-span-3 flex items-center">
              <Button
                variant={overdueOnly ? 'destructive' : 'outline'}
                size="sm"
                className="w-full h-9 rounded-lg text-xs gap-1.5"
                onClick={() => setOverdueOnly(!overdueOnly)}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{overdueOnly ? 'Show All Dates' : 'Overdue Only'}</span>
              </Button>
            </div>
          </div>

          {/* Date Range Filter Row */}
          <div className="pt-3 border-t flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Date Range</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center gap-2 flex-1">
                <label className="flex items-center h-9 rounded-lg border border-input bg-background px-2.5 text-xs shadow-sm focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary">
                  <span className="text-[11px] font-medium text-muted-foreground mr-2 shrink-0 select-none">
                    Start Date
                  </span>
                  <input
                    type="date"
                    aria-label="Start Date"
                    value={startDateFilter}
                    max={endDateFilter || undefined}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDateFilter(nextStart);
                      if (nextStart && endDateFilter && nextStart > endDateFilter) {
                        setEndDateFilter(nextStart);
                      }
                      resetPagination();
                    }}
                    className="w-full bg-transparent text-xs font-mono focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </label>

                <span className="hidden lg:inline text-muted-foreground text-xs select-none">—</span>

                <label className="flex items-center h-9 rounded-lg border border-input bg-background px-2.5 text-xs shadow-sm focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary">
                  <span className="text-[11px] font-medium text-muted-foreground mr-2 shrink-0 select-none">
                    End Date
                  </span>
                  <input
                    type="date"
                    aria-label="End Date"
                    value={endDateFilter}
                    min={startDateFilter || undefined}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setEndDateFilter(nextEnd);
                      if (nextEnd && startDateFilter && nextEnd < startDateFilter) {
                        setStartDateFilter(nextEnd);
                      }
                      resetPagination();
                    }}
                    className="w-full bg-transparent text-xs font-mono focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </label>

                {(startDateFilter || endDateFilter) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDateFilter('');
                      setEndDateFilter('');
                      resetPagination();
                    }}
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1 sm:col-span-2 lg:col-span-1 justify-center"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Dates</span>
                  </Button>
                )}
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetAllFilters}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive gap-1 self-start lg:self-auto shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset All Filters</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Sort Controls (< md) */}
      <div className="md:hidden flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground font-medium">Sort by:</span>
        <div className="flex items-center gap-1.5">
          {(['duedate', 'created', 'key'] as const).map((field) => (
            <Button
              key={field}
              variant={sortField === field ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => toggleSort(field)}
            >
              {field === 'duedate' ? 'Due Date' : field === 'created' ? 'Created' : 'Key'}
              {sortField === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile Task Cards (< md) */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="border rounded-xl bg-card p-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading assigned subtasks from Jira...</span>
          </div>
        ) : error ? (
          <div className="border rounded-xl bg-card p-6 text-center text-destructive text-xs">
            Error loading Jira tasks: {error instanceof Error ? error.message : 'Unknown'}
          </div>
        ) : displayedIssues.length === 0 ? (
          <div className="border rounded-xl bg-card p-8 text-center text-muted-foreground text-xs space-y-2">
            <CheckSquare className="h-6 w-6 mx-auto text-muted-foreground/50" />
            <p>No assigned subtasks match your criteria.</p>
          </div>
        ) : (
          displayedIssues.map((issue) => {
            const isOverdue = isTaskOverdue(
              issue.fields.duedate,
              issue.fields.status.statusCategory.key
            );
            const parentKey = issue.fields.parent?.key;

            return (
              <Card
                key={issue.id}
                className={isOverdue ? 'border-destructive/40 bg-destructive/5' : ''}
              >
                <CardContent className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
                      {siteUrl ? (
                        <a
                          href={`${siteUrl}/browse/${issue.key}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline truncate"
                        >
                          {issue.key}
                        </a>
                      ) : (
                        <span className="font-semibold text-primary truncate">{issue.key}</span>
                      )}
                      {parentKey && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          ({parentKey})
                        </span>
                      )}
                    </div>

                    <Badge
                      variant={
                        issue.fields.status.statusCategory.key === 'done'
                          ? 'success'
                          : issue.fields.status.statusCategory.key === 'indeterminate'
                          ? 'warning'
                          : 'secondary'
                      }
                      className="text-[10px] shrink-0"
                    >
                      {issue.fields.status.name}
                    </Badge>
                  </div>

                  <p className="text-xs font-medium text-foreground break-words">
                    {issue.fields.summary}
                  </p>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <div>
                      <span className="opacity-75">Priority: </span>
                      <span className="text-foreground">{issue.fields.priority?.name || '—'}</span>
                    </div>
                    <div className="font-mono">
                      {issue.fields.duedate ? (
                        <span
                          className={
                            isOverdue
                              ? 'text-destructive font-semibold inline-flex items-center gap-1'
                              : 'text-foreground'
                          }
                        >
                          {isOverdue && <AlertTriangle className="h-3 w-3 shrink-0" />}
                          {issue.fields.duedate}
                        </span>
                      ) : (
                        <span>No due date</span>
                      )}
                    </div>
                    <div className="truncate">
                      <span className="opacity-75">Assignee: </span>
                      <span className="text-foreground">{issue.fields.assignee?.displayName || 'Unassigned'}</span>
                    </div>
                    <div className="truncate">
                      <span className="opacity-75">Comp: </span>
                      <span className="text-foreground">
                        {issue.fields.components && issue.fields.components.length > 0
                          ? issue.fields.components.map((c) => c.name).join(', ')
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {siteUrl && (
                    <div className="flex items-center justify-between pt-1.5 border-t text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        Created {format(parseISO(issue.fields.created), 'yyyy-MM-dd')}
                      </span>
                      <a
                        href={`${siteUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <span>Open in Jira</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop Tasks Table (>= md) */}
      <div className="hidden md:block border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort('key')}
              >
                <div className="flex items-center gap-1">
                  <span>Issue Key</span>
                  {sortField === 'key' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </TableHead>
              <TableHead className="w-28">Parent Story</TableHead>
              <TableHead className="min-w-[240px]">Subtask Summary</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Priority</TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort('duedate')}
              >
                <div className="flex items-center gap-1">
                  <span>Due Date</span>
                  {sortField === 'duedate' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </TableHead>
              <TableHead className="w-32">Components</TableHead>
              <TableHead className="w-28">Assignee</TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort('created')}
              >
                <div className="flex items-center gap-1">
                  <span>Created</span>
                  {sortField === 'created' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </TableHead>
              <TableHead className="w-16 text-center">Jira</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="h-36 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading assigned subtasks from Jira...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={10} className="h-36 text-center text-destructive text-xs">
                  Error loading Jira tasks: {error instanceof Error ? error.message : 'Unknown'}
                </TableCell>
              </TableRow>
            ) : displayedIssues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-36 text-center text-muted-foreground text-xs space-y-2">
                  <CheckSquare className="h-6 w-6 mx-auto text-muted-foreground/50" />
                  <p>No assigned subtasks match your criteria.</p>
                </TableCell>
              </TableRow>
            ) : (
              displayedIssues.map((issue) => {
                const isOverdue = isTaskOverdue(
                  issue.fields.duedate,
                  issue.fields.status.statusCategory.key
                );
                const parentKey = issue.fields.parent?.key;

                return (
                  <TableRow
                    key={issue.id}
                    className={isOverdue ? 'bg-destructive/5 hover:bg-destructive/10' : ''}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {siteUrl ? (
                        <a
                          href={`${siteUrl}/browse/${issue.key}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span>{issue.key}</span>
                        </a>
                      ) : (
                        <span>{issue.key}</span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {parentKey ? (
                        siteUrl ? (
                          <a
                            href={`${siteUrl}/browse/${parentKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {parentKey}
                          </a>
                        ) : (
                          parentKey
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>

                    <TableCell className="text-xs font-medium max-w-[280px] truncate" title={issue.fields.summary}>
                      {issue.fields.summary}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          issue.fields.status.statusCategory.key === 'done'
                            ? 'success'
                            : issue.fields.status.statusCategory.key === 'indeterminate'
                            ? 'warning'
                            : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {issue.fields.status.name}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs">{issue.fields.priority?.name || '—'}</TableCell>

                    <TableCell className="text-xs font-mono whitespace-nowrap">
                      {issue.fields.duedate ? (
                        <span
                          className={
                            isOverdue
                              ? 'text-destructive font-semibold flex items-center gap-1'
                              : 'text-muted-foreground'
                          }
                        >
                          {isOverdue && <AlertTriangle className="h-3 w-3" />}
                          {issue.fields.duedate}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">No due date</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs truncate max-w-[120px]">
                      {issue.fields.components && issue.fields.components.length > 0
                        ? issue.fields.components.map((c) => c.name).join(', ')
                        : '—'}
                    </TableCell>

                    <TableCell className="text-xs truncate max-w-[120px]" title={issue.fields.assignee?.displayName}>
                      {issue.fields.assignee?.displayName || 'Unassigned'}
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(parseISO(issue.fields.created), 'yyyy-MM-dd')}
                    </TableCell>

                    <TableCell className="text-center">
                      {siteUrl && (
                        <a
                          href={`${siteUrl}/browse/${issue.key}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-muted-foreground hover:text-primary inline-block"
                          title="Open Subtask in Jira"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Toolbar */}
      {(pageIndex > 0 || hasNextPage || (approxTotal !== undefined && approxTotal > 0)) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border rounded-xl bg-card text-xs">
          <span className="text-muted-foreground">
            Page {pageIndex + 1}
            {approxTotalPages ? ` of ~${approxTotalPages}` : ''}
            {typeof approxTotal === 'number' ? ` (~${approxTotal} total tasks)` : ''}
          </span>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-7 text-xs"
              disabled={pageIndex === 0 || isFetching}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-7 text-xs"
              disabled={!hasNextPage || isFetching}
              onClick={() => {
                if (!data?.nextPageToken) return;
                const nextToken = data.nextPageToken;
                setPageTokens((prev) => {
                  const next = prev.slice(0, pageIndex + 1);
                  next.push(nextToken);
                  return next;
                });
                setPageIndex((p) => p + 1);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
