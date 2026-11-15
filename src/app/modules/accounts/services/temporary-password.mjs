const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const DIGIT_ALPHABET = '23456789';
const CODE_LENGTH = 6;

function randomIndex(max) {
  const bytes = new Uint8Array(1);
  const limit = 256 - (256 % max);
  let value;
  do {
    globalThis.crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= limit);
  return value % max;
}

export function generateTemporaryPassword() {
  const chars = Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)]
  );
  if (!chars.some((ch) => DIGIT_ALPHABET.includes(ch))) {
    chars[randomIndex(CODE_LENGTH)] = DIGIT_ALPHABET[randomIndex(DIGIT_ALPHABET.length)];
  }
  return `Sti-${chars.join('')}`;
}
