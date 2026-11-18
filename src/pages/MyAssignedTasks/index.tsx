import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { jiraIssues } from '@/services/jira/issues';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { isTaskOverdue } from '@/utils/dates';
import {
  CheckSquare,
  Search,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Lock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';

export const MyAssignedTasksPage: React.FC = () => {
  const { isConnected, user, siteUrl, cloudId } = useJiraAuth();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusCategory, setSelectedStatusCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
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
      selectedPriority,
      searchQuery,
    ],
    queryFn: () =>
      jiraIssues.getMyAssignedSubtasks({
        nextPageToken: currentCursor,
        maxResults: pageSize,
        statusCategory: selectedStatusCategory,
        priorityName: selectedPriority,
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
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-foreground">Jira is not connected. </span>
                <span className="text-muted-foreground">
                  Connect your Jira account in Settings to view your assigned Subtasks.
                </span>
              </div>
            </div>
            <Link to="/settings">
              <Button size="sm" variant="jira">
                Connect Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Summary or Key..."
                className="pl-8 text-xs h-9"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetPagination();
                }}
              />
            </div>

            {/* Status Category */}
            <div>
              <Select
                value={selectedStatusCategory}
                onChange={(e) => {
                  setSelectedStatusCategory(e.target.value);
                  resetPagination();
                }}
                className="text-xs h-9"
              >
                <option value="all">All Statuses</option>
                <option value="new">To Do</option>
                <option value="indeterminate">In Progress</option>
                <option value="done">Completed</option>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <Select
                value={selectedPriority}
                onChange={(e) => {
                  setSelectedPriority(e.target.value);
                  resetPagination();
                }}
                className="text-xs h-9"
              >
                <option value="all">All Priorities</option>
                <option value="Highest">Highest</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Lowest">Lowest</option>
              </Select>
            </div>

            {/* Overdue filter */}
            <div className="flex items-center">
              <Button
                variant={overdueOnly ? 'destructive' : 'outline'}
                size="sm"
                className="w-full h-9 text-xs gap-1.5"
                onClick={() => setOverdueOnly(!overdueOnly)}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{overdueOnly ? 'Show All Dates' : 'Overdue Only'}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <div className="border rounded-xl bg-card overflow-hidden">
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

        {/* Pagination Toolbar */}
        {(pageIndex > 0 || hasNextPage || (approxTotal !== undefined && approxTotal > 0)) && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
            <span className="text-muted-foreground">
              Page {pageIndex + 1}
              {approxTotalPages ? ` of ~${approxTotalPages}` : ''}
              {typeof approxTotal === 'number' ? ` (~${approxTotal} total tasks)` : ''}
            </span>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={pageIndex === 0 || isFetching}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
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
    </div>
  );
};
