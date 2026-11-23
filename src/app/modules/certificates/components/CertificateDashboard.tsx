import { useState } from "react";
import { Award, Clock, CheckCircle, UserPlus, Calendar, ChevronRight, CheckCircle2, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { useAllEvents } from "../../events/hooks/useEventStream";
import { useAttendanceStream } from "../../attendance/hooks/useAttendanceStream";
import { useCertificateTemplatesStream, useIssuedCertificatesStream } from "../hooks/useCertificateStream";
import { useOrganizationStream } from "../../organizations/hooks/useOrganizationStream";
import { isEventReadyForCertificates } from "../../events/utils/event-lifecycle.utils";

interface Props {
  isAdmin: boolean;
  organizationId?: string;
  onGenerate: (eventId: string, templateId?: string) => void;
  onOpenTemplateLibrary?: () => void;
  onOpenEditor?: () => void;
  onManageTemplatesInSettings?: () => void;
}

export default function CertificateDashboard({
  isAdmin,
  organizationId,
  onGenerate,
  onOpenTemplateLibrary,
  onOpenEditor,
  onManageTemplatesInSettings,
}: Props) {
  const [pickEventForTemplate, setPickEventForTemplate] = useState<{ id: string; name: string } | null>(null);
  const { events, loading: eventsLoading } = useAllEvents();
  const { attendance, loading: attendanceLoading } = useAttendanceStream();
  const { templates, loading: templatesLoading } = useCertificateTemplatesStream(organizationId, isAdmin);
  const { issuedRecords, loading: issuedLoading } = useIssuedCertificatesStream();
  const { data: orgs } = useOrganizationStream();

  const getOrgName = (orgId: string) => orgs.find(o => o.id === orgId)?.acronym || orgs.find(o => o.id === orgId)?.name || orgId || 'General';

  // All events owned by this scope (for total attendance and issued metrics)
  const allScopedEvents = events.filter(e => {
    if (!isAdmin && organizationId && e.hostingOrgId !== organizationId) return false;
    return true;
  });

  // Concluded events that have attendance tracking enabled
  const readyToGenerateEvents = allScopedEvents.filter(e => isEventReadyForCertificates(e));

  // Concluded events ready to generate certificates
  const readyEvents = readyToGenerateEvents.map(e => {
    const eventAttendance = attendance.filter(a => a.eventId === e.id || a.event === e.title);
    const attendedCount = eventAttendance.filter(a => 
      a.status === 'Present' || a.status === 'Checked In' || a.status === 'Checked Out' || a.status === 'Complete' || a.status === 'Late' || a.status === 'Flagged'
    ).length;
    const firstDate = e.sessions && e.sessions.length > 0 ? e.sessions[0].date : (e.date || 'TBA');
    const issuedCount = issuedRecords.filter(r => r.eventId === e.id).length;

    return {
      id: e.id,
      name: e.title,
      org: getOrgName(e.hostingOrgId),
      date: firstDate,
      attended: attendedCount,
      issued: issuedCount,
    };
  });

  // Scoped issued certificates and attendance
  const scopedEventIds = new Set(allScopedEvents.map(e => e.id));
  const scopedIssuedRecords = isAdmin ? issuedRecords : issuedRecords.filter(r => scopedEventIds.has(r.eventId));
  const scopedAttendance = (isAdmin ? attendance : attendance.filter(a => scopedEventIds.has(a.eventId || ''))).filter(
    a => a.status !== 'Absent'
  );

  const totalIssuedCount = scopedIssuedRecords.length;

  const metrics = [
    { label: "Total Templates", value: templates.length, note: isAdmin ? "admin templates saved" : "organization templates saved", icon: Award, gradient: "from-[#0E4EBD] to-[#1E70E8]", pill: null },
    { label: "Ready Events", value: readyEvents.length, note: "concluded events ready for certificates", icon: Clock, gradient: "from-[#FFC107] to-[#FFD54F]", textDark: true, pill: "Generate Now" },
    { label: "Certificates Issued", value: totalIssuedCount, note: isAdmin ? "total issued across system" : "issued for your org", icon: CheckCircle, gradient: "from-[#22C55E] to-[#16A34A]", pill: null },
    { label: "Total Attendees", value: scopedAttendance.length, note: "checked-in attendance records", icon: UserPlus, gradient: "from-[#83358E] to-[#5B1F6B]", pill: null },
  ];

  return (
    <div className="space-y-6">
      {/* Officer scope note */}
      {!isAdmin && (
        <div className="bg-[#F3E8FF] border border-[#83358E]/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <Award className="w-4 h-4 text-[#83358E] flex-shrink-0" />
          <p className="text-[#83358E] text-sm">Certificate generation and templates are scoped strictly to your organization's events.</p>
        </div>
      )}

      {/* Context Banner */}
      <div className={`bg-gradient-to-r ${isAdmin ? "from-[#001A4D] to-[#0E4EBD]" : "from-[#83358E] to-[#5B1F6B]"} rounded-2xl p-5 flex items-center justify-between shadow-sm`}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Award className="w-6 h-6 text-[#FFD41C]" />
          </div>
          <div>
            <p className="text-white font-bold text-xl">Certificate Management</p>
            <p className="text-white/80 text-sm mt-0.5">Upload a template, position names, preview, and export landscape A4 certificates for your events.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">{templates.length} Templates Saved</span>
          <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">{totalIssuedCount} Certificates Issued</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`bg-gradient-to-br ${m.gradient} rounded-2xl p-5 relative overflow-hidden`}>
              {m.pill && (
                <span className="absolute top-3 right-3 bg-white/20 text-white text-[10px] font-semibold px-2 py-1 rounded-full">{m.pill}</span>
              )}
              <Icon className={`w-7 h-7 mb-3 ${m.textDark ? "text-[#001A4D]" : "text-white/80"}`} />
              <p className={`text-3xl font-bold ${m.textDark ? "text-[#001A4D]" : "text-white"}`}>{m.value.toLocaleString()}</p>
              <p className={`text-sm font-semibold mt-0.5 ${m.textDark ? "text-[#001A4D]" : "text-white"}`}>{m.label}</p>
              <p className={`text-xs mt-1 ${m.textDark ? "text-[#001A4D]/70" : "text-white/60"}`}>{m.note}</p>
            </div>
          );
        })}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-12 gap-5">
        {/* Ready to Generate */}
        <div className="col-span-8 bg-white rounded-2xl border border-[#E0E0E0] overflow-hidden flex flex-col shadow-sm">
          <div className={`${isAdmin ? "bg-[#001A4D]" : "bg-[#83358E]"} px-5 py-3 flex items-center justify-between`}>
            <span className="text-white font-bold text-sm">Ready to Generate</span>
            <span className="bg-[#FFC107] text-[#001A4D] text-xs font-bold px-2 py-0.5 rounded-full">{readyEvents.length}</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-[#E0E0E0]">
            {eventsLoading || attendanceLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading events & attendance...</div>
            ) : readyEvents.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm space-y-1">
                <p className="font-semibold text-gray-700">No concluded events with attendance enabled found yet.</p>
                <p className="text-xs text-gray-400">When an event with attendance tracking is officially concluded, it will appear here ready to generate certificates.</p>
              </div>
            ) : (
              readyEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F3E8FF]/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[#001A4D] font-bold text-sm truncate">{ev.name}</p>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Concluded
                      </span>
                    </div>
                    {isAdmin && <p className="text-[#9E9E9E] text-xs mt-0.5">{ev.org}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[#888780] text-xs whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5 text-[#83358E]" />
                    {ev.date}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      ev.attended > 0
                        ? "bg-[#22C55E]/10 text-[#22C55E]"
                        : "bg-amber-100/70 text-amber-800"
                    }`}>
                      {ev.attended > 0 ? `${ev.attended} Attendees` : "0 Scanned (Manual)"}
                    </span>
                    {ev.issued > 0 && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                        {ev.issued} Issued
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onGenerate(ev.id)}
                    className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs ${isAdmin
                        ? "bg-[#FFD41C] text-[#001A4D] hover:bg-[#FFC107]"
                        : "bg-[#83358E] text-white hover:bg-[#6D2A78]"
                      }`}
                  >
                    {ev.issued > 0 ? "Generate / Re-issue" : "Generate Certificates"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ready-Made Templates */}
        <div className="col-span-4 bg-white rounded-2xl border border-[#E0E0E0] overflow-hidden flex flex-col shadow-sm">
          <div className={`${isAdmin ? "bg-[#001A4D]" : "bg-[#83358E]"} px-5 py-3 flex items-center justify-between`}>
            <span className="text-white font-bold text-sm">
              {isAdmin ? "Ready-Made Templates" : "Saved Templates"}
            </span>
            {!isAdmin && onOpenEditor ? (
              <button onClick={onOpenEditor} className="text-white text-xs font-semibold hover:underline cursor-pointer">
                + Upload New
              </button>
            ) : (
              <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {templates.length}
              </span>
            )}
          </div>
          <div className="max-h-[310px] overflow-y-auto divide-y divide-[#E0E0E0]">
            {templatesLoading ? (
              <div className="p-6 text-center text-gray-400 text-xs">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs space-y-2">
                <p>No ready-made templates available yet.</p>
                {isAdmin && onManageTemplatesInSettings && (
                  <button
                    type="button"
                    onClick={onManageTemplatesInSettings}
                    className="text-[#0E4EBD] font-semibold hover:underline cursor-pointer"
                  >
                    Create templates in Settings →
                  </button>
                )}
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (readyEvents.length === 0) {
                      toast.info("No concluded events with attendance enabled found yet. Conclude an event first to use this template.");
                      return;
                    }
                    if (readyEvents.length === 1) {
                      onGenerate(readyEvents[0].id, t.id);
                      return;
                    }
                    setPickEventForTemplate({ id: t.id, name: t.name });
                  }}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[#F3E8FF]/30 transition-colors group cursor-pointer"
                  title="Choose this ready-made template to generate certificates"
                >
                  <div className="w-12 h-8 bg-[#F8F8F8] rounded border border-[#E0E0E0] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                    ) : (
                      <Award className="w-4 h-4 text-[#888780]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#001A4D] font-bold text-xs truncate">{t.name}</p>
                    <p className="text-[#888780] text-[11px]">{t.namePosition?.fontFamily || 'Arial'} · {t.namePosition?.textColor || '#001A4D'}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                    isAdmin
                      ? "bg-blue-50 text-[#0E4EBD] group-hover:bg-[#001A4D] group-hover:text-white"
                      : "bg-purple-50 text-[#83358E] group-hover:bg-[#83358E] group-hover:text-white"
                  }`}>
                    Use
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-3 border-t border-[#E0E0E0] mt-auto">
            {isAdmin && onManageTemplatesInSettings ? (
              <button
                type="button"
                onClick={onManageTemplatesInSettings}
                className="text-[#0E4EBD] text-xs font-semibold hover:underline flex items-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Manage &amp; Edit Templates in Settings <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : onOpenTemplateLibrary ? (
              <button onClick={onOpenTemplateLibrary} className={`${isAdmin ? "text-[#0E4EBD]" : "text-[#83358E]"} text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer`}>
                View All Templates <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Event Picker Modal when choosing a ready-made template */}
      {pickEventForTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setPickEventForTemplate(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-10 border border-gray-200">
            <div className={`${isAdmin ? "bg-[#001A4D]" : "bg-[#83358E]"} px-5 py-4 flex items-center justify-between text-white`}>
              <div>
                <h3 className="font-bold text-sm">Select Event for Template</h3>
                <p className="text-[11px] text-white/80 truncate">{pickEventForTemplate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPickEventForTemplate(null)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto divide-y divide-gray-100">
              {readyEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    const tmplId = pickEventForTemplate.id;
                    setPickEventForTemplate(null);
                    onGenerate(ev.id, tmplId);
                  }}
                  className="w-full text-left py-3 px-2 hover:bg-blue-50/60 rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#001A4D] truncate">{ev.name}</p>
                    <p className="text-[11px] text-gray-500">{ev.date} · {ev.attended} attendees</p>
                  </div>
                  <span className="text-xs font-bold text-[#0E4EBD] shrink-0">Select →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

