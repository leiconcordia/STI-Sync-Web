/**
 * src/app/signatory/pages/SignatoryPARsPage.tsx
 *
 * Dedicated institutional review portal for Post-Activity Reports (Form PAR-01).
 * Features sub-tabs: Pending My Signature | Signed History & Archive | Returned for Revision.
 */

import React, { useState } from 'react';
import { useOutletContext } from 'react-router';
import {
  FileCheck2,
  Search,
  Clock,
  CheckCircle2,
  RotateCcw,
  Building,
  Calendar,
  Send,
  Eye,
  Users,
  Image,
  Award,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import PAREndorsementModal from '../components/PAREndorsementModal';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal: () => void;
}

export default function SignatoryPARsPage() {
  const { session, onOpenSignatureModal } = useOutletContext<ContextType>();
  const {
    pendingPARs,
    endorsedPARs,
    returnedPARs,
    loading,
  } = useSignatoryDocuments(session);

  const [activeTab, setActiveTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPAR, setSelectedPAR] = useState<PostActivityReportDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const currentList =
    activeTab === 'pending'
      ? pendingPARs
      : activeTab === 'endorsed'
      ? endorsedPARs
      : returnedPARs;

  const filteredList = currentList.filter((par) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = (par.activityTitle || '').toLowerCase();
    const org = (par.organizationName || '').toLowerCase();
    const id = (par.id || '').toLowerCase();
    return title.includes(q) || org.includes(q) || id.includes(q);
  });

  const handleDownloadPdf = async (e: React.MouseEvent, par: PostActivityReportDocument) => {
    e.stopPropagation();
    setDownloadingId(par.id);
    try {
      await exportPostActivityReportPDF(par);
      toast.success(`Official Post-Activity Report PDF downloaded for ${par.activityTitle}`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold mb-2">
          <FileCheck2 className="w-3.5 h-3.5 text-indigo-700" />
          <span>Post-Activity Clearance</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#001A4D] tracking-tight">
          Post-Activity Reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review execution outcomes, verified student attendance, photo evidence, and stamp completion clearance.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'pending'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending My Signature</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'pending' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {pendingPARs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('endorsed')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'endorsed'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Signed History & Archive</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'endorsed' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {endorsedPARs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('returned')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'returned'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Returned for Revision</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'returned' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {returnedPARs.length}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports by activity title or student club..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* PAR Cards List */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Post-Activity Reports in this category</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {activeTab === 'pending'
                ? 'All completed activity evaluation reports for your stage are cleared.'
                : 'No reports currently match this archive filter.'}
            </p>
          </div>
        ) : (
          filteredList.map((par) => {
            const photosCount = par.photos?.length || 0;
            const attendeeCount = par.attendeesCount || 0;

            return (
              <div
                key={par.id}
                onClick={() => setSelectedPAR(par)}
                className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-700 text-white">
                      Post-Activity Report
                    </span>
                    {((par as any).version > 1 || (par as any).revisionCount > 1 || (par as any).revisionHistory?.length > 0 || (par as any).previousSnapshot) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Revision v{(par as any).version || (par as any).revisionCount || 2}.0
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {par.organizationName || 'Student Club'}
                    </span>
                    <span className="text-xs text-slate-400">
                      • Stage {par.currentStageIndex ?? 1}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#001A4D] hover:text-[#0E4EBD] transition-colors">
                    {par.activityTitle}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {attendeeCount} Verified Attendees
                    </span>
                    {photosCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Image className="w-3.5 h-3.5 text-slate-400" />
                        {photosCount} Documentation Photos
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadPdf(e, par)}
                    disabled={downloadingId === par.id}
                    className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                    title="Download Official Post-Activity Report PDF"
                  >
                    <Download className="w-4 h-4 text-[#0E4EBD]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPAR(par)}
                    className="px-4 py-2 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  >
                    {activeTab === 'pending' ? (
                      <>
                        <Send className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>Review & Sign</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>View Report</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PAR Modal */}
      {selectedPAR && (
        <PAREndorsementModal
          isOpen={Boolean(selectedPAR)}
          report={selectedPAR}
          signatorySession={session}
          onClose={() => setSelectedPAR(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}
    </div>
  );
}
