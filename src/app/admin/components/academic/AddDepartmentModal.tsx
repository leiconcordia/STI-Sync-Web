import React, { useState, useEffect } from 'react';
import { X, Building, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createDepartment, type AcademicLevel } from '../../../modules/academic';

export interface CreatedDepartmentInfo {
  name: string;
  code: string;
  academicLevel: AcademicLevel;
}

export interface AddDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAcademicLevel?: AcademicLevel;
  onDepartmentCreated?: (dept: CreatedDepartmentInfo) => void;
}

export default function AddDepartmentModal({
  isOpen,
  onClose,
  initialAcademicLevel = 'COLLEGE',
  onDepartmentCreated,
}: AddDepartmentModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>(initialAcademicLevel);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCode('');
      setAcademicLevel(initialAcademicLevel || 'COLLEGE');
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialAcademicLevel]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName) {
      setError('Please enter a department name.');
      return;
    }
    if (!cleanCode) {
      setError('Please enter a department code (e.g., ITE, CBA, THM).');
      return;
    }

    setIsSaving(true);
    try {
      await createDepartment({
        name: cleanName,
        code: cleanCode,
        academicLevel,
      });

      toast.success(`Academic Department "${cleanCode} — ${cleanName}" created successfully!`);
      onDepartmentCreated?.({
        name: cleanName,
        code: cleanCode,
        academicLevel,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create department. It may already exist.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="font-bold text-lg">Add Academic Department</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-left">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Academic Track Toggle */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Academic Track <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAcademicLevel('COLLEGE')}
                disabled={isSaving}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  academicLevel === 'COLLEGE'
                    ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                College Department
              </button>
              <button
                type="button"
                onClick={() => setAcademicLevel('SHS')}
                disabled={isSaving}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  academicLevel === 'SHS'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                Senior High Track
              </button>
            </div>
          </div>

          {/* Department Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Department Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              disabled={isSaving}
              placeholder={
                academicLevel === 'SHS'
                  ? 'e.g. Senior High School Academic Track'
                  : 'e.g. Information Technology Education'
              }
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all disabled:opacity-50"
            />
          </div>

          {/* Department Code */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Department Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              disabled={isSaving}
              maxLength={10}
              placeholder={academicLevel === 'SHS' ? 'e.g. SHS' : 'e.g. ITE, CBA, or THM'}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all disabled:opacity-50 uppercase"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim() || !code.trim()}
              className="flex-1 py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

