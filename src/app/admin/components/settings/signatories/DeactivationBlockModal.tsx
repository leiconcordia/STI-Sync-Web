/**
 * src/app/admin/components/settings/signatories/DeactivationBlockModal.tsx
 *
 * Safety alert modal displayed when an administrator attempts to deactivate an institutional signatory
 * who is still assigned in default workflow pipelines or has pending in-flight documents.
 * Shows only the specific blocking reasons with no subsequent reassignment actions.
 */

import React from 'react';
import {
  Ban,
  GitBranch,
  FileText,
  ExternalLink,
  X,
  AlertCircle,
} from 'lucide-react';
import type { InstitutionalSignatory } from '../../../../modules/signatories/types/signatory.types';
import type {
  AssignedPipelineInfo,
  PendingDocumentInfo,
} from '../../../../modules/signatories/services/signatory-validation.service';

interface DeactivationBlockModalProps {
  signatory: InstitutionalSignatory;
  flowAssignments: AssignedPipelineInfo[];
  pendingDocuments: PendingDocumentInfo[];
  onClose: () => void;
  onNavigateToWorkflowSettings?: () => void;
}

export function DeactivationBlockModal({
  signatory,
  flowAssignments,
  pendingDocuments,
  onClose,
  onNavigateToWorkflowSettings,
}: DeactivationBlockModalProps) {
  const totalIssues = flowAssignments.length + pendingDocuments.length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-red-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Ban className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Cannot Deactivate Signatory</h3>
              <p className="text-xs text-red-100">
                This signatory cannot be deactivated due to active dependencies.
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
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Signatory Details Banner */}
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-red-950 uppercase tracking-wider block">
                Target Signatory
              </span>
              <p className="text-sm font-bold text-red-900 mt-0.5">{signatory.name}</p>
              <p className="text-xs text-red-700">
                {signatory.roleTitle} {signatory.department ? `• ${signatory.department}` : ''}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-red-200/80 text-red-900 rounded-lg text-xs font-bold whitespace-nowrap">
              {totalIssues} Active Dependenc{totalIssues === 1 ? 'y' : 'ies'}
            </span>
          </div>

          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Deactivation Blocked:</strong> Deactivating this signatory is restricted because their account has active roles in the approval system. Review the specific reasons below:
            </p>
          </div>

          {/* Section 1: Assigned Workflow Pipelines */}
          {flowAssignments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 text-indigo-600" />
                  Reason 1: Assigned to Default Approval Workflow ({flowAssignments.length})
                </span>
                {onNavigateToWorkflowSettings && (
                  <button
                    type="button"
                    onClick={onNavigateToWorkflowSettings}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Workflow Settings</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                This signatory is actively assigned as a designated approver/endorser in the default workflow. They must be removed or replaced from the workflow steps in Workflow Settings before deactivation.
              </p>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50/50 max-h-48 overflow-y-auto">
                {flowAssignments.map((f, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-gray-900">{f.pipelineLabel}</p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        {f.stageName} • Action: <span className="font-medium uppercase text-indigo-700">{f.actionType}</span>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold rounded">
                      {f.creatorGroup.toUpperCase()} ORIGIN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Pending In-Flight Documents */}
          {pendingDocuments.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-600" />
                Reason 2: Pending In-Flight Documents Awaiting Signature ({pendingDocuments.length})
              </span>
              <p className="text-[11px] text-gray-500">
                This signatory has documents currently in-flight awaiting their endorsement or approval. These pending documents must be completed or acted upon before this person can be deactivated.
              </p>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50/50 max-h-48 overflow-y-auto">
                {pendingDocuments.map((doc) => (
                  <div key={doc.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-900">{doc.code || doc.documentType.toUpperCase()}</span>
                        <span className="text-gray-400">•</span>
                        <p className="font-semibold text-gray-900 line-clamp-1">{doc.title}</p>
                      </div>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        Org: {doc.organizationName} • {doc.stepStageName}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                        doc.isCurrentTurn
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {doc.isCurrentTurn ? 'Current Turn' : 'Upcoming Stage'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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

