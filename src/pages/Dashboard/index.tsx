import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { jiraIssues } from '@/services/jira/issues';
import { historyRepo } from '@/services/storage/historyRepo';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isTaskOverdue } from '@/utils/dates';
import { Link } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  UploadCloud,
  CheckCircle2,
  Calendar,
  History,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const DashboardPage: React.FC = () => {
  const { isConnected, user, siteUrl } = useJiraAuth();

  // 1. Fetch assigned subtasks from Jira
  const {
    data: tasksData,
    isLoading: isTasksLoading,
    error: tasksError,
  } = useQuery({
    queryKey: ['assignedSubtasksSummary', user?.accountId],
    queryFn: () => jiraIssues.getMyAssignedSubtasks({ maxResults: 100 }),
    enabled: isConnected,
  });

  // 2. Fetch history stats from IndexedDB
  const { data: historyStats, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['historyStats'],
    queryFn: () => historyRepo.getOverallStats(),
  });

  const issues = tasksData?.issues || [];

  // Dynamic calculations for Jira tasks
  const totalAssigned = issues.length;
  const todoCount = issues.filter(
    (i) => i.fields.status.statusCategory.key === 'new'
  ).length;
  const inProgressCount = issues.filter(
    (i) => i.fields.status.statusCategory.key === 'indeterminate'
  ).length;
  const completedCount = issues.filter(
    (i) => i.fields.status.statusCategory.key === 'done'
  ).length;

  const overdueTasks = issues.filter((i) =>
    isTaskOverdue(i.fields.duedate, i.fields.status.statusCategory.key)
  );

  // Upcoming deadlines (tasks with duedate not done, sorted soonest first)
  const upcomingTasks = issues
    .filter(
      (i) =>
        i.fields.duedate &&
        i.fields.status.statusCategory.key !== 'done' &&
        !isTaskOverdue(i.fields.duedate, i.fields.status.statusCategory.key)
    )
    .slice(0, 5);

  const totalImported = historyStats?.totalImported || 0;
  const recentSessions = historyStats?.recentSessions || [];

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-200">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isConnected
              ? `Welcome back, ${user?.displayName || 'User'}. Here is your live Jira subtask status.`
              : 'Connect your Jira account in Settings to view live assigned subtasks.'}
          </p>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/import">
            <Button variant="jira" className="gap-2 shadow-sm">
              <UploadCloud className="h-4 w-4" />
              <span>Import Subtasks</span>
            </Button>
          </Link>
          <Link to="/my-tasks">
            <Button variant="outline" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              <span>My Tasks</span>
            </Button>
          </Link>
          <Link to="/history">
            <Button variant="outline" className="gap-2">
              <History className="h-4 w-4" />
              <span>History</span>
            </Button>
          </Link>
        </div>
      </div>

      {!isConnected && (
        <Card className="border-amber-300/40 bg-amber-500/10">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-foreground">Jira is not connected. </span>
                <span className="text-muted-foreground">
                  Connect your Jira Cloud instance to enable automatic user resolution and live task tracking.
                </span>
              </div>
            </div>
            <Link to="/settings">
              <Button size="sm" variant="jira">
                Connect Now
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Assigned */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Assigned</span>
              <CheckSquare className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {isTasksLoading ? '...' : totalAssigned}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">My Subtasks</p>
          </CardContent>
        </Card>

        {/* To Do */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>To Do</span>
              <Clock className="h-4 w-4 text-slate-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {isTasksLoading ? '...' : todoCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Pending start</p>
          </CardContent>
        </Card>

        {/* In Progress */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>In Progress</span>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {isTasksLoading ? '...' : inProgressCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Active tasks</p>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Completed</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {isTasksLoading ? '...' : completedCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Status Done</p>
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card className={overdueTasks.length > 0 ? 'border-destructive/40 bg-destructive/5' : ''}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span className={overdueTasks.length > 0 ? 'text-destructive font-semibold' : ''}>
                Overdue
              </span>
              <AlertTriangle
                className={`h-4 w-4 ${overdueTasks.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-bold ${overdueTasks.length > 0 ? 'text-destructive' : ''}`}>
              {isTasksLoading ? '...' : overdueTasks.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Past due date</p>
          </CardContent>
        </Card>

        {/* Successfully Imported */}
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Imported</span>
              <UploadCloud className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {isHistoryLoading ? '...' : totalImported}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Via Excel uploads</p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Main Dashboard Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Task Overview & Upcoming Deadlines */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section A: Task Distribution */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Subtask Distribution</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Breakdown of your assigned subtasks by workflow status
                </p>
              </div>
              <Link to="/my-tasks" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                <span>View all</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {tasksError ? (
                <div className="text-xs text-destructive py-4">
                  Unable to load Jira tasks: {tasksError instanceof Error ? tasksError.message : 'Error'}
                </div>
              ) : totalAssigned === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {isConnected ? 'No assigned subtasks found for your account.' : 'Connect Jira to view task distribution.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status Bar */}
                  <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
                    {todoCount > 0 && (
                      <div
                        style={{ width: `${(todoCount / totalAssigned) * 100}%` }}
                        className="bg-slate-400 dark:bg-slate-600 transition-all"
                        title={`To Do: ${todoCount}`}
                      />
                    )}
                    {inProgressCount > 0 && (
                      <div
                        style={{ width: `${(inProgressCount / totalAssigned) * 100}%` }}
                        className="bg-amber-500 transition-all"
                        title={`In Progress: ${inProgressCount}`}
                      />
                    )}
                    {completedCount > 0 && (
                      <div
                        style={{ width: `${(completedCount / totalAssigned) * 100}%` }}
                        className="bg-emerald-500 transition-all"
                        title={`Completed: ${completedCount}`}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-muted/40">
                      <div className="text-muted-foreground">To Do</div>
                      <div className="font-semibold text-base mt-0.5">{todoCount}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {totalAssigned ? Math.round((todoCount / totalAssigned) * 100) : 0}%
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <div>In Progress</div>
                      <div className="font-semibold text-base mt-0.5">{inProgressCount}</div>
                      <div className="text-[10px] opacity-80">
                        {totalAssigned ? Math.round((inProgressCount / totalAssigned) * 100) : 0}%
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <div>Completed</div>
                      <div className="font-semibold text-base mt-0.5">{completedCount}</div>
                      <div className="text-[10px] opacity-80">
                        {totalAssigned ? Math.round((completedCount / totalAssigned) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section B: Upcoming Deadlines */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Subtasks due soon that require your attention
                </p>
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No upcoming deadlines in the near term.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {upcomingTasks.map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {t.key}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {t.fields.status.name}
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground truncate mt-0.5 font-medium">
                          {t.fields.summary}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-foreground flex items-center gap-1 justify-end">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{t.fields.duedate}</span>
                        </div>
                        {siteUrl && (
                          <a
                            href={`${siteUrl}/browse/${t.key}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Open in Jira</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Section C: Recent Import Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Recent Imports</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Latest Excel import sessions (IndexedDB)
                </p>
              </div>
              <Link to="/history" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                <span>View all</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {recentSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm space-y-3">
                  <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p>No imports executed yet.</p>
                  <Link to="/import">
                    <Button variant="outline" size="sm" className="text-xs">
                      Start your first import
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground truncate max-w-[150px]">
                          {session.fileName}
                        </span>
                        <Badge
                          variant={
                            session.status === 'COMPLETED'
                              ? 'success'
                              : session.status === 'PARTIAL'
                              ? 'warning'
                              : 'destructive'
                          }
                          className="text-[10px] py-0 px-1.5"
                        >
                          {session.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(parseISO(session.importDate), 'dd MMM yyyy, HH:mm')}
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t text-muted-foreground">
                        <span>Total: {session.totalRows}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ {session.successfulRows}
                        </span>
                        {session.failedRows > 0 && (
                          <span className="text-destructive font-medium">
                            ✗ {session.failedRows}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
