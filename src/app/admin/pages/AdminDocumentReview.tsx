import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Gavel,
  CheckCircle, X, HelpCircle, Clock, FileText, Hash,
  Tag, Calendar, Building2, File, StickyNote, Send,
  ZoomIn, ZoomOut, Maximize2, RefreshCw, MessageSquare,
  ExternalLink,
} from "lucide-react";

// ─── Mock Document ─────────────────────────────────────────────────────────────
const MOCK_DOC = {
  id: "1",
  ref: "DOC-2026-0092",
  title: "Activity Letter for Cultural Night 2026",
  category: "Activity Letter",
  fileType: "PDF" as const,
  fileSize: "1.1 MB",
  org: "STI Dance Company",
  orgType: "Cultural",
  orgInitials: "DC",
  submittedBy: "Ana Reyes",
  studentId: "2021-00145",
  email: "areyes@sti.edu.ph",
  submittedAt: "March 18, 2026 · 9:42 AM",
  semester: "2nd Semester · A.Y. 2025–2026",
  timeInQueue: "1 day",
  notes: "This is for the Cultural Night event on April 5. Please expedite review as we need to book the venue.",
  history: [
    { label: "Submitted to SAS", color: "bg-blue-600", icon: Send, timestamp: "Mar 18, 2026 · 9:42 AM", actor: "Ana Reyes" },
    { label: "Received by SAS", color: "bg-[#FFD41C]", icon: Clock, timestamp: "Mar 18, 2026 · 9:43 AM", actor: "Opened by SAS Admin" },
    { label: "Decision Pending", color: "bg-gray-200", icon: HelpCircle, timestamp: "", actor: "Awaiting" },
  ],
};

// ─── Approve Confirmation Modal ────────────────────────────────────────────────
function ApproveModal({ doc, remarks, onClose, onConfirm }: { doc: typeof MOCK_DOC; remarks: string; onClose: () => void; onConfirm: () => void }) {
  const [editedRemarks, setEditedRemarks] = useState(remarks);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[640px] overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-400 px-6 py-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Confirm Document Approval</p>
            <p className="text-[#FFD41C] text-sm">{doc.title}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-[#001A4D] font-bold text-sm">You are approving this document. The following will happen:</p>
            </div>
            <ul className="space-y-1.5">
              {[
                "Document status → Approved",
                `${doc.submittedBy} notified via in-app + push notification`,
                "Document available for download in officer's submissions log",
                "Approval timestamp recorded with your name",
                "Audit log entry created",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-[#001A4D]">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Optional Approval Remarks</label>
            <textarea
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none text-sm"
              value={editedRemarks}
              onChange={(e) => setEditedRemarks(e.target.value)}
            />
            <p className="text-gray-400 text-xs mt-0.5">These will be sent to the officer with the approval notification.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-400 text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity">
            <Send className="w-4 h-4" />
            Confirm Approval
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Confirmation Modal ─────────────────────────────────────────────────
function RejectModal({ doc, remarks, onClose, onConfirm }: { doc: typeof MOCK_DOC; remarks: string; onClose: () => void; onConfirm: () => void }) {
  const [allowResubmit, setAllowResubmit] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[560px] overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
            <X className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Confirm Document Rejection</p>
            <p className="text-[#FFD41C] text-sm">{doc.title}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <AlertIcon className="w-4 h-4 text-red-600" />
              <p className="text-[#001A4D] text-sm">This document will be rejected and returned to the officer with your remarks.</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Rejection Reason Category <span className="text-red-500">*</span></label>
            <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
              <option>Document Incomplete</option>
              <option>Wrong Format</option>
              <option>Wrong Category</option>
              <option>Missing Attachments</option>
              <option>Requires Revision</option>
              <option>Does Not Meet Requirements</option>
              <option>Duplicate Submission</option>
              <option>Other</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Allow Resubmission</p>
              <p className="text-xs text-gray-500">Officer can submit a corrected version.</p>
            </div>
            <button onClick={() => setAllowResubmit(!allowResubmit)} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${allowResubmit ? "bg-[#83358E]" : "bg-gray-300"}`}>
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${allowResubmit ? "translate-x-6" : ""}`} />
            </button>
          </div>
          {!allowResubmit && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-700 text-xs">Officer will not be able to resubmit this document.</p>
            </div>
          )}
          <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
            <p className="text-gray-500 text-xs mb-1 font-medium">Your Rejection Remarks:</p>
            <p className="text-[#001A4D] text-sm italic">"{remarks || "No remarks provided."}"</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity">
            <X className="w-4 h-4" />
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// little helper used in the reject modal
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function AdminDocumentReview() {
  const navigate = useNavigate();
  const doc = MOCK_DOC;

  const [decision, setDecision] = useState<"approved" | "rejected" | "info" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [savedAnnotation, setSavedAnnotation] = useState("");
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [zoom, setZoom] = useState(100);

  const canReject = remarks.trim().length >= 10;

  const handleApprove = () => { setDecision("approved"); setShowApproveModal(false); };
  const handleReject = () => { setDecision("rejected"); setShowRejectModal(false); };
  const handleRequestInfo = () => { setDecision("info"); };

  return (
    <div className="space-y-0 -m-6">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/home/documents")} className="flex items-center gap-2 text-gray-500 hover:text-[#001A4D] transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-gray-400 text-sm">
            Document Management &rsaquo; Review &rsaquo; <span className="text-[#001A4D] font-medium">{doc.title.slice(0, 45)}{doc.title.length > 45 ? "…" : ""}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <p className="text-gray-500 text-xs">1 of {3} pending</p>
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-[280px_1fr_280px] min-h-screen">
        {/* LEFT — Submission Info */}
        <div className="border-r border-[#E0E0E0] p-5 space-y-4 bg-white overflow-y-auto sticky top-[57px] h-[calc(100vh-57px)]">
          {/* Submitter */}
          <div className="border border-[#E0E0E0] rounded-xl p-4">
            <div className="border-l-4 border-[#83358E] pl-3 mb-4">
              <p className="text-[#001A4D] font-bold text-xs">Submitted By</p>
            </div>
            <div className="text-center mb-3">
              <div className="w-14 h-14 bg-[#F3E8FF] border-2 border-white shadow rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-[#83358E] font-bold text-base">AR</span>
              </div>
              <p className="text-[#001A4D] font-bold text-sm">{doc.submittedBy}</p>
              <p className="text-gray-400 text-xs">{doc.studentId}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">Organization Officer</span>
            </div>
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-gray-600">{doc.org}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-gray-600">{doc.email}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-gray-600">{doc.submittedAt}</span>
              </div>
            </div>
          </div>

          {/* Document Metadata */}
          <div className="border border-[#E0E0E0] rounded-xl p-4">
            <div className="border-l-4 border-[#83358E] pl-3 mb-3">
              <p className="text-[#001A4D] font-bold text-xs">Document Information</p>
            </div>
            <div className="space-y-2.5">
              {[
                { Icon: Hash, label: "Reference", value: doc.ref, valueClass: "text-amber-600 font-bold font-mono" },
                { Icon: Tag, label: "Category", value: doc.category, valueClass: "px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium" },
                { Icon: Calendar, label: "Semester", value: doc.semester, valueClass: "" },
                { Icon: File, label: "File", value: `${doc.fileType} · ${doc.fileSize}`, valueClass: "" },
                { Icon: Clock, label: "In Queue", value: doc.timeInQueue, valueClass: "text-amber-600 font-bold" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <row.Icon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500 text-xs">{row.label}</span>
                  </div>
                  {row.label === "Category" ? (
                    <span className={row.valueClass}>{row.value}</span>
                  ) : (
                    <span className={`text-xs text-right ${row.valueClass || "text-[#001A4D]"}`}>{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submission Notes */}
          {doc.notes && (
            <div className="border border-[#E0E0E0] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <StickyNote className="w-3.5 h-3.5 text-blue-600" />
                <p className="text-blue-700 font-bold text-xs">Officer's Submission Notes</p>
              </div>
              <p className="text-[#001A4D] text-xs italic leading-relaxed">{doc.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="border border-[#E0E0E0] rounded-xl p-4">
            <p className="text-[#001A4D] font-bold text-xs mb-3">Document History</p>
            <div className="space-y-3">
              {doc.history.map((step, i) => {
                const Icon = step.icon;
                const isLast = i === doc.history.length - 1;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${step.color}`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      {!isLast && <div className={`w-px flex-1 mt-1 ${step.timestamp ? "bg-gray-300" : "bg-gray-200 border-dashed"}`} style={{ minHeight: "16px" }} />}
                    </div>
                    <div className="pb-3">
                      <p className="text-[#001A4D] text-xs font-medium">{step.label}</p>
                      {step.timestamp && <p className="text-gray-400 text-[10px]">{step.timestamp}</p>}
                      <p className="text-gray-400 text-[10px]">{step.actor}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER — Preview */}
        <div className="p-6 space-y-4 bg-gray-50">
          {/* Preview Card */}
          <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="text-[#001A4D] font-bold text-sm">Document Preview</p>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1.5 text-blue-600 text-xs hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Open Full Screen
                </button>
                <button className="flex items-center gap-1.5 text-[#001A4D] text-xs hover:underline">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </div>
            </div>

            {/* PDF Preview Area */}
            <div className="relative bg-gray-100 m-4 rounded-xl overflow-hidden" style={{ height: "600px" }}>
              {/* Simulated PDF pages */}
              <div className="absolute inset-0 flex flex-col items-center py-6 gap-4 overflow-y-auto">
                {[1, 2].map((page) => (
                  <div key={page} className="bg-white shadow-md w-[80%] rounded" style={{ minHeight: "380px", padding: "32px", transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
                    {page === 1 && (
                      <div className="space-y-4 text-[#001A4D]">
                        <div className="text-center border-b border-gray-200 pb-4 mb-4">
                          <p className="font-bold text-sm">STUDENT TECHNOLOGY INSTITUTE</p>
                          <p className="text-xs text-gray-500">STI College Ormoc · Student Affairs Services</p>
                        </div>
                        <p className="font-bold text-sm text-center">ACTIVITY LETTER</p>
                        <p className="text-xs text-gray-600 leading-relaxed">March 18, 2026</p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Dear Ma'am/Sir,
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          We, the STI Dance Company, humbly request your approval for our upcoming event, <strong>Cultural Night 2026</strong>, scheduled on April 5, 2026 at the STI Ormoc Auditorium from 5:00 PM to 9:00 PM.
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          This annual event showcases the cultural heritage and artistic talents of our student members through various dance performances, traditional music, and cultural exhibits. We expect approximately 200 attendees.
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Attached are the event timeline, budget proposal, and list of participants for your reference.
                        </p>
                        <p className="text-xs text-gray-600 mt-6">Respectfully yours,</p>
                        <div className="mt-4">
                          <div className="border-b border-gray-400 w-32 mb-1" />
                          <p className="text-xs font-bold">Ana Reyes</p>
                          <p className="text-[10px] text-gray-500">President, STI Dance Company</p>
                        </div>
                      </div>
                    )}
                    {page === 2 && (
                      <div className="space-y-3 text-[#001A4D]">
                        <p className="font-bold text-sm">EVENT DETAILS</p>
                        <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                          <div><p className="font-medium text-[#001A4D]">Event Name</p><p>Cultural Night 2026</p></div>
                          <div><p className="font-medium text-[#001A4D]">Date</p><p>April 5, 2026</p></div>
                          <div><p className="font-medium text-[#001A4D]">Venue</p><p>STI Ormoc Auditorium</p></div>
                          <div><p className="font-medium text-[#001A4D]">Time</p><p>5:00 PM – 9:00 PM</p></div>
                        </div>
                        <p className="font-bold text-xs mt-4">BUDGET BREAKDOWN</p>
                        <table className="w-full text-xs border-collapse">
                          <thead><tr className="bg-gray-100"><th className="p-2 text-left border border-gray-200">Item</th><th className="p-2 text-right border border-gray-200">Amount</th></tr></thead>
                          <tbody>
                            {[["Venue rental", "₱3,000"], ["Sound system", "₱2,500"], ["Props & costumes", "₱2,000"], ["Food for performers", "₱1,500"], ["Miscellaneous", "₱1,000"]].map(([item, amt]) => (
                              <tr key={item}><td className="p-2 border border-gray-100">{item}</td><td className="p-2 border border-gray-100 text-right">{amt}</td></tr>
                            ))}
                            <tr className="font-bold bg-gray-50"><td className="p-2 border border-gray-200">TOTAL</td><td className="p-2 border border-gray-200 text-right">₱10,000</td></tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Zoom controls */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="text-gray-500 hover:text-[#001A4D] transition-colors"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs text-gray-600 w-12 text-center">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(150, zoom + 10))} className="text-gray-500 hover:text-[#001A4D] transition-colors"><ZoomIn className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-gray-200" />
                <button onClick={() => setZoom(100)} className="text-gray-500 hover:text-[#001A4D] transition-colors"><Maximize2 className="w-3.5 h-3.5" /></button>
                <span className="text-gray-400 text-xs">Page 1 of 2</span>
              </div>
            </div>
          </div>

          {/* Annotation Bar */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <StickyNote className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 text-xs italic">Private Annotation</span>
              <input
                type="text"
                placeholder="Add a private note about this document (visible to SAS staff only)..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
              />
              <button
                onClick={() => { setSavedAnnotation(annotation); setAnnotation(""); }}
                className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Save Note
              </button>
            </div>
            {savedAnnotation && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-[#F3E8FF] rounded-lg">
                <StickyNote className="w-3.5 h-3.5 text-[#83358E] flex-shrink-0 mt-0.5" />
                <p className="text-[#001A4D] text-xs flex-1">{savedAnnotation}</p>
                <span className="text-gray-400 text-[10px]">Saved just now</span>
                <button onClick={() => setSavedAnnotation("")} className="text-gray-400 hover:text-gray-600 ml-1"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Decision Panel */}
        <div className="border-l border-[#E0E0E0] p-5 space-y-4 bg-white overflow-y-auto sticky top-[57px] h-[calc(100vh-57px)]">
          {decision ? (
            /* Decision Made */
            <div className="space-y-4">
              <div className={`p-5 rounded-2xl text-center ${decision === "approved" ? "bg-gradient-to-b from-green-500 to-green-600" : decision === "rejected" ? "bg-gradient-to-b from-red-500 to-orange-500" : "bg-gradient-to-b from-blue-600 to-blue-500"}`}>
                {decision === "approved" && <><CheckCircle className="w-10 h-10 text-white mx-auto mb-2" /><p className="text-white font-bold text-lg">Document Approved</p></>}
                {decision === "rejected" && <><X className="w-10 h-10 text-white mx-auto mb-2" /><p className="text-white font-bold text-lg">Document Rejected</p></>}
                {decision === "info" && <><HelpCircle className="w-10 h-10 text-white mx-auto mb-2" /><p className="text-white font-bold text-lg">More Info Requested</p></>}
                <p className="text-white/80 text-xs mt-1">March 18, 2026 · {new Date().toLocaleTimeString()}</p>
              </div>
              <button
                onClick={() => setDecision(null)}
                className="text-gray-400 text-xs hover:text-gray-600 transition-colors w-full text-center"
              >
                Undo Decision (available 5 min)
              </button>
              <button
                onClick={() => navigate("/home/documents")}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Next Pending Document
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-2">
                <Gavel className="w-5 h-5 text-[#001A4D]" />
                <p className="text-[#001A4D] font-bold text-base">Review Decision</p>
              </div>
              <p className="text-gray-500 text-xs">Review the document before making your decision.</p>

              {/* Summary chips */}
              <div className="space-y-2">
                {[
                  { Icon: Building2, value: doc.org },
                  { Icon: Tag, value: doc.category },
                  { Icon: Calendar, value: doc.submittedAt.split(" · ")[0] },
                ].map((chip) => (
                  <div key={chip.value} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <chip.Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{chip.value}</span>
                  </div>
                ))}
              </div>

              {/* Remarks */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-3">
                  <p className="text-[#001A4D] font-bold text-sm">Adviser Remarks</p>
                </div>
                <textarea
                  rows={7}
                  placeholder="Write your feedback, instructions, or approval remarks for the submitting officer. These will be sent with your decision."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none text-sm text-[#001A4D] leading-relaxed"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
                <p className="text-right text-gray-400 text-[10px] mt-0.5">{remarks.length} / 1000</p>
                <div className="flex items-start gap-2 mt-2 p-2 bg-[#F3E8FF] border border-[#83358E]/20 rounded-lg">
                  <Eye className="w-3 h-3 text-[#83358E] flex-shrink-0 mt-0.5" />
                  <p className="text-[#83358E] text-[10px] italic">Remarks are sent directly to the officer and stored permanently in the document record.</p>
                </div>
              </div>

              {/* Decision Buttons */}
              <div className="space-y-3">
                {/* Approve */}
                <div>
                  <button
                    onClick={() => setShowApproveModal(true)}
                    className="w-full py-3.5 bg-gradient-to-r from-green-500 to-green-400 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Approve Document
                  </button>
                  <p className="text-gray-400 text-[10px] italic text-center mt-1">Officer will be notified. Document marked as approved.</p>
                </div>

                {/* Reject */}
                <div>
                  <button
                    onClick={() => canReject && setShowRejectModal(true)}
                    disabled={!canReject}
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-[1.5px] transition-colors ${canReject ? "border-red-500 text-red-500 hover:bg-red-50" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
                  >
                    <X className="w-4 h-4" />
                    Reject Document
                  </button>
                  {!canReject && remarks.length > 0 && (
                    <p className="text-red-500 text-[10px] mt-1 text-center">Remarks must be at least 10 characters to reject.</p>
                  )}
                  <p className="text-gray-400 text-[10px] italic text-center mt-1">Officer receives your remarks and can resubmit.</p>
                </div>

                {/* Request More Info */}
                <div>
                  <button
                    onClick={handleRequestInfo}
                    className="w-full py-2.5 border border-blue-500 text-blue-600 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Request More Information
                  </button>
                  <p className="text-gray-400 text-[10px] italic text-center mt-1">Document stays in queue. Officer is notified.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showApproveModal && (
        <ApproveModal doc={doc} remarks={remarks} onClose={() => setShowApproveModal(false)} onConfirm={handleApprove} />
      )}
      {showRejectModal && (
        <RejectModal doc={doc} remarks={remarks} onClose={() => setShowRejectModal(false)} onConfirm={handleReject} />
      )}
    </div>
  );
}
