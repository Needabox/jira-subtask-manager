import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UploadCloud,
  CheckSquare,
  History,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Import Tasks', href: '/import', icon: UploadCloud, badge: 'Excel' },
  { name: 'My Assigned Tasks', href: '/my-tasks', icon: CheckSquare },
  { name: 'Import History', href: '/history', icon: History },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r bg-card flex flex-col justify-between shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="py-4 px-3 space-y-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center space-x-3">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={cn(
                          'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded',
                          isActive
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Info Box */}
      <div className="p-4 m-3 rounded-lg border bg-muted/40 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center space-x-1.5 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-jira-blue" />
          <span>Direct Jira REST API</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          100% Client-side. Excel parsing, validation, and Subtask creation run securely in your browser.
        </p>
      </div>
    </aside>
  );
};
