/**
 * src/app/modules/signatories/components/AddCustomLabelModal.tsx
 *
 * Modal allowing document proponents to define a new custom formal signatory label
 * (e.g., "Reviewed by:", "Verified by:", "Recommending Approval:") and save it
 * directly to the institutional Firestore directory.
 */

import React, { useState } from 'react';
import { Tag, X, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { createSignatoryLabel } from '../services/signatory-label.service';

interface AddCustomLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLabelCreated: (newLabelText: string) => void;
  existingLabels?: string[];
}

export const AddCustomLabelModal: React.FC<AddCustomLabelModalProps> = ({
  isOpen,
  onClose,
  onLabelCreated,
  existingLabels = [],
}) => {
  const [labelText, setLabelText] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = labelText.trim();
    if (!clean) {
      toast.error('Please enter a formal label name.');
      return;
    }

    // Auto-append colon if omitted
    const formatted = clean.endsWith(':') ? clean : `${clean}:`;

    // Check if already in current list
    const alreadyExists = existingLabels.some(
      (l) => l.toLowerCase() === formatted.toLowerCase()
    );
    if (alreadyExists) {
      toast.info(`Label "${formatted}" is already registered. Applying to signatory.`);
      onLabelCreated(formatted);
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await createSignatoryLabel({
        label: formatted,
        description: description.trim(),
        actionType: 'endorse',
        isApproverLabel: false,
      });

      toast.success(`Custom label "${formatted}" saved to directory!`);
      onLabelCreated(formatted);
      setLabelText('');
      setDescription('');
      onClose();
    } catch (err: any) {
      // If error says duplicate, still select it
      if (err?.message && err.message.includes('already exists')) {
        toast.info(`Label "${formatted}" already exists in records. Applying.`);
        onLabelCreated(formatted);
        onClose();
      } else {
        toast.error('Failed to save label: ' + (err?.message || 'Unexpected error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="font-bold text-base">Add Custom Signatory Label</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
              Formal Signatory Label *
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Reviewed by:"
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Document prefix printed above the signature line (e.g. <span className="font-mono font-bold text-gray-700">Reviewed by:</span>, <span className="font-mono font-bold text-gray-700">Verified by:</span>, or <span className="font-mono font-bold text-gray-700">Recommending Approval:</span>).
            </p>
          </div>

          <div>
            <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
              Description / Usage Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Used for academic program endorsements"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !labelText.trim()}
              className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <FileSignature className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Apply'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

