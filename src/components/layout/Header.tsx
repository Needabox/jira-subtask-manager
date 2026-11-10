import React from 'react';
import { useJiraAuth } from '@/hooks/useJiraAuth';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sun,
  Moon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  Sliders,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Header: React.FC = () => {
  const { isConnected, user, siteUrl, disconnect } = useJiraAuth();
  const { isDark, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        {/* Left Side: Brand Logo */}
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0052CC] text-white shadow-sm font-bold">
            <svg
              className="h-5 w-5 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84zM6.77 6.8a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.36 4.36 0 0 0 4.34 4.34V7.63a.84.84 0 0 0-.83-.83zM2 11.6c0 2.4 1.95 4.34 4.35 4.34h1.78v1.72c0 2.39 1.94 4.34 4.34 4.34v-9.56a.84.84 0 0 0-.84-.84z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-base tracking-tight">Jira Subtask Manager</span>
            <span className="ml-2 text-xs font-mono text-muted-foreground hidden sm:inline-block">
              REST v3
            </span>
          </div>
        </div>

        {/* Right Side: Connection Status, Theme, Profile */}
        <div className="flex items-center space-x-3">
          {isConnected ? (
            <div className="flex items-center space-x-2">
              <Badge variant="success" className="gap-1 hidden sm:inline-flex py-1 px-2.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span>Connected</span>
              </Badge>

              <div className="flex items-center gap-2 pl-2 border-l">
                {user?.avatarUrls?.['24x24'] ? (
                  <img
                    src={user.avatarUrls['24x24']}
                    alt={user.displayName}
                    className="h-7 w-7 rounded-full border border-border"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                    {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'U'}
                  </div>
                )}
                <div className="hidden md:flex flex-col text-left text-xs">
                  <span className="font-medium leading-none">{user?.displayName || 'Authenticated User'}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                    {siteUrl.replace(/^https?:\/\//, '')}
                  </span>
                </div>
              </div>

              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground hidden lg:inline-flex p-1 rounded-md hover:bg-muted"
                  title="Open Jira site in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                onClick={disconnect}
                title="Disconnect Jira session"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline ml-1 text-xs">Disconnect</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Badge variant="warning" className="gap-1 py-1 px-2.5">
                <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span>Not Connected</span>
              </Badge>
              <Link to="/settings">
                <Button variant="jira" size="sm" className="h-8 text-xs gap-1.5">
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Connect Jira</span>
                </Button>
              </Link>
            </div>
          )}

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
          </Button>
        </div>
      </div>
    </header>
  );
};
