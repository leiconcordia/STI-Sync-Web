import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FileSignature, GitBranch } from 'lucide-react';
import ApprovalWorkflowSettings from '../components/settings/ApprovalWorkflowSettings';
import InstitutionalSignatoryManagement from '../components/settings/InstitutionalSignatoryManagement';

type WorkflowSignatoryTab = 'workflows' | 'signatories';

export function WorkflowAndSignatories() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: WorkflowSignatoryTab =
    searchParams.get('tab') === 'signatories' ? 'signatories' : 'workflows';
  const [activeTab, setActiveTab] = useState<WorkflowSignatoryTab>(initialTab);

  useEffect(() => {
    const param = searchParams.get('tab');
    const resolved: WorkflowSignatoryTab =
      param === 'signatories' ? 'signatories' : 'workflows';
    if (resolved !== activeTab) {
      setActiveTab(resolved);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (nextTab: WorkflowSignatoryTab) => {
    setActiveTab(nextTab);
    setSearchParams({ tab: nextTab });
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#001A4D]">
              Workflows &amp; Institutional Signatories
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure default multi-stage approval routes and manage authorized institutional signatories across AP, FL, and PAR.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200">
          <button
            type="button"
            onClick={() => handleTabChange('workflows')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'workflows'
                ? 'bg-[#001A4D] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Default Approval Workflows</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('signatories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'signatories'
                ? 'bg-[#001A4D] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <FileSignature className="w-3.5 h-3.5" />
            <span>Institutional Signatories</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs">
        {activeTab === 'workflows' ? (
          <ApprovalWorkflowSettings />
        ) : (
          <InstitutionalSignatoryManagement />
        )}
      </div>
    </div>
  );
}
