import React, { useState, useEffect, useMemo } from 'react';
import { X, Layers, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCourses, useDepartments, createSection, type CourseDocument } from '../../../modules/academic';

export interface CreatedSectionInfo {
  id?: string;
  name: string;
  courseId: string;
  departmentId: string;
  yearLevel: number;
}

export interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCourseId?: string;
  initialYearLevel?: number;
  initialDepartmentId?: string;
  onSectionCreated?: (section: CreatedSectionInfo) => void;
}

export default function AddSectionModal({
  isOpen,
  onClose,
  initialCourseId,
  initialYearLevel,
  initialDepartmentId,
  onSectionCreated,
}: AddSectionModalProps) {
  const { data: courses = [], loading: loadingCourses } = useCourses();
  const { data: departments = [] } = useDepartments();

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);

  const [courseId, setCourseId] = useState<string>(initialCourseId || '');
  const [yearLevel, setYearLevel] = useState<number>(initialYearLevel || 1);
  const [name, setName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial props when opened
  useEffect(() => {
    if (isOpen) {
      const targetCourseId = initialCourseId || (activeCourses.length > 0 ? activeCourses[0].id : '');
      setCourseId(targetCourseId);

      const matchedCourse = activeCourses.find((c) => c.id === targetCourseId);
      const isShs = matchedCourse?.academicLevel === 'SHS';
      const defaultYear = initialYearLevel || (isShs ? 11 : 1);
      setYearLevel(defaultYear);

      setName('');
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialCourseId, initialYearLevel, activeCourses]);

  const selectedCourse = useMemo(
    () => activeCourses.find((c) => c.id === courseId),
    [activeCourses, courseId]
  );

  const isShsCourse = selectedCourse?.academicLevel === 'SHS';

  const selectedDepartment = useMemo(() => {
    if (!selectedCourse) return null;
    return departments.find((d) => d.id === selectedCourse.departmentId) || null;
  }, [selectedCourse, departments]);

  if (!isOpen) return null;

  const handleCourseChange = (newCourseId: string) => {
    setCourseId(newCourseId);
    setError(null);
    const c = activeCourses.find((item) => item.id === newCourseId);
    if (c?.academicLevel === 'SHS') {
      setYearLevel(11);
    } else {
      setYearLevel(1);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim().toUpperCase();
    if (!courseId) {
      setError('Please select a program / strand.');
      return;
    }
    if (!cleanName) {
      setError('Please enter a section name.');
      return;
    }

    const resolvedDeptId = selectedCourse?.departmentId || initialDepartmentId || '';
    if (!resolvedDeptId) {
      setError('The selected program is not assigned to an academic department.');
      return;
    }

    setIsSaving(true);
    try {
      await createSection({
        name: cleanName,
        courseId,
        departmentId: resolvedDeptId,
        yearLevel: Number(yearLevel),
      });

      toast.success(`Section "${cleanName}" created successfully!`);
      onSectionCreated?.({
        name: cleanName,
        courseId,
        departmentId: resolvedDeptId,
        yearLevel: Number(yearLevel),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create section. It may already exist.');
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
            <Layers className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="font-bold text-lg">Add Section</h3>
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

          {/* Program / Strand */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Program / Strand <span className="text-red-500">*</span>
            </label>
            <select
              value={courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={isSaving || loadingCourses}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all disabled:opacity-50"
            >
              <option value="">Select course / strand...</option>
              {activeCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.academicLevel === 'SHS' ? '[SHS] ' : '[College] '}
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Linked Department & Track Info Badge */}
          {selectedCourse && (
            <div className="px-3 py-2 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs flex items-center justify-between">
              <span className="text-gray-600 font-medium">
                {selectedDepartment ? selectedDepartment.name : 'Academic Department'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isShsCourse ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-[#001A4D]'
                }`}
              >
                {isShsCourse ? 'Senior High' : 'College'}
              </span>
            </div>
          )}

          {/* Year Level */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Year Level <span className="text-red-500">*</span>
            </label>
            <select
              value={yearLevel}
              onChange={(e) => setYearLevel(Number(e.target.value))}
              disabled={isSaving}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all disabled:opacity-50"
            >
              {isShsCourse ? (
                <>
                  <option value={11}>Grade 11</option>
                  <option value={12}>Grade 12</option>
                </>
              ) : (
                Array.from({ length: selectedCourse?.yearLevels || 4 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1st Year' : n === 2 ? '2nd Year' : n === 3 ? '3rd Year' : `${n}th Year`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Section Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Section Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value.toUpperCase());
                setError(null);
              }}
              disabled={isSaving}
              placeholder={isShsCourse ? 'e.g. STEM 11-A or ABM 1101' : 'e.g. BSIT 1101 or BSOA 2101'}
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
              disabled={isSaving || !name.trim() || !courseId}
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

