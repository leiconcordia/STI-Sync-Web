import { Award, Clock, CheckCircle, UserPlus, Calendar, Eye, ChevronRight } from "lucide-react";

interface Props {
  isAdmin: boolean;
  onGenerate: (eventId: string) => void;
  onOpenTemplateLibrary: () => void;
  onOpenEditor: () => void;
}

const readyEvents = [
  { id: "1", name: "IT Guild Tech Summit 2025", org: "IT Guild – CCS", date: "Nov 28, 2025", attended: 72, manual: 3 },
  { id: "2", name: "Business Plan Competition", org: "JPIA – CBA", date: "Dec 2, 2025", attended: 48, manual: 0 },
  { id: "3", name: "Cultural Night Showcase", org: "Cultura Dance Org", date: "Dec 5, 2025", attended: 130, manual: 7 },
  { id: "4", name: "Leadership Summit", org: "SSG", date: "Dec 10, 2025", attended: 91, manual: 2 },
];

const savedTemplates = [
  { id: "1", name: "Certificate of Participation", used: 12, uploaded: "Nov 15, 2025" },
  { id: "2", name: "Certificate of Recognition", used: 5, uploaded: "Oct 20, 2025" },
  { id: "3", name: "Certificate of Achievement", used: 3, uploaded: "Sep 8, 2025" },
];

const metrics = [
  { label: "Total Templates", value: 3, note: "uploaded this account", icon: Award, gradient: "from-[#0E4EBD] to-[#1E70E8]", pill: null },
  { label: "Pending Generation", value: 4, note: "events with completed attendance", icon: Clock, gradient: "from-[#FFC107] to-[#FFD54F]", textDark: true, pill: "Generate Now" },
  { label: "Certificates Issued", value: 847, note: "+124 this semester", icon: CheckCircle, gradient: "from-[#22C55E] to-[#16A34A]", pill: null },
  { label: "Manual Recipients", value: 12, note: "added outside app attendance", icon: UserPlus, gradient: "from-[#83358E] to-[#5B1F6B]", pill: null },
];

export default function CertificateDashboard({ isAdmin, onGenerate, onOpenTemplateLibrary, onOpenEditor }: Props) {
  return (
    <div className="space-y-6">
      {/* Officer scope note */}
      {!isAdmin && (
        <div className="bg-[#F3E8FF] border border-[#83358E]/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <Award className="w-4 h-4 text-[#83358E] flex-shrink-0" />
          <p className="text-[#83358E] text-sm">Certificate generation is scoped to your organization's events only.</p>
        </div>
      )}

      {/* Context Banner */}
      <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#FFD41C]/20 rounded-full flex items-center justify-center">
            <Award className="w-6 h-6 text-[#FFD41C]" />
          </div>
          <div>
            <p className="text-white font-bold text-xl">Certificate Management</p>
            <p className="text-white/70 text-sm mt-0.5">Upload a template, position names, preview, and export certificates for your events.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-[#FFD41C] text-[#001A4D] text-xs font-semibold px-3 py-1.5 rounded-full">3 Templates Saved</span>
          <span className="bg-[#FFD41C] text-[#001A4D] text-xs font-semibold px-3 py-1.5 rounded-full">847 Certificates Issued</span>
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
        <div className="col-span-8 bg-white rounded-2xl border border-[#E0E0E0] overflow-hidden">
          <div className="bg-[#001A4D] px-5 py-3 flex items-center justify-between">
            <span className="text-white font-bold text-sm">Ready to Generate</span>
            <span className="bg-[#FFC107] text-[#001A4D] text-xs font-bold px-2 py-0.5 rounded-full">{readyEvents.length}</span>
          </div>
          <div className="divide-y divide-[#E0E0E0]">
            {readyEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-4 px-5 h-14 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[#001A4D] font-bold text-sm truncate">{ev.name}</p>
                  {isAdmin && <p className="text-[#9E9E9E] text-xs">{ev.org}</p>}
                </div>
                <div className="flex items-center gap-1.5 text-[#9E9E9E] text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  {ev.date}
                </div>
                <span className="bg-[#22C55E]/10 text-[#22C55E] text-xs font-semibold px-2 py-0.5 rounded-full">{ev.attended} attended</span>
                {ev.manual > 0 && (
                  <span className="bg-[#FFC107]/10 text-[#FFC107] text-xs font-semibold px-2 py-0.5 rounded-full">+{ev.manual} manual</span>
                )}
                <button
                  onClick={() => onGenerate(ev.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    isAdmin
                      ? "bg-[#FFD41C] text-[#001A4D] hover:bg-[#FFC107]"
                      : "bg-[#83358E] text-white hover:bg-[#5B1F6B]"
                  }`}
                >
                  Generate Certificates
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Saved Templates */}
        <div className="col-span-4 bg-white rounded-2xl border border-[#E0E0E0] overflow-hidden">
          <div className="bg-[#001A4D] px-5 py-3 flex items-center justify-between">
            <span className="text-white font-bold text-sm">My Templates</span>
            <button onClick={onOpenEditor} className="text-[#FFD41C] text-xs font-semibold hover:underline">+ Upload New</button>
          </div>
          <div className="divide-y divide-[#E0E0E0]">
            {savedTemplates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                <div className="w-12 h-8 bg-[#F8F8F8] rounded border border-[#E0E0E0] flex items-center justify-center flex-shrink-0">
                  <Award className="w-4 h-4 text-[#9E9E9E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#001A4D] font-bold text-xs truncate">{t.name}</p>
                  <p className="text-[#9E9E9E] text-[11px]">Used {t.used} times · {t.uploaded}</p>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 rounded hover:bg-[#EEF2FF]"><Eye className="w-3.5 h-3.5 text-[#0E4EBD]" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-[#E0E0E0]">
            <button onClick={onOpenTemplateLibrary} className="text-[#0E4EBD] text-xs font-semibold hover:underline flex items-center gap-1">
              View All Templates <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
