import React from 'react';
import { useOutletContext, useNavigate } from 'react-router';
import { CalendarDays, BarChart3 } from 'lucide-react';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { useCampusActivityData } from '../hooks/useCampusActivityData';
import CampusActivityOverview from '../components/CampusActivityOverview';

export default function SignatoryCalendarPage() {
  const { session } = useOutletContext<{ session: any }>();
  const navigate = useNavigate();
  const documents = useSignatoryDocuments(session);
  const campusData = useCampusActivityData(documents, session);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#001A4D]/5 px-3 py-1 text-xs font-bold text-[#001A4D]">
            <CalendarDays className="h-3.5 w-3.5" />
            Campus Schedule
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#001A4D] sm:text-3xl">
            Calendar of Activities
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View all approved and scheduled campus activities across student organizations and SAS.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/signatory/reports')}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-[#001A4D] shadow-2xs hover:bg-slate-50 cursor-pointer"
        >
          <BarChart3 className="h-4 w-4 text-[#0E4EBD]" />
          <span>Open Campus Reports</span>
        </button>
      </div>

      <CampusActivityOverview data={campusData} />
    </div>
  );
}

