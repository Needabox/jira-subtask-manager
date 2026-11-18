import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UploadCloud,
  CheckSquare,
  History,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

interface SidebarNavContentProps {
  onNavigate?: () => void;
}

const SidebarNavContent: React.FC<SidebarNavContentProps> = ({ onNavigate }) => (
  <>
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
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2.5 md:py-2 text-sm font-medium transition-all duration-150',
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
        Client-side Excel parsing, validation, and Subtask creation via secure serverless proxy.
      </p>
    </div>
  </>
);

export const Sidebar: React.FC = () => {
  return (
    <aside className="hidden md:flex w-64 border-r bg-card flex-col justify-between shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      <SidebarNavContent />
    </aside>
  );
};

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Slide-over drawer */}
      <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-card border-r shadow-xl flex flex-col justify-between animate-in slide-in-from-left duration-200">
        <div>
          <div className="flex items-center justify-between h-14 px-4 border-b">
            <span className="font-semibold text-sm tracking-tight">Jira Subtask Manager</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between overflow-y-auto">
          <SidebarNavContent onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
};
