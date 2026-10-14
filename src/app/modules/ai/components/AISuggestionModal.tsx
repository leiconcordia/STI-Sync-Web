/**
 * src/app/modules/ai/components/AISuggestionModal.tsx
 *
 * Interactive preview and confirmation modal for AI suggestions.
 * Gives user full transparency and control over what gets applied to their form.
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  X,
  RefreshCw,
  Copy,
  Plus,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

export interface AISuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  originalText?: string;
  suggestionText?: string;
  suggestionList?: string[];
  mode?: 'text' | 'choice' | 'list';
  onApplyText?: (applied: string, mode: 'replace' | 'append') => void;
  onApplyList?: (selectedItems: string[]) => void;
  onRegenerate?: () => void;
  isLoading?: boolean;
}

export default function AISuggestionModal({
  isOpen,
  onClose,
  title,
  description,
  originalText = '',
  suggestionText = '',
  suggestionList = [],
  mode = 'text',
  onApplyText,
  onApplyList,
  onRegenerate,
  isLoading = false,
}: AISuggestionModalProps) {
  // For choice mode (e.g. 3 titles)
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(0);

  // For list mode (e.g. objectives or mechanics)
  const [selectedListIndices, setSelectedListIndices] = useState<number[]>(() =>
    suggestionList.map((_, i) => i)
  );

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const toggleListItem = (index: number) => {
    if (selectedListIndices.includes(index)) {
      setSelectedListIndices(selectedListIndices.filter((i) => i !== index));
    } else {
      setSelectedListIndices([...selectedListIndices, index]);
    }
  };

  const handleApply = (applyMode: 'replace' | 'append' = 'replace') => {
    if (mode === 'text' && onApplyText) {
      onApplyText(suggestionText, applyMode);
      onClose();
    } else if (mode === 'choice' && onApplyText) {
      const chosen = suggestionList[selectedChoiceIndex] || suggestionText;
      onApplyText(chosen, 'replace');
      onClose();
    } else if (mode === 'list' && onApplyList) {
      const chosenItems = selectedListIndices.map((i) => suggestionList[i]).filter(Boolean);
      onApplyList(chosenItems);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#001A4D] via-[#0A2E6D] to-[#0E4EBD] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-xs text-[#FFD41C]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">{title}</h3>
              {description && (
                <p className="text-[11px] text-blue-100/80 font-normal">{description}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Comparison for text mode */}
          {mode === 'text' && (
            <div className="space-y-4">
              {originalText && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">
                    Your Original Input:
                  </span>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 italic leading-relaxed">
                    "{originalText}"
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-[#001A4D] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />
                    AI Suggestion:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(suggestionText)}
                    className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 font-medium transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {suggestionText || (
                    <span className="text-gray-400 italic">No suggestion generated yet.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Choice mode (e.g. 3 titles) */}
          {mode === 'choice' && (
            <div className="space-y-3">
              <span className="text-[11px] uppercase tracking-wider font-bold text-gray-700 block">
                Select your preferred title:
              </span>
              <div className="space-y-2.5">
                {suggestionList.map((item, idx) => {
                  const isSelected = selectedChoiceIndex === idx;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedChoiceIndex(idx)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-[#001A4D] bg-blue-50/80 shadow-xs ring-1 ring-[#001A4D]'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'border-[#001A4D] bg-[#001A4D]'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-900">{item}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List mode (e.g. objectives or mechanics) */}
          {mode === 'list' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-bold text-gray-700">
                  Select items to add to your form:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedListIndices.length === suggestionList.length) {
                      setSelectedListIndices([]);
                    } else {
                      setSelectedListIndices(suggestionList.map((_, i) => i));
                    }
                  }}
                  className="text-xs font-semibold text-[#0E4EBD] hover:underline"
                >
                  {selectedListIndices.length === suggestionList.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="space-y-2">
                {suggestionList.map((item, idx) => {
                  const isChecked = selectedListIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleListItem(idx)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isChecked
                          ? 'border-blue-300 bg-blue-50/60'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-md border mt-0.5 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? 'border-[#001A4D] bg-[#001A4D] text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-medium text-gray-800 leading-relaxed flex-1">
                        {item}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-2xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Generating...' : 'Try Again'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Discard
            </button>

            {mode === 'text' && originalText && (
              <button
                type="button"
                onClick={() => handleApply('append')}
                className="px-3.5 py-2 text-xs font-bold text-[#001A4D] bg-white border border-[#001A4D]/30 hover:bg-blue-50/50 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Append Below
              </button>
            )}

            <button
              type="button"
              onClick={() => handleApply('replace')}
              disabled={
                isLoading ||
                (mode === 'list' && selectedListIndices.length === 0) ||
                (mode === 'text' && !suggestionText)
              }
              className="px-4 py-2 text-xs font-bold text-white bg-[#001A4D] hover:bg-[#0A2E6D] rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {mode === 'list'
                ? `Add ${selectedListIndices.length} Selected`
                : 'Apply Suggestion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
