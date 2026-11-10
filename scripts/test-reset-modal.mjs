import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const browser = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'DocumentFragment', 'HTMLFormElement', 'HTMLButtonElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver']) {
  const value = browser[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? value.bind(browser) : value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
browser.prompt = browser.confirm = () => { throw new Error('Native browser dialogs are not allowed in this reset flow'); };
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', define: { 'import.meta.env.VITE_FIREBASE_EMULATORS': JSON.stringify('true') } });
try {
  const { ResetPasswordModal } = await server.ssrLoadModule('/src/app/modules/accounts/components/ResetPasswordModal.tsx');
  const account = { id: 'test-user', name: 'Test Adviser', email: 'adviser@example.com' };
  for (const delivery of ['accepted', 'failed', 'unavailable']) {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const requests = [];
    let completed = null;
    await act(async () => root.render(React.createElement(ResetPasswordModal, {
      account, kind: 'advisers', onClose() {}, onCompleted(result) { completed = result; },
      submitReset: async (...args) => {
        requests.push(args);
        if (delivery === 'unavailable') throw new Error('Reset service unavailable');
        return { operationId: 'test-operation', delivery, temporaryPassword: args[3], deliveryError: delivery === 'failed' ? 'The account was reset but email was not accepted.' : undefined };
      },
    })));
    const preview = document.querySelector('#reset-password-preview');
    assert.ok(preview?.value?.length >= 16, 'The modal must display a generated password before submitting');
    const initialPassword = preview.value;
    assert.match(document.body.textContent, /This is a preview/);
    assert.equal(requests.length, 0, 'Opening the modal must not reset the account');
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Generate another')).click());
    const password = document.querySelector('#reset-password-preview').value;
    assert.notEqual(password, initialPassword, 'Regeneration must change the preview without resetting the account');
    await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(requests.length, 0, 'Missing reason must not start a reset');
    const textarea = document.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Forgot password');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0][3], password, 'Confirm must submit the exact preview password');
    if (delivery === 'unavailable') {
      assert.equal(completed, null);
      assert.match(document.body.textContent, /Reset service unavailable/);
      assert.doesNotMatch(document.body.textContent, /Active temporary password/);
    } else {
      assert.equal(completed.delivery, delivery);
      assert.match(document.body.textContent, /Active temporary password/);
      assert.equal(document.querySelector('#reset-password-preview').value, password);
      if (delivery === 'failed') assert.match(document.body.textContent, /email was not accepted/);
      else assert.match(document.body.textContent, /inbox delivery is not yet confirmed/);
    }
    await act(async () => root.unmount()); host.remove();
    console.log(`PASS: reset modal preview, exact-password confirmation, and ${delivery} state`);
  }
} finally {
  await server.close();
  browser.happyDOM.abort();
}
process.exit(0);
