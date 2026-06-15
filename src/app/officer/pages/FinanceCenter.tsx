import { useState } from "react";
import {
  Building2,
  TrendingUp,
  Wallet,
  Coins,
  CheckCircle,
  AlertCircle,
  Plus,
  Edit,
  Archive,
  Eye,
  Bell,
  ChevronDown,
  X,
  Save,
  Lock,
  Download,
  FileText,
  Users,
  Calendar,
  History,
  ArrowRight,
  Shield,
  RefreshCw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type FinanceTab = "budget" | "payables" | "liquidation";
type PayableSubTab = "member" | "type" | "overdue";

interface BudgetItem {
  id: string;
  category: string;
  description: string;
  estimated: number;
  actual: number;
  status: "Planned" | "Approved" | "Overspent";
}

interface Member {
  id: string;
  name: string;
  studentId: string;
  course: string;
  totalAssigned: number;
  totalPaid: number;
  lastPayment: string;
  status: "Paid" | "Partial" | "Unpaid" | "Overdue";
}

interface PayableType {
  id: string;
  name: string;
  type: string;
  totalAssigned: number;
  collected: number;
  outstanding: number;
  memberCount: number;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const CEILING = 25000;
const TOTAL_BUDGETED = 22500;
const TOTAL_SPENT = 18400;

const MOCK_BUDGET_ITEMS: BudgetItem[] = [
  { id: "1", category: "Venue", description: "Venue rental for GenAss", estimated: 5000, actual: 4800, status: "Approved" },
  { id: "2", category: "Food", description: "Catering for induction ceremony", estimated: 4500, actual: 4500, status: "Approved" },
  { id: "3", category: "Equipment", description: "AV rental for symposium", estimated: 3000, actual: 3200, status: "Overspent" },
  { id: "4", category: "Supplies", description: "Printing and materials", estimated: 2000, actual: 1900, status: "Approved" },
  { id: "5", category: "Transportation", description: "Team transport to competition", estimated: 3000, actual: 0, status: "Planned" },
  { id: "6", category: "Venue", description: "Sports Fest venue deposit", estimated: 5000, actual: 4000, status: "Approved" },
];

const MOCK_MEMBERS: Member[] = [
  { id: "1", name: "Juan Dela Cruz", studentId: "2021-00123", course: "BSIT 3A", totalAssigned: 500, totalPaid: 500, lastPayment: "Mar 2, 2026", status: "Paid" },
  { id: "2", name: "Maria Santos", studentId: "2021-00124", course: "BSIT 3A", totalAssigned: 500, totalPaid: 250, lastPayment: "Feb 14, 2026", status: "Partial" },
  { id: "3", name: "Jose Reyes", studentId: "2021-00125", course: "BSCS 2B", totalAssigned: 500, totalPaid: 0, lastPayment: "—", status: "Overdue" },
  { id: "4", name: "Ana Lopez", studentId: "2021-00126", course: "BSCS 2B", totalAssigned: 500, totalPaid: 500, lastPayment: "Jan 20, 2026", status: "Paid" },
  { id: "5", name: "Carlos Mendoza", studentId: "2021-00127", course: "BSIT 4A", totalAssigned: 500, totalPaid: 0, lastPayment: "—", status: "Unpaid" },
];

const MOCK_PAYABLE_TYPES: PayableType[] = [
  { id: "1", name: "Membership Dues", type: "Recurring", totalAssigned: 12500, collected: 10000, outstanding: 2500, memberCount: 25 },
  { id: "2", name: "Sports Fest Registration", type: "Event", totalAssigned: 5000, collected: 3500, outstanding: 1500, memberCount: 25 },
  { id: "3", name: "T-Shirt Fee", type: "One-Time", totalAssigned: 3750, collected: 3750, outstanding: 0, memberCount: 25 },
];

const MOCK_LIQUIDATIONS = [
  { id: "1", event: "General Assembly 2026", submitted: "Feb 10, 2026", amount: "₱9,300", status: "Approved" as const },
  { id: "2", event: "Induction Ceremony", submitted: "Mar 5, 2026", amount: "₱4,500", status: "Pending" as const },
  { id: "3", event: "IT Symposium", submitted: "Apr 1, 2026", amount: "₱4,600", status: "Under Review" as const },
];

// ─── Semester Selector ─────────────────────────────────────────────────────────
function SemesterSelector({ current, onSelect }: { current: string; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const semesters = [
    { label: "2nd Semester · A.Y. 2025–2026", tag: "CURRENT" },
    { label: "1st Semester · A.Y. 2025–2026", tag: "COMPLETED" },
    { label: "2nd Semester · A.Y. 2024–2025", tag: "COMPLETED" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${
          current !== semesters[0].label
            ? "bg-amber-50 border-amber-300 text-amber-800"
            : "bg-white border-[#E0E0E0] text-[#001A4D] hover:border-blue-400"
        }`}
      >
        <Calendar className="w-4 h-4 text-blue-600" />
        <span className="font-bold">{current}</span>
        {current === semesters[0].label && (
          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">CURRENT</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-white border border-[#E0E0E0] rounded-xl shadow-lg z-20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Select Semester</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {semesters.map((s) => (
            <button
              key={s.label}
              onClick={() => { onSelect(s.label); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors relative ${
                s.label === current ? "bg-[#F3E8FF] border-l-[3px] border-l-[#83358E]" : "hover:bg-gray-50"
              }`}
            >
              <div>
                <p className={`text-sm font-bold ${s.label === current ? "text-[#83358E]" : "text-[#001A4D]"}`}>{s.label.split(" · ")[0]}</p>
                <p className="text-xs text-gray-500">{s.label.split(" · ")[1]}</p>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                s.tag === "CURRENT" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}>{s.tag}</span>
            </button>
          ))}
          <div className="px-4 py-2 border-t border-gray-100">
            <button className="text-blue-600 text-xs hover:underline">Manage Semesters</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metrics Row ───────────────────────────────────────────────────────────────
function MetricsRow({ isPast }: { isPast: boolean }) {
  const totalPayables = MOCK_MEMBERS.reduce((a, m) => a + m.totalAssigned, 0);
  const totalCollected = MOCK_MEMBERS.reduce((a, m) => a + m.totalPaid, 0);
  const totalOutstanding = totalPayables - totalCollected;

  const cards = [
    { label: "Club Budget Ceiling", value: `₱${CEILING.toLocaleString()}`, note: "set by SAO Adviser", color: "text-[#83358E]", icon: Building2 },
    { label: "Total Club Expenditures", value: `₱${TOTAL_SPENT.toLocaleString()}`, note: "this semester", color: "text-blue-600", icon: TrendingUp },
    { label: "Remaining Budget", value: `₱${(CEILING - TOTAL_SPENT).toLocaleString()}`, note: "unspent this semester", color: "text-green-600", icon: Wallet },
    { label: "Total Payables Assigned", value: `₱${totalPayables.toLocaleString()}`, note: `across ${MOCK_MEMBERS.length} members`, color: "text-[#001A4D]", icon: Coins },
    { label: "Total Collected", value: `₱${totalCollected.toLocaleString()}`, note: "+₱250 this month", color: "text-green-600", icon: CheckCircle },
    { label: "Total Outstanding", value: `₱${totalOutstanding.toLocaleString()}`, note: `across ${MOCK_MEMBERS.filter((m) => m.status !== "Paid").length} members`, color: "text-red-600", icon: AlertCircle },
  ];

  return (
    <div className={`grid grid-cols-3 gap-4 ${isPast ? "opacity-80" : ""}`}>
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-gray-500 text-xs">{c.label}</p>
              <Icon className="w-5 h-5 text-gray-300" />
            </div>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{c.note}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Budget Tracker Tab ────────────────────────────────────────────────────────
function BudgetTrackerTab({ isPast }: { isPast: boolean }) {
  const [showAddItem, setShowAddItem] = useState(false);

  const spentPct = Math.round((TOTAL_SPENT / CEILING) * 100);
  const budgetedPct = Math.round((TOTAL_BUDGETED / CEILING) * 100);

  return (
    <div className="space-y-4">
      {/* Budget Summary Card */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-[#FFD41C]" />
            <p className="text-white font-bold text-base">Club Budget — STI IT Guild</p>
            <span className="text-[#FFD41C] text-xs">2nd Semester · A.Y. 2025–2026</span>
          </div>
          {!isPast && (
            <button className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <Edit className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 grid grid-cols-[1fr_300px] gap-6">
          {/* Left — breakdown */}
          <div className="space-y-3">
            {[
              { label: "SAO-Approved Ceiling", value: `₱${CEILING.toLocaleString()}`, color: "text-[#001A4D]", note: "" },
              { label: "Amount Budgeted by Club", value: `₱${TOTAL_BUDGETED.toLocaleString()}`, color: "text-[#83358E]", note: "" },
              { label: "Actually Spent (Approved Liquidations)", value: `₱${TOTAL_SPENT.toLocaleString()}`, color: "text-blue-600", note: "" },
              { label: "Remaining Budget", value: `₱${(CEILING - TOTAL_SPENT).toLocaleString()}`, color: "text-green-600", note: "" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <p className="text-gray-500 text-sm">{row.label}</p>
                <p className={`font-bold text-lg ${row.color}`}>{row.value}</p>
              </div>
            ))}
            {/* Segmented progress bar */}
            <div className="mt-2">
              <div className="h-4 rounded-full overflow-hidden bg-gray-100 flex">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${spentPct}%` }} title={`Spent: ${spentPct}%`} />
                <div className="h-full bg-[#83358E]/40 transition-all" style={{ width: `${budgetedPct - spentPct}%` }} title="Budgeted not yet spent" />
              </div>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 bg-blue-500 rounded-full inline-block" /> Spent ({spentPct}%)</span>
                <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 bg-[#83358E]/40 rounded-full inline-block" /> Budgeted ({budgetedPct - spentPct}%)</span>
                <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 bg-gray-100 rounded-full inline-block border" /> Unbudgeted</span>
              </div>
            </div>
          </div>

          {/* Right — donut placeholder */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-32 h-32 rounded-full border-[12px] border-[#83358E] flex items-center justify-center mb-2" style={{
              background: `conic-gradient(#83358E 0% 35%, #1E70E8 35% 55%, #FFD41C 55% 70%, #10B981 70% 85%, #F97316 85% 100%)`
            }}>
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
                <p className="text-[#001A4D] font-bold text-sm">₱{CEILING.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              {[
                { label: "Venue", color: "bg-[#83358E]" },
                { label: "Food", color: "bg-blue-500" },
                { label: "Equipment", color: "bg-[#FFD41C]" },
                { label: "Supplies", color: "bg-green-500" },
                { label: "Other", color: "bg-orange-400" },
              ].map((cat) => (
                <div key={cat.label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                  {cat.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Budget Line Items Table */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="border-l-4 border-[#83358E] pl-3">
            <h3 className="text-[#001A4D] font-bold text-sm">Club Budget Plan</h3>
          </div>
          {!isPast && (
            <button
              onClick={() => setShowAddItem(true)}
              className="px-3 py-1.5 border border-[#83358E] text-[#83358E] text-xs rounded-lg hover:bg-[#83358E]/5 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Budget Item
            </button>
          )}
        </div>
        {isPast && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-200">
            <Archive className="w-4 h-4 text-amber-600" />
            <p className="text-amber-700 text-xs font-medium">Historical Data — All records are read-only.</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Category", "Description", "Estimated (₱)", "Actual Spent (₱)", "Variance (₱)", "Status", ...(!isPast ? ["Actions"] : [])].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_BUDGET_ITEMS.map((item, i) => {
                const variance = item.estimated - item.actual;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-[#F3E8FF] text-[#83358E] text-xs rounded font-medium">{item.category}</span>
                    </td>
                    <td className="px-4 py-3 text-[#001A4D] text-sm">{item.description}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">₱{item.estimated.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{item.actual > 0 ? `₱${item.actual.toLocaleString()}` : "—"}</td>
                    <td className={`px-4 py-3 text-sm font-medium ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {item.actual > 0 ? `${variance >= 0 ? "+" : ""}₱${variance.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        item.status === "Approved" ? "bg-green-100 text-green-700" :
                        item.status === "Overspent" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{item.status}</span>
                    </td>
                    {!isPast && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-amber-500 transition-colors">
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#001A4D]">
                <td colSpan={3} className="px-4 py-3 text-white font-bold text-sm">Total</td>
                <td className="px-4 py-3 text-white font-bold text-sm">₱{MOCK_BUDGET_ITEMS.reduce((a, i) => a + i.estimated, 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-white font-bold text-sm">₱{MOCK_BUDGET_ITEMS.reduce((a, i) => a + i.actual, 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-[#FFD41C] font-bold text-sm">+₱{(MOCK_BUDGET_ITEMS.reduce((a, i) => a + i.estimated - i.actual, 0)).toLocaleString()}</td>
                <td colSpan={!isPast ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add Budget Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddItem(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] overflow-hidden">
            <div className="bg-[#83358E] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="text-white font-bold text-base">Add Budget Item</h3>
                <span className="px-2.5 py-0.5 bg-[#FFD41C] text-[#001A4D] text-xs font-bold rounded-full">STI IT Guild</span>
              </div>
              <button onClick={() => setShowAddItem(false)} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category <span className="text-red-500">*</span></label>
                <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
                  <option>Venue & Facilities</option>
                  <option>Food & Catering</option>
                  <option>Equipment Rental</option>
                  <option>Supplies & Materials</option>
                  <option>Transportation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Venue rental for GenAss" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Amount (₱) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                  <input type="number" placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
                </div>
                <p className="text-xs text-gray-500 mt-1">Remaining unbudgeted ceiling: <span className="text-green-600 font-medium">₱2,500</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Funding Source</label>
                <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
                  <option>Club Funds</option>
                  <option>SAO Budget</option>
                  <option>Sponsorship</option>
                  <option>Student Registration Fees</option>
                  <option>Donation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Justification</label>
                <textarea rows={2} placeholder="Why is this expense needed?" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-between">
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
              <button className="px-5 py-2.5 bg-[#83358E] text-white rounded-lg text-sm font-medium hover:bg-[#6D2A78] transition-colors">
                Save Budget Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student Payables Tab ──────────────────────────────────────────────────────
function StudentPayablesTab({ isPast }: { isPast: boolean }) {
  const [subTab, setSubTab] = useState<PayableSubTab>("member");
  const totalAssigned = MOCK_MEMBERS.reduce((a, m) => a + m.totalAssigned, 0);
  const totalCollected = MOCK_MEMBERS.reduce((a, m) => a + m.totalPaid, 0);
  const totalOutstanding = totalAssigned - totalCollected;
  const collectionRate = Math.round((totalCollected / totalAssigned) * 100);
  const overdueCount = MOCK_MEMBERS.filter((m) => m.status === "Overdue").length;

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <div className="grid grid-cols-4 divide-x divide-gray-200 mb-4">
          {[
            { label: "Total Payables Assigned", value: `₱${totalAssigned.toLocaleString()}`, color: "text-[#001A4D]" },
            { label: "Total Collected", value: `₱${totalCollected.toLocaleString()}`, color: "text-green-600" },
            { label: "Total Outstanding", value: `₱${totalOutstanding.toLocaleString()}`, color: "text-red-600" },
            { label: "Collection Rate", value: `${collectionRate}%`, color: "text-[#83358E]" },
          ].map((s) => (
            <div key={s.label} className="px-5 first:pl-0 last:pr-0 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-400 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-gray-500 text-xs">{collectionRate}% of total payables collected this semester</p>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#83358E] rounded-full" style={{ width: `${collectionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([["member", "By Member"], ["type", "By Payable Type"], ["overdue", `Overdue`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              subTab === key ? "border-[#83358E] text-[#83358E]" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "overdue" && overdueCount > 0 && (
              <span className="w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* By Member */}
      {subTab === "member" && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            <input type="text" placeholder="Search members..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
            <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
              <option>All Status</option>
              <option>Paid</option>
              <option>Partial</option>
              <option>Unpaid</option>
              <option>Overdue</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Member", "Course & Year", "Total Assigned", "Total Paid", "Outstanding", "Last Payment", "Status", ...(!isPast ? ["Actions"] : [])].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MOCK_MEMBERS.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          m.status === "Paid" ? "bg-green-100 text-green-700" :
                          m.status === "Overdue" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-[#001A4D] font-medium text-sm">{m.name}</p>
                          <p className="text-gray-400 text-xs">{m.studentId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{m.course}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">₱{m.totalAssigned.toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-600 font-medium text-sm">₱{m.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600 font-bold text-sm">₱{(m.totalAssigned - m.totalPaid).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{m.lastPayment}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        m.status === "Paid" ? "bg-green-100 text-green-700" :
                        m.status === "Overdue" ? "bg-red-100 text-red-700" :
                        m.status === "Partial" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{m.status}</span>
                    </td>
                    {!isPast && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors" title="View Profile">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Record Payment">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-amber-500 transition-colors" title="Send Reminder">
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Payable Type */}
      {subTab === "type" && (
        <div className="grid grid-cols-3 gap-4">
          {MOCK_PAYABLE_TYPES.map((pt) => {
            const pct = Math.round((pt.collected / pt.totalAssigned) * 100);
            return (
              <div key={pt.id} className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[#001A4D] font-bold text-sm">{pt.name}</p>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-medium">{pt.type}</span>
                </div>
                <p className="text-[#83358E] font-bold text-lg">₱{pt.totalAssigned.toLocaleString()}</p>
                <div className="flex justify-between text-xs mt-1 mb-2">
                  <span className="text-green-600">₱{pt.collected.toLocaleString()} collected</span>
                  <span className="text-red-600">₱{pt.outstanding.toLocaleString()} outstanding</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#83358E]" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-gray-400 text-xs">{pt.memberCount} members</p>
                  <button className="text-blue-600 text-xs hover:underline">View Breakdown</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overdue */}
      {subTab === "overdue" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 font-bold text-sm mb-0.5">Overdue Payables</p>
              <p className="text-gray-700 text-sm">These members have payables that are past their due date. Send reminders or record manual payments.</p>
            </div>
          </div>
          {!isPast && (
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                Send Overdue Reminder to All
              </button>
            </div>
          )}
          <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Member", "Outstanding", "Days Overdue", "Fine Accrued", ...(!isPast ? ["Actions"] : [])].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MOCK_MEMBERS.filter((m) => m.status === "Overdue").map((m) => (
                  <tr key={m.id} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-[#001A4D] font-medium text-sm">{m.name}</p>
                      <p className="text-gray-400 text-xs">{m.course}</p>
                    </td>
                    <td className="px-4 py-3 text-red-600 font-bold text-sm">₱{(m.totalAssigned - m.totalPaid).toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600 font-bold text-sm">18 days</td>
                    <td className="px-4 py-3 text-red-500 text-sm">₱45</td>
                    {!isPast && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button className="px-2.5 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Record Payment
                          </button>
                          <button className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1">
                            <Bell className="w-3 h-3" /> Remind
                          </button>
                        </div>
                      </td>
                    )}
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

// ─── Liquidation Tab ───────────────────────────────────────────────────────────
function LiquidationTab({ isPast }: { isPast: boolean }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#F3E8FF] border border-[#83358E]/30 rounded-xl">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#83358E] flex-shrink-0 mt-0.5" />
          <p className="text-[#83358E] text-sm">
            Liquidation reports must account for budget items in your Club Budget Plan. The SAO Adviser will cross-reference your liquidations against your approved budget ceiling.
          </p>
        </div>
      </div>
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="border-l-4 border-[#83358E] pl-3">
            <h3 className="text-[#001A4D] font-bold text-sm">Liquidation Reports</h3>
          </div>
          {!isPast && (
            <button className="px-3 py-1.5 bg-[#83358E] text-white text-xs rounded-lg flex items-center gap-1.5 font-medium hover:bg-[#6D2A78] transition-colors">
              <Plus className="w-3.5 h-3.5" />
              New Liquidation Report
            </button>
          )}
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {["Event", "Submitted", "Amount", "Status", "Actions"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_LIQUIDATIONS.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-[#001A4D] font-medium text-sm">{l.event}</td>
                <td className="px-4 py-3 text-gray-500 text-sm">{l.submitted}</td>
                <td className="px-4 py-3 text-gray-700 font-medium text-sm">{l.amount}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                    l.status === "Approved" ? "bg-green-100 text-green-700" :
                    l.status === "Pending" ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>{l.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                    <Eye className="w-3 h-3" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Semester Transition Screens ───────────────────────────────────────────────
function SemesterEndedScreen({ onViewPast, onStartNew }: { onViewPast: () => void; onStartNew: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-[120px] h-[120px] bg-gradient-to-br from-[#001A4D] to-[#83358E] rounded-full flex items-center justify-center mb-6">
        <RefreshCw className="w-16 h-16 text-[#FFD41C]" style={{ animation: "spin 6s linear infinite" }} />
      </div>
      <h1 className="text-[#001A4D] font-bold text-3xl mb-2">Semester Has Ended</h1>
      <p className="text-gray-500 text-base mb-8">2nd Semester · A.Y. 2025–2026 has concluded.</p>

      <div className="grid grid-cols-2 gap-5 w-full max-w-2xl mb-6">
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-6 text-center">
          <History className="w-10 h-10 text-blue-600 mx-auto mb-3" />
          <p className="text-blue-600 font-bold text-base mb-1">View Past Semester</p>
          <p className="text-gray-500 text-sm mb-4">Browse events, attendance, finances, and payables from the completed semester.</p>
          <button onClick={onViewPast} className="w-full py-2.5 border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
            View 2nd Semester Data
          </button>
        </div>
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-6 text-center">
          <ArrowRight className="w-10 h-10 text-[#83358E] mx-auto mb-3" />
          <p className="text-[#83358E] font-bold text-base mb-1">Start New Semester</p>
          <p className="text-gray-500 text-sm mb-4">Begin working in 1st Semester A.Y. 2026–2027.</p>
          <button onClick={onStartNew} className="w-full py-2.5 bg-[#83358E] text-white rounded-lg text-sm font-medium hover:bg-[#6D2A78] transition-colors">
            Go to New Semester Dashboard
          </button>
        </div>
      </div>
      <button className="text-gray-400 text-sm hover:text-gray-600 transition-colors">I'll decide later</button>
    </div>
  );
}

function SemesterSetupChecklist({ onContinue }: { onContinue: () => void }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const items = [
    { id: "officers", icon: Shield, color: "text-[#83358E]", bg: "bg-[#F3E8FF]", label: "Confirm Organization Officers", desc: "Verify that your organization's officer roster is up to date for this semester.", action: "Update Officers" },
    { id: "budget", icon: Wallet, color: "text-blue-600", bg: "bg-blue-50", label: "Set Club Budget Plan", desc: "Plan your organization's expenditures for the new semester.", action: "Set Budget Plan" },
    { id: "dues", icon: Coins, color: "text-amber-600", bg: "bg-amber-50", label: "Set Up Member Dues", desc: "Configure the dues and registration fees for your members this semester.", action: "Set Up Dues" },
    { id: "assign", icon: Users, color: "text-green-600", bg: "bg-green-50", label: "Assign Dues to Members", desc: "Once dues are configured, assign them to your active members.", action: "Assign Dues", disabled: !done["dues"] },
  ];
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-white px-8 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-[#001A4D] font-bold text-2xl mb-1">Set Up Your Organization for 1st Semester A.Y. 2026–2027</h1>
        <p className="text-gray-500 text-sm mb-6">Complete these steps to get your organization ready for the new semester.</p>

        <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden mb-6">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${i < items.length - 1 ? "border-b border-[#E0E0E0]" : ""} ${item.disabled ? "opacity-50" : ""}`}>
                <button
                  onClick={() => !item.disabled && setDone({ ...done, [item.id]: !done[item.id] })}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${done[item.id] ? "bg-green-500 border-green-500" : "border-gray-300"}`}
                >
                  {done[item.id] && <Check className="w-4 h-4 text-white" />}
                </button>
                <div className={`w-10 h-10 ${item.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-[#001A4D] font-bold text-sm">{item.label}</p>
                  <p className="text-gray-500 text-xs">{item.desc}</p>
                </div>
                <button
                  disabled={!!item.disabled}
                  className={`px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                    done[item.id]
                      ? "border-green-200 text-green-600 bg-green-50"
                      : item.disabled
                      ? "border-gray-200 text-gray-400 cursor-not-allowed"
                      : `border-[#83358E] text-[#83358E] hover:bg-[#83358E]/5`
                  }`}
                >
                  {done[item.id] ? "✓ Done" : item.action}
                </button>
              </div>
            );
          })}

          <div className="px-5 py-3 bg-gray-50 border-t border-[#E0E0E0]">
            <div className="flex justify-between items-center mb-1">
              <p className="text-gray-500 text-xs">{doneCount} of {items.length} setup steps completed</p>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#83358E] rounded-full transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={onContinue}
            disabled={doneCount === 0}
            className={`w-full py-3 rounded-xl text-sm font-bold mb-2 transition-colors ${
              doneCount > 0 ? "bg-[#83358E] text-white hover:bg-[#6D2A78]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Continue to Dashboard →
          </button>
          <p className="text-gray-400 text-xs mb-4">You can complete remaining steps from your dashboard.</p>
          <button onClick={onContinue} className="text-gray-400 text-sm hover:text-gray-600 transition-colors">Skip Setup — I'll do this later</button>
        </div>
      </div>
    </div>
  );
}

// ─── Historical Finance Summary ────────────────────────────────────────────────
function HistoricalSummaryCard() {
  return (
    <div className="p-4 bg-[#001A4D] rounded-xl">
      <p className="text-white/70 text-xs mb-3">Final Financial Record</p>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Final Budget Utilization", value: "91%" },
          { label: "Total Collections", value: "₱21,250" },
          { label: "Total Outstanding", value: "₱3,500" },
          { label: "Total Liquidations Filed", value: "6" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[#FFD41C] font-bold text-xl">{s.value}</p>
            <p className="text-white/70 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="text-white/50 text-xs italic mt-3">This is the final financial record for this semester.</p>
    </div>
  );
}

// ─── Main FinanceCenter Page ───────────────────────────────────────────────────
export default function FinanceCenter() {
  const CURRENT_SEM = "2nd Semester · A.Y. 2025–2026";
  const [selectedSem, setSelectedSem] = useState(CURRENT_SEM);
  const [activeTab, setActiveTab] = useState<FinanceTab>("budget");
  const [showTransition, setShowTransition] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const isPast = selectedSem !== CURRENT_SEM;

  // Demo: simulate transition screens
  if (showSetup) {
    return <SemesterSetupChecklist onContinue={() => setShowSetup(false)} />;
  }
  if (showTransition) {
    return (
      <SemesterEndedScreen
        onViewPast={() => { setShowTransition(false); setSelectedSem("1st Semester · A.Y. 2025–2026"); }}
        onStartNew={() => { setShowTransition(false); setShowSetup(true); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Finance Center</h2>
          <p className="text-gray-500 text-sm">Finance &rsaquo; {activeTab === "budget" ? "Budget Tracker" : activeTab === "payables" ? "Student Payables" : "Liquidation Reports"}</p>
        </div>
        <div className="flex items-center gap-3">
          <SemesterSelector current={selectedSem} onSelect={setSelectedSem} />
          <button className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[#001A4D]/90 transition-colors">
            <Download className="w-4 h-4" />
            Export Financial Report
          </button>
          {/* Demo trigger */}
          <button
            onClick={() => setShowTransition(true)}
            className="px-3 py-2 border border-gray-300 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors"
            title="Demo: Semester Transition Screen"
          >
            Demo Transition
          </button>
        </div>
      </div>

      {/* Past Semester Banner */}
      {isPast && (
        <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 font-bold text-sm">Viewing: {selectedSem} — Read-Only Historical Data.</span>
          </div>
          <button onClick={() => setSelectedSem(CURRENT_SEM)} className="text-[#001A4D] text-xs font-medium hover:underline">
            Return to Current Semester
          </button>
        </div>
      )}

      {/* Past semester historical summary */}
      {isPast && <HistoricalSummaryCard />}

      {/* Metric Cards */}
      <MetricsRow isPast={isPast} />

      {/* Export row for past semester */}
      {isPast && (
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-[#001A4D]/90 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export This Semester's Report (PDF)
          </button>
          <button className="px-4 py-2 border border-[#0E4EBD] text-[#0E4EBD] rounded-lg text-xs hover:bg-blue-50 transition-colors flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Export Payables Summary (Excel)
          </button>
        </div>
      )}

      {/* Three-Tab Area */}
      <div>
        <div className="flex border-b border-gray-200 mb-4">
          {([["budget", "Budget Tracker"], ["payables", "Student Payables"], ["liquidation", "Liquidation Reports"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "bg-[#001A4D] text-white border-[#FFD41C] -mb-px rounded-t-lg"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "budget" && <BudgetTrackerTab isPast={isPast} />}
        {activeTab === "payables" && <StudentPayablesTab isPast={isPast} />}
        {activeTab === "liquidation" && <LiquidationTab isPast={isPast} />}
      </div>
    </div>
  );
}
