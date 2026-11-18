import { useState, useEffect } from 'react';
import { jiraAuth } from '@/services/jira/auth';
import { JiraConnectionState } from '@/types/settings';

export function useJiraAuth() {
  const [authState, setAuthState] = useState<JiraConnectionState>(jiraAuth.getState());

  useEffect(() => {
    const unsubscribe = jiraAuth.subscribe((state) => {
      setAuthState(state);
    });
    return unsubscribe;
  }, []);

  return {
    ...authState,
    disconnect: () => jiraAuth.disconnect(),
  };
}

