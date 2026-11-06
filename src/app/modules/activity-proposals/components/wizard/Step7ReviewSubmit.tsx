/**
 * src/app/modules/activity-proposals/components/wizard/Step7ReviewSubmit.tsx
 *
 * Section 7: Live Official STI Activity Proposal Document Preview,
 * 15-Calendar-Day Policy Verification & Dynamic Signatory Chain Assembly.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Building,
  ShieldCheck,
  Send,
  Save,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  UserPlus,
  Plus,
  X,
  UserCheck,
  Download,
  RotateCcw,
  School,
  GraduationCap,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProposalFormData, ProposalApprovalStep } from '../../types/proposal.types';
import type { InstitutionalSignatory } from '../../../signatories/types/signatory.types';
import { subscribeToSignatories } from '../../../signatories/services/signatory.service';
import { check15DayRule, formatPHP } from '../../utils/proposal-calculations';
import { exportActivityProposalPDF } from '../../utils/proposal-pdf-exporter';
import ProposalFlowBuilder from '../workflow/ProposalFlowBuilder';

interface Step7Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  isSubmitting?: boolean;
  isSavingDraft?: boolean;
  errors?: Record<string, string>;
}

export default function Step7ReviewSubmit({
  formData,
  onChange,
  onSubmit,
  onSaveDraft,
  isSubmitting = false,
  isSavingDraft = false,
  errors = {},
}: Step7Props) {
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(true);
  const [coProponentInput, setCoProponentInput] = useState('');

  // Subscribe to institutional signatories from registry
  useEffect(() => {
    const unsubscribe = subscribeToSignatories((list) => {
      setSignatories(list);
      setLoadingSignatories(false);
    });
    return () => unsubscribe();
  }, []);

  // Compute 15-day compliance
  const ruleCheck = useMemo(() => {
    return check15DayRule(
      formData.submissionDate || new Date().toISOString(),
      formData.sessions || [],
      formData.tasks || [],
      formData.date
    );
  }, [formData.submissionDate, formData.sessions, formData.tasks, formData.date]);

  // Proponents List (default to logged-in creator/maker)
  const proponents = useMemo(() => {
    if (formData.proponents && formData.proponents.length > 0) {
      return formData.proponents;
    }
    return [formData.createdByName || 'Student Affairs & Services'];
  }, [formData.proponents, formData.createdByName]);

  const handleAddProponent = (nameToAdd: string) => {
    const trimmed = nameToAdd.trim();
    if (!trimmed || proponents.includes(trimmed)) return;
    const updated = [...proponents, trimmed];
    onChange({ proponents: updated });
    setCoProponentInput('');
  };

  const handleRemoveProponent = (indexToRemove: number) => {
    if (proponents.length <= 1) return; // Keep at least one proponent
    const updated = proponents.filter((_, idx) => idx !== indexToRemove);
    onChange({ proponents: updated });
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportActivityProposalPDF(formData);
      toast.success('Official Activity Proposal PDF generated successfully!');
    } catch (err: any) {
      console.error('PDF export error:', err);
      toast.error('Failed to generate PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const approvalChain: ProposalApprovalStep[] = formData.approvalChain || [];

  // Synchronize isUrgent flag with ruleCheck:
  // If under 15 days, enable urgent mode. If compliant, clear urgent mode and any stale justification.
  useEffect(() => {
    if (!ruleCheck.isCompliant) {
      if (!formData.isUrgent) {
        onChange({ isUrgent: true });
      }
    } else {
      if (formData.isUrgent) {
        onChange({ isUrgent: false, urgentJustification: '' });
      }
    }
  }, [ruleCheck.isCompliant, formData.isUrgent]);

  const isReturnedProposal = Boolean(
    formData.status === 'returned' ||
    formData.status === 'returned_for_revision' ||
    (formData as any).proposalStatus === 'returned' ||
    (formData as any).isReturned
  );

  const canSubmit = useMemo(() => {
    if (formData.isUrgent && !(formData.urgentJustification || '').trim()) {
      return false;
    }
    if (!formData.title?.trim() || !formData.description?.trim()) {
      return false;
    }
    if (!approvalChain || approvalChain.length === 0) {
      return false;
    }
    const hasApprover = approvalChain.some((s) => s.actionType === 'approve' || s.role === 'school_president');
    if (!hasApprover) {
      return false;
    }
    if (isReturnedProposal && !(formData.resubmissionNote || '').trim()) {
      return false;
    }
    return true;
  }, [formData.isUrgent, formData.urgentJustification, formData.title, formData.description, approvalChain, isReturnedProposal, formData.resubmissionNote]);

  return (
    <div className="space-y-6">
      {/* ── 15-DAY POLICY VERIFICATION STATUS BANNER ── */}
      {ruleCheck.isCompliant && !formData.isUrgent ? (
        <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
              15-Calendar-Day Policy Rule: Compliant
            </h4>
            <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
              This proposal is scheduled <strong>{ruleCheck.daysDiff} calendar days</strong> before the initial task/session 
              {ruleCheck.earliestDate && ` (${ruleCheck.earliestDate})`}, satisfying the required 15-day advance notice for institutional review.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Urgent Filing Vetting Notice — Under 15 Calendar Days ({ruleCheck.daysDiff} Days Lead Time)
                </h4>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-full">
                  Fast-Track Route
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Official STI policy requires proposals to be submitted at least <strong>15 calendar days</strong> before the start of the initial task/event.
                Because the earliest activity date is on <strong>{ruleCheck.earliestDate || 'soon'}</strong>, an administrative justification was provided in Step 4 for the School President and Academic Head.
              </p>

              {formData.urgentJustification?.trim() ? (
                <div className="mt-3 p-3 bg-white/90 border border-amber-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                    Urgent Submission Justification (Configured in Step 4):
                  </span>
                  <p className="text-xs text-slate-800 italic leading-relaxed">
                    "{formData.urgentJustification.trim()}"
                  </p>
                </div>
              ) : (
                <div className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span>Missing urgent justification. Please return to Step 4 to enter your administrative reason.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PROPOSED BY / PROPONENTS (MAKERS) SECTION ── */}
      <div className="bg-gradient-to-r from-blue-900 to-[#001A4D] text-white p-5 rounded-2xl shadow-sm border border-blue-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-[#FFD41C] flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Proposed By (Activity Maker & Co-Proponents)
              </h4>
              <p className="text-[11px] text-blue-200">
                Defaults to your account as the primary maker. You can add fellow organizers or co-proponents below.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-blue-300">
            {proponents.length} {proponents.length === 1 ? 'Proponent' : 'Proponents'}
          </span>
        </div>

        {/* Proponents Badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          {proponents.map((prop, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs ${
                idx === 0
                  ? 'bg-blue-800/80 text-white border border-blue-400/40'
                  : 'bg-white/10 text-blue-100 border border-white/20'
              }`}
            >
              <span>{prop}</span>
              {idx === 0 ? (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-[#FFD41C] text-[#001A4D] px-1.5 py-0.5 rounded">
                  Maker
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRemoveProponent(idx)}
                  className="text-blue-300 hover:text-rose-400 transition-colors"
                  title="Remove co-proponent"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Add Co-Proponent Input */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={coProponentInput}
            onChange={(e) => setCoProponentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddProponent(coProponentInput);
              }
            }}
            placeholder="Type name of co-proponent (e.g. Juan Dela Cruz, SSC Officer)..."
            className="flex-1 px-3.5 py-2 bg-slate-900/80 border border-blue-700/60 rounded-xl text-xs text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-[#FFD41C]/30 focus:border-[#FFD41C]"
          />
          <button
            type="button"
            onClick={() => handleAddProponent(coProponentInput)}
            className="px-4 py-2 bg-[#FFD41C] hover:bg-[#ffe054] text-[#001A4D] text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Proponent</span>
          </button>
        </div>
      </div>

      {/* ── OFFICIAL STI DOCUMENT PREVIEW SHEET ── */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        {/* Document Header (STI Official Branding Header) */}
        <div className="bg-slate-900 text-white p-6 sm:p-8 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold uppercase tracking-wider">
                  Official Activity Proposal
                </span>
                <span className="text-slate-400 text-xs font-mono">
                  {formData.referenceNo || 'AP-2026-SAS-PENDING'}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white mt-1.5 leading-snug">
                {formData.title || 'Untitled Activity Proposal'}
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                STI College Ormoc • Student Affairs & Services (SAS) Institutional Review
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
              <div className="text-left sm:text-right">
                <span className="text-[11px] text-slate-400 block uppercase font-mono tracking-wider">
                  Submission Date
                </span>
                <span className="text-sm font-semibold text-white">
                  {formData.submissionDate ||
                    new Intl.DateTimeFormat('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date())}
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 hover:text-white border border-blue-400/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                title="Generate and download official STI Activity Proposal PDF"
              >
                <Download className="w-3.5 h-3.5 text-[#FFD41C]" />
                <span>{isExportingPdf ? 'Exporting PDF...' : 'Download Proposal PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Document Body */}
        <div className="p-6 sm:p-8 space-y-6 text-slate-800">
          {/* Top Meta: Date, Proposed By, and Organizers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                Date (Submission Date)
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                {formData.submissionDate ||
                  new Intl.DateTimeFormat('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date())}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                Proposed / Submitted By
              </span>
              <span className="font-semibold text-blue-900 text-sm mt-0.5 block leading-tight">
                {proponents.join(', ')}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {proponents.length > 1
                  ? `${proponents.length} Co-Proponents (Primary: ${proponents[0]})`
                  : formData.creatorRole === 'sas_admin'
                  ? 'SAS Administrator (Maker)'
                  : 'Activity Maker'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                3. Organizer/s
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                {formData.organizers?.join(', ') || 'Student Affairs & Services'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                9. Est. attendance
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                {formData.estimatedAttendance || '—'}
              </span>
            </div>
          </div>

          {/* 1. Activity title & 2. Description */}
          <div className="space-y-4 pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Activity title
              </h3>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {formData.title || 'Untitled'}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Description
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap mt-0.5 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                {formData.description || 'No description provided.'}
              </p>
            </div>
          </div>

          {/* 4. Objective/s & 5. Success indicator/s */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                4. Objective/s
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {formData.objectives?.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                5. Success indicator/s
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {formData.successIndicators?.map((ind, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                    <span>{ind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 6. Mechanics & 7. Materials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                6. Mechanics
              </h3>
              <ol className="space-y-1.5 text-xs text-slate-700 list-decimal pl-4">
                {formData.mechanics?.map((m, i) => (
                  <li key={i} className="pl-1">
                    <span>{m}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                7. Materials
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {formData.materials?.map((mat, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-[11px]"
                  >
                    {mat}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 8. Target market */}
          <div className="space-y-2 pb-6 border-b border-slate-100 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              8. Target market
            </h3>
            {formData.targetAudience?.allStudents ? (
              <div className="p-4 bg-gradient-to-br from-blue-50/80 to-slate-50 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <strong className="text-sm font-bold text-[#001A4D]">
                      Campus-Wide Coverage: All Students (SHS & College)
                    </strong>
                  </div>
                  {formData.targetAudience?.expectedReachPercentage && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#001A4D] text-[#FFD41C]">
                      {formData.targetAudience.expectedReachPercentage}% Expected Reach
                    </span>
                  )}
                </div>

                {formData.targetAudience?.demographicBreakdown ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-gray-500 font-semibold block">Total Target Pool</span>
                        <span className="text-sm font-black text-[#001A4D]">
                          {formData.targetAudience.demographicBreakdown.totalPopulation?.toLocaleString() || '—'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-amber-700 font-semibold block">Senior High School</span>
                        <span className="text-sm font-black text-slate-800">
                          {formData.targetAudience.demographicBreakdown.shsTotal?.toLocaleString() || '0'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-blue-700 font-semibold block">Tertiary / College</span>
                        <span className="text-sm font-black text-slate-800">
                          {formData.targetAudience.demographicBreakdown.collegeTotal?.toLocaleString() || '0'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-purple-700 font-semibold block">Faculty & Staff</span>
                        <span className="text-sm font-black text-slate-800">
                          {formData.targetAudience.demographicBreakdown.facultyTotal
                            ? `${formData.targetAudience.demographicBreakdown.facultyTotal} included`
                            : 'Excluded'}
                        </span>
                      </div>
                    </div>

                    {/* Strands & Programs demographic tags */}
                    <div className="space-y-1.5 pt-1">
                      {formData.targetAudience.demographicBreakdown.strandsBreakdown &&
                        Object.keys(formData.targetAudience.demographicBreakdown.strandsBreakdown).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                              <School className="w-3 h-3 text-amber-600" /> SHS Strands:
                            </span>
                            {Object.entries(formData.targetAudience.demographicBreakdown.strandsBreakdown).map(
                              ([code, count]) => (
                                <span
                                  key={code}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                                >
                                  {code}: {count}
                                </span>
                              )
                            )}
                          </div>
                        )}

                      {formData.targetAudience.demographicBreakdown.programsBreakdown &&
                        Object.keys(formData.targetAudience.demographicBreakdown.programsBreakdown).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                              <GraduationCap className="w-3 h-3 text-blue-600" /> College Programs:
                            </span>
                            {Object.entries(formData.targetAudience.demographicBreakdown.programsBreakdown).map(
                              ([code, count]) => (
                                <span
                                  key={code}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200"
                                >
                                  {code}: {count}
                                </span>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">
                    All academic programs and strands across Senior High School and College departments are included.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                <div>
                  <strong className="text-slate-700">Programs / Strands:</strong>{' '}
                  <span className="text-blue-900 font-medium">
                    {formData.targetAudience?.courseCodes?.length
                      ? formData.targetAudience.courseCodes.join(', ')
                      : formData.targetAudience?.departments?.join(', ') || 'All Programs'}
                  </span>
                </div>
                <div>
                  <strong className="text-slate-700">Year Levels:</strong>{' '}
                  <span className="text-slate-800">
                    {formData.targetAudience?.yearLevels?.join(', ') || 'All Levels'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 10. Marketing plan & 11. Documentation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                10. Marketing plan
              </h3>
              <ul className="space-y-1 text-xs text-slate-700">
                {formData.marketingPlan?.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#0E4EBD]">›</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                11. Documentation
              </h3>
              <ul className="space-y-1 text-xs text-slate-700">
                {formData.documentationPlan?.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-600">✓</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 12. Date & time (and Venue) */}
          <div className="space-y-2 pb-6 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              12. Date & time (and Venue)
            </h3>
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Event Date</span>
                <span className="font-semibold text-slate-800">
                  {formData.date || formData.sessions?.[0]?.date || 'Date TBD'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Operational Hours</span>
                <span className="font-semibold text-slate-800">
                  {(formData.startTime || formData.sessions?.[0]?.startTime || '08:00')} -{' '}
                  {(formData.endTime || formData.sessions?.[0]?.endTime || '12:00')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Campus Venue</span>
                <span className="font-semibold text-blue-900">
                  {formData.venueName || formData.sessions?.[0]?.venueName || 'Venue TBD'}
                </span>
              </div>
            </div>
          </div>

          {/* 13. Task list */}
          <div className="space-y-2 pb-6 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              13. Task list
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <th className="p-2.5">Task</th>
                    <th className="p-2.5">Person Assigned</th>
                    <th className="p-2.5">Date to be Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.tasks?.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium">{t.taskName}</td>
                      <td className="p-2.5 text-slate-600">{t.assignedPerson}</td>
                      <td className="p-2.5 text-slate-600">{t.completionDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 14. Financial projections */}
          <div className="space-y-3 pb-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                14. Financial projections
              </h3>
              <div className="text-xs font-bold text-slate-700">
                Projected Balance: <span className="text-emerald-700">{formatPHP(formData.financialProjections?.balance || 0)}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Proposed Revenues</span>
                <span className="text-base font-bold text-emerald-900">
                  {formatPHP(formData.financialProjections?.totalRevenue || 0)}
                </span>
                <span className="text-[11px] text-emerald-700 block mt-0.5">
                  {formData.financialProjections?.revenues?.length || 0} line item(s)
                </span>
              </div>
              <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-rose-800 block">Total Proposed Expenses</span>
                <span className="text-base font-bold text-rose-900">
                  {formatPHP(formData.financialProjections?.totalExpenses || 0)}
                </span>
                <span className="text-[11px] text-rose-700 block mt-0.5">
                  {formData.financialProjections?.expenses?.length || 0} line item(s)
                </span>
              </div>
            </div>
          </div>

          {/* 15. Signatories & Dynamic Multi-Stage Approval Flow */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                15. Institutional Signatory & Approval Pipeline
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                {approvalChain.length} Designated Signatories
              </span>
            </div>

            <ProposalFlowBuilder
              approvalChain={approvalChain}
              onChange={(newChain) => onChange({ approvalChain: newChain })}
              activeSignatories={signatories}
              targetAudience={formData.targetAudience}
              creatorName={formData.createdByName}
              creatorEmail={formData.createdByEmail}
              creatorRole={formData.creatorRole}
            />
          </div>
        </div>
      </div>

      {/* ── OFFICER REVISION SUMMARY (When resubmitting returned proposal) ── */}
      {isReturnedProposal && (
        <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-amber-950 font-bold text-xs uppercase tracking-wider">
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <span>Officer Revision Summary / Changes Made (Required) <span className="text-red-500">*</span></span>
          </div>
          <p className="text-[11px] text-amber-800">
            Explain the corrections, updates, or clarifications applied to the proposal in this revision cycle so approvers can immediately verify them.
          </p>
          <textarea
            rows={3}
            value={formData.resubmissionNote || ''}
            onChange={(e) => onChange({ resubmissionNote: e.target.value })}
            placeholder="e.g. Adjusted budget line item 3 with updated supplier quotations; moved event date to next week to avoid exam conflict..."
            className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/40 text-slate-800 placeholder:text-gray-400"
            required
          />
        </div>
      )}

      {/* ── BOTTOM ACTIONS ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>{isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            title="Download publication-quality PDF copy of this Activity Proposal"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Download Proposal PDF'}</span>
          </button>
        </div>

        {!canSubmit && (
          <div className="w-full sm:w-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              {isReturnedProposal && !(formData.resubmissionNote || '').trim()
                ? 'Please provide a summary of the revisions made above before resubmitting.'
                : (formData.isUrgent || !ruleCheck.isCompliant) && !(formData.urgentJustification || '').trim()
                ? 'Please return to Step 4 to provide an urgent submission justification before proceeding.'
                : 'Please ensure all required fields across previous steps are filled.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
