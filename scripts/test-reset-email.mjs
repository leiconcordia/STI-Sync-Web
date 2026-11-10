import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { deliverResetEmail } from '../src/app/modules/accounts/services/reset-email.mjs';

const server = await createServer({
  server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom',
  define: {
    'import.meta.env.VITE_EMAILJS_SERVICE_ID': JSON.stringify('test_service'),
    'import.meta.env.VITE_EMAILJS_TEMPLATE_ID': JSON.stringify('test_template'),
    'import.meta.env.VITE_EMAILJS_PUBLIC_KEY': JSON.stringify('test_public_key'),
    'import.meta.env.VITE_RESEND_API_KEY': JSON.stringify('test_unused_resend_key'),
  },
});
globalThis.window = { location: { origin: 'http://localhost:5173', hostname: 'localhost', pathname: '/' } };
globalThis.location = window.location;
const originalFetch = globalThis.fetch;
const requests = [];
let fail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.emailjs.com/api/v1.0/email/send', 'Only the EmailJS SDK endpoint may be used');
  requests.push(JSON.parse(options.body));
  return new Response(fail ? 'EmailJS test provider unavailable' : 'OK', { status: fail ? 403 : 200 });
};
try {
  const emailService = await server.ssrLoadModule('/src/services/email.service.ts');
  const pending = { operationId: 'test-operation', delivery: 'pending', recipientEmail: 'recipient@example.com', temporaryPassword: 'Preview<Temporary>123!&' };
  const result = await deliverResetEmail(pending, 'students', emailService.sendAccountPasswordResetCredentialsEmail);
  assert.equal(result.delivery, 'accepted');
  assert.equal(requests.length, 1);
  const payload = requests[0];
  assert.equal(payload.service_id, 'test_service');
  assert.equal(payload.template_id, 'test_template');
  assert.equal(payload.user_id, 'test_public_key');
  const params = payload.template_params;
  assert.equal(params.to_email, pending.recipientEmail);
  assert.equal(params.temp_password, pending.temporaryPassword);
  assert.equal(params.temporary_password, pending.temporaryPassword);
  assert.equal(params.password, pending.temporaryPassword);
  assert.match(params.message, /mobile app/);
  assert.match(params.html_content, /Preview&lt;Temporary&gt;123!&amp;/);
  await deliverResetEmail({ ...pending, delivery: 'accepted' }, 'students', emailService.sendAccountPasswordResetCredentialsEmail);
  assert.equal(requests.length, 1, 'An already emailed backend response must not be sent twice');
  const missingRecipient = await deliverResetEmail({ ...pending, recipientEmail: '' }, 'students', emailService.sendAccountPasswordResetCredentialsEmail);
  assert.equal(missingRecipient.delivery, 'failed');
  assert.equal(requests.length, 1, 'Do not email without a server-confirmed recipient');
  await emailService.sendAdviserWelcomeCredentialsEmail({ to: 'faculty@example.test', adviserName: 'John S. Doe', orgName: 'Logic Club', existingAccount: true });
  const adviser = requests.at(-1).template_params;
  assert.match(adviser.message, /existing email and password/); assert.match(adviser.message, /choose Club Adviser/);
  assert.equal(adviser.temp_password, 'Use your existing password'); assert.equal(adviser.temporary_password, 'Use your existing password');
  assert.equal(adviser.login_url, 'http://localhost:5173/portal/login');
  assert.doesNotMatch(adviser.html_content, /Adv-2026|Temporary Password/);
  fail = true;
  const failed = await deliverResetEmail(pending, 'advisers', emailService.sendAccountPasswordResetCredentialsEmail);
  assert.equal(failed.delivery, 'failed');
  assert.equal(failed.temporaryPassword, pending.temporaryPassword);
  assert.match(failed.deliveryError, /EmailJS test provider unavailable/);
  console.log('PASS: EmailJS reset fields, escaping, duplicate prevention, adviser account-reuse message, and delivery failure');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window; delete globalThis.location;
  await server.close();
}
process.exit(0);
