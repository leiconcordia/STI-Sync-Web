import { createHostedAccountsHandler } from '../../server/hosted-accounts-handler.mjs';
import { createHostedAdminContext } from '../../server/hosted-admin-context.mjs';
import resetModule from '../../functions/reset-handler.js';

let context;
const handler = createHostedAccountsHandler(async () => {
  // Production is pinned to the app's Firebase project. No emulator environment
  // is supported in the hosted function.
  if (!context) context = createHostedAdminContext();
  return context;
}, resetModule.createResetHandler);

export default async function resetPassword(req, res) {
  return handler(req, res);
}
