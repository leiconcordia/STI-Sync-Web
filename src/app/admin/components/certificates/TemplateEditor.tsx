import { useState, useRef, useCallback } from "react";
import {
  Upload, ZoomIn, ZoomOut, Maximize2, Settings, Save, Eye, EyeOff,
  AlignLeft, AlignCenter, AlignRight, Lock, RotateCcw, Info, Award
} from "lucide-react";

interface Props {
  isAdmin: boolean;
  onSave: () => void;
}

const FONTS = ["Arial", "Times New Roman", "Georgia", "Helvetica", "Montserrat", "Playfair Display", "Great Vibes"];
const COLOR_PRESETS = ["#001A4D", "#FFFFFF", "#000000", "#B8860B", "#8B0000", "#006400"];

export default function TemplateEditor({ isAdmin, onSave }: Props) {
  const [hasTemplate, setHasTemplate] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [zoom, setZoom] = useState(100);
  const [templateName, setTemplateName] = useState("");
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(32);
  const [fontWeight, setFontWeight] = useState("Regular");
  const [textColor, setTextColor] = useState("#001A4D");
  const [textAlign, setTextAlign] = useState("center");
  const [previewName, setPreviewName] = useState("Juan dela Cruz");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [namePos, setNamePos] = useState({ x: 342, y: 156, w: 280, h: 48 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const canSave = hasTemplate && templateName.trim().length > 0;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== "edit") return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ mx: e.clientX, my: e.clientY, ox: namePos.x, oy: namePos.y });
  }, [mode, namePos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.mx;
    const dy = e.clientY - dragStart.my;
    setNamePos(p => ({ ...p, x: Math.max(0, dragStart.ox + dx), y: Math.max(0, dragStart.oy + dy) }));
  }, [isDragging, dragStart]);

  const onMouseUp = useCallback(() => setIsDragging(false), []);

  const resetPosition = () => setNamePos({ x: 210, y: 310, w: 280, h: 48 });

  const fontWeightOptions = ["Regular", "Bold", "Italic", "Bold Italic"];

  return (
    <div className="flex gap-5 h-[calc(100vh-160px)]" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {/* LEFT — Canvas */}
      <div className="flex-1 bg-[#F0F0F0] rounded-2xl overflow-hidden flex flex-col">
        {/* Canvas Header */}
        <div className="bg-white border-b border-[#E0E0E0] h-11 flex items-center justify-between px-4">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["edit", "preview"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors capitalize ${
                  mode === m ? "bg-[#001A4D] text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "edit" ? "Edit Mode" : "Preview Mode"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {mode === "preview" && (
              <span className="bg-[#22C55E] text-white text-xs font-semibold px-2 py-0.5 rounded-full">Preview Active</span>
            )}
            <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="w-7 h-7 rounded-lg border border-[#E0E0E0] flex items-center justify-center hover:bg-gray-50">
              <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <span className="text-gray-500 text-sm w-12 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="w-7 h-7 rounded-lg border border-[#E0E0E0] flex items-center justify-center hover:bg-gray-50">
              <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button onClick={() => setZoom(100)} className="w-7 h-7 rounded-lg border border-[#E0E0E0] flex items-center justify-center hover:bg-gray-50">
              <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-8">
          {!hasTemplate ? (
            <div
              className="border-2 border-dashed border-[#001A4D]/30 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#001A4D]/60 transition-colors"
              style={{ width: 400, height: 280 }}
              onClick={() => setHasTemplate(true)}
            >
              <Upload className="w-12 h-12 text-[#001A4D]" />
              <p className="text-[#001A4D] font-bold text-base">Upload your certificate template</p>
              <p className="text-[#9E9E9E] text-xs text-center">JPG, PNG, or PDF · Max 10MB · A4 or Letter size recommended</p>
              <button className="bg-[#83358E] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#5B1F6B] transition-colors">
                Upload Template
              </button>
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="relative bg-white shadow-xl rounded"
              style={{ width: `${700 * zoom / 100}px`, height: `${495 * zoom / 100}px` }}
            >
              {/* Checkered pattern for "outside template" feel */}
              <div
                className="absolute inset-0 rounded"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23ccc'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23ccc'/%3E%3C/svg%3E")`,
                  backgroundSize: "16px 16px",
                }}
              />
              {/* Certificate background (simulated gradient) */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-yellow-100 rounded" />
              {/* Certificate border decoration */}
              <div className="absolute inset-3 border-4 border-[#B8860B]/30 rounded" />
              <div className="absolute inset-4 border border-[#B8860B]/20 rounded" />
              {/* Mock certificate text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <p className="text-[#001A4D]/30 text-xs font-bold tracking-widest uppercase">Certificate of Participation</p>
                <p className="text-[#001A4D]/20 text-[10px]">This is to certify that</p>
                <div style={{ height: namePos.h + 30 }} />
                <p className="text-[#001A4D]/20 text-[10px]">has successfully participated in the event</p>
              </div>

              {mode === "edit" ? (
                <>
                  {/* Snap guides */}
                  {isDragging && (
                    <>
                      <div className="absolute left-0 right-0 border-t-2 border-dashed border-[#FFD41C] pointer-events-none" style={{ top: "50%" }} />
                      <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-[#FFD41C] pointer-events-none" style={{ left: "50%" }} />
                    </>
                  )}
                  {/* Draggable name box */}
                  <div
                    className="absolute cursor-move select-none"
                    style={{ left: namePos.x, top: namePos.y, width: namePos.w, height: namePos.h }}
                    onMouseDown={onMouseDown}
                  >
                    <div
                      className="w-full h-full flex items-center justify-center border-2 border-dashed border-[#FFD41C] rounded"
                      style={{ background: "rgba(0,26,77,0.15)" }}
                    >
                      <span style={{ fontFamily, fontSize: Math.max(10, fontSize * zoom / 200), color: textColor, fontWeight: fontWeight.includes("Bold") ? "bold" : "normal", fontStyle: fontWeight.includes("Italic") ? "italic" : "normal", textAlign: textAlign as any }}>
                        {previewName}
                      </span>
                    </div>
                    {/* Resize handles */}
                    {[["top-0 left-0 -translate-x-1/2 -translate-y-1/2", "cursor-nw-resize"],
                      ["top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", "cursor-n-resize"],
                      ["top-0 right-0 translate-x-1/2 -translate-y-1/2", "cursor-ne-resize"],
                      ["top-1/2 right-0 translate-x-1/2 -translate-y-1/2", "cursor-e-resize"],
                      ["bottom-0 right-0 translate-x-1/2 translate-y-1/2", "cursor-se-resize"],
                      ["bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", "cursor-s-resize"],
                      ["bottom-0 left-0 -translate-x-1/2 translate-y-1/2", "cursor-sw-resize"],
                      ["top-1/2 left-0 -translate-x-1/2 -translate-y-1/2", "cursor-w-resize"],
                    ].map(([pos, cursor], i) => (
                      <div key={i} className={`absolute w-2.5 h-2.5 bg-[#FFD41C] border border-white ${pos} ${cursor}`} />
                    ))}
                    {/* Rotation handle */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#FFD41C] rounded-full flex items-center justify-center cursor-grab">
                      <RotateCcw className="w-2.5 h-2.5 text-[#001A4D]" />
                    </div>
                  </div>
                  {/* Coordinate badge while dragging */}
                  {isDragging && (
                    <div className="absolute top-2 left-2 bg-[#001A4D] text-white text-xs font-semibold px-2 py-1 rounded-full pointer-events-none">
                      X: {namePos.x}px · Y: {namePos.y}px
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="absolute flex items-center pointer-events-none"
                  style={{ left: namePos.x, top: namePos.y, width: namePos.w, height: namePos.h, justifyContent: textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center" }}
                >
                  <span style={{ fontFamily, fontSize: Math.max(10, fontSize * zoom / 200), color: textColor, fontWeight: fontWeight.includes("Bold") ? "bold" : "normal", fontStyle: fontWeight.includes("Italic") ? "italic" : "normal" }}>
                    {previewName}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Settings Panel */}
      <div className="w-80 bg-white border border-[#E0E0E0] rounded-2xl overflow-y-auto flex flex-col">
        <div className="px-5 py-4 border-b border-[#E0E0E0] flex items-center justify-between">
          <p className="text-[#001A4D] font-bold text-base">Template Settings</p>
          <Settings className="w-4 h-4 text-[#9E9E9E]" />
        </div>

        <div className="flex-1 p-5 space-y-6 overflow-y-auto">
          {/* Section A — Upload */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#001A4D] mb-1.5">Template Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g., IT Guild Certificate of Participation"
                className="w-full px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none focus:border-[#1E70E8]"
              />
            </div>
            {!hasTemplate ? (
              <div
                className="border-2 border-dashed border-[#E0E0E0] rounded-xl h-20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#0E4EBD] transition-colors"
                onClick={() => setHasTemplate(true)}
              >
                <Upload className="w-5 h-5 text-[#0E4EBD]" />
                <p className="text-[#9E9E9E] text-xs">Click or drag to upload</p>
                <p className="text-[#9E9E9E] text-[10px]">Accepted: JPG, PNG, PDF · Max 10MB</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-[#E0E0E0]">
                <div className="w-12 h-8 bg-gradient-to-br from-amber-50 to-yellow-100 rounded border border-[#E0E0E0] flex items-center justify-center">
                  <Award className="w-4 h-4 text-[#9E9E9E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#001A4D] text-xs font-bold truncate">certificate-template.jpg</p>
                  <p className="text-[#9E9E9E] text-[11px]">1.4 MB</p>
                </div>
                <button onClick={() => setHasTemplate(false)} className="text-[#0E4EBD] text-xs font-semibold hover:underline">Replace</button>
              </div>
            )}
          </div>

          {/* Section B — Name Text Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-l-[3px] border-[#83358E] pl-2">
              <p className="text-[#001A4D] font-bold text-xs">Name Text Appearance</p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-3">
                <label className="block text-[10px] text-[#9E9E9E] mb-1">Font Family</label>
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full px-2 py-1.5 border border-[#E0E0E0] rounded-lg text-xs focus:outline-none">
                  {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-[#9E9E9E] mb-1">Size</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} min={8} max={120} className="w-full px-2 py-1.5 border border-[#E0E0E0] rounded-lg text-xs focus:outline-none" />
                  <span className="text-[#9E9E9E] text-xs">px</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[#9E9E9E] mb-1">Font Weight</label>
              <div className="grid grid-cols-4 gap-1">
                {fontWeightOptions.map(w => (
                  <button key={w} onClick={() => setFontWeight(w)} className={`py-1 text-[10px] font-medium rounded-lg border transition-colors ${fontWeight === w ? "bg-[#001A4D] text-white border-[#001A4D]" : "bg-white text-gray-500 border-[#E0E0E0] hover:border-gray-400"}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[#9E9E9E] mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-[#E0E0E0]" />
                <input type="text" value={textColor} onChange={e => setTextColor(e.target.value)} className="flex-1 px-2 py-1.5 border border-[#E0E0E0] rounded-lg text-xs font-mono focus:outline-none" />
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {COLOR_PRESETS.map(c => (
                  <button key={c} onClick={() => setTextColor(c)} className="w-5 h-5 rounded border border-[#E0E0E0] hover:scale-110 transition-transform" style={{ background: c }} />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[#9E9E9E] mb-1">Text Alignment</label>
              <div className="flex gap-1">
                {[["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]].map(([a, Icon]: any) => (
                  <button key={a} onClick={() => setTextAlign(a)} className={`flex-1 py-1.5 rounded-lg border flex items-center justify-center transition-colors ${textAlign === a ? "bg-[#001A4D] border-[#001A4D]" : "bg-white border-[#E0E0E0] hover:border-gray-400"}`}>
                    <Icon className={`w-4 h-4 ${textAlign === a ? "text-white" : "text-gray-500"}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section C — Position */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-l-[3px] border-[#83358E] pl-2">
              <p className="text-[#001A4D] font-bold text-xs">Name Position</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[["X Position", namePos.x, "px"], ["Y Position", namePos.y, "px"], ["Box Width", namePos.w, "px"], ["Box Height", namePos.h, "px"]].map(([label, val]) => (
                <div key={label as string} className="bg-gray-50 border border-[#E0E0E0] rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#9E9E9E]">{label as string}</p>
                    <p className="text-[#001A4D] text-sm font-bold">{val as number} px</p>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-[#9E9E9E]" />
                </div>
              ))}
            </div>
            <button onClick={resetPosition} className="text-[#0E4EBD] text-xs font-semibold flex items-center gap-1 hover:underline">
              <RotateCcw className="w-3 h-3" /> Reset Position
            </button>
            <p className="text-[#9E9E9E] text-[11px] italic">Drag the highlighted box on the canvas to adjust name position.</p>
          </div>

          {/* Section D — Preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-l-[3px] border-[#83358E] pl-2">
              <p className="text-[#001A4D] font-bold text-xs">Preview Certificate</p>
            </div>
            <input
              type="text"
              value={previewName}
              onChange={e => setPreviewName(e.target.value)}
              placeholder="Type a name to preview..."
              className="w-full px-3 py-2.5 border border-[#E0E0E0] rounded-lg text-sm focus:outline-none focus:border-[#83358E]"
            />
            <button
              onClick={() => setMode(m => m === "edit" ? "preview" : "edit")}
              className={`w-full py-3 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                isAdmin ? "bg-[#001A4D] hover:bg-[#0E4EBD]" : "bg-gradient-to-r from-[#83358E] to-[#5B1F6B] hover:opacity-90"
              }`}
            >
              {mode === "preview" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {mode === "preview" ? "Exit Preview" : "Preview Certificate"}
            </button>
            <div className="bg-[#F3E8FF] rounded-xl p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#83358E] flex-shrink-0 mt-0.5" />
              <p className="text-[#83358E] text-[11px] italic">Preview shows exactly how names will appear on the final exported certificates.</p>
            </div>
          </div>

          {/* Section E — Save */}
          <div className="space-y-3 pt-2">
            <button
              onClick={onSave}
              disabled={!canSave}
              className={`w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isAdmin ? "bg-[#001A4D] text-[#FFD41C] hover:bg-[#0E4EBD]" : "bg-[#83358E] text-white hover:bg-[#5B1F6B]"
              }`}
            >
              <Save className="w-4 h-4" /> Save Template
            </button>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={setAsDefault} onChange={e => setSetAsDefault(e.target.checked)} className="w-4 h-4 rounded accent-[#83358E]" />
              <span className="text-[#9E9E9E] text-xs">Set as Default Template — use automatically for new certificate generations.</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
