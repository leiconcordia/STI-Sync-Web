import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, entries: [] },
});

let passed = 0;
const test = async (name, body) => {
  await body();
  passed++;
  console.log(`PASS: ${name}`);
};

try {
  const resolverModule = await server.ssrLoadModule('/src/app/modules/signatories/services/signatory-resolver.service.ts');
  const { getFastCachedSignature, resolveUserSignature } = resolverModule;

  await test('getFastCachedSignature returns signatureUrl from profile', () => {
    const testSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const profile = {
      uid: 'test_admin_1',
      signatureUrl: testSig,
    };
    assert.equal(getFastCachedSignature(profile), testSig);
  });

  await test('getFastCachedSignature returns signatureDataUrl if signatureUrl is absent', () => {
    const testDataSig = 'data:image/png;base64,testSignatureData';
    const profile = {
      uid: 'test_admin_2',
      signatureDataUrl: testDataSig,
    };
    assert.equal(getFastCachedSignature(profile), testDataSig);
  });

  await test('getFastCachedSignature returns empty string when no signature exists', () => {
    const profile = {
      uid: 'test_admin_empty',
      signatureUrl: null,
      signatureDataUrl: '',
    };
    assert.equal(getFastCachedSignature(profile), '');
  });

  await test('resolveUserSignature immediately resolves if cached signature is present', async () => {
    const testSig = 'https://res.cloudinary.com/sti/signature_sample.png';
    const result = await resolveUserSignature({
      uid: 'user_123',
      profile: { signatureUrl: testSig },
    });
    assert.equal(result, testSig);
  });

  console.log(`\nAll ${passed} signature resolver tests passed.`);
} finally {
  await server.close();
}

