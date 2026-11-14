import React, { useState, useEffect, useCallback } from 'react';
import { X, Calculator, Copy, Check, Delete } from 'lucide-react';
import { toast } from 'sonner';

interface QuickCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Operator = '+' | '-' | '*' | '/';

const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

function formatDisplayNumber(val: number): string {
  if (!Number.isFinite(val)) return 'Error';
  // Guard floating point precision artifacts (e.g., 0.1 + 0.2)
  const rounded = Math.round(val * 1e10) / 1e10;
  return String(rounded);
}

function computeOperation(left: number, right: number, op: Operator): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? NaN : left / right;
  }
}

export const QuickCalculatorModal: React.FC<QuickCalculatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [display, setDisplay] = useState<string>('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Operator | null>(null);
  const [resetOnNextDigit, setResetOnNextDigit] = useState<boolean>(false);
  const [expressionHint, setExpressionHint] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setAccumulator(null);
    setPendingOp(null);
    setResetOnNextDigit(false);
    setExpressionHint('');
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (display === 'Error') {
        setDisplay(digit);
        setAccumulator(null);
        setPendingOp(null);
        setResetOnNextDigit(false);
        setExpressionHint('');
        return;
      }

      if (resetOnNextDigit) {
        setDisplay(digit);
        setResetOnNextDigit(false);
        return;
      }

      if (display === '0') {
        setDisplay(digit);
      } else if (display.length < 15) {
        setDisplay(display + digit);
      }
    },
    [display, resetOnNextDigit]
  );

  const handleDecimal = useCallback(() => {
    if (display === 'Error' || resetOnNextDigit) {
      setDisplay('0.');
      setResetOnNextDigit(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  }, [display, resetOnNextDigit]);

  const handleBackspace = useCallback(() => {
    if (display === 'Error' || resetOnNextDigit) {
      setDisplay('0');
      setResetOnNextDigit(false);
      return;
    }
    if (display.length <= 1 || (display.length === 2 && display.startsWith('-'))) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  }, [display, resetOnNextDigit]);

  const handleToggleSign = useCallback(() => {
    if (display === 'Error' || display === '0') return;
    setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
  }, [display]);

  const handlePercent = useCallback(() => {
    if (display === 'Error') return;
    const current = parseFloat(display);
    if (Number.isNaN(current)) return;

    const pct =
      accumulator !== null && (pendingOp === '+' || pendingOp === '-')
        ? (accumulator * current) / 100
        : current / 100;
    setDisplay(formatDisplayNumber(pct));
    setResetOnNextDigit(false);
  }, [display, accumulator, pendingOp]);

  const handleOperator = useCallback(
    (nextOp: Operator) => {
      if (display === 'Error') return;
      const current = parseFloat(display);
      if (Number.isNaN(current)) return;

      if (accumulator === null) {
        setAccumulator(current);
        setPendingOp(nextOp);
        setResetOnNextDigit(true);
        setExpressionHint(`${formatDisplayNumber(current)} ${OPERATOR_SYMBOLS[nextOp]}`);
        return;
      }

      if (pendingOp && !resetOnNextDigit) {
        const result = computeOperation(accumulator, current, pendingOp);
        const formatted = formatDisplayNumber(result);
        setDisplay(formatted);
        if (formatted === 'Error') {
          setAccumulator(null);
          setPendingOp(null);
          setExpressionHint('');
          setResetOnNextDigit(true);
          return;
        }
        setAccumulator(result);
        setPendingOp(nextOp);
        setResetOnNextDigit(true);
        setExpressionHint(`${formatted} ${OPERATOR_SYMBOLS[nextOp]}`);
        return;
      }

      // Just switch operator if awaiting second operand
      setPendingOp(nextOp);
      setExpressionHint(`${formatDisplayNumber(accumulator)} ${OPERATOR_SYMBOLS[nextOp]}`);
    },
    [display, accumulator, pendingOp, resetOnNextDigit]
  );

  const handleEquals = useCallback(() => {
    if (display === 'Error' || accumulator === null || !pendingOp) return;
    const current = parseFloat(display);
    if (Number.isNaN(current)) return;

    const result = computeOperation(accumulator, current, pendingOp);
    const formatted = formatDisplayNumber(result);
    setExpressionHint(
      `${formatDisplayNumber(accumulator)} ${OPERATOR_SYMBOLS[pendingOp]} ${formatDisplayNumber(current)} =`
    );
    setDisplay(formatted);
    setAccumulator(null);
    setPendingOp(null);
    setResetOnNextDigit(true);
  }, [display, accumulator, pendingOp]);

  const handleCopy = useCallback(async () => {
    if (display === 'Error') return;
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      toast.success(`Copied ${display} to clipboard`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy result');
    }
  }, [display]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault();
        handleOperator(e.key as Operator);
      } else if (e.key === '%') {
        e.preventDefault();
        handlePercent();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleClear();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    onClose,
    handleDigit,
    handleDecimal,
    handleOperator,
    handlePercent,
    handleEquals,
    handleBackspace,
    handleClear,
  ]);

  if (!isOpen) return null;

  const formattedDisplay = (() => {
    if (display === 'Error' || display === '-' || display.endsWith('.')) return display;
    const num = Number(display);
    if (!Number.isFinite(num)) return display;
    const [intPart, decPart] = display.split('.');
    const formattedInt = Number(intPart).toLocaleString('en-US');
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  })();

  const digitBtnClass =
    'h-11 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-800 font-semibold text-sm border border-slate-200/80 transition-all flex items-center justify-center';
  const utilBtnClass =
    'h-11 rounded-xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.98] text-slate-700 font-semibold text-sm border border-slate-200/80 transition-all flex items-center justify-center';
  const opBtnClass = (op: Operator) =>
    `h-11 rounded-xl active:scale-[0.98] font-bold text-base border transition-all flex items-center justify-center ${
      pendingOp === op && resetOnNextDigit
        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/80'
    }`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Financial Quick Calculator"
    >
      <div
        className="w-full max-w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold tracking-wide">Quick Calculator</h4>
              <p className="text-[10px] text-slate-400">Keyboard supported</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close calculator"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Screen */}
        <div className="px-4 pt-3 pb-3 bg-slate-50 border-b border-slate-200">
          <div className="min-h-[16px] text-right text-[11px] font-medium text-slate-400 truncate">
            {expressionHint || '\u00A0'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={display === 'Error'}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-semibold text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition-colors disabled:opacity-40 shrink-0"
              title="Copy numeric value"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <div
              className="text-right text-2xl font-black text-slate-900 tracking-tight tabular-nums truncate"
              title={display}
            >
              {formattedDisplay}
            </div>
          </div>
        </div>

        {/* Keypad */}
        <div className="p-3 grid grid-cols-4 gap-2 bg-white">
          <button type="button" onClick={handleClear} className="h-11 rounded-xl bg-rose-50 hover:bg-rose-100 active:scale-[0.98] text-rose-700 font-bold text-sm border border-rose-200/80 transition-all">
            C
          </button>
          <button type="button" onClick={handleToggleSign} className={utilBtnClass}>
            +/−
          </button>
          <button type="button" onClick={handlePercent} className={utilBtnClass}>
            %
          </button>
          <button type="button" onClick={() => handleOperator('/')} className={opBtnClass('/')}>
            ÷
          </button>

          <button type="button" onClick={() => handleDigit('7')} className={digitBtnClass}>
            7
          </button>
          <button type="button" onClick={() => handleDigit('8')} className={digitBtnClass}>
            8
          </button>
          <button type="button" onClick={() => handleDigit('9')} className={digitBtnClass}>
            9
          </button>
          <button type="button" onClick={() => handleOperator('*')} className={opBtnClass('*')}>
            ×
          </button>

          <button type="button" onClick={() => handleDigit('4')} className={digitBtnClass}>
            4
          </button>
          <button type="button" onClick={() => handleDigit('5')} className={digitBtnClass}>
            5
          </button>
          <button type="button" onClick={() => handleDigit('6')} className={digitBtnClass}>
            6
          </button>
          <button type="button" onClick={() => handleOperator('-')} className={opBtnClass('-')}>
            −
          </button>

          <button type="button" onClick={() => handleDigit('1')} className={digitBtnClass}>
            1
          </button>
          <button type="button" onClick={() => handleDigit('2')} className={digitBtnClass}>
            2
          </button>
          <button type="button" onClick={() => handleDigit('3')} className={digitBtnClass}>
            3
          </button>
          <button type="button" onClick={() => handleOperator('+')} className={opBtnClass('+')}>
            +
          </button>

          <button type="button" onClick={() => handleDigit('0')} className={digitBtnClass}>
            0
          </button>
          <button type="button" onClick={handleDecimal} className={digitBtnClass}>
            .
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className={utilBtnClass}
            title="Backspace"
            aria-label="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-base shadow-sm transition-all flex items-center justify-center"
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
};
