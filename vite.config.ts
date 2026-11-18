import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const API_ROUTE_MAP: Record<string, string> = {
  '/api/auth/config': '/api/auth/config.ts',
  '/api/auth/session': '/api/auth/session.ts',
  '/api/auth/token': '/api/auth/token.ts',
  '/api/auth/oauth-exchange': '/api/auth/oauth-exchange.ts',
  '/api/auth/select-site': '/api/auth/select-site.ts',
  '/api/auth/logout': '/api/auth/logout.ts',
  '/api/jira': '/api/jira.ts',
};

function localApiProxyPlugin(mode: string): Plugin {
  return {
    name: 'local-vercel-api-dev-middleware',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const key of ['SESSION_SECRET', 'JIRA_OAUTH_CLIENT_ID', 'JIRA_OAUTH_CLIENT_SECRET']) {
        if (env[key] && !process.env[key]) {
          process.env[key] = env[key];
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url || '/';
        const pathname = new URL(reqUrl, 'http://localhost').pathname;

        if (!pathname.startsWith('/api/')) {
          return next();
        }

        const targetFile = API_ROUTE_MAP[pathname];
        if (!targetFile) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(targetFile);
          await mod.default(req, res);
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Local API middleware error',
            })
          );
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), localApiProxyPlugin(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
}));
