import { createAccountsMiddleware } from './accounts-api.mjs';

export function createHostedAccountsHandler(getContext, resetFactory, options) {
  const middleware = createAccountsMiddleware(getContext, resetFactory, options);
  return async (req, res) => middleware(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: { message: 'Account endpoint not found.' } }));
  });
}
