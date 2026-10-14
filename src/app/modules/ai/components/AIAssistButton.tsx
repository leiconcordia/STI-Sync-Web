/**
 * src/app/modules/ai/components/AIAssistButton.tsx
 *
 * Reusable AI Assistant trigger button and dropdown menu.
 * Integrates into input headers and toolbars across AP and PAR forms.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';

export interface AIAssistOption {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
}

export interface AIAssistButtonProps {
  label?: string;
  options?: AIAssistOption[];
  onClick?: () => void | Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'ghost';
  tooltip?: string;
  className?: string;
}

export default function AIAssistButton({
  label = 'AI Assist',
  options,
  onClick,
  isLoading = false,
  disabled = false,
  size = 'sm',
  variant = 'secondary',
  tooltip,
  className = '',
}: AIAssistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const hasOptions = options && options.length > 0;

  const handleButtonClick = () => {
    if (isLoading || disabled) return;
    if (hasOptions) {
      setIsOpen(!isOpen);
    } else if (onClick) {
      onClick();
    }
  };

  const handleOptionSelect = (opt: AIAssistOption) => {
    setIsOpen(false);
    opt.onClick();
  };

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1 text-[11px] gap-1.5 rounded-lg'
      : 'px-3.5 py-1.5 text-xs gap-2 rounded-xl';

  const variantClasses =
    variant === 'primary'
      ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-white shadow-2xs border border-transparent'
      : variant === 'secondary'
      ? 'bg-blue-50/90 hover:bg-blue-100/90 text-[#001A4D] border border-blue-200/80 shadow-2xs'
      : 'hover:bg-slate-100 text-slate-700 border border-transparent';

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || isLoading}
        title={tooltip || 'Enhance with Gemini AI'}
        className={`inline-flex items-center font-bold transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses}`}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E4EBD]" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />
        )}
        <span>{isLoading ? 'AI Thinking...' : label}</span>
        {hasOptions && !isLoading && (
          <ChevronDown
            className={`w-3 h-3 text-[#0E4EBD] transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {/* Floating Action Menu */}
      {isOpen && hasOptions && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#0E4EBD]" />
              AI Writing Tools
            </span>
          </div>
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleOptionSelect(opt)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50/80 flex items-start gap-2.5 transition-colors group"
              >
                {opt.icon && (
                  <span className="mt-0.5 text-gray-500 group-hover:text-[#001A4D] transition-colors">
                    {opt.icon}
                  </span>
                )}
                <div>
                  <p className="font-bold text-gray-800 group-hover:text-[#001A4D] transition-colors">
                    {opt.label}
                  </p>
                  {opt.description && (
                    <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
                      {opt.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
