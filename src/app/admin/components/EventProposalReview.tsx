import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Download, Clock, CheckCircle, XCircle, RotateCcw,
  Info, Calendar, Users, Shield, Receipt, FileText, History,
  ChevronDown, ChevronUp, Eye, Mail, MessageSquare, Send,
  Gavel, Check, X, AlertTriangle, AlertCircle, Rocket,
  FileImage, Plus, Minus
} from 'lucide-react';

interface EventProposalReviewProps {
  event: any;
  onClose: () => void;
}

type Decision = 'none' | 'approved' | 'returned' | 'rejected';
type ActiveModal = 'none' | 'approve' | 'return' | 'reject';

const MOCK_BUDGET_ITEMS = [
  { id: 1, category: 'Venue', description: 'STI Auditorium rental (full day)', qty: 1, unitCost: 25000, fundingSource: 'SAO Budget' },
  { id: 2, category: 'Food & Beverage', description: 'Catering service – 200 pax snacks', qty: 200, unitCost: 150, fundingSource: 'Org Funds' },
  { id: 3, category: 'Equipment', description: 'Sound system rental', qty: 1, unitCost: 8000, fundingSource: 'SAO Budget' },
  { id: 4, category: 'Materials', description: 'Event kits and printed materials', qty: 200, unitCost: 50, fundingSource: 'Sponsorship' },
  { id: 5, category: 'Honorarium', description: 'Resource speaker fee', qty: 2, unitCost: 5000, fundingSource: 'SAO Budget' },
];

const NAV_SECTIONS = [
  { id: 'overview', icon: Info, label: 'Event Overview', status: 'complete' },
  { id: 'schedule', icon: Calendar, label: 'Schedule & Venue', status: 'complete' },
  { id: 'participants', icon: Users, label: 'Participants & Audience', status: 'complete' },
  { id: 'team', icon: Shield, label: 'Event Team & Scanners', status: 'warning' },
  { id: 'budget', icon: Receipt, label: 'Budget Request', status: 'complete' },
  { id: 'documents', icon: FileText, label: 'Submitted Documents', status: 'warning' },
  { id: 'history', icon: History, label: 'Submission History', status: 'complete' },
];

const RETURN_FLAGS = [
  'Event Information (title, description, objectives)',
  'Schedule or Venue',
  'Participant Settings',
  'Event Team Assignment',
  'Budget Request',
  'Submitted Documents',
  'Other',
];

const REJECTION_REASONS = [
  'Fraudulent or Misleading Information',
  'Insufficient Documentation',
  'Budget Exceeds Approved Limit',
  'Scheduling or Venue Conflict',
  'Policy Violation',
  'Event Not Aligned with Institutional Goals',
  'Duplicate Event',
  'Other',
];

function SectionHeader({ title, status, subtitle }: { title: string; status: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-[#83358E] rounded-full" />
          <h2 className="text-[#001A4D] font-bold text-lg">{title}</h2>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          status === 'complete' ? 'bg-green-100 text-green-700' :
          status === 'warning' ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {status === 'complete' ? 'Complete' : status === 'warning' ? 'Incomplete' : 'Missing Required Data'}
        </span>
      </div>
      <p className="text-gray-500 text-sm ml-4">{subtitle}</p>
      <div className="mt-3 border-b border-[#E0E0E0]" />
    </div>
  );
}

export default function EventProposalReview({ event, onClose }: EventProposalReviewProps) {
  const [activeSection, setActiveSection] = useState('overview');
  const [visitedSections, setVisitedSections] = useState<Set<string>>(new Set(['overview']));
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<Decision>('none');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [remarksError, setRemarksError] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);

  // Return modal state
  const [returnFlags, setReturnFlags] = useState<string[]>([]);
  const [returnDeadline, setReturnDeadline] = useState('');

  // Reject modal state
  const [rejectionReason, setRejectionReason] = useState('');
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [resubmitDays, setResubmitDays] = useState(7);

  // Budget adjustment
  const [approvedAmounts, setApprovedAmounts] = useState<Record<number, number>>(
    Object.fromEntries(MOCK_BUDGET_ITEMS.map(i => [i.id, i.qty * i.unitCost]))
  );

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const centerRef = useRef<HTMLDivElement>(null);

  const budgetItems = MOCK_BUDGET_ITEMS;
  const totalRequested = budgetItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const totalApproved = Object.values(approvedAmounts).reduce((a, b) => a + b, 0);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setVisitedSections(prev => new Set([...prev, id]));
    const el = sectionRefs.current[id];
    if (el && centerRef.current) {
      centerRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    }
  };

  const allVisited = NAV_SECTIONS.every(s => visitedSections.has(s.id));
  const remarksWritten = remarks.trim().length > 0;

  const handleDecision = (type: 'approve' | 'return' | 'reject') => {
    if (type !== 'approve' && !remarksWritten) {
      setRemarksError(true);
      return;
    }
    setRemarksError(false);
    setActiveModal(type);
  };

  const confirmDecision = (type: Decision) => {
    setDecision(type);
    setActiveModal('none');
    setUndoVisible(true);
    setTimeout(() => setUndoVisible(false), 300000); // 5 min
  };

  const propRef = event?.name ? `PROP-2026-00${event.id?.toString().padStart(2, '0') || '42'}` : 'PROP-2026-0042';

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">

      {/* PAGE HEADER */}
      <div className="flex-shrink-0 h-16 bg-white border-b border-[#E0E0E0] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose}
            className="flex items-center gap-2 text-[#001A4D] hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Event Approvals
          </button>
          <div className="h-5 w-px bg-[#E0E0E0]" />
          <span className="text-xs text-gray-400">Dashboard &gt; Event Approvals &gt; <span className="text-gray-600">{event?.name?.slice(0, 40) || 'Review'}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1.5 bg-[#FFD41C] text-[#001A4D] font-mono font-bold text-xs rounded-full">{propRef}</span>
          {decision === 'none' ? (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 text-white font-bold text-sm rounded-full">
              <Clock className="w-4 h-4" /> Pending Review
            </span>
          ) : decision === 'approved' ? (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-sm rounded-full">
              <CheckCircle className="w-4 h-4" /> Approved
            </span>
          ) : decision === 'returned' ? (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-[#1E70E8] text-white font-bold text-sm rounded-full">
              <RotateCcw className="w-4 h-4" /> Returned
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-600 text-white font-bold text-sm rounded-full">
              <XCircle className="w-4 h-4" /> Rejected
            </span>
          )}
          <button className="flex items-center gap-2 px-3 py-2 border border-[#001A4D] text-[#001A4D] rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* THREE-COLUMN BODY */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT COLUMN — Navigator (380px) */}
        <div className="w-[320px] flex-shrink-0 border-r border-[#E0E0E0] flex flex-col overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Nav list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#001A4D] font-bold text-sm">Proposal Sections</span>
              </div>
              <div className="space-y-1">
                {NAV_SECTIONS.map(s => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  const isVisited = visitedSections.has(s.id);
                  return (
                    <button key={s.id} onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative ${isActive ? 'bg-[#F3E8FF] text-[#83358E] font-bold' : 'text-[#001A4D] hover:bg-gray-50'}`}>
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#83358E] rounded-l-lg" />}
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#83358E]' : 'text-gray-400'}`} />
                      <span className="flex-1 text-left">{s.label}</span>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        s.status === 'complete' && isVisited ? 'bg-green-500' :
                        s.status === 'warning' && isVisited ? 'bg-amber-400' :
                        !isVisited ? 'bg-gray-200' : 'bg-red-400'
                      }`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Review Progress */}
            <div className="bg-[#F3E8FF] border border-[#83358E]/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-[#83358E]" />
                <span className="text-[#83358E] font-bold text-sm">Review Progress</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Viewed all sections', done: allVisited },
                  { label: 'Remarks written', done: remarksWritten },
                  { label: 'Decision made', done: decision !== 'none' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-[#83358E] border-[#83358E]' : 'border-gray-300'}`}>
                      {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className={`text-xs ${item.done ? 'text-[#83358E] font-medium' : 'text-gray-500'}`}>{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 text-xs italic mt-3">Review checklist helps ensure thorough evaluation.</p>
            </div>

            {/* Officer Contact */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
              <p className="text-[#001A4D] font-bold text-sm mb-3">Submitting Officer</p>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-bold text-sm">JD</div>
                <div>
                  <p className="font-bold text-[#001A4D] text-sm">Juan Dela Cruz</p>
                  <p className="text-gray-400 text-xs">2021-00123 • STI IT Guild</p>
                  <span className="px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full">President</span>
                </div>
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Mail className="w-3.5 h-3.5" /> jdelacruz@sti.edu.ph
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MessageSquare className="w-3.5 h-3.5" /> +63 912 345 6789
                </div>
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-2 border border-[#1E70E8] text-[#1E70E8] rounded-lg text-sm hover:bg-blue-50 transition-colors">
                <Send className="w-4 h-4" /> Send Message
              </button>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN — Proposal Content */}
        <div ref={centerRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-10 max-w-3xl">

            {/* SECTION 1 — EVENT OVERVIEW */}
            <div ref={el => { sectionRefs.current['overview'] = el; }}
              onMouseEnter={() => { setActiveSection('overview'); setVisitedSections(p => new Set([...p, 'overview'])); }}>
              <SectionHeader title="Event Overview" status="complete" subtitle="Event identity, classification, and media assets submitted by the officer" />

              {/* Banner */}
              <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden mb-4">
                <div className="h-44 bg-gradient-to-br from-[#7F77DD] to-[#83358E] flex items-center justify-center">
                  <div className="text-center">
                    <FileImage className="w-12 h-12 text-white/40 mx-auto mb-2" />
                    <p className="text-white/50 text-sm">No banner uploaded</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Event Title</p>
                        <p className="text-[#001A4D] font-bold text-xl">{event?.name || 'Annual Leadership Summit 2026'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Description</p>
                        <p className="text-[#001A4D] text-sm leading-relaxed">
                          The Annual Leadership Summit brings together student organization leaders for a full-day development program. Sessions cover governance, event management, financial accountability, and inter-org collaboration. Resource speakers include alumni leaders and faculty advisers.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: 'Event Type', value: event?.type || 'Conference', pill: true, color: '#83358E' },
                        { label: 'Category', value: 'Seminar', pill: true, color: '#9E9E9E' },
                        { label: 'Organization', value: event?.org || 'JPIA', pill: false },
                        { label: 'Visibility', value: 'Public', pill: true, color: '#22C55E' },
                        { label: 'QR Attendance', value: 'Required', pill: true, color: '#1E70E8' },
                        { label: 'Certificate', value: 'Enabled', pill: true, color: '#22C55E' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-[#F0F0F0] last:border-0">
                          <span className="text-gray-400 text-xs">{row.label}</span>
                          {row.pill ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: row.color + '20', color: row.color }}>{row.value}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 bg-[#7F77DD] rounded-full flex items-center justify-center text-white text-xs font-bold">{(row.value as string)[0]}</div>
                              <span className="text-[#83358E] font-bold text-sm">{row.value}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Objectives */}
              <div className="bg-[#F3E8FF] border-l-4 border-[#83358E] rounded-xl p-4">
                <p className="text-[#83358E] font-bold text-sm mb-3">Event Objectives</p>
                <div className="space-y-2">
                  {['Develop leadership competencies among student officers', 'Foster inter-organizational networking and collaboration', 'Enhance organizational governance and accountability practices'].map((obj, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-[#83358E] text-white rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                      <p className="text-[#001A4D] text-sm">{obj}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION 2 — SCHEDULE & VENUE */}
            <div ref={el => { sectionRefs.current['schedule'] = el; }}
              onMouseEnter={() => { setActiveSection('schedule'); setVisitedSections(p => new Set([...p, 'schedule'])); }}>
              <SectionHeader title="Schedule & Venue" status="complete" subtitle="Academic context, session schedule, and venue logistics" />

              <div className="space-y-4">
                {/* Academic context */}
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                  <div className="grid grid-cols-3 divide-x divide-[#E0E0E0]">
                    {[
                      { label: 'School Year', value: 'SY 2025-2026' },
                      { label: 'Semester', value: '1st Semester' },
                      { label: 'Submitted', value: event?.submittedDate || 'May 28, 2026' },
                    ].map(c => (
                      <div key={c.label} className="px-5 first:pl-0 last:pr-0 text-center">
                        <p className="text-xs uppercase text-gray-400 font-semibold mb-1">{c.label}</p>
                        <p className="text-[#001A4D] font-bold text-base">{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sessions */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[#001A4D] font-bold text-sm">Event Sessions</p>
                    <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded-full font-medium">2 Sessions</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { n: 1, title: 'Morning Session — Plenary', date: 'June 15, 2026', time: '8:00 AM – 12:00 PM', duration: '4 hours' },
                      { n: 2, title: 'Afternoon Session — Workshops', date: 'June 15, 2026', time: '1:00 PM – 5:00 PM', duration: '4 hours' },
                    ].map(s => (
                      <div key={s.n} className="border-l-[3px] border-[#83358E] bg-white border border-[#E0E0E0] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[#83358E] font-bold text-xs">Session {s.n}</span>
                          <span className="text-[#001A4D] font-bold text-sm">{s.title}</span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-gray-400" />{s.date}</div>
                          <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-gray-400" />{s.time}</div>
                          <div className="flex items-center gap-1.5"><span className="text-gray-400 text-xs">Duration:</span><span className="font-medium">{s.duration}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Venue */}
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs uppercase text-gray-400 font-semibold mb-2">Requested Venue</p>
                      <p className="text-[#001A4D] font-bold text-base">{event?.venue || 'STI Auditorium'}</p>
                      <p className="text-gray-500 text-xs mt-0.5">Main Building • Ground Floor</p>
                      <p className="text-gray-400 text-xs mt-0.5">Capacity: 500 pax</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-green-600 text-xs font-medium">No Conflicts Detected</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-400 font-semibold mb-2">Event Format</p>
                      <span className="px-3 py-1 bg-[#83358E]/10 text-[#83358E] rounded-full text-sm font-medium">In-Person</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3 — PARTICIPANTS */}
            <div ref={el => { sectionRefs.current['participants'] = el; }}
              onMouseEnter={() => { setActiveSection('participants'); setVisitedSections(p => new Set([...p, 'participants'])); }}>
              <SectionHeader title="Participants & Audience" status="complete" subtitle="Target audience, reach estimate, and attendance configuration" />

              <div className="space-y-4">
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                  <div className="grid grid-cols-3 divide-x divide-[#E0E0E0]">
                    {[
                      { label: 'Max Participants', value: '200' },
                      { label: 'Minimum Required', value: '50' },
                      { label: 'Expected Attendance', value: '200' },
                    ].map(c => (
                      <div key={c.label} className="px-5 first:pl-0 last:pr-0 text-center">
                        <p className="text-xs uppercase text-gray-400 font-semibold mb-1">{c.label}</p>
                        <p className="text-[#001A4D] font-bold text-2xl">{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-4">
                  <div>
                    <p className="text-xs uppercase text-gray-400 font-semibold mb-2">Target Departments</p>
                    <div className="flex flex-wrap gap-2">
                      {['CCS', 'CBA', 'CTE'].map(d => (
                        <span key={d} className="px-3 py-1 bg-[#83358E] text-white text-xs rounded-full font-medium">{d}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400 font-semibold mb-2">Target Year Levels</p>
                    <div className="flex flex-wrap gap-2">
                      {['1st Year', '2nd Year', '3rd Year', '4th Year'].map(y => (
                        <span key={y} className="px-3 py-1 bg-[#001A4D] text-[#FFD41C] text-xs rounded-full font-medium">{y}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-[#F3E8FF] border border-[#83358E]/20 rounded-xl p-4">
                  <p className="text-[#83358E] font-bold text-sm mb-3">Estimated Reach</p>
                  <div className="space-y-2">
                    {[{ dept: 'CCS', count: 145, total: 387 }, { dept: 'CBA', count: 98, total: 387 }, { dept: 'CTE', count: 67, total: 387 }, { dept: 'CAS', count: 77, total: 387 }].map(d => (
                      <div key={d.dept}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#001A4D]">{d.dept}</span>
                          <span className="font-bold text-[#001A4D]">{d.count}</span>
                        </div>
                        <div className="h-1.5 bg-[#83358E]/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#83358E]" style={{ width: `${(d.count / d.total) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#83358E]/10 flex justify-between">
                    <span className="text-sm text-gray-500">Total Estimated Reach</span>
                    <span className="font-bold text-[#83358E] text-lg">387</span>
                  </div>
                </div>

                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                  <p className="text-[#001A4D] font-bold text-sm mb-3">Attendance Rules</p>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {[
                      { label: 'Late Threshold', value: '15', unit: 'minutes', color: 'text-amber-600' },
                      { label: 'Grace Period', value: '5', unit: 'minutes', color: 'text-[#1E70E8]' },
                      { label: 'Min. Attendance', value: '80', unit: '%', color: 'text-[#001A4D]' },
                    ].map(r => (
                      <div key={r.label} className="text-center">
                        <p className="text-xs text-gray-400 mb-1">{r.label}</p>
                        <span className={`font-bold text-xl ${r.color}`}>{r.value}</span>
                        <span className="text-gray-400 text-xs ml-1">{r.unit}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /><span className="text-gray-700">Scan-In Required</span></div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /><span className="text-gray-700">Scan-Out Required</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4 — TEAM & SCANNERS */}
            <div ref={el => { sectionRefs.current['team'] = el; }}
              onMouseEnter={() => { setActiveSection('team'); setVisitedSections(p => new Set([...p, 'team'])); }}>
              <SectionHeader title="Event Team & Scanners" status="warning" subtitle="Proposed core team members and scanner officer assignments" />

              <div className="space-y-4">
                {/* Warning: no event head */}
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm font-medium">Event Head is required — proposal cannot be approved without an Event Head.</p>
                </div>

                <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#E0E0E0]">
                    <p className="text-[#001A4D] font-bold text-sm">Proposed Core Team</p>
                  </div>
                  <div className="divide-y divide-[#F0F0F0]">
                    {[
                      { role: 'Event Head', name: null, id: null },
                      { role: 'Co-Head', name: 'Maria Santos', id: '2022-00345' },
                      { role: 'Secretary', name: 'Ana Reyes', id: '2022-00456' },
                      { role: 'Treasurer', name: 'Carlo Mendoza', id: '2023-00789' },
                      { role: 'Logistics Officer', name: 'Lea Torres', id: '2023-00901' },
                    ].map(m => (
                      <div key={m.role} className="flex items-center gap-4 px-5 py-3">
                        <span className="text-[#83358E] font-bold text-xs w-40 flex-shrink-0">{m.role}</span>
                        {m.name ? (
                          <>
                            <div className="w-8 h-8 bg-[#7F77DD] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {m.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="flex-1">
                              <p className="text-[#001A4D] font-bold text-sm">{m.name}</p>
                              <p className="text-gray-400 text-xs">{m.id}</p>
                            </div>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Assigned</span>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                <Users className="w-4 h-4 text-gray-300" />
                              </div>
                              <span className="text-gray-400 text-sm italic">Not assigned</span>
                            </div>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">Not Assigned</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scanner */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[#001A4D] font-bold text-sm">Proposed Scanner Officers</p>
                    <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded-full">1 Scanner</span>
                  </div>
                  <div className="border-l-[3px] border-[#83358E] bg-white border border-[#E0E0E0] rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded-full">Primary</span>
                      <span className="text-[#001A4D] font-bold text-sm">Carlo Mendoza</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-bold">CM</div>
                      <div>
                        <p className="text-[#001A4D] font-bold text-sm">Carlo Mendoza</p>
                        <p className="text-gray-400 text-xs">2023-00789 • BSIT 2nd Year</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-[#F0F0F0]">
                      {[
                        { label: 'Scan In', enabled: true },
                        { label: 'Scan Out', enabled: true },
                        { label: 'View Logs', enabled: true },
                        { label: 'Export Data', enabled: false },
                      ].map(p => (
                        <span key={p.label} className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 5 — BUDGET */}
            <div ref={el => { sectionRefs.current['budget'] = el; }}
              onMouseEnter={() => { setActiveSection('budget'); setVisitedSections(p => new Set([...p, 'budget'])); }}>
              <SectionHeader title="Budget Request" status="complete" subtitle="Itemized budget breakdown and funding source allocation" />

              <div className="space-y-4">
                {/* Ceiling reference */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-700 font-bold text-sm">Budget Reference</span>
                  </div>
                  <p className="text-[#001A4D] text-sm mb-3">This organization's SAO-approved semester budget ceiling is <strong>₱100,000</strong>.</p>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">₱{totalRequested.toLocaleString()} requested vs ₱100,000 ceiling</span>
                    <span className="text-green-600 font-medium">Within limit</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#83358E] rounded-full" style={{ width: `${Math.min((totalRequested / 100000) * 100, 100)}%` }} />
                  </div>
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Requested', value: `₱${totalRequested.toLocaleString()}`, color: 'text-[#83358E]' },
                    { label: 'SAO Budget', value: '₱38,000', color: 'text-[#1E70E8]' },
                    { label: 'Org Funds', value: '₱35,000', color: 'text-green-600' },
                    { label: 'Sponsorship', value: '₱10,000', color: 'text-amber-600' },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-[#E0E0E0] rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                      <p className={`font-bold text-base ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Budget table */}
                <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#E0E0E0]">
                    <p className="text-[#001A4D] font-bold text-sm">Itemized Budget Breakdown</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-[#E0E0E0]">
                      <tr>
                        {['#', 'Category', 'Description', 'Qty', 'Unit Cost', 'Total', 'Source'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {budgetItems.map((item, i) => (
                        <tr key={item.id} className="hover:bg-[#F3E8FF]/30 transition-colors">
                          <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 bg-[#83358E]/10 text-[#83358E] text-xs rounded-full">{item.category}</span>
                          </td>
                          <td className="px-3 py-3 text-[#001A4D]">{item.description}</td>
                          <td className="px-3 py-3 text-center text-[#001A4D]">{item.qty}</td>
                          <td className="px-3 py-3 text-right text-[#001A4D]">₱{item.unitCost.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-bold text-[#001A4D]">₱{(item.qty * item.unitCost).toLocaleString()}</td>
                          <td className="px-3 py-3 text-gray-400 text-xs">{item.fundingSource}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#001A4D]">
                        <td colSpan={5} className="px-3 py-3 text-white font-bold">Total Requested</td>
                        <td className="px-3 py-3 text-right text-[#FFD41C] font-bold">₱{totalRequested.toLocaleString()}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Admin budget adjustment */}
                <div className="bg-[#F3E8FF] border-2 border-[#83358E] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#83358E] font-bold text-sm">Budget Review (SAO Adviser)</span>
                  </div>
                  <p className="text-gray-500 text-xs italic mb-4">You may adjust individual line item approval amounts. Officers will see your adjustments.</p>
                  <div className="space-y-2 mb-4">
                    {budgetItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg p-3">
                        <span className="text-[#001A4D] text-sm flex-1 truncate">{item.description}</span>
                        <span className="text-gray-400 text-xs">Req: ₱{(item.qty * item.unitCost).toLocaleString()}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">Approved: ₱</span>
                          <input
                            type="number"
                            value={approvedAmounts[item.id] || 0}
                            onChange={e => setApprovedAmounts({ ...approvedAmounts, [item.id]: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border border-[#83358E]/40 rounded text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent text-right"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#83358E]/20">
                    <span className="text-sm text-gray-600">Total Approved Amount</span>
                    <span className="text-[#83358E] font-bold text-lg">₱{totalApproved.toLocaleString()}</span>
                  </div>
                  {totalApproved !== totalRequested && (
                    <button onClick={() => setApprovedAmounts(Object.fromEntries(budgetItems.map(i => [i.id, i.qty * i.unitCost])))}
                      className="text-gray-400 text-xs hover:text-[#83358E] underline mt-2 float-right">
                      Reset All to Requested Amounts
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 6 — DOCUMENTS */}
            <div ref={el => { sectionRefs.current['documents'] = el; }}
              onMouseEnter={() => { setActiveSection('documents'); setVisitedSections(p => new Set([...p, 'documents'])); }}>
              <SectionHeader title="Submitted Documents" status="warning" subtitle="Official documents and supporting files submitted with the proposal" />

              {/* Missing warning */}
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 font-bold text-sm mb-1">Missing Required Documents</p>
                  <p className="text-red-600 text-sm">• Campus Permit / Facilities Authorization</p>
                  <p className="text-red-500 text-xs mt-2 italic">Approval cannot proceed without all required documents. Return this proposal for correction.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: 'Event Proposal Document', type: 'Required', label: 'PDF', uploaded: true, size: '2.4 MB', date: 'May 28, 2026' },
                  { name: 'Approved Budget Authorization', type: 'Required', label: 'PDF', uploaded: true, size: '1.1 MB', date: 'May 28, 2026' },
                  { name: 'Campus Permit / Facilities Authorization', type: 'Required', label: 'PDF', uploaded: false, size: null, date: null },
                  { name: 'Program of Activities', type: 'Optional', label: 'DOCX', uploaded: true, size: '0.8 MB', date: 'May 28, 2026' },
                  { name: 'Risk Assessment Form', type: 'Optional', label: 'PDF', uploaded: false, size: null, date: null },
                ].map(doc => (
                  <div key={doc.name} className="bg-white border border-[#E0E0E0] rounded-xl p-4 relative">
                    <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium ${
                      doc.type === 'Required' && doc.uploaded ? 'bg-green-100 text-green-700' :
                      doc.type === 'Required' && !doc.uploaded ? 'bg-red-100 text-red-700' :
                      doc.uploaded ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {doc.type === 'Required' && doc.uploaded ? 'Required ✓' :
                       doc.type === 'Required' ? 'Required — Missing' :
                       doc.uploaded ? 'Uploaded' : 'Optional'}
                    </div>
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${doc.uploaded ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <FileText className={`w-6 h-6 ${doc.uploaded ? 'text-red-500' : 'text-gray-300'}`} />
                      </div>
                      <div className="flex-1 min-w-0 pr-16">
                        <p className="text-[#001A4D] font-bold text-sm leading-tight">{doc.name}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{doc.type} document</p>
                        {doc.uploaded && <p className="text-gray-300 text-xs">{doc.size} • {doc.date}</p>}
                      </div>
                    </div>
                    {doc.uploaded && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#F0F0F0]">
                        <button className="text-[#1E70E8] text-xs flex items-center gap-1 hover:underline"><Eye className="w-3 h-3" />Preview</button>
                        <button className="text-[#001A4D] text-xs flex items-center gap-1 hover:underline"><Download className="w-3 h-3" />Download</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 7 — HISTORY */}
            <div ref={el => { sectionRefs.current['history'] = el; }}
              onMouseEnter={() => { setActiveSection('history'); setVisitedSections(p => new Set([...p, 'history'])); }}>
              <SectionHeader title="Submission History" status="complete" subtitle="Complete proposal lifecycle and audit trail" />

              <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                <div className="relative">
                  <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-[#E0E0E0]" />
                  <div className="space-y-6">
                    {[
                      { color: 'bg-gray-400', label: 'Draft Created', actor: 'Juan Dela Cruz', time: 'May 25, 2026 · 10:23 AM', note: null },
                      { color: 'bg-[#1E70E8]', label: 'Submitted for Review', actor: 'Juan Dela Cruz', time: 'May 28, 2026 · 2:30 PM', note: null },
                      { color: 'bg-[#FFD41C]', label: 'Currently Under Review', actor: 'SAO Adviser', time: 'Now', note: 'Awaiting adviser decision', pulse: true },
                    ].map((ev, i) => (
                      <div key={i} className="flex gap-4 relative">
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 ${ev.color} ${ev.pulse ? 'ring-4 ring-[#FFD41C]/30' : ''}`}>
                          {i === 0 ? <span className="w-2 h-2 bg-white rounded-full" /> :
                           i === 1 ? <Send className="w-3 h-3 text-white" /> :
                           <Eye className="w-3 h-3 text-[#001A4D]" />}
                        </div>
                        <div>
                          <p className="text-[#001A4D] font-bold text-sm">{ev.label}</p>
                          <p className="text-gray-400 text-xs mt-0.5">by {ev.actor} · {ev.time}</p>
                          {ev.note && <p className="text-gray-400 text-xs italic mt-1">{ev.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN — Decision Panel (300px) */}
        <div className="w-[300px] flex-shrink-0 border-l border-[#E0E0E0] flex flex-col overflow-y-auto">
          <div className="p-5 space-y-4">
            {decision === 'none' ? (
              <>
                {/* Panel header */}
                <div className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-[#001A4D]" />
                  <div>
                    <p className="text-[#001A4D] font-bold text-base">Adviser Decision</p>
                    <p className="text-gray-400 text-xs">Review all sections before deciding.</p>
                  </div>
                </div>

                {/* Remarks */}
                <div className={`bg-white border rounded-xl p-4 ${remarksError ? 'border-red-400' : 'border-[#E0E0E0]'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 bg-[#83358E] rounded-full" />
                    <p className="text-[#001A4D] font-bold text-sm">Adviser Remarks</p>
                  </div>
                  <textarea
                    value={remarks}
                    onChange={e => { setRemarks(e.target.value); if (e.target.value) setRemarksError(false); }}
                    rows={6}
                    placeholder="Write your remarks, feedback, or instructions for the officer here. These will be sent directly to the submitting officer with your decision."
                    className="w-full text-sm resize-none border border-[#E0E0E0] rounded-lg p-3 focus:ring-2 focus:ring-[#83358E] focus:border-transparent outline-none leading-relaxed text-[#001A4D]"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3 h-3 text-[#83358E]" />
                      <span className="text-[#83358E] text-xs italic">Visible to submitting officer</span>
                    </div>
                    <span className="text-gray-400 text-xs">{remarks.length} / 1000</span>
                  </div>
                  {remarksError && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />Remarks required when returning or rejecting.
                    </p>
                  )}
                </div>

                {/* Decision buttons */}
                <div className="space-y-3">
                  {/* APPROVE */}
                  <div>
                    <button onClick={() => handleDecision('approve')}
                      className="w-full h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white font-bold text-base rounded-xl hover:from-[#16A34A] hover:to-[#22C55E] transition-all shadow-sm">
                      <CheckCircle className="w-5 h-5" />
                      Approve Proposal
                    </button>
                    <p className="text-gray-400 text-xs italic text-center mt-1.5">Officer notified immediately. Event published.</p>
                  </div>

                  {/* RETURN */}
                  <div>
                    <button onClick={() => handleDecision('return')}
                      className="w-full h-14 flex items-center justify-center gap-2 bg-[#FFC107] text-[#001A4D] font-bold text-base rounded-xl hover:bg-[#F59E0B] transition-colors shadow-sm">
                      <RotateCcw className="w-5 h-5" />
                      Return for Revision
                    </button>
                    <p className="text-gray-400 text-xs italic text-center mt-1.5">Officer receives remarks and can revise.</p>
                  </div>

                  {/* REJECT */}
                  <div>
                    <button onClick={() => handleDecision('reject')}
                      className="w-full h-[52px] flex items-center justify-center gap-2 bg-white border-[1.5px] border-[#EF4444] text-[#EF4444] font-bold text-sm rounded-xl hover:bg-red-50 transition-colors">
                      <X className="w-4 h-4" />
                      Reject Proposal
                    </button>
                    <p className="text-gray-400 text-xs italic text-center mt-1.5">Closes this proposal permanently.</p>
                  </div>
                </div>
              </>
            ) : (
              /* DECISION MADE STATE */
              <>
                <div className={`rounded-xl p-5 text-center ${
                  decision === 'approved' ? 'bg-gradient-to-br from-[#22C55E] to-[#16A34A]' :
                  decision === 'returned' ? 'bg-gradient-to-br from-[#FFC107] to-[#F59E0B]' :
                  'bg-gradient-to-br from-[#EF4444] to-[#F97316]'
                }`}>
                  {decision === 'approved' ? <CheckCircle className="w-10 h-10 text-white mx-auto mb-2" /> :
                   decision === 'returned' ? <RotateCcw className="w-10 h-10 text-[#001A4D] mx-auto mb-2" /> :
                   <XCircle className="w-10 h-10 text-white mx-auto mb-2" />}
                  <p className={`font-bold text-lg ${decision === 'returned' ? 'text-[#001A4D]' : 'text-white'}`}>
                    {decision === 'approved' ? 'Proposal Approved' : decision === 'returned' ? 'Returned for Revision' : 'Proposal Rejected'}
                  </p>
                  <p className={`text-sm mt-1 ${decision === 'returned' ? 'text-[#001A4D]/70' : 'text-white/80'}`}>
                    {new Date().toLocaleString()}
                  </p>
                </div>

                {undoVisible && (
                  <button onClick={() => { setDecision('none'); setUndoVisible(false); }}
                    className="w-full text-center text-gray-400 text-sm hover:text-[#83358E] flex items-center justify-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Undo Decision (5 min window)
                  </button>
                )}

                <button className="w-full flex items-center justify-center gap-2 py-3 border border-[#1E70E8] text-[#1E70E8] rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors">
                  View Next Pending Proposal
                </button>

                <button onClick={onClose} className="w-full text-center text-[#001A4D] text-sm hover:underline">
                  Back to Event Approvals
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== CONFIRMATION MODALS ===== */}

      {/* APPROVE MODAL */}
      {activeModal === 'approve' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] px-6 py-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Confirm Approval</h3>
                <p className="text-[#FFD41C] text-sm">{event?.name}</p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-5">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-[#001A4D] font-bold text-sm">You are about to approve this event proposal. The following will happen immediately:</p>
              </div>
              <div className="space-y-2 mb-5">
                {[
                  'Event status set to "Approved"',
                  'Event published to the student discovery feed',
                  'Submitting officer notified via in-app + push notification',
                  'All assigned event team members notified of their roles',
                  'Scanner activation codes generated for assigned scanners',
                  `Budget authorization recorded: ₱${totalApproved.toLocaleString()}`,
                  'Event added to SAO master calendar',
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm text-[#001A4D]">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="p-4 bg-white border border-[#E0E0E0] rounded-xl mb-5">
                <p className="text-[#001A4D] font-bold text-sm mb-2">Budget to be Authorized</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Authorized</span>
                  <span className="font-bold text-[#FFD41C] text-base">₱{totalApproved.toLocaleString()}</span>
                </div>
              </div>
              <div className="mb-5">
                <p className="text-gray-500 text-xs mb-1.5">Optional remarks for the officer (included with approval notification)</p>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                  className="w-full text-sm border border-[#E0E0E0] rounded-lg p-3 focus:ring-2 focus:ring-green-400 outline-none resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setActiveModal('none')} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                <button onClick={() => confirmDecision('approved')}
                  className="flex-1 py-3 bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white rounded-xl text-sm font-bold hover:from-[#16A34A] hover:to-[#22C55E] flex items-center justify-center gap-2">
                  <Rocket className="w-4 h-4" /> Approve & Publish Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RETURN MODAL */}
      {activeModal === 'return' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#FFC107] to-[#F59E0B] px-6 py-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-[#001A4D]/20 rounded-full flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-[#001A4D]" />
              </div>
              <div>
                <h3 className="text-[#001A4D] font-bold text-lg">Return for Revision</h3>
                <p className="text-[#001A4D]/70 text-sm">{event?.name}</p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-5">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[#001A4D] text-sm">The proposal will be returned to the officer with your remarks. They can revise and resubmit.</p>
              </div>

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-[#83358E] rounded-full" />
                  <p className="text-[#001A4D] font-bold text-sm">Flagged Items to Correct</p>
                </div>
                <div className="space-y-2">
                  {RETURN_FLAGS.map(flag => (
                    <label key={flag} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={returnFlags.includes(flag)}
                        onChange={() => setReturnFlags(p => p.includes(flag) ? p.filter(f => f !== flag) : [...p, flag])}
                        className="accent-amber-500 w-4 h-4 rounded" />
                      <span className="text-sm text-gray-700">{flag}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <p className="text-[#001A4D] font-bold text-sm mb-1.5">Resubmission Deadline <span className="text-gray-400 font-normal text-xs">(optional)</span></p>
                <input type="date" value={returnDeadline} onChange={e => setReturnDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </div>

              <div className="p-3 bg-gray-50 rounded-xl mb-5">
                <p className="text-gray-400 text-xs mb-2">Your remarks (preview):</p>
                <p className="text-[#001A4D] text-sm italic">"{remarks}"</p>
              </div>

              <p className="text-amber-600 text-xs mb-4">This will be return #1. Officer has 2 resubmission(s) remaining.</p>

              <div className="flex gap-3">
                <button onClick={() => setActiveModal('none')} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                <button onClick={() => confirmDecision('returned')}
                  className="flex-1 py-3 bg-gradient-to-r from-[#FFC107] to-[#F59E0B] text-[#001A4D] rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" /> Return for Revision
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {activeModal === 'reject' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#EF4444] to-[#F97316] px-6 py-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
                <X className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Confirm Rejection</h3>
                <p className="text-[#FFD41C] text-sm">{event?.name}</p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-5">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-[#001A4D] font-bold text-sm">This action will permanently reject this event proposal. The officer will be notified and the proposal will be closed.</p>
              </div>

              <div className="mb-5">
                <p className="text-[#001A4D] font-bold text-sm mb-1.5">Rejection Reason <span className="text-red-500">*</span></p>
                <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent">
                  <option value="">Select rejection reason category...</option>
                  {REJECTION_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg mb-4">
                <div>
                  <p className="text-sm font-medium text-[#001A4D]">Allow Resubmission</p>
                  <p className="text-xs text-gray-400">Officer can submit a new proposal after waiting period</p>
                </div>
                <button onClick={() => setAllowResubmit(!allowResubmit)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${allowResubmit ? 'bg-[#83358E]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allowResubmit ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {allowResubmit && (
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-[#001A4D]">Officer can resubmit after</span>
                  <input type="number" value={resubmitDays} onChange={e => setResubmitDays(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-red-400" />
                  <span className="text-sm text-[#001A4D]">days</span>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl mb-5">
                <p className="text-gray-400 text-xs mb-2">Your remarks (will be sent with rejection notice):</p>
                <p className="text-[#001A4D] text-sm italic">"{remarks}"</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setActiveModal('none')} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel — Go Back</button>
                <button onClick={() => confirmDecision('rejected')} disabled={!rejectionReason}
                  className="flex-1 py-3 bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                  <X className="w-4 h-4" /> Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
