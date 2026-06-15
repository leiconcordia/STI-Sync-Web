import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Radio, Clock, CheckCircle, XCircle, Send, Building2,
  Eye, Download, Check, X, Search, Save, FileText,
  Upload, AlertCircle, ChevronDown, Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "Pending" | "Approved" | "Rejected" | "Resubmitted" | "Draft" | "Info Requested";
type AdminTab = "incoming" | "sent";

interface IncomingDoc {
  id: string;
  ref: string;
  title: string;
  org: string;
  orgType: string;
  orgInitials: string;
  category: string;
  submittedBy: string;
  fileType: "PDF" | "DOCX";
  fileSize: string;
  dateSubmitted: string;
  relativeTime: string;
  daysInQueue: number;
  status: DocStatus;
}

interface SentDoc {
  id: string;
  ref: string;
  title: string;
  category: string;
  dateSent: string;
  sentTo: string;
  orgCount: number;
  orgsOpened: number;
  fileType: "PDF" | "DOCX";
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_INCOMING: IncomingDoc[] = [
  { id: "1", ref: "DOC-2026-0092", title: "Activity Letter for Cultural Night 2026", org: "STI Dance Company", orgType: "Cultural", orgInitials: "DC", category: "Activity Letter", submittedBy: "Ana Reyes", fileType: "PDF", fileSize: "1.1 MB", dateSubmitted: "Mar 18, 2026", relativeTime: "1 day ago", daysInQueue: 1, status: "Pending" },
  { id: "2", ref: "DOC-2026-0091", title: "Event Proposal — Foundation Day 2026", org: "Supreme Student Government", orgType: "Governing", orgInitials: "SS", category: "Event Proposal", submittedBy: "Carlo Mendoza", fileType: "DOCX", fileSize: "980 KB", dateSubmitted: "Mar 18, 2026", relativeTime: "1 day ago", daysInQueue: 1, status: "Resubmitted" },
  { id: "3", ref: "DOC-2026-0089", title: "Activity Letter for IT Guild GenAss 2026", org: "STI IT Guild", orgType: "Academic", orgInitials: "IG", category: "Activity Letter", submittedBy: "Juan Dela Cruz", fileType: "PDF", fileSize: "1.2 MB", dateSubmitted: "Mar 15, 2026", relativeTime: "4 days ago", daysInQueue: 4, status: "Approved" },
  { id: "4", ref: "DOC-2026-0088", title: "Waiver Form for Sports Fest Participants", org: "STI IT Guild", orgType: "Academic", orgInitials: "IG", category: "Waiver", submittedBy: "Maria Santos", fileType: "PDF", fileSize: "845 KB", dateSubmitted: "Mar 10, 2026", relativeTime: "9 days ago", daysInQueue: 9, status: "Rejected" },
  { id: "5", ref: "DOC-2026-0086", title: "JPIA Accreditation Paper 2025–2026", org: "Junior Philippine Institute of Accountants", orgType: "Professional", orgInitials: "JP", category: "Accreditation Paper", submittedBy: "Lisa Gomez", fileType: "PDF", fileSize: "3.4 MB", dateSubmitted: "Mar 5, 2026", relativeTime: "2 weeks ago", daysInQueue: 14, status: "Pending" },
  { id: "6", ref: "DOC-2026-0083", title: "Q1 Financial Report — ROTC Corps 2026", org: "ROTC Corps", orgType: "Civic", orgInitials: "RC", category: "Financial Report", submittedBy: "Rey Castillo", fileType: "DOCX", fileSize: "2.2 MB", dateSubmitted: "Feb 28, 2026", relativeTime: "3 weeks ago", daysInQueue: 19, status: "Pending" },
];

const MOCK_SENT: SentDoc[] = [
  { id: "s1", ref: "SAS-2026-0015", title: "Updated Activity Letter Template 2026", category: "Approved Template", dateSent: "Mar 16, 2026", sentTo: "All Organizations", orgCount: 12, orgsOpened: 8, fileType: "PDF" },
  { id: "s2", ref: "SAS-2026-0014", title: "Campus Policy Memo No. 12-2026", category: "Memo", dateSent: "Mar 10, 2026", sentTo: "All Organizations", orgCount: 12, orgsOpened: 12, fileType: "PDF" },
  { id: "s3", ref: "SAS-2026-0012", title: "SAS Guidelines on Event Documentation", category: "Guidelines", dateSent: "Feb 28, 2026", sentTo: "STI IT Guild", orgCount: 1, orgsOpened: 1, fileType: "DOCX" },
];

const ORGS = [
  { name: "STI IT Guild", type: "Academic", initials: "IG" },
  { name: "Supreme Student Government", type: "Governing", initials: "SS" },
  { name: "JPIA", type: "Professional", initials: "JP" },
  { name: "ROTC Corps", type: "Civic", initials: "RC" },
  { name: "STI Dance Company", type: "Cultural", initials: "DC" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
};

function CategoryPill({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>{category}</span>;
}

function FileChip({ type }: { type: "PDF" | "DOCX" }) {
  return <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${type === "PDF" ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}>{type}</span>;
}

function StatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { cls: string; label: string }> = {
    Pending: { cls: "bg-amber-100 text-amber-700 animate-pulse", label: "Pending" },
    Approved: { cls: "bg-green-100 text-green-700", label: "Approved" },
    Rejected: { cls: "bg-red-100 text-red-700", label: "Rejected" },
    Resubmitted: { cls: "bg-blue-100 text-blue-700", label: "Resubmitted" },
    Draft: { cls: "bg-gray-100 text-gray-600", label: "Draft" },
    "Info Requested": { cls: "bg-blue-100 text-blue-700", label: "Info Requested" },
  };
  const { cls, label } = map[status];
  return <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${cls}`}>{label}</span>;
}

// ─── Quick Action Popovers ─────────────────────────────────────────────────────
function QuickApprovePopover({ doc, onClose, onApprove }: { doc: IncomingDoc; onClose: () => void; onApprove: () => void }) {
  const [remarks, setRemarks] = useState("");
  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-[#E0E0E0] rounded-xl shadow-lg z-30 overflow-hidden">
      <div className="h-8 bg-gradient-to-r from-green-500 to-green-400 flex items-center gap-2 px-3">
        <Check className="w-3.5 h-3.5 text-white" />
        <p className="text-white font-bold text-xs">Quick Approve?</p>
      </div>
      <div className="p-3 space-y-3">
        <p className="text-[#001A4D] text-xs">Approve <strong>{doc.title.slice(0, 30)}...</strong> from <strong>{doc.org}</strong>?</p>
        <textarea
          rows={3}
          placeholder="Optional approval remarks..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-gray-500 text-xs hover:text-gray-700">Cancel</button>
          <button onClick={onApprove} className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-400 text-white text-xs font-bold rounded-lg">Approve</button>
        </div>
      </div>
    </div>
  );
}

function QuickRejectPopover({ doc, onClose, onReject }: { doc: IncomingDoc; onClose: () => void; onReject: () => void }) {
  const [remarks, setRemarks] = useState("");
  const canReject = remarks.trim().length >= 10;
  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-[#E0E0E0] rounded-xl shadow-lg z-30 overflow-hidden">
      <div className="h-8 bg-gradient-to-r from-red-500 to-orange-500 flex items-center gap-2 px-3">
        <X className="w-3.5 h-3.5 text-white" />
        <p className="text-white font-bold text-xs">Quick Reject</p>
      </div>
      <div className="p-3 space-y-3">
        <p className="text-[#001A4D] text-xs"><strong>{doc.title.slice(0, 30)}...</strong> · {doc.org}</p>
        <textarea
          rows={3}
          placeholder="Rejection reason — required..."
          className={`w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none ${!canReject && remarks.length > 0 ? "border-red-400" : "border-gray-300"}`}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
        {remarks.length > 0 && !canReject && <p className="text-red-500 text-xs">Remarks must be at least 10 characters.</p>}
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-gray-500 text-xs hover:text-gray-700">Cancel</button>
          <button
            onClick={() => canReject && onReject()}
            disabled={!canReject}
            className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${canReject ? "bg-gradient-to-r from-red-500 to-orange-500" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Broadcast Modal ───────────────────────────────────────────────────────────
function BroadcastModal({ onClose }: { onClose: () => void }) {
  const [distribution, setDistribution] = useState<"all" | "specific" | "type">("all");
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [pushNotif, setPushNotif] = useState(true);
  const [inAppNotif, setInAppNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(false);
  const [broadcast, setBroadcast] = useState(false);

  const orgCount = distribution === "all" ? 12 : distribution === "specific" ? selectedOrgs.length : 5;
  const canBroadcast = title && fileUploaded && orgCount > 0;

  const toggleOrg = (name: string) => setSelectedOrgs((p) => p.includes(name) ? p.filter((o) => o !== name) : [...p, name]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-[#FFD41C]" />
            <div>
              <p className="text-white font-bold text-lg">Broadcast Document to Clubs</p>
              <p className="text-white/80 text-xs">Student Affairs Services → Student Organizations</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {broadcast ? (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 bg-gradient-to-b from-[#001A4D] to-[#0E4EBD] flex flex-col items-center justify-center p-8 text-center">
              <Radio className="w-14 h-14 text-[#FFD41C] mb-4" />
              <p className="text-white font-bold text-xl mb-1">Document Broadcast Successful!</p>
              <p className="text-white/90 text-sm mb-2">{orgCount} organizations notified.</p>
              <p className="text-[#FFD41C] font-bold font-mono text-base">SAS-2026-0016</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-white/50 text-white bg-[#001A4D] rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 transition-colors">Broadcast Another</button>
              <button onClick={onClose} className="flex-1 py-2.5 bg-[#FFD41C] text-[#001A4D] rounded-lg text-sm font-bold hover:bg-[#FFD41C]/90 transition-colors">View Sent Documents</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Section A — Document Details */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Document Details</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Title <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="e.g. Updated Activity Letter Template / Campus Policy Memo No. 12-2026" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                    <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">Select category...</option>
                      <option>Memo</option><option>Policy</option><option>Guidelines</option>
                      <option>Approved Template</option><option>Signed Approval Form</option>
                      <option>Announcement</option><option>Reminder</option><option>Report</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description / Message to Clubs</label>
                    <textarea rows={3} placeholder="Add a message to accompany this document — clubs will see this in their inbox alongside the file." className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none" />
                  </div>
                </div>
              </div>

              {/* Section B — File */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-3">
                  <p className="text-[#001A4D] font-bold text-sm">File Attachment</p>
                </div>
                {fileUploaded ? (
                  <div className="flex items-center gap-4 p-4 bg-white border-2 border-[#83358E] rounded-xl">
                    <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[#001A4D] font-bold text-sm">SAS_Activity_Letter_Template_2026.pdf</p>
                      <div className="flex items-center gap-1 mt-1"><CheckCircle className="w-3.5 h-3.5 text-green-500" /><span className="text-green-600 text-xs">Uploaded</span></div>
                    </div>
                    <button onClick={() => setFileUploaded(false)} className="text-red-500 p-1"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div onClick={() => setFileUploaded(true)} className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed border-[#83358E]/40 bg-[#F3E8FF]/40 rounded-xl cursor-pointer hover:border-[#83358E] hover:bg-[#F3E8FF] transition-colors">
                    <Upload className="w-8 h-8 text-[#83358E] mb-1" />
                    <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                    <p className="text-gray-400 text-xs italic">PDF, DOCX, XLSX, JPG, PNG · Max 50MB</p>
                  </div>
                )}
              </div>

              {/* Section C — Distribution */}
              <div>
                <div className="border-l-4 border-[#83358E] pl-3 mb-3">
                  <p className="text-[#001A4D] font-bold text-sm">Send To</p>
                </div>
                <div className="space-y-2">
                  {([
                    { key: "all", icon: Building2, label: "All Organizations", desc: "Broadcast to all 12 active student organizations", borderColor: "border-[#83358E]", bg: "bg-[#F3E8FF]" },
                    { key: "specific", icon: Building2, label: "Specific Organizations", desc: "Choose which clubs receive this document", borderColor: "border-blue-500", bg: "bg-blue-50" },
                    { key: "type", icon: Users, label: "By Organization Type", desc: "Send to all clubs of a specific type", borderColor: "border-amber-500", bg: "bg-amber-50" },
                  ] as const).map((opt) => (
                    <div key={opt.key}>
                      <button
                        onClick={() => setDistribution(opt.key)}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors ${distribution === opt.key ? `${opt.borderColor} ${opt.bg}` : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <opt.icon className={`w-5 h-5 flex-shrink-0 ${distribution === opt.key ? "text-[#83358E]" : "text-gray-400"}`} />
                        <div>
                          <p className="text-[#001A4D] font-bold text-sm">{opt.label}</p>
                          <p className="text-gray-500 text-xs">{opt.desc}</p>
                        </div>
                      </button>
                      {opt.key === "specific" && distribution === "specific" && (
                        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                          <div className="px-3 py-2 border-b border-gray-100">
                            <input type="text" placeholder="Search organization name..." className="w-full text-sm border-none outline-none" />
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {ORGS.map((org) => (
                              <label key={org.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={selectedOrgs.includes(org.name)} onChange={() => toggleOrg(org.name)} className="accent-[#83358E]" />
                                <div className="w-7 h-7 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{org.initials}</div>
                                <div>
                                  <p className="text-sm text-[#001A4D] font-medium">{org.name}</p>
                                  <p className="text-xs text-gray-400">{org.type}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                          {selectedOrgs.length > 0 && (
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                              <span className="text-[#83358E] text-xs font-medium">{selectedOrgs.length} organizations selected</span>
                              <button onClick={() => setSelectedOrgs([])} className="text-gray-400 text-xs hover:text-gray-600">Clear All</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notification Settings */}
              <div className="space-y-2">
                {[
                  { label: "Send Push Notification to Officers", desc: "Officers receive an immediate push notification.", state: pushNotif, toggle: () => setPushNotif(!pushNotif) },
                  { label: "Send In-App Notification", desc: "Appears in officers' notification bell.", state: inAppNotif, toggle: () => setInAppNotif(!inAppNotif) },
                  { label: "Send Email Notification", desc: "Email sent to registered officer email addresses.", state: emailNotif, toggle: () => setEmailNotif(!emailNotif) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                    <button onClick={item.toggle} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${item.state ? "bg-[#83358E]" : "bg-gray-300"}`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${item.state ? "translate-x-6" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="p-3 bg-[#F3E8FF] border border-[#83358E]/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-[#83358E]" />
                  <p className="text-[#83358E] font-bold text-xs">Broadcast Preview</p>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                  <div className="w-6 h-6 bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">RL</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#001A4D] font-bold text-xs truncate">{title || "Document Title"}</p>
                    <p className="text-gray-400 text-[10px]">SAS Admin · Ms. R. Lucanas · Just now</p>
                  </div>
                  {category && <CategoryPill category={category} />}
                  <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
              <button className="flex items-center gap-2 px-4 py-2 border border-[#83358E] text-[#83358E] rounded-lg text-sm font-medium hover:bg-[#83358E]/5 transition-colors">
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                onClick={() => canBroadcast && setBroadcast(true)}
                disabled={!canBroadcast}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors ${canBroadcast ? "bg-[#001A4D] text-[#FFD41C] hover:bg-[#001A4D]/90" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
              >
                <Radio className="w-4 h-4" />
                Broadcast to {orgCount} Organization{orgCount !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Incoming Queue Tab ────────────────────────────────────────────────────────
function IncomingQueueTab() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<string, DocStatus>>({});
  const [approvePopover, setApprovePopover] = useState<string | null>(null);
  const [rejectPopover, setRejectPopover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("All");

  const getStatus = (doc: IncomingDoc) => statuses[doc.id] || doc.status;
  const pending = MOCK_INCOMING.filter((d) => getStatus(d) === "Pending" || getStatus(d) === "Resubmitted");
  const filtered = statusFilter === "All" ? MOCK_INCOMING : MOCK_INCOMING.filter((d) => getStatus(d) === statusFilter);

  const handleApprove = (id: string) => { setStatuses((p) => ({ ...p, [id]: "Approved" })); setApprovePopover(null); };
  const handleReject = (id: string) => { setStatuses((p) => ({ ...p, [id]: "Rejected" })); setRejectPopover(null); };
  const toggleSelect = (id: string) => setSelected((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search document title, org name, or reference..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
        </div>
        <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
          <option>All Organizations</option>
          {ORGS.map((o) => <option key={o.name}>{o.name}</option>)}
        </select>
        <div className="flex gap-1">
          {["All", "Pending", "Approved", "Rejected", "Resubmitted"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? "bg-[#001A4D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{s}</button>
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
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="accent-[#83358E]" onChange={(e) => setSelected(e.target.checked ? MOCK_INCOMING.map((d) => d.id) : [])} />
                </th>
                {["Reference #", "Document Title", "Organization", "Category", "Submitted By", "Date Submitted", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const status = getStatus(doc);
                const isPending = status === "Pending" || status === "Resubmitted";
                return (
                  <tr
                    key={doc.id}
                    className={`border-b border-[#E0E0E0] hover:bg-[#F3E8FF]/20 transition-colors group ${isPending ? "border-l-4 border-l-[#FFD41C]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggleSelect(doc.id)} className="accent-[#83358E]" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isPending && <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse flex-shrink-0" />}
                        {doc.ref}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-[#001A4D] font-bold text-sm leading-tight">{doc.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <FileChip type={doc.fileType} />
                        <span className="text-gray-400 text-xs">{doc.fileSize}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{doc.orgInitials}</div>
                        <div>
                          <p className="text-[#001A4D] text-xs font-medium leading-tight">{doc.org}</p>
                          <p className="text-gray-400 text-[10px]">{doc.orgType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CategoryPill category={doc.category} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-[#F3E8FF] rounded-full flex items-center justify-center text-[#83358E] text-[10px] font-bold flex-shrink-0">{doc.submittedBy.split(" ").map((n) => n[0]).join("")}</div>
                        <div>
                          <p className="text-gray-600 text-xs">{doc.submittedBy}</p>
                          <span className="px-1 py-0.5 bg-[#F3E8FF] text-[#83358E] text-[9px] rounded font-medium">Officer</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-600 text-xs">{doc.dateSubmitted}</p>
                      <p className="text-gray-400 text-[10px] italic">{doc.relativeTime}</p>
                      {isPending && doc.daysInQueue > 2 && (
                        <p className="text-amber-600 text-[10px] italic">{doc.daysInQueue} days in queue</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 relative">
                        <button
                          onClick={() => navigate(`/home/documents/${doc.id}/review`)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                          title="Review Document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-[#001A4D] transition-colors"><Download className="w-4 h-4" /></button>
                        {status === "Pending" && (
                          <>
                            <button
                              onClick={() => { setApprovePopover(approvePopover === doc.id ? null : doc.id); setRejectPopover(null); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setRejectPopover(rejectPopover === doc.id ? null : doc.id); setApprovePopover(null); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {approvePopover === doc.id && (
                          <QuickApprovePopover doc={doc} onClose={() => setApprovePopover(null)} onApprove={() => handleApprove(doc.id)} />
                        )}
                        {rejectPopover === doc.id && (
                          <QuickRejectPopover doc={doc} onClose={() => setRejectPopover(null)} onReject={() => handleReject(doc.id)} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3 bg-[#001A4D] rounded-2xl shadow-2xl z-20">
          <p className="text-white text-sm font-medium">{selected.length} documents selected</p>
          <button className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-400 text-white text-xs font-bold rounded-lg">Approve Selected</button>
          <button className="px-4 py-2 border border-white/30 text-white text-xs rounded-lg hover:bg-white/10 transition-colors">Export Selected</button>
          <button onClick={() => setSelected([])} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

// ─── Sent Tab ──────────────────────────────────────────────────────────────────
function SentTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search sent documents..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
        </div>
        <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option>All Categories</option></select>
      </div>
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-[#E0E0E0]">
            <tr>
              {["Reference #", "Document Title", "Category", "Date Sent", "Sent To", "Read By", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_SENT.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{doc.ref}</td>
                <td className="px-4 py-3">
                  <p className="text-[#001A4D] font-bold text-sm">{doc.title}</p>
                  <div className="flex items-center gap-1.5 mt-1"><FileChip type={doc.fileType} /></div>
                </td>
                <td className="px-4 py-3"><CategoryPill category={doc.category} /></td>
                <td className="px-4 py-3 text-gray-600 text-sm">{doc.dateSent}</td>
                <td className="px-4 py-3">
                  {doc.sentTo === "All Organizations" ? (
                    <span className="px-2 py-0.5 bg-[#001A4D]/10 text-[#001A4D] text-xs rounded-full font-medium">All Organizations ({doc.orgCount})</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">{doc.sentTo}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(doc.orgsOpened, 4) }).map((_, i) => (
                      <div key={i} className="w-6 h-6 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold -ml-1 first:ml-0 border border-white">
                        {String.fromCharCode(65 + i)}
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">{doc.orgsOpened} of {doc.orgCount} orgs opened</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-50 text-[#001A4D] transition-colors"><Download className="w-3.5 h-3.5" /></button>
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#001A4D]/5 text-[#001A4D] transition-colors"><Send className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function AdminDocuments() {
  const [tab, setTab] = useState<AdminTab>("incoming");
  const [showBroadcast, setShowBroadcast] = useState(false);

  const pendingCount = MOCK_INCOMING.filter((d) => d.status === "Pending" || d.status === "Resubmitted").length;
  const approvedCount = MOCK_INCOMING.filter((d) => d.status === "Approved").length;
  const rejectedCount = MOCK_INCOMING.filter((d) => d.status === "Rejected").length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Document Management</h2>
          <p className="text-gray-500 text-sm">Dashboard &rsaquo; Document Management</p>
        </div>
        <button
          onClick={() => setShowBroadcast(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#001A4D] text-[#FFD41C] rounded-lg font-bold text-sm hover:bg-[#001A4D]/90 transition-colors"
        >
          <Radio className="w-4 h-4" />
          Broadcast Document to Clubs
        </button>
      </div>

      {/* Context banner */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] rounded-2xl">
        <div className="flex items-center gap-4">
          <FileText className="w-8 h-8 text-[#FFD41C]" />
          <div>
            <p className="text-white font-bold text-base">Electronic Document Management System</p>
            <p className="text-white/80 text-sm leading-relaxed">Centralized document routing between Student Organizations and the Student Affairs Services. Review incoming submissions and broadcast official documents to clubs.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-xl">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-white text-xs font-medium">{pendingCount} Pending Review</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-xl">
            <Send className="w-4 h-4 text-blue-300" />
            <span className="text-white text-xs font-medium">{MOCK_SENT.length} Sent This Semester</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Pending Documents", value: pendingCount, note: "requires your review", gradient: "from-amber-500 to-amber-400", Icon: Clock, pulse: pendingCount > 0 },
          { label: "Approved This Semester", value: approvedCount, note: "+2 this week", gradient: "from-green-500 to-green-400", Icon: CheckCircle },
          { label: "Rejected", value: rejectedCount, note: "awaiting resubmission", gradient: "from-red-500 to-orange-400", Icon: XCircle },
          { label: "Broadcast to Clubs", value: MOCK_SENT.length, note: "sent by SAS this semester", gradient: "from-blue-600 to-blue-400", Icon: Radio },
          { label: "Organizations Submitting", value: 4, note: "active submitters", gradient: "from-[#001A4D] to-[#0E4EBD]", Icon: Building2 },
        ].map((card) => (
          <div key={card.label} className={`bg-gradient-to-br ${card.gradient} rounded-xl p-4 text-white relative`}>
            {card.pulse && <span className="absolute top-3 right-3 w-2 h-2 bg-white rounded-full animate-ping" />}
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mb-3">
              <card.Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-3xl font-bold mb-0.5">{card.value}</p>
            <p className="text-white/90 text-xs">{card.label}</p>
            <p className="text-white/70 text-[10px] mt-0.5">{card.note}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([["incoming", "Incoming Queue"], ["sent", "Sent to Clubs"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? "bg-[#001A4D] text-white border-[#FFD41C] -mb-px rounded-t-lg" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {label}
            {key === "incoming" && pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "incoming" ? <IncomingQueueTab /> : <SentTab />}

      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
    </div>
  );
}
