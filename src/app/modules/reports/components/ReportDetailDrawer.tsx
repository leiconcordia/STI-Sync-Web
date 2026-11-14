import React from 'react';
import {
  X,
  Download,
  FileText,
  Wallet,
  ClipboardCheck,
  Building2,
  Users,
} from 'lucide-react';
import {
  APReportRow,
  FLReportRow,
  PARReportRow,
  OrgDirectoryRow,
  OfficerRosterRow,
} from '../types/report.types';

export type ReportDrawerSelection =
  | { type: 'ap'; data: APReportRow }
  | { type: 'fl'; data: FLReportRow }
  | { type: 'par'; data: PARReportRow }
  | { type: 'org'; data: OrgDirectoryRow }
  | { type: 'officer'; data: OfficerRosterRow }
  | null;

interface ReportDetailDrawerProps {
  selection: ReportDrawerSelection;
  onClose: () => void;
  onExportSingle: (selection: ReportDrawerSelection) => void;
}

export const ReportDetailDrawer: React.FC<ReportDetailDrawerProps> = ({
  selection,
  onClose,
  onExportSingle,
}) => {
  if (!selection) return null;

  const formatPHP = (val?: number | null) =>
    `₱${(Number(val) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const renderField = (label: string, value: React.ReactNode) => (
    <div className="bg-slate-50 border border-gray-200 rounded-xl p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-0.5">
        {label}
      </div>
      <div className="text-xs font-bold text-gray-900 break-words">{value || '—'}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#003B73] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-[#FFD100]">
              {selection.type === 'ap' && <FileText className="w-5 h-5" />}
              {selection.type === 'fl' && <Wallet className="w-5 h-5" />}
              {selection.type === 'par' && <ClipboardCheck className="w-5 h-5" />}
              {selection.type === 'org' && <Building2 className="w-5 h-5" />}
              {selection.type === 'officer' && <Users className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFD100]">
                {selection.type === 'ap' && 'Activity Proposal Record'}
                {selection.type === 'fl' && 'Financial Liquidation Record'}
                {selection.type === 'par' && 'Post-Activity Report Record'}
                {selection.type === 'org' && 'Organization Accreditation Profile'}
                {selection.type === 'officer' && 'Student Officer Profile'}
              </div>
              <h3 className="text-base font-black line-clamp-1">
                {selection.type === 'ap' && selection.data.title}
                {selection.type === 'fl' && selection.data.eventTitle}
                {selection.type === 'par' && selection.data.activityName}
                {selection.type === 'org' && selection.data.name}
                {selection.type === 'officer' && selection.data.studentName}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {selection.type === 'ap' && (
            <div className="grid grid-cols-2 gap-3">
              {renderField('Reference Code', selection.data.referenceNo)}
              {renderField('Status', selection.data.signatoryStatus?.toUpperCase())}
              {renderField('Organization', selection.data.organizer)}
              {renderField('Club Adviser', selection.data.adviserName || 'SAS Office')}
              {renderField('Funding Source', selection.data.fundingSource || 'School Budget')}
              {renderField('Event Date & Venue', selection.data.targetDateVenue)}
              {renderField('Proposed Budget', formatPHP(selection.data.proposedBudget))}
              {renderField('Approved Budget', formatPHP(selection.data.approvedBudget))}
              {renderField('Current Stage', selection.data.stage)}
              {renderField('Submitted Date', selection.data.submissionDate)}
            </div>
          )}

          {selection.type === 'fl' && (
            <div className="grid grid-cols-2 gap-3">
              {renderField('Liquidation ID', selection.data.liquidationId)}
              {renderField('Audit Status', selection.data.auditStatus?.toUpperCase())}
              {renderField('Organization', selection.data.organization)}
              {renderField('Club Adviser', selection.data.adviserName || 'SAS Office')}
              {renderField('Disbursed Amount', formatPHP(selection.data.disbursedAmount))}
              {renderField('Actual Spend', formatPHP(selection.data.totalActualExpense))}
              {renderField('Surplus / Deficit', formatPHP(selection.data.surplusDeficit))}
              {renderField(
                'Receipts Attached',
                `${selection.data.orCount || 0} ORs (${selection.data.attachmentsCount || 0} files)`
              )}
              {renderField('Days Lapsed', String(selection.data.daysLapsed || '—'))}
              {renderField('Submitted Date', selection.data.dateSubmitted || '—')}
            </div>
          )}

          {selection.type === 'par' && (
            <div className="grid grid-cols-2 gap-3">
              {renderField('PAR Code', selection.data.parCode)}
              {renderField('Status', selection.data.status?.toUpperCase())}
              {renderField('Organization', selection.data.organizer)}
              {renderField('Club Adviser', selection.data.adviserName || 'SAS Office')}
              {renderField('Date Held', selection.data.dateHeld)}
              {renderField(
                'Verified Attendance',
                `${(selection.data.actualTurnout || 0).toLocaleString()} / ${(
                  selection.data.targetTurnout || 0
                ).toLocaleString()} (${selection.data.turnoutPercent || 0}%)`
              )}
              {renderField(
                'Evaluation Rating',
                `⭐ ${Number(selection.data.rating || 0).toFixed(1)} / 5.0`
              )}
              {renderField(
                'Photo Proofs',
                `${selection.data.documentationStatus?.photosCount || 0} photos`
              )}
            </div>
          )}

          {selection.type === 'org' && (
            <div className="grid grid-cols-2 gap-3">
              {renderField('Organization Name', selection.data.name)}
              {renderField('Acronym', selection.data.acronym || 'N/A')}
              {renderField('Category', selection.data.category)}
              {renderField('Academic Year', selection.data.academicYear)}
              {renderField('Club Adviser', selection.data.adviserName)}
              {renderField('Adviser Email', selection.data.adviserEmail || 'N/A')}
              {renderField('President', selection.data.presidentName)}
              {renderField('Standing', selection.data.accreditationStatus)}
              {renderField('Active Officers', `${selection.data.activeOfficersCount || 0} officers`)}
              {renderField('Registered Members', `${selection.data.activeMembers || 0} members`)}
              {renderField('Activity Proposals (AP)', `${selection.data.totalAPs || 0} submitted`)}
              {renderField(
                'Settled FL & PAR',
                `${selection.data.approvedFLs || 0} FL · ${selection.data.approvedPARs || 0} PAR`
              )}
            </div>
          )}

          {selection.type === 'officer' && (
            <div className="grid grid-cols-2 gap-3">
              {renderField('Student ID', selection.data.studentId)}
              {renderField('Full Name', selection.data.studentName)}
              {renderField('Position', selection.data.positionTitle)}
              {renderField('Status', selection.data.status)}
              {renderField('Organization', selection.data.organizationName)}
              {renderField('Acronym', selection.data.organizationAcronym)}
              {renderField('Club Adviser', selection.data.adviserName || 'SAS Office')}
              {renderField('Course & Year', selection.data.courseAndYear)}
              {renderField('Official Email', selection.data.email)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onExportSingle(selection)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#003B73] text-white hover:bg-[#002855] transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export Record (PDF / CSV)
          </button>
        </div>
      </div>
    </div>
  );
};
