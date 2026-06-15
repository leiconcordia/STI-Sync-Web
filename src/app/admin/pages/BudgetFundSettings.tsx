import { useState } from "react";
import {
  Plus,
  Building2,
  Info,
  Eye,
  Edit,
  Archive,
  X,
  Save,
  Tag,
  Wallet,
  ChevronDown,
  AlertTriangle,
  Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrgAllocation {
  id: string;
  name: string;
  type: string;
  initials: string;
  ceiling: number;
  requested: number;
  approved: number;
}

interface BudgetCategory {
  id: string;
  name: string;
  description: string;
  limit: number | null;
  appliesTo: string;
  overspendAction: "Block" | "Warn" | "Allow";
  isDefault: boolean;
  active: boolean;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_ORGS: OrgAllocation[] = [
  { id: "1", name: "STI IT Guild", type: "Academic", initials: "IG", ceiling: 25000, requested: 24500, approved: 22000 },
  { id: "2", name: "Junior Philippine Institute of Accountants", type: "Professional", initials: "JP", ceiling: 20000, requested: 18000, approved: 17500 },
  { id: "3", name: "Supreme Student Government", type: "Governing", initials: "SS", ceiling: 30000, requested: 30000, approved: 28000 },
  { id: "4", name: "ROTC Corps", type: "Civic", initials: "RC", ceiling: 15000, requested: 12000, approved: 12000 },
  { id: "5", name: "Dance Company", type: "Cultural", initials: "DC", ceiling: 10000, requested: 9800, approved: 9000 },
];

const MOCK_CATEGORIES: BudgetCategory[] = [
  { id: "1", name: "Venue & Facilities", description: "Rental of venues, halls, and facilities for events.", limit: 15000, appliesTo: "All Orgs", overspendAction: "Warn", isDefault: true, active: true },
  { id: "2", name: "Food & Catering", description: "Food and beverages for events and meetings.", limit: 10000, appliesTo: "All Orgs", overspendAction: "Warn", isDefault: true, active: true },
  { id: "3", name: "Supplies & Materials", description: "Office supplies, printing, and materials.", limit: 5000, appliesTo: "All Orgs", overspendAction: "Block", isDefault: false, active: true },
  { id: "4", name: "Transportation", description: "Travel and transportation costs.", limit: null, appliesTo: "All Orgs", overspendAction: "Allow", isDefault: false, active: true },
  { id: "5", name: "Equipment Rental", description: "Audio-visual and other equipment rental.", limit: 8000, appliesTo: "Academic", overspendAction: "Block", isDefault: false, active: true },
];

const TOTAL_BUDGET = 150000;
const TOTAL_ALLOCATED = MOCK_ORGS.reduce((a, o) => a + o.ceiling, 0);
const UNALLOCATED = TOTAL_BUDGET - TOTAL_ALLOCATED;
const TOTAL_DISBURSED = MOCK_ORGS.reduce((a, o) => a + o.approved, 0);

// ─── Add Budget Allocation Modal ───────────────────────────────────────────────
function AddBudgetModal({ onClose }: { onClose: () => void }) {
  const [carryOver, setCarryOver] = useState(false);
  const [form, setForm] = useState({ semester: "", amount: "", notes: "" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[560px] overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="text-white font-bold text-base">Add School Budget Allocation</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Semester <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              value={form.semester}
              onChange={(e) => setForm({ ...form, semester: e.target.value })}
            >
              <option value="">Select semester...</option>
              <option>1st Semester A.Y. 2026–2027</option>
              <option>Summer Term A.Y. 2025–2026</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">School Year</label>
            <input
              type="text"
              value={form.semester ? form.semester.split(" ").slice(-1)[0] : ""}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Total School Budget for This Semester (₱) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
              <input
                type="number"
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">This is the total SAS fund available for student organization activities this semester.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes / Source of Funds</label>
            <textarea
              rows={2}
              placeholder="e.g. Annual institutional allocation from school administration"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Carry Over Unspent Balance from Previous Semester</p>
              <p className="text-xs text-gray-500 mt-0.5">Unspent from previous semester: ₱12,450</p>
              {carryOver && (
                <p className="text-xs text-[#83358E] font-medium mt-1">
                  Total Effective Budget = ₱{(parseFloat(form.amount || "0") + 12450).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => setCarryOver(!carryOver)}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${carryOver ? "bg-[#83358E]" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${carryOver ? "translate-x-6" : ""}`} />
            </button>
          </div>

          <div className="p-4 bg-[#F3E8FF] border border-[#83358E]/30 rounded-xl">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-[#83358E] flex-shrink-0 mt-0.5" />
              <p className="text-[#83358E] text-xs">
                After saving, you can distribute this budget to individual organizations from the Organization Budget Allocation section below.
                <br /><span className="text-gray-500 mt-1 block">Organizations not yet allocated will have ₱0 ceiling until you assign them.</span>
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button className="px-5 py-2.5 bg-[#001A4D] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[#001A4D]/90 transition-colors">
            <Save className="w-4 h-4" />
            Save Budget Allocation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Org Ceiling Modal ────────────────────────────────────────────────────
function EditCeilingModal({ org, onClose }: { org: OrgAllocation; onClose: () => void }) {
  const [amount, setAmount] = useState(org.ceiling.toString());
  const [notify, setNotify] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden">
        <div className="bg-gradient-to-r from-[#83358E] to-[#A855F7] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-white" />
            <h3 className="text-white font-bold text-base">Edit Budget Ceiling</h3>
            <span className="px-2.5 py-1 bg-[#FFD41C] text-[#001A4D] text-xs font-bold rounded-full">{org.name}</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="w-9 h-9 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-full flex items-center justify-center text-white text-xs font-bold">
              {org.initials}
            </div>
            <div>
              <p className="text-[#001A4D] font-medium text-sm">{org.name}</p>
              <p className="text-gray-500 text-xs">{org.type} Organization</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Ceiling</label>
            <input
              type="text"
              value={`₱${org.ceiling.toLocaleString()}`}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              New Ceiling Amount (₱) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₱</span>
              <input
                type="number"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Remaining available: <span className="text-green-600 font-medium">₱{UNALLOCATED.toLocaleString()}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Disbursement Date</label>
              <input type="date" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Disbursement Method</label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
                <option>Cash</option>
                <option>Check</option>
                <option>Direct Transfer</option>
                <option>Petty Cash</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Remarks</label>
            <textarea
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none"
              placeholder="Message sent to org officers..."
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Notify Organization Officers</p>
            <button
              onClick={() => setNotify(!notify)}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${notify ? "bg-[#83358E]" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${notify ? "translate-x-6" : ""}`} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button className="px-5 py-2.5 bg-[#83358E] text-white rounded-lg text-sm font-medium hover:bg-[#6D2A78] transition-colors">
            Update Ceiling
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Category Modal ────────────────────────────────────────────────────────
function AddCategoryModal({ onClose }: { onClose: () => void }) {
  const [noLimit, setNoLimit] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tag className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="text-white font-bold text-base">Add Budget Category</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category Name <span className="text-red-500">*</span>
            </label>
            <input type="text" placeholder="e.g. Venue & Facilities" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea rows={2} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none" />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-900">No Spending Limit</p>
            <button
              onClick={() => setNoLimit(!noLimit)}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${noLimit ? "bg-[#83358E]" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${noLimit ? "translate-x-6" : ""}`} />
            </button>
          </div>

          {!noLimit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Spending Limit (₱)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                <input type="number" placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Applies To</label>
            <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
              <option>All Orgs</option>
              <option>Academic</option>
              <option>Professional</option>
              <option>Cultural</option>
              <option>Civic</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Overspend Action</label>
            <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
              <option>Block Submission</option>
              <option>Show Warning</option>
              <option>Allow Silently</option>
            </select>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button className="px-5 py-2.5 bg-[#001A4D] text-white rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 transition-colors">
            Save Category
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Overspend Action Badge ────────────────────────────────────────────────────
function OverspendBadge({ action }: { action: "Block" | "Warn" | "Allow" }) {
  const map = {
    Block: "bg-red-100 text-red-700",
    Warn: "bg-amber-100 text-amber-700",
    Allow: "bg-green-100 text-green-700",
  };
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[action]}`}>{action}</span>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function BudgetFundSettings() {
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editCeilingOrg, setEditCeilingOrg] = useState<OrgAllocation | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryTab, setCategoryTab] = useState<"active" | "archived">("active");
  const [orgCeilings, setOrgCeilings] = useState<Record<string, string>>(
    Object.fromEntries(MOCK_ORGS.map((o) => [o.id, o.ceiling.toString()]))
  );

  const allocPct = Math.round((TOTAL_ALLOCATED / TOTAL_BUDGET) * 100);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Budget & Fund Management</h2>
          <p className="text-gray-500 text-sm">Settings &rsaquo; Budget &amp; Fund Management</p>
        </div>
        <button
          onClick={() => setShowAddBudget(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#83358E] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add School Budget Allocation
        </button>
      </div>

      {/* Context Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-700 font-bold text-sm mb-0.5">School-Level Budget</p>
          <p className="text-gray-700 text-sm leading-relaxed">
            This section manages the overall school fund that the SAO Adviser controls. This is the institutional budget — NOT individual club budgets. Club budgets are managed by each organization's officers in their own dashboard. The SAO sets the allocation ceiling for each club from this school budget.
          </p>
        </div>
      </div>

      {/* School Budget Overview */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-10 h-10 text-[#FFD41C]" />
            <div>
              <p className="text-white font-bold text-lg">STI College Ormoc — Student Affairs Services Budget</p>
              <p className="text-[#FFD41C] text-sm">A.Y. 2025–2026 · 2nd Semester</p>
            </div>
          </div>
          <button className="px-4 py-2 border border-white/50 text-white rounded-lg text-sm hover:bg-white/10 transition-colors flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit School Budget
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-4 divide-x divide-[#E0E0E0] mb-5">
            {[
              { label: "Total School Budget", value: `₱${TOTAL_BUDGET.toLocaleString()}`, sub: "For current semester", color: "text-[#001A4D]" },
              { label: "Allocated to Organizations", value: `₱${TOTAL_ALLOCATED.toLocaleString()}`, sub: `distributed across ${MOCK_ORGS.length} orgs`, color: "text-[#83358E]" },
              { label: "Remaining Unallocated", value: `₱${UNALLOCATED.toLocaleString()}`, sub: "available for new allocations", color: "text-green-600" },
              { label: "Total Disbursed", value: `₱${TOTAL_DISBURSED.toLocaleString()}`, sub: "actually released to orgs", color: "text-blue-600" },
            ].map((s) => (
              <div key={s.label} className="px-6 first:pl-0 last:pr-0 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-gray-400 text-xs mt-1">{s.label}</p>
                <p className="text-gray-400 text-xs">{s.sub}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <p className="text-[#001A4D] text-sm">₱{TOTAL_ALLOCATED.toLocaleString()} allocated of ₱{TOTAL_BUDGET.toLocaleString()} total school budget</p>
              <p className="text-[#FFD41C] font-bold text-sm">{allocPct}%</p>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#83358E] rounded-full" style={{ width: `${allocPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Semester Budget Records */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Semester Budget Records</h3>
            </div>
            <select className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#83358E]">
              <option>Current Semester</option>
              <option>All Semesters</option>
            </select>
          </div>
          <button onClick={() => setShowAddBudget(true)} className="px-3 py-1.5 bg-[#001A4D] text-[#FFD41C] text-xs rounded-lg flex items-center gap-1.5 font-medium hover:bg-[#001A4D]/90 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Allocation
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Semester", "School Year", "Total Budget (₱)", "Allocated (₱)", "Unallocated (₱)", "Disbursed (₱)", "Utilization", "Status", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="border-l-4 border-l-[#FFD41C] bg-[#F3E8FF]/20 hover:bg-[#F3E8FF]/40 transition-colors">
                <td className="px-4 py-3 text-[#001A4D] font-medium text-sm">2nd Semester</td>
                <td className="px-4 py-3 text-gray-600 text-sm">A.Y. 2025–2026</td>
                <td className="px-4 py-3 text-[#001A4D] font-bold text-sm">₱150,000</td>
                <td className="px-4 py-3 text-[#83358E] font-bold text-sm">₱{TOTAL_ALLOCATED.toLocaleString()}</td>
                <td className="px-4 py-3 text-green-600 font-bold text-sm">₱{UNALLOCATED.toLocaleString()}</td>
                <td className="px-4 py-3 text-blue-600 font-bold text-sm">₱{TOTAL_DISBURSED.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#83358E]" style={{ width: `${allocPct}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{allocPct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-500 transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 text-sm">1st Semester</td>
                <td className="px-4 py-3 text-gray-500 text-sm">A.Y. 2025–2026</td>
                <td className="px-4 py-3 text-gray-500 text-sm">₱140,000</td>
                <td className="px-4 py-3 text-gray-500 text-sm">₱135,000</td>
                <td className="px-4 py-3 text-gray-500 text-sm">₱5,000</td>
                <td className="px-4 py-3 text-gray-500 text-sm">₱128,000</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-300" style={{ width: "96%" }} />
                    </div>
                    <span className="text-xs text-gray-400">96%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full font-medium">Completed</span>
                </td>
                <td className="px-4 py-3">
                  <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Organization Budget Allocation */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="border-l-4 border-[#83358E] pl-3">
                <h3 className="text-[#001A4D] font-bold text-base">Organization Budget Ceilings</h3>
              </div>
              <span className="px-2.5 py-1 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">2nd Semester · A.Y. 2025–2026</span>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 border border-[#0E4EBD] text-[#0E4EBD] text-xs rounded-lg hover:bg-blue-50 transition-colors">
                Bulk Update (CSV)
              </button>
              <button className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">
                Auto-Distribute Equally
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-sm">Set the maximum budget ceiling each organization can request from the school fund this semester.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Organization", "Org Type", "Semester Ceiling (₱)", "Requested (₱)", "Approved (₱)", "Utilization", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_ORGS.map((org) => {
                const util = Math.round((org.approved / parseInt(orgCeilings[org.id] || "1")) * 100);
                return (
                  <tr key={org.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {org.initials}
                        </div>
                        <span className="text-[#001A4D] font-medium text-sm">{org.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-medium">{org.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₱</span>
                        <input
                          type="number"
                          value={orgCeilings[org.id]}
                          onChange={(e) => setOrgCeilings({ ...orgCeilings, [org.id]: e.target.value })}
                          className="pl-5 pr-2 py-1.5 border-2 border-[#001A4D] rounded text-xs font-medium w-28 focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">₱{org.requested.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">₱{org.approved.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${util > 90 ? "bg-red-500" : "bg-[#83358E]"}`}
                            style={{ width: `${Math.min(util, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{util}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditCeilingOrg(org)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-500 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#001A4D]">
                <td colSpan={2} className="px-4 py-3 text-white font-bold text-sm">Total Allocated</td>
                <td className="px-4 py-3 text-white font-bold text-sm">₱{TOTAL_ALLOCATED.toLocaleString()}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right">
                  <span className="text-[#FFD41C] font-bold text-sm">Remaining: ₱{UNALLOCATED.toLocaleString()}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-100">
          <button className="w-full py-3 bg-[#83358E] text-white rounded-xl text-sm font-bold hover:bg-[#6D2A78] transition-colors flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            Save All Ceilings
          </button>
        </div>
      </div>

      {/* Budget Categories */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-sm">Budget Categories & Spending Rules</h3>
            </div>
            <div className="flex gap-1">
              {(["active", "archived"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCategoryTab(t)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    categoryTab === t ? "bg-[#001A4D] text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setShowAddCategory(true)}
            className="px-3 py-1.5 bg-[#001A4D] text-[#FFD41C] text-xs rounded-lg flex items-center gap-1.5 font-medium hover:bg-[#001A4D]/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Category
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Category Name", "Description", "Default Limit", "Applies To", "Overspend Action", "Default", "Status", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_CATEGORIES.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 text-[#001A4D] font-medium text-sm">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{cat.description}</td>
                  <td className="px-4 py-3 text-gray-700 text-sm">{cat.limit ? `₱${cat.limit.toLocaleString()}` : "Unlimited"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">{cat.appliesTo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <OverspendBadge action={cat.overspendAction} />
                  </td>
                  <td className="px-4 py-3">
                    {cat.isDefault && (
                      <span className="px-2 py-0.5 bg-[#83358E]/10 text-[#83358E] text-xs rounded font-medium">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`w-2 h-2 inline-block rounded-full ${cat.active ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-500 transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {!cat.isDefault && (
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-amber-600 transition-colors">
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddBudget && <AddBudgetModal onClose={() => setShowAddBudget(false)} />}
      {editCeilingOrg && <EditCeilingModal org={editCeilingOrg} onClose={() => setEditCeilingOrg(null)} />}
      {showAddCategory && <AddCategoryModal onClose={() => setShowAddCategory(false)} />}
    </div>
  );
}
