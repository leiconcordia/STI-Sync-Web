/**
 * Standard Currency Formatter for STI Sync
 * Formats numbers into Philippine Peso currency representation: ₱1,000.00
 */

export interface FormatCurrencyOptions {
  /** Include a '+' sign for positive non-zero values (e.g. +₱1,000.00) */
  showSign?: boolean;
  /** Exclude the '₱' symbol (e.g. 1,000.00) */
  noSymbol?: boolean;
  /** Number of decimal places (defaults to 2) */
  decimals?: number;
}

function parseNumericAmount(amount: number | string | null | undefined): number {
  if (typeof amount === 'number') return isNaN(amount) ? 0 : amount;
  if (typeof amount === 'string') {
    const cleaned = amount.replace(/[₱,\s]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  }
  const num = Number(amount);
  return isNaN(num) ? 0 : num;
}

/**
 * Format a number or numeric string as Philippine Peso currency (₱1,000.00).
 * Handles null, undefined, and NaN gracefully by defaulting to 0.00.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: FormatCurrencyOptions = {}
): string {
  const { showSign = false, noSymbol = false, decimals = 2 } = options;

  const validNum = parseNumericAmount(amount);

  const formattedAbs = Math.abs(validNum).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const symbol = noSymbol ? '' : '₱';

  if (validNum < 0) {
    return `-${symbol}${formattedAbs}`;
  }

  if (showSign && validNum > 0) {
    return `+${symbol}${formattedAbs}`;
  }

  return `${symbol}${formattedAbs}`;
}

/**
 * Alias helper for variance display (e.g. +₱1,000.00 / -₱500.00 / ₱0.00)
 */
export function formatVariance(amount: number | string | null | undefined): string {
  const validNum = parseNumericAmount(amount);
  if (validNum > 0) return `+${formatCurrency(validNum)}`;
  if (validNum < 0) return formatCurrency(validNum);
  return formatCurrency(0);
}
