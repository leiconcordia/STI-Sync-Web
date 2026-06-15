import { useState } from "react";
import {
  Upload, Clock, CheckCircle, XCircle, Mail, ArrowUp, ArrowDown,
  Eye, Download, RefreshCw, Trash2, Search, Send, Save,
  FileText, X, MessageSquare, ChevronDown, ChevronUp,
  Mailbox, EyeOff, BellOff, Hash, Tag, Calendar, Building,
  File, StickyNote, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "Pending" | "Approved" | "Rejected" | "Resubmitted" | "Draft";
type MainTab = "submissions" | "inbox";

interface Submission {
  id: string;
  ref: string;
  title: string;
  category: string;
  fileType: "PDF" | "DOCX";
  fileSize: string;
  dateSubmitted: string;
  relativeTime: string;
  lastUpdated: string;
  status: DocStatus;
  remarks: string | null;
  notes: string;
}

interface InboxDoc {
  id: string;
  title: string;
  fileType: "PDF" | "DOCX";
  fileSize: string;
  sentBy: string;
  category: string;
  dateSent: string;
  relativeTime: string;
  forType: "org" | "all";
  read: boolean;
  readDate?: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_SUBMISSIONS: Submission[] = [
  { id: "1", ref: "DOC-2026-0089", title: "Activity Letter for IT Guild GenAss 2026", category: "Activity Letter", fileType: "PDF", fileSize: "1.2 MB", dateSubmitted: "Mar 15, 2026", relativeTime: "3 days ago", lastUpdated: "Mar 17, 2026", status: "Approved", remarks: "Approved. Well-prepared activity letter. Please submit the post-event report within 5 days.", notes: "Please review ASAP, event is in 2 weeks." },
  { id: "2", ref: "DOC-2026-0088", title: "Waiver Form for Sports Fest Participants", category: "Waiver", fileType: "PDF", fileSize: "845 KB", dateSubmitted: "Mar 10, 2026", relativeTime: "8 days ago", lastUpdated: "Mar 12, 2026", status: "Rejected", remarks: "The waiver form is missing the required legal disclaimer on page 2. Please revise and resubmit.", notes: "" },
  { id: "3", ref: "DOC-2026-0085", title: "Q1 Financial Report 2026", category: "Financial Report", fileType: "DOCX", fileSize: "2.1 MB", dateSubmitted: "Mar 1, 2026", relativeTime: "2 weeks ago", lastUpdated: "Mar 1, 2026", status: "Pending", remarks: null, notes: "First quarter financial summary for SAS review." },
  { id: "4", ref: "DOC-2026-0082", title: "Certificate Request — IT Symposium Speakers", category: "Certificate Request", fileType: "PDF", fileSize: "512 KB", dateSubmitted: "Feb 20, 2026", relativeTime: "1 month ago", lastUpdated: "Feb 22, 2026", status: "Approved", remarks: null, notes: "" },
  { id: "5", ref: "DOC-2026-0079", title: "Accreditation Paper 2025–2026", category: "Accreditation Paper", fileType: "PDF", fileSize: "3.4 MB", dateSubmitted: "Feb 10, 2026", relativeTime: "5 weeks ago", lastUpdated: "Feb 10, 2026", status: "Draft", remarks: null, notes: "Incomplete — still gathering officer signatures." },
  { id: "6", ref: "DOC-2026-0091", title: "Event Proposal — Foundation Day 2026", category: "Event Proposal", fileType: "DOCX", fileSize: "980 KB", dateSubmitted: "Mar 18, 2026", relativeTime: "Just now", lastUpdated: "Mar 18, 2026", status: "Resubmitted", remarks: null, notes: "Corrected venue details as requested." },
];

const MOCK_INBOX: InboxDoc[] = [
  { id: "i1", title: "Updated Activity Letter Template 2026", fileType: "PDF", fileSize: "245 KB", sentBy: "Ms. R. Lucanas", category: "Approved Template", dateSent: "Mar 16, 2026", relativeTime: "2 days ago", forType: "all", read: false },
  { id: "i2", title: "Campus Policy Memo No. 12-2026", fileType: "PDF", fileSize: "1.1 MB", sentBy: "Ms. R. Lucanas", category: "Memo", dateSent: "Mar 10, 2026", relativeTime: "8 days ago", forType: "all", read: true, readDate: "Mar 11, 2026" },
  { id: "i3", title: "SAS Guidelines on Event Documentation", fileType: "DOCX", fileSize: "890 KB", sentBy: "Ms. R. Lucanas", category: "Guidelines", dateSent: "Feb 28, 2026", relativeTime: "3 weeks ago", forType: "org", read: true, readDate: "Mar 1, 2026" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "Activity Letter": "bg-[#F3E8FF] text-[#83358E]",
  "Accreditation Paper": "bg-blue-100 text-blue-700",
  "Waiver": "bg-amber-100 text-amber-700",
  "Financial Report": "bg-green-100 text-green-700",
  "Event Proposal": "bg-[#001A4D]/10 text-[#001A4D]",
  "Certificate Request": "bg-teal-100 text-teal-700",
  "Memorandum": "bg-gray-100 text-gray-600",
  "Approved Template": "bg-green-100 text-green-700",
  "Memo": "bg-gray-100 text-gray-600",
  "Guidelines": "bg-blue-100 text-blue-700",
  "Policy": "bg-[#001A4D]/10 text-[#001A4D]",
};

function CategoryPill({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>{category}</span>;
}

function FileChip({ type }: { type: "PDF" | "DOCX" }) {
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${type === "PDF" ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}>
      {type}
    </span>
  );
}

function StatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    Pending: { cls: "bg-amber-500 text-white", icon: <Clock className="w-3 h-3" />, label: "Pending Review" },
    Approved: { cls: "bg-green-500 text-white", icon: <CheckCircle className="w-3 h-3" />, label: "Approved" },
    Rejected: { cls: "bg-red-500 text-white", icon: <XCircle className="w-3 h-3" />, label: "Rejected" },
    Resubmitted: { cls: "bg-blue-600 text-white", icon: <RefreshCw className="w-3 h-3" />, label: "Resubmitted" },
    Draft: { cls: "bg-gray-400 text-white", icon: <FileText className="w-3 h-3" />, label: "Draft" },
  };
  const { cls, icon, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ─── Submit Document Modal ─────────────────────────────────────────────────────
function SubmitDocModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [fileUploaded, setFileUploaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const canSubmit = title.trim() && category && fileUploaded;

  const handleFakeUpload = () => {
    setFileName("IT_Guild_Activity_Letter.pdf");
    setFileUploaded(true);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#83358E] to-[#5B1F6B] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg">Submit Document to SAS</p>
              <p className="text-white/80 text-xs">Student Affairs Services — STI College Ormoc</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          /* Success State */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 bg-gradient-to-b from-green-500 to-green-600 flex flex-col items-center justify-center p-8 text-center">
              <CheckCircle className="w-14 h-14 text-white mb-4" />
              <p className="text-white font-bold text-xl mb-1">Document Submitted Successfully!</p>
              <p className="text-[#FFD41C] font-bold text-base font-mono mb-2">DOC-2026-0090</p>
              <p className="text-white/90 text-sm">The SAS Adviser has been notified and will review your submission.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-[#83358E] text-[#83358E] rounded-lg text-sm font-medium hover:bg-[#83358E]/5 transition-colors">
                Submit Another
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 bg-[#001A4D] text-[#FFD41C] rounded-lg text-sm font-bold hover:bg-[#001A4D]/90 transition-colors">
                View My Submissions
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Document Details */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Document Details</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Document Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={150}
                      placeholder="e.g. Activity Letter for IT Guild GenAss 2026"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent text-sm"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <p className="text-right text-xs text-gray-400 mt-0.5">{title.length}/150</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent text-sm"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">Select document category...</option>
                      <option>Activity Letter</option>
                      <option>Accreditation Paper</option>
                      <option>Waiver / Permission Slip</option>
                      <option>Financial Report</option>
                      <option>Event Proposal</option>
                      <option>Certificate Request</option>
                      <option>Memorandum / Official Letter</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Academic Year <span className="text-red-500">*</span></label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent text-sm">
                        <option>A.Y. 2025–2026</option>
                        <option>A.Y. 2026–2027</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Semester <span className="text-red-500">*</span></label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent text-sm">
                        <option>2nd Semester</option>
                        <option>1st Semester</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Submission Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Add any context or instructions for the SAS Adviser reviewing this document... (optional)"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none text-sm"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-0.5">These notes are visible to the SAS Adviser during review.</p>
                  </div>
                </div>
              </div>

              {/* File Attachment */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Attach Document</p>
                </div>

                {fileUploaded ? (
                  <div className="flex items-center gap-4 p-4 bg-white border-2 border-[#83358E] rounded-xl">
                    <div className="w-14 h-14 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#001A4D] font-bold text-sm truncate">{fileName}</p>
                      <p className="text-gray-400 text-xs">1.2 MB</p>
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-green-600 text-xs font-medium">Ready to submit</span>
                      </div>
                    </div>
                    <button onClick={() => { setFileUploaded(false); setFileName(""); }} className="text-red-500 hover:text-red-700 p-1.5">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={handleFakeUpload}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); handleFakeUpload(); }}
                    className={`w-full h-[140px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragging ? "border-[#83358E] bg-[#F3E8FF]" : "border-[#83358E]/50 bg-[#F3E8FF]/50 hover:border-[#83358E] hover:bg-[#F3E8FF]"}`}
                  >
                    <Upload className="w-12 h-12 text-[#83358E] mb-2" />
                    <p className="text-[#001A4D] font-bold text-sm">Drag and drop your file here</p>
                    <p className="text-gray-500 text-xs mb-1">or</p>
                    <span className="text-[#83358E] text-sm underline cursor-pointer">Browse Files</span>
                    <p className="text-gray-400 text-xs italic mt-2">Accepted: PDF, DOCX, DOC · Maximum file size: 25MB</p>
                  </div>
                )}
              </div>

              {/* Reference Preview */}
              {canSubmit && (
                <div className="flex items-center gap-3 p-3 bg-[#F3E8FF] border border-[#83358E]/30 rounded-xl">
                  <FileText className="w-4 h-4 text-[#83358E] flex-shrink-0" />
                  <div>
                    <p className="text-[#83358E] text-xs">Your submission reference will be:</p>
                    <p className="text-[#FFD41C] font-bold font-mono text-sm" style={{ color: "#83358E" }}>DOC-2026-0090</p>
                    <p className="text-gray-400 text-xs italic">This reference number will be used to track your document.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
              <button className="flex items-center gap-2 px-4 py-2 border border-[#83358E] text-[#83358E] rounded-lg text-sm font-medium hover:bg-[#83358E]/5 transition-colors">
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors ${canSubmit ? "bg-[#83358E] text-white hover:bg-[#6D2A78]" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
              >
                <Send className="w-4 h-4" />
                Submit to SAS
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Resubmit Modal ────────────────────────────────────────────────────────────
function ResubmitModal({ doc, onClose }: { doc: Submission; onClose: () => void }) {
  const [changes, setChanges] = useState("");
  const [fileUploaded, setFileUploaded] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-[#83358E] to-[#5B1F6B] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-white" />
            <div>
              <p className="text-white font-bold text-base">Resubmit Document</p>
              <p className="text-white/80 text-xs">Addressing SAS Feedback</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Rejection reason */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-red-600" />
              <p className="text-red-600 font-bold text-xs">Rejection Reason</p>
            </div>
            <p className="text-[#001A4D] text-sm italic">{doc.remarks}</p>
            <p className="text-gray-400 text-xs mt-1">Submitted {doc.dateSubmitted} by Ms. R. Lucanas</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              What Changed? <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe what you changed or corrected in the new version... (required)"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none text-sm"
              value={changes}
              onChange={(e) => setChanges(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-0.5">This message is sent to the SAS Adviser alongside your resubmission.</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Upload Corrected Document</p>
            {fileUploaded ? (
              <div className="flex items-center gap-3 p-3 bg-white border-2 border-[#83358E] rounded-xl">
                <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[#001A4D] font-medium text-sm">corrected_waiver_v2.pdf</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    <span className="text-green-600 text-xs">Ready</span>
                  </div>
                </div>
                <button onClick={() => setFileUploaded(false)} className="text-red-500 p-1"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div
                onClick={() => setFileUploaded(true)}
                className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed border-[#83358E]/50 bg-[#F3E8FF]/50 rounded-xl cursor-pointer hover:border-[#83358E] hover:bg-[#F3E8FF] transition-colors"
              >
                <Upload className="w-8 h-8 text-[#83358E] mb-1" />
                <p className="text-sm text-gray-600">Click to upload corrected document</p>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <p className="text-amber-700 text-xs">The original rejected file is preserved for records. Only upload the corrected version.</p>
            </div>
          </div>

          <div className="flex gap-2">
            <span className="px-2.5 py-1 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">{doc.title.slice(0, 30)}...</span>
            <CategoryPill category={doc.category} />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button
            disabled={!changes.trim() || !fileUploaded}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${changes.trim() && fileUploaded ? "bg-[#83358E] text-white hover:bg-[#6D2A78]" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            <Send className="w-4 h-4" />
            Submit Corrected Document
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row Expansion ────────────────────────────────────────────────────────────
function ExpandedRow({ doc }: { doc: Submission }) {
  const steps = [
    { label: "Submitted to SAS", done: true, color: "bg-blue-600" },
    { label: "Under Review", done: doc.status !== "Pending", color: "bg-amber-500" },
    { label: doc.status === "Approved" ? "Approved" : doc.status === "Rejected" ? "Rejected" : "Decision Pending", done: doc.status === "Approved" || doc.status === "Rejected", color: doc.status === "Approved" ? "bg-green-500" : "bg-red-500" },
  ];

  return (
    <tr className="bg-[#F3E8FF]/30">
      <td colSpan={8} className="px-6 py-4">
        <div className="flex gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${doc.fileType === "PDF" ? "bg-red-500" : "bg-blue-600"}`}>
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-[#001A4D] font-bold text-sm">{doc.title}</p>
              <p className="text-gray-400 text-xs">{doc.fileSize} · {doc.fileType}</p>
            </div>
          </div>
          {doc.notes && (
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-500 mb-1">Submission Notes</p>
              <p className="text-[#001A4D] text-sm italic">{doc.notes}</p>
            </div>
          )}
          {doc.remarks && (
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-500 mb-1">SAS Remarks</p>
              <p className={`text-sm ${doc.status === "Rejected" ? "text-red-700" : "text-green-700"}`}>{doc.remarks}</p>
            </div>
          )}
          <div className="flex-shrink-0">
            <p className="text-xs font-medium text-gray-500 mb-2">Timeline</p>
            <div className="flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? s.color : "bg-gray-200"}`}>
                    {s.done && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-xs ${s.done ? "text-[#001A4D]" : "text-gray-400"} whitespace-nowrap`}>{s.label}</span>
                  {i < steps.length - 1 && <div className={`w-6 h-px ${s.done ? "bg-gray-400" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── My Submissions Tab ────────────────────────────────────────────────────────
function SubmissionsTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resubmitDoc, setResubmitDoc] = useState<Submission | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const statuses: DocStatus[] = ["Pending", "Approved", "Rejected", "Resubmitted", "Draft"];
  const filtered = statusFilter === "All" ? MOCK_SUBMISSIONS : MOCK_SUBMISSIONS.filter((d) => d.status === statusFilter);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by document title or reference..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
        </div>
        <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
          <option>All Categories</option>
          <option>Activity Letter</option>
          <option>Accreditation Paper</option>
          <option>Waiver</option>
          <option>Financial Report</option>
          <option>Event Proposal</option>
        </select>
        <div className="flex gap-1">
          {["All", ...statuses].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? "bg-[#001A4D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-xs ml-auto">Showing {filtered.length} documents</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-[#E0E0E0]">
              <tr>
                {["Reference #", "Document Title", "Category", "Date Submitted", "Last Updated", "Status", "SAS Remarks", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <>
                  <tr
                    key={doc.id}
                    className="border-b border-[#E0E0E0] hover:bg-[#F3E8FF]/30 transition-colors cursor-pointer group"
                    onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {doc.status === "Pending" && <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse flex-shrink-0" />}
                        {doc.ref}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <p className="text-[#001A4D] font-bold text-sm leading-tight">{doc.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <FileChip type={doc.fileType} />
                        <span className="text-gray-400 text-xs">{doc.fileSize}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CategoryPill category={doc.category} /></td>
                    <td className="px-4 py-3">
                      <p className="text-gray-600 text-sm">{doc.dateSubmitted}</p>
                      <p className="text-gray-400 text-xs italic">{doc.relativeTime}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">{doc.lastUpdated}</td>
                    <td className="px-4 py-3"><StatusPill status={doc.status} /></td>
                    <td className="px-4 py-3">
                      {doc.remarks === null ? (
                        <span className="text-gray-400 text-sm italic">—</span>
                      ) : doc.status === "Approved" ? (
                        <button className="flex items-center gap-1 text-green-600 text-xs font-medium hover:underline">
                          <MessageSquare className="w-3.5 h-3.5" /> View
                        </button>
                      ) : (
                        <button className="flex items-center gap-1 text-red-600 text-xs font-medium underline">
                          <MessageSquare className="w-3.5 h-3.5" /> View Reason
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-[#001A4D] transition-colors"><Download className="w-4 h-4" /></button>
                        {(doc.status === "Rejected" || doc.status === "Draft") && (
                          <button onClick={() => setResubmitDoc(doc)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F3E8FF] text-[#83358E] transition-colors"><RefreshCw className="w-4 h-4" /></button>
                        )}
                        {doc.status === "Draft" && (
                          <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        )}
                        {expanded === doc.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </td>
                  </tr>
                  {expanded === doc.id && <ExpandedRow key={`exp-${doc.id}`} doc={doc} />}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-gray-400 text-xs">Showing 1–6 of 6 submissions</p>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-[#E0E0E0] rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors">Previous</button>
            <button className="px-3 py-1.5 border border-[#E0E0E0] rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors">Next</button>
          </div>
        </div>
      </div>

      {resubmitDoc && <ResubmitModal doc={resubmitDoc} onClose={() => setResubmitDoc(null)} />}
    </div>
  );
}

// ─── Inbox Tab ─────────────────────────────────────────────────────────────────
function InboxTab() {
  const unreadCount = MOCK_INBOX.filter((d) => !d.read).length;

  return (
    <div className="space-y-4">
      {/* Context card */}
      <div className="flex items-start justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-700 font-bold text-sm mb-0.5">Official Documents from SAS</p>
            <p className="text-gray-700 text-sm">These are official memos, guidelines, approved forms, and files sent directly to your organization by the Student Affairs Services.</p>
          </div>
        </div>
        <button className="text-blue-600 text-xs font-medium hover:underline whitespace-nowrap ml-4">Mark All as Read</button>
      </div>

      {/* Filter */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search documents from SAS..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
        </div>
        <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
          <option>All Categories</option>
          <option>Memo</option>
          <option>Policy</option>
          <option>Guidelines</option>
          <option>Approved Template</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" className="accent-[#83358E]" />
          Show Unread Only
        </label>
      </div>

      {/* Table */}
      {MOCK_INBOX.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E0E0E0] rounded-2xl">
          <Mailbox className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-[#001A4D] font-bold text-lg mb-1">Your inbox is empty</p>
          <p className="text-gray-500 text-sm">Documents sent to your organization by the SAS will appear here.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-[#E0E0E0]">
                <tr>
                  {["Document Title", "Sent By", "Category", "Date Sent", "For", "Opened", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {MOCK_INBOX.map((doc) => (
                  <tr key={doc.id} className={`hover:bg-gray-50 transition-colors group ${!doc.read ? "bg-blue-50/50" : ""}`}>
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-start gap-2">
                        {!doc.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                        <div>
                          <p className="text-[#001A4D] font-bold text-sm leading-tight">{doc.title}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <FileChip type={doc.fileType} />
                            <span className="text-gray-400 text-xs">{doc.fileSize}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] rounded-full flex items-center justify-center text-white text-xs font-bold">RL</div>
                        <span className="text-gray-500 text-xs">{doc.sentBy}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CategoryPill category={doc.category} /></td>
                    <td className="px-4 py-3">
                      <p className="text-gray-600 text-sm">{doc.dateSent}</p>
                      <p className="text-gray-400 text-xs italic">{doc.relativeTime}</p>
                    </td>
                    <td className="px-4 py-3">
                      {doc.forType === "org" ? (
                        <span className="px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">Your Organization</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-[#001A4D]/10 text-[#001A4D] text-xs rounded-full font-medium">All Organizations</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {doc.read ? (
                        <div className="flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-green-500" />
                          <span className="text-gray-400 text-xs">{doc.readDate}</span>
                        </div>
                      ) : (
                        <EyeOff className="w-4 h-4 text-amber-500" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-[#001A4D] transition-colors"><Download className="w-4 h-4" /></button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 transition-colors"><BellOff className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function OfficerDocuments() {
  const [tab, setTab] = useState<MainTab>("submissions");
  const [showSubmit, setShowSubmit] = useState(false);

  const pendingCount = MOCK_SUBMISSIONS.filter((d) => d.status === "Pending").length;
  const approvedCount = MOCK_SUBMISSIONS.filter((d) => d.status === "Approved").length;
  const rejectedCount = MOCK_SUBMISSIONS.filter((d) => d.status === "Rejected").length;
  const unreadInbox = MOCK_INBOX.filter((d) => !d.read).length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Documents</h2>
          <p className="text-gray-500 text-sm">Dashboard &rsaquo; Documents</p>
        </div>
        <button
          onClick={() => setShowSubmit(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#83358E] text-white rounded-lg font-bold text-sm hover:bg-[#6D2A78] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Submit Document
        </button>
      </div>

      {/* Context Banner */}
      <div className="flex items-center justify-between p-4 bg-[#F3E8FF] border border-[#83358E]/30 rounded-2xl">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-[#83358E]" />
          <div>
            <p className="text-[#83358E] font-bold text-sm">Electronic Document Management System</p>
            <p className="text-[#001A4D] text-xs leading-relaxed">Submit documents to the SAS for approval and receive official files, memos, and guidelines directly from the Student Affairs Services.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#83358E]/30 rounded-lg">
            <ArrowUp className="w-3.5 h-3.5 text-[#83358E]" />
            <span className="text-[#001A4D] text-xs font-medium">{MOCK_SUBMISSIONS.length} Submitted</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#83358E]/30 rounded-lg">
            <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[#001A4D] text-xs font-medium">{MOCK_INBOX.length} Received from SAS</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Pending Review", value: pendingCount, note: "awaiting SAS decision", color: "text-amber-500", Icon: Clock },
          { label: "Approved", value: approvedCount, note: "this semester", color: "text-green-600", Icon: CheckCircle },
          { label: "Rejected", value: rejectedCount, note: "require resubmission", color: "text-red-600", Icon: XCircle },
          { label: "From SAS (Unread)", value: unreadInbox, note: "new documents from SAS", color: "text-blue-600", Icon: Mail, pulse: unreadInbox > 0 },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-gray-500 text-xs">{card.label}</p>
              <div className="relative">
                <card.Icon className={`w-5 h-5 ${card.color}`} />
                {card.pulse && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
              </div>
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-gray-400 text-xs mt-1">{card.note}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([["submissions", "My Submissions"], ["inbox", "From SAS — Inbox"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? "bg-[#001A4D] text-white border-[#83358E] -mb-px rounded-t-lg" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {label}
            {key === "inbox" && unreadInbox > 0 && (
              <span className="ml-2 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{unreadInbox}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "submissions" ? <SubmissionsTab /> : <InboxTab />}

      {showSubmit && <SubmitDocModal onClose={() => setShowSubmit(false)} />}
    </div>
  );
}
