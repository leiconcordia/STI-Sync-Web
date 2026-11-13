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
  Lock,
  Coins,
  FileSignature,
  PenTool,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProposalFormData, ProposalApprovalStep } from '../../types/proposal.types';
import type { InstitutionalSignatory } from '../../../signatories/types/signatory.types';
import { subscribeToSignatories } from '../../../signatories/services/signatory.service';
import { check15DayRule, formatPHP, formatDateLong } from '../../utils/proposal-calculations';
import { exportActivityProposalPDF } from '../../utils/proposal-pdf-exporter';
import ProposalFlowBuilder from '../workflow/ProposalFlowBuilder';

interface Step7Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  isSubmitting?: boolean;
  isSavingDraft?: boolean;
  isOfficerOnly?: boolean;
  errors?: Record<string, string>;
  makerSignatureUrl?: string;
}

export default function Step7ReviewSubmit({
  formData,
  onChange,
  onSubmit,
  onSaveDraft,
  isSubmitting = false,
  isSavingDraft = false,
  isOfficerOnly = false,
  errors = {},
  makerSignatureUrl,
}: Step7Props) {
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(true);

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

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const effectiveSig =
        formData.submittedBySignatureUrl ||
        formData.preparedBy?.signatureUrl ||
        makerSignatureUrl ||
        '';

      const exportData: ProposalFormData = {
        ...formData,
        submittedBySignatureUrl: effectiveSig,
        preparedBy: {
          ...formData.preparedBy,
          name: formData.preparedBy?.name || formData.createdByName || 'Organization Adviser',
          roleTitle: formData.preparedBy?.roleTitle || (formData.creatorRole === 'sas_admin' ? 'SAS Administrator' : 'Organization Adviser'),
          signatureUrl: effectiveSig,
          signedAt: formData.preparedBy?.signedAt || new Date().toISOString(),
        },
      };

      await exportActivityProposalPDF(exportData);
      toast.success(
        effectiveSig
          ? 'Official Activity Proposal PDF generated with registered signature!'
          : 'Official Activity Proposal PDF generated successfully!'
      );
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
              {ruleCheck.earliestDate && ` (${formatDateLong(ruleCheck.earliestDate)})`}, satisfying the required 15-day advance notice for institutional review.
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
                Because the earliest activity date is on <strong>{formatDateLong(ruleCheck.earliestDate) || 'soon'}</strong>, an administrative justification was provided in Step 4 for the School President and Academic Head.
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
                  {formatDateLong(formData.submissionDate || new Date())}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 pb-6 border-b border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                Date (Submission Date)
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                {formatDateLong(formData.submissionDate || new Date())}
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
            <div>
              <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                Funding Source
              </span>
              <div className="mt-1">
                {formData.fundingSource === 'organization_funds' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    💼 Club Treasury
                  </span>
                ) : formData.fundingSource === 'zero_budget' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    📄 Non-Monetary (₱0)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    🏛️ School Budget
                  </span>
                )}
              </div>
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
                  {formatDateLong(formData.date || formData.sessions?.[0]?.date) || 'Date TBD'}
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
                      <td className="p-2.5 text-slate-600">{formatDateLong(t.completionDate) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 14. Financial projections */}
          {(() => {
            const revItems = formData.financialProjections?.revenues || [];
            const expItems = formData.financialProjections?.expenses || [];
            const calculatedTotalRevenue = Number(formData.financialProjections?.totalRevenue) ||
              revItems.reduce((s, r) => s + (Number(r.totalAmount) || Number(r.thisYearProposed) || 0), 0);
            const calculatedTotalExpenses = Number(formData.financialProjections?.totalExpenses) ||
              expItems.reduce((s, e) => s + (Number(e.totalAmount) || Number(e.thisYearProposed) || 0), 0);

            const isInstitutionalAllocation =
              (formData.fundingSource === 'school_budget' || formData.fundingSource === 'organization_funds') &&
              calculatedTotalRevenue === 0 &&
              calculatedTotalExpenses > 0;

            const displayRevenue = isInstitutionalAllocation ? calculatedTotalExpenses : calculatedTotalRevenue;
            const rawBalance = formData.financialProjections?.balance !== undefined && !isInstitutionalAllocation
              ? Number(formData.financialProjections.balance)
              : (displayRevenue - calculatedTotalExpenses);

            const isNonMonetary = formData.fundingSource === 'zero_budget';
            const hasCommercialRevenues = !isInstitutionalAllocation && !isNonMonetary && calculatedTotalRevenue > 0;

            return (
              <div className="space-y-3 pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    14. Financial projections
                  </h3>
                  <div className="flex items-center gap-2.5 text-xs font-bold flex-wrap">
                    <span className="text-slate-600">
                      Total Asking Budget: <strong className="text-[#001A4D] font-mono">{formatPHP(calculatedTotalExpenses)}</strong>
                    </span>
                    {hasCommercialRevenues && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600">
                          Projected Balance: <strong className={`font-mono ${rawBalance >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatPHP(rawBalance)}</strong>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rawBalance === 0
                            ? 'bg-blue-100 text-blue-800'
                            : rawBalance > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rawBalance === 0 ? '✓ Balanced' : rawBalance > 0 ? '↑ Surplus' : '⚠ Deficit'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {isNonMonetary ? (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Funding Source</span>
                      <span className="font-bold text-slate-800 text-sm">Non-Monetary Activity</span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">Zero budget baseline (₱0.00) required</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-[#001A4D]">
                      ₱0.00 Non-Monetary
                    </span>
                  </div>
                ) : isInstitutionalAllocation ? (
                  <div className="p-4 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white border border-blue-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900">
                          Total Asking Budget
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#001A4D]">
                          {formData.fundingSource === 'school_budget' ? 'School Budget' : 'Club Treasury'}
                        </span>
                      </div>
                      <span className="text-xl font-black text-[#001A4D] font-mono block mt-1">
                        {formatPHP(calculatedTotalExpenses)}
                      </span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        {expItems.length} baseline category spending item(s) allocated from institutional funds
                      </span>
                    </div>
                    <div className="text-left sm:text-right sm:border-l sm:border-blue-200/60 sm:pl-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Funding Allocation
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 inline-block mt-1">
                        ✓ 100% Covered
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Proposed Revenues</span>
                      <span className="text-base font-bold text-emerald-900 font-mono">
                        {formatPHP(displayRevenue)}
                      </span>
                      <span className="text-[11px] text-emerald-700 block mt-0.5">
                        {revItems.length} revenue line item(s)
                      </span>
                    </div>
                    <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl">
                      <span className="text-[10px] uppercase font-bold text-rose-800 block">Total Proposed Expenses</span>
                      <span className="text-base font-bold text-rose-900 font-mono">
                        {formatPHP(calculatedTotalExpenses)}
                      </span>
                      <span className="text-[11px] text-rose-700 block mt-0.5">
                        {expItems.length} expense line item(s)
                      </span>
                    </div>
                  </div>
                )}

            {/* Historical Budget Reference Status Badge */}
            {formData.historicalReference && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  formData.historicalReference.isManuallyEdited
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
                }`}
              >
                {formData.historicalReference.isManuallyEdited ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Historical Baseline Reference (Manually Adjusted):</strong> Referenced from{' '}
                      <em>"{formData.historicalReference.eventTitle}"</em> ({formData.historicalReference.schoolYear ? `SY ${formData.historicalReference.schoolYear} • ` : ''}Original Past Budget: {formatPHP(formData.historicalReference.originalTotalAmount)}), but one or more figures in Last Year's Actual were modified. Reviewers will see that adjustments were made.
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Historical Baseline Reference (Audit-Verified):</strong> "Last Year's Actual" figures are verified and locked to official past record{' '}
                      <em>"{formData.historicalReference.eventTitle}"</em> ({formData.historicalReference.schoolYear ? `SY ${formData.historicalReference.schoolYear} • ` : ''}Past Total: {formatPHP(formData.historicalReference.originalTotalAmount)}) without modifications.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

          {/* 15. Prepared By / Maker Electronic Signature Verification */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                15. Prepared By (Official E-Signature Verification)
              </h3>
              {isOfficerOnly ? (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  Adviser Signature Required on Submission
                </span>
              ) : makerSignatureUrl ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Official Signature Attached
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Signature Required in Settings
                </span>
              )}
            </div>

            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                isOfficerOnly
                  ? 'bg-slate-50 border-slate-200 shadow-2xs'
                  : makerSignatureUrl
                  ? 'bg-emerald-50/60 border-emerald-200 shadow-2xs'
                  : 'bg-amber-50/80 border-amber-300 shadow-xs'
              }`}
            >
              <div className="space-y-1 max-w-xl">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                  <FileSignature className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{proponents[0] || formData.preparedBy?.name || 'Organization Adviser'}</span>
                  <span className="text-[10px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {formData.creatorRole === 'sas_admin' ? 'SAS Administrator' : 'Organization Adviser'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {isOfficerOnly
                    ? 'Only the Organization Adviser’s registered digital signature will be verified and attached when the Adviser formally submits this Activity Proposal.'
                    : makerSignatureUrl
                    ? 'Official signature is verified from your registered profile and will be stamped onto Form AP-01 upon submission and publication-quality PDF export.'
                    : 'No registered digital signature found for your account. Please upload or register your signature in your Profile / Account Settings before submitting this Activity Proposal.'}
                </p>
              </div>

              {!isOfficerOnly && makerSignatureUrl && (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="bg-white p-1.5 rounded-xl border border-emerald-200 shadow-2xs">
                    <img
                      src={makerSignatureUrl}
                      alt="Verified Official Signature"
                      className="h-10 max-w-[140px] object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 16. Signatories & Dynamic Multi-Stage Approval Flow */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                16. Signatory & Approval Pipeline
              </h3>
              {formData.fundingSource === 'organization_funds' ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Direct SAS Approval
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  {approvalChain.length} Designated Signatories
                </span>
              )}
            </div>

            {formData.fundingSource === 'organization_funds' ? (
              <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-2xl flex items-start gap-3.5 shadow-xs">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800 shrink-0">
                  <Coins className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Organization Internal Funds — Direct SAS Approval
                  </h4>
                  <p className="text-xs text-emerald-900/90 leading-relaxed">
                    This activity is funded entirely from organization treasury funds. Institutional signatory pipelines (School Director, Academic Head, Assistant Principals) are not required. This document routes directly to <strong>Student Affairs & Services (SAS)</strong> for official institutional review, digital approval, and signature.
                  </p>
                </div>
              </div>
            ) : (
              <ProposalFlowBuilder
                approvalChain={approvalChain}
                onChange={(newChain) => onChange({ approvalChain: newChain })}
                activeSignatories={signatories}
                targetAudience={formData.targetAudience}
                creatorName={formData.createdByName}
                creatorEmail={formData.createdByEmail}
                creatorRole={formData.creatorRole}
                fundingSource={formData.fundingSource}
              />
            )}
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

      {/* ── OFFICER DRAFTING MODE NOTICE ── */}
      {isOfficerOnly && (
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 text-xs shadow-xs">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-sm text-amber-950 block">Organization Officer Drafting Mode</span>
            <p className="leading-relaxed text-amber-900">
              As an Organization Officer, you can prepare activity details, logistics, and budget allocations, and <strong>Save as Draft</strong>.
              Only your <strong>Organization Adviser</strong> has the formal authority to sign and submit this proposal for institutional review.
            </p>
          </div>
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

        {!canSubmit && !isOfficerOnly && (
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
