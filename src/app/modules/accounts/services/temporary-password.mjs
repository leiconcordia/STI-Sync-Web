export function generateTemporaryPassword() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return `Sti-7${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}!`;
}
