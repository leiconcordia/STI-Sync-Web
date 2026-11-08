/**
 * src/app/modules/ai/utils/ai-validation.utils.ts
 *
 * Client-side input validation and anti-gibberish heuristic filter.
 * Prevents submitting nonsensical keyboard-smashed text (e.g. 'asdfghjk',
 * 'qwrtyp', repeated letters, zero-vowel sequences) to Gemini AI.
 */

export interface InputValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedText?: string;
}

// Common vowels including 'y' which can function as a vowel in English
const VOWEL_REGEX = /[aeiouy]/i;

// Keyboard smash consonant cluster regex (5 or more consecutive consonants)
const CONSONANT_CLUSTER_REGEX = /[bcdfghjklmnpqrstvwxz]{5,}/i;

// 4 or more identical consecutive characters (e.g. "aaaa", "zzzz", "1111")
const REPEATED_CHAR_REGEX = /(.)\1{3,}/i;

/**
 * Validates whether user-entered text or prompt represents meaningful English words
 * rather than random keyboard smash or invalid non-words.
 */
export function validateMeaningfulInput(rawInput?: string): InputValidationResult {
  const text = (rawInput || '').trim();

  // 1. Minimum length requirement
  if (!text) {
    return {
      isValid: false,
      error: 'Please enter some text or notes before asking AI to enhance or generate.',
    };
  }

  if (text.length < 2) {
    return {
      isValid: false,
      error: 'Input is too short. Please provide at least 2 characters.',
    };
  }

  // 2. Character repetition check (e.g. "aaaaa", "zzzzz", "!!!!!")
  if (REPEATED_CHAR_REGEX.test(text)) {
    return {
      isValid: false,
      error: 'Input contains repeated characters (e.g. "aaaa"). Please type real words or notes.',
    };
  }

  // 3. Check individual tokens / words
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return {
      isValid: false,
      error: 'Input does not contain valid alphanumeric words.',
    };
  }

  let invalidWordCount = 0;
  let firstInvalidWord = '';

  for (const word of words) {
    // Skip pure numbers or common abbreviations (e.g. "IT", "HR", "3D", "STI", "SAS", "AP")
    if (/^\d+$/.test(word) || word.length <= 2) {
      continue;
    }

    // Skip alphanumeric IDs like "AP-2026-001" or "CS101"
    if (/^[A-Za-z]+\d+$/i.test(word) || /^\d+[A-Za-z]+$/i.test(word)) {
      continue;
    }

    // Check for 5+ consonants in a row (e.g. "sdfghj", "qwrtp")
    if (CONSONANT_CLUSTER_REGEX.test(word)) {
      invalidWordCount++;
      if (!firstInvalidWord) firstInvalidWord = word;
      continue;
    }

    // Check for words 4+ chars long with zero vowels (e.g. "flkj", "zzzz", "zxvb")
    if (word.length >= 4 && !VOWEL_REGEX.test(word)) {
      invalidWordCount++;
      if (!firstInvalidWord) firstInvalidWord = word;
      continue;
    }
  }

  // If more than half the words are gibberish or a severe smash is found
  if (invalidWordCount > 0 && (invalidWordCount >= Math.ceil(words.length / 2) || words.length === 1)) {
    return {
      isValid: false,
      error: `"${firstInvalidWord}" appears to be random or invalid characters. Please type meaningful words or a genuine description.`,
    };
  }

  return {
    isValid: true,
    sanitizedText: text,
  };
}

