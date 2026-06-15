import { Award, Eye, Edit2, Copy, Trash2, AlertTriangle, CheckCircle, BarChart2, Clock, Search } from "lucide-react";
import { useState } from "react";

interface Props {
  isAdmin: boolean;
  onEditTemplate: (id: string) => void;
  onUploadNew: () => void;
}

const templates = [
  {
    id: "1",
    name: "Certificate of Participation",
    dimensions: "A4 Landscape — 297×210mm",
    positionSet: true,
    font: "Arial · 28px · Centered · Dark Navy",
    usedCount: 12,
    lastUsed: "Nov 28, 2025",
    isDefault: true,
  },
  {
    id: "2",
    name: "Certificate of Recognition",
    dimensions: "A4 Landscape — 297×210mm",
    positionSet: true,
    font: "Georgia · 32px · Centered · Black",
    usedCount: 5,
    lastUsed: "Oct 20, 2025",
    isDefault: false,
  },
  {
    id: "3",
    name: "Certificate of Achievement",
    dimensions: "Letter Landscape — 279×216mm",
    positionSet: false,
    font: "Montserrat · 26px · Centered · Dark Navy",
    usedCount: 3,
    lastUsed: "Sep 8, 2025",
    isDefault: false,
  },
];

export default function TemplateLibrary({ isAdmin, onEditTemplate, onUploadNew }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

  const filtered = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-4 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none focus:border-[#1E70E8]"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none focus:border-[#1E70E8]"
        >
          <option value="newest">Newest</option>
          <option value="most-used">Most Used</option>
          <option value="az">A–Z</option>
        </select>
        <span className="text-[#9E9E9E] text-sm ml-auto">Showing {filtered.length} templates</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Award className="w-16 h-16 text-[#0E4EBD] mb-4" />
          <p className="text-[#001A4D] font-bold text-lg">No templates yet</p>
          <p className="text-[#9E9E9E] text-sm mt-1 mb-5">Upload your first certificate template to get started.</p>
          <button onClick={onUploadNew} className="bg-[#83358E] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#5B1F6B] transition-colors">
            + Upload Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {filtered.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-[#E0E0E0]/50 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Thumbnail */}
              <div className="relative w-full h-40 bg-[#F8F8F8] flex items-center justify-center rounded-t-2xl">
                {t.isDefault && (
                  <span className="absolute top-3 left-3 bg-[#FFD41C] text-[#001A4D] text-[10px] font-bold px-2 py-0.5 rounded-full">DEFAULT</span>
                )}
                <Award className="w-12 h-12 text-[#9E9E9E]" />
              </div>

              {/* Body */}
              <div className="p-4 space-y-2">
                <p className="text-[#001A4D] font-bold text-[15px]">{t.name}</p>
                <p className="text-[#9E9E9E] text-xs">{t.dimensions}</p>

                <div className="flex items-center gap-1.5">
                  {t.positionSet ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span className="text-[#22C55E] text-xs">Name position configured</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-[#FFC107]" />
                      <span className="text-[#FFC107] text-xs">Name position not set</span>
                    </>
                  )}
                </div>

                <p className="text-[#9E9E9E] text-xs">{t.font}</p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 text-[#9E9E9E] text-xs">
                    <BarChart2 className="w-3.5 h-3.5" />
                    Used {t.usedCount} times
                  </div>
                  <div className="flex items-center gap-1 text-[#9E9E9E] text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    {t.lastUsed}
                  </div>
                </div>
              </div>

              {/* Action Row */}
              <div className="px-4 pb-4 flex items-center gap-2">
                <button
                  onClick={() => onEditTemplate(t.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isAdmin
                      ? "bg-[#001A4D] text-white hover:bg-[#0E4EBD]"
                      : "bg-[#83358E] text-white hover:bg-[#5B1F6B]"
                  }`}
                >
                  Use This Template
                </button>
                <button className="p-2 rounded-lg border border-[#E0E0E0] hover:bg-[#EEF2FF] transition-colors">
                  <Eye className="w-4 h-4 text-[#0E4EBD]" />
                </button>
                <button onClick={() => onEditTemplate(t.id)} className="p-2 rounded-lg border border-[#E0E0E0] hover:bg-gray-50 transition-colors">
                  <Edit2 className="w-4 h-4 text-[#9E9E9E]" />
                </button>
                <button className="p-2 rounded-lg border border-[#E0E0E0] hover:bg-gray-50 transition-colors">
                  <Copy className="w-4 h-4 text-[#9E9E9E]" />
                </button>
                <button className="p-2 rounded-lg border border-[#E0E0E0] hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4 text-[#9E9E9E] hover:text-[#EF4444]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
