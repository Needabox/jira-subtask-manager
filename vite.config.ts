import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Optional proxy to allow bypassing CORS during local development if testing with Atlassian basic auth / PAT
    proxy: {
      '/jira-proxy': {
        target: 'https://api.atlassian.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jira-proxy/, ''),
      },
    },
  },
});
