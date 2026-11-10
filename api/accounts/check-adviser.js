import { createHostedAccountsHandler } from '../../server/hosted-accounts-handler.mjs';
import { createHostedAdminContext } from '../../server/hosted-admin-context.mjs';
import { createAdviserAccountHandler } from '../../server/adviser-account-handler.mjs';

let context;
const handler = createHostedAccountsHandler(async () => {
  if (!context) context = createHostedAdminContext();
  return context;
}, createAdviserAccountHandler, { path: '/api/accounts/check-adviser' });
export default async function checkAdviser(req, res) { return handler(req, res); }
