import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/Dashboard';
import { ImportTasksPage } from '@/pages/ImportTasks';
import { MyAssignedTasksPage } from '@/pages/MyAssignedTasks';
import { ImportHistoryPage } from '@/pages/ImportHistory';
import { SettingsPage } from '@/pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'import',
        element: <ImportTasksPage />,
      },
      {
        path: 'my-tasks',
        element: <MyAssignedTasksPage />,
      },
      {
        path: 'history',
        element: <ImportHistoryPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

