import { createAccountsMiddleware } from './accounts-api.mjs';
import { createAdminContext } from './admin-context.mjs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));

export function accountsApiPlugin(env = {}) {
  let context;
  return {
    name: 'sti-local-account-api',
    configureServer(server) {
      server.middlewares.use(createAccountsMiddleware(async () => {
        if (!context) context = createAdminContext({ projectDir: server.config.root, projectId: env.VITE_FIREBASE_EMULATORS === 'true' ? 'demo-sti-sync' : 'sti-sync', env: { ...process.env, ...env } });
        return context;
      }, (context) => require('./reset-handler.js').createResetHandler(context)));
      server.httpServer?.once('close', () => { if (context) void context.close(); });
    },
  };
}
