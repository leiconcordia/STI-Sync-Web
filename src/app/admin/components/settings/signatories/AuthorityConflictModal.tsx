/**
 * src/app/admin/components/settings/signatories/AuthorityConflictModal.tsx
 *
 * Warning modal displayed when attempting to revoke signing authority ('cannot_sign')
 * on a document type where the signatory still has pending documents or pipeline assignments.
 * Shows only the specific blocking reasons with no subsequent reassignment actions.
 */

import React from 'react';
import {
  AlertTriangle,
  GitBranch,
  FileText,
  X,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import type {
  InstitutionalSignatory,
  WorkflowDocumentType,
} from '../../../../modules/signatories/types/signatory.types';
import type {
  AssignedPipelineInfo,
  PendingDocumentInfo,
} from '../../../../modules/signatories/services/signatory-validation.service';
import type { DocumentAuthorityLevel } from '../InstitutionalSignatoryManagement';

interface AuthorityConflictModalProps {
  signatory: InstitutionalSignatory;
  docType: WorkflowDocumentType;
  targetLevel: DocumentAuthorityLevel;
  templateAssignments: AssignedPipelineInfo[];
  pendingDocuments: PendingDocumentInfo[];
  onClose: () => void;
}

export function AuthorityConflictModal({
  signatory,
  docType,
  templateAssignments,
  pendingDocuments,
  onClose,
}: AuthorityConflictModalProps) {
  const docLabels: Record<WorkflowDocumentType, { name: string; code: string; color: string }> = {
    proposal: { name: 'Activity Proposals', code: 'AP-01', color: 'indigo' },
    liquidation: { name: 'Financial Liquidations', code: 'FL-01', color: 'amber' },
    par: { name: 'Post-Activity Reports', code: 'PAR-01', color: 'purple' },
  };

  const docInfo = docLabels[docType] || { name: docType, code: docType.toUpperCase(), color: 'blue' };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-amber-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Cannot Revoke Signing Authority</h3>
              <p className="text-xs text-amber-100">
                Active dependencies found for {docInfo.name}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Authority Modification Blocked:</strong> Signing authority for <strong>{docInfo.name}</strong> cannot be set to <em>Cannot Sign</em> because <strong>{signatory.name}</strong> has active roles. Review the blocking reasons below:
            </div>
          </div>

          {/* Pending Documents */}
          {pendingDocuments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-600" />
                Reason 1: Pending Documents Awaiting Signature ({pendingDocuments.length})
              </span>
              <p className="text-[11px] text-gray-500">
                This signatory has documents awaiting their signature. These documents must be signed or processed before their signing authority can be revoked.
              </p>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50 max-h-40 overflow-y-auto">
                {pendingDocuments.map((doc) => (
                  <div key={doc.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-gray-900">{doc.code} — {doc.title}</p>
                      <p className="text-[11px] text-gray-500">{doc.stepStageName} • Org: {doc.organizationName}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      {doc.isCurrentTurn ? 'Current Turn' : 'Upcoming'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Template Assignments */}
          {templateAssignments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                Reason 2: Assigned in Default Workflow Pipelines ({templateAssignments.length})
              </span>
              <p className="text-[11px] text-gray-500">
                This signatory is currently configured in the default workflow steps for {docInfo.name}. Remove or replace their assignment in Workflow Settings first before changing their authority.
              </p>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50 max-h-36 overflow-y-auto">
                {templateAssignments.map((t, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-gray-900">{t.pipelineLabel}</p>
                      <p className="text-[11px] text-gray-500">{t.stageName}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                      {t.actionType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            I Understand & Close
          </button>
        </div>
      </div>
    </div>
  );
}

