import { useState } from "react";
import { X, FileText, Files, Printer, CheckCircle, Download } from "lucide-react";

interface Props {
  eventName: string;
  totalRecipients: number;
  includedCount: number;
  onClose: () => void;
}

const FORMAT_OPTIONS = [
  { id: "single", label: "Single PDF", desc: "All certificates in one file", icon: FileText, iconColor: "text-[#0E4EBD]" },
  { id: "individual", label: "Individual PDFs", desc: "One file per student, zipped", icon: Files, iconColor: "text-[#83358E]" },
  { id: "print-ready", label: "Print-Ready PDF", desc: "Crop marks included", icon: Printer, iconColor: "text-[#001A4D]" },
];

const NAMING = [
  "StudentName_Certificate.pdf",
  "StudentID_Certificate.pdf",
  "EventName_StudentName.pdf",
  "Custom",
];

export default function ExportModal({ eventName, totalRecipients, includedCount, onClose }: Props) {
  const [format, setFormat] = useState("single");
  const [paperSize, setPaperSize] = useState("A4");
  const [orientation, setOrientation] = useState("Landscape");
  const [quality, setQuality] = useState(150);
  const [naming, setNaming] = useState(NAMING[0]);
  const [phase, setPhase] = useState<"config" | "progress" | "done">("config");
  const [progress, setProgress] = useState(0);

  const qualityLabel = quality <= 72 ? "72 DPI — Screen" : quality <= 150 ? "150 DPI — Standard Print" : "300 DPI — High Quality Print";

  const startExport = () => {
    setPhase("progress");
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p >= 100) { p = 100; clearInterval(interval); setTimeout(() => setPhase("done"), 400); }
      setProgress(Math.min(100, p));
    }, 120);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-[560px] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FFD41C]/20 rounded-full flex items-center justify-center">
            <Download className="w-5 h-5 text-[#FFD41C]" />
          </div>
          <div>
            <p className="text-white font-bold text-base">Export Certificates</p>
            <p className="text-[#FFD41C] text-xs">{eventName}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {phase === "config" && (
            <>
              {/* Summary */}
              <div className="bg-[#F3E8FF] border border-[#83358E]/20 rounded-xl p-4 flex items-center justify-around">
                <div className="text-center">
                  <p className="text-[#001A4D] font-bold text-xl">{totalRecipients}</p>
                  <p className="text-[#9E9E9E] text-xs">Total Recipients</p>
                </div>
                <div className="w-px h-10 bg-[#83358E]/20" />
                <div className="text-center">
                  <p className="text-[#22C55E] font-bold text-xl">{includedCount}</p>
                  <p className="text-[#9E9E9E] text-xs">Included</p>
                </div>
                <div className="w-px h-10 bg-[#83358E]/20" />
                <div className="text-center">
                  <p className="text-[#9E9E9E] font-bold text-xl">{totalRecipients - includedCount}</p>
                  <p className="text-[#9E9E9E] text-xs">Excluded</p>
                </div>
              </div>

              {/* Format */}
              <div>
                <p className="text-[#001A4D] font-bold text-xs mb-2 border-l-[3px] border-[#83358E] pl-2">Export Format</p>
                <div className="grid grid-cols-3 gap-3">
                  {FORMAT_OPTIONS.map(f => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFormat(f.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${format === f.id ? "border-[#83358E] bg-[#F3E8FF]" : "border-[#E0E0E0] bg-white hover:border-gray-300"}`}
                      >
                        <Icon className={`w-5 h-5 mb-2 ${f.iconColor}`} />
                        <p className="text-[#001A4D] font-bold text-xs">{f.label}</p>
                        <p className="text-[#9E9E9E] text-[10px] mt-0.5">{f.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paper & Orientation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#9E9E9E] mb-1">Paper Size</label>
                  <select value={paperSize} onChange={e => setPaperSize(e.target.value)} className="w-full px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none">
                    {["A4", "Letter", "Legal", "Custom"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#9E9E9E] mb-1">Orientation</label>
                  <div className="flex gap-2">
                    {["Landscape", "Portrait"].map(o => (
                      <button key={o} onClick={() => setOrientation(o)} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${orientation === o ? "bg-[#001A4D] text-white border-[#001A4D]" : "bg-white text-[#9E9E9E] border-[#E0E0E0] hover:border-gray-400"}`}>{o}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-xs text-[#9E9E9E] mb-2">Quality — {qualityLabel}</label>
                <input type="range" min={72} max={300} step={78} value={quality} onChange={e => setQuality(Number(e.target.value))} className="w-full accent-[#83358E]" />
              </div>

              {/* File naming */}
              <div>
                <label className="block text-xs text-[#9E9E9E] mb-1.5">File Naming Convention</label>
                <select value={naming} onChange={e => setNaming(e.target.value)} className="w-full px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none">
                  {NAMING.map(n => <option key={n}>{n}</option>)}
                </select>
                <p className="text-[#9E9E9E] text-xs font-mono mt-1.5">e.g., JuandelaCruz_Certificate.pdf</p>
              </div>
            </>
          )}

          {phase === "progress" && (
            <div className="py-4 space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="h-full bg-[#83358E] rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[#001A4D] font-semibold text-sm">Generating certificate {Math.round(progress / 100 * includedCount)} of {includedCount}...</p>
              <p className="text-[#9E9E9E] text-xs">Please wait — do not close this window.</p>
            </div>
          )}

          {phase === "done" && (
            <div className="py-4">
              <div className="bg-gradient-to-br from-[#22C55E] to-[#16A34A] rounded-2xl p-6 text-center">
                <CheckCircle className="w-10 h-10 text-white mx-auto mb-3" />
                <p className="text-white font-bold text-base">{includedCount} certificates generated successfully!</p>
                <p className="text-white/80 text-sm mt-1">Download ready.</p>
                <button className="mt-4 w-full bg-white text-[#22C55E] font-bold text-sm py-3 rounded-xl hover:bg-gray-50 transition-colors">
                  Download ZIP / PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E0E0E0] flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-sm text-[#9E9E9E] hover:bg-gray-50 transition-colors">Cancel</button>
          {phase === "config" && (
            <button onClick={startExport} className="px-5 py-2 bg-[#001A4D] text-white text-sm font-semibold rounded-lg hover:bg-[#0E4EBD] transition-colors">
              Export {includedCount} Certificates
            </button>
          )}
          {phase === "done" && (
            <button onClick={onClose} className="px-5 py-2 text-[#9E9E9E] text-sm hover:underline">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
