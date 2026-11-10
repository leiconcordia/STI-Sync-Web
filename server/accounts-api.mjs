const statuses = { unauthenticated: 401, 'permission-denied': 403, 'invalid-argument': 400, 'not-found': 404, 'failed-precondition': 409, 'resource-exhausted': 429, unavailable: 503 };
const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

/** Shared authenticated admin endpoint for Vite and Vercel's Node runtime. */
export function createAccountsMiddleware(getContext, resetFactory, options = {}) {
  const operation = options.path ? 'account' : 'reset';
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== (options.path || '/api/accounts/reset-password')) return next();
    try {
      if (req.method !== 'POST') { reply(res, 405, { error: { message: `Use POST for ${operation} requests.` } }); return; }
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reply(res, 403, { error: { message: 'Account requests must originate from this application.' } }); return; }
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) { reply(res, 401, { error: { message: 'Sign in as an active SAS administrator.' } }); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { reply(res, 415, { error: { message: `Send a JSON ${operation} request.` } }); return; }
      let body = req.body === undefined ? '' : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      if (Buffer.byteLength(body) > 8192) { reply(res, 413, { error: { message: 'The account request is too large.' } }); return; }
      // Vercel may parse JSON before invoking this handler; Vite supplies a stream.
      if (req.body === undefined) for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 8192) { reply(res, 413, { error: { message: 'The account request is too large.' } }); return; }
      }
      let data;
      try { data = JSON.parse(body); } catch { reply(res, 400, { error: { message: `Invalid JSON ${operation} request.` } }); return; }
      const context = await getContext();
      let identity;
      try { identity = await context.auth.verifyIdToken(token, true); }
      catch { reply(res, 401, { error: { message: 'Your sign-in session is invalid or expired. Sign in again.' } }); return; }
      const result = await resetFactory(context)({ auth: { uid: identity.uid }, data });
      reply(res, 200, { result });
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') { reply(res, 503, { error: { message: 'The local backend dependencies are missing. Run npm run setup:backend, then restart npm run dev.' } }); return; }
      if (error.code === 8 || error.code === 'resource-exhausted') {
        reply(res, 429, { error: { code: 'resource-exhausted', message: error.code === 8 ? `Firebase Firestore quota is exhausted. No ${operation} operation was confirmed. Try again after the project quota resets.` : error.message } }); return;
      }
      const status = statuses[error.code] || 500;
      const message = statuses[error.code] || error.code === 'internal'
        ? error.message
        : `The ${operation} backend could not access Firebase. Check the server Firebase credentials and project permissions. On Vercel, configure FIREBASE_ADMIN_SERVICE_ACCOUNT and redeploy.`;
      reply(res, status, { error: { code: error.code || 'internal', message } });
    }
  };
}
