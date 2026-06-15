import { useState } from 'react';
import { Plus, Upload, X, Check, Trash2 } from 'lucide-react';

type LiquidationStatus = 'all' | 'draft' | 'pending' | 'approved' | 'returned';

interface ExpenseItem {
  id: number;
  description: string;
  category: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  receiptRef: string;
}

interface LiquidationReport {
  id: number;
  eventName: string;
  reportTitle: string;
  submissionDate: string;
  totalAmount: number;
  status: 'draft' | 'pending' | 'approved' | 'returned';
  returnNote?: string;
}

export default function FinancialLiquidation() {
  const [activeStatus, setActiveStatus] = useState<LiquidationStatus>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const mockReports: LiquidationReport[] = [
    {
      id: 1,
      eventName: 'IT Guild General Assembly',
      reportTitle: 'IT Guild General Assembly — Liquidation Report',
      submissionDate: 'Jun 10, 2026',
      totalAmount: 25000,
      status: 'approved',
    },
    {
      id: 2,
      eventName: 'Leadership Summit 2026',
      reportTitle: 'Leadership Summit 2026 — Liquidation Report',
      submissionDate: 'Jun 8, 2026',
      totalAmount: 15000,
      status: 'pending',
    },
    {
      id: 3,
      eventName: 'Team Building Activity',
      reportTitle: 'Team Building Activity — Liquidation Report',
      submissionDate: 'Jun 5, 2026',
      totalAmount: 12000,
      status: 'returned',
      returnNote: 'Missing receipt for item 3',
    },
    {
      id: 4,
      eventName: 'Programming Workshop',
      reportTitle: 'Programming Workshop — Liquidation Report',
      submissionDate: 'Not submitted',
      totalAmount: 8000,
      status: 'draft',
    },
  ];

  const filteredReports = mockReports.filter(
    (report) => activeStatus === 'all' || report.status === activeStatus
  );

  const statusCounts = {
    all: mockReports.length,
    draft: mockReports.filter((r) => r.status === 'draft').length,
    pending: mockReports.filter((r) => r.status === 'pending').length,
    approved: mockReports.filter((r) => r.status === 'approved').length,
    returned: mockReports.filter((r) => r.status === 'returned').length,
  };

  const statusColors = {
    draft: 'bg-[#888780]',
    pending: 'bg-[#BA7517]',
    approved: 'bg-[#639922]',
    returned: 'bg-[#E24B4A]',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[#888780] text-[13px] mb-1">Dashboard &gt; Financial Liquidation</div>
          <h1 className="text-[#001A4D] text-[24px] font-bold">Financial Liquidation</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90"
        >
          <Plus className="w-5 h-5" />
          New Liquidation Report
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-[#E0E0E0]">
        {[
          { key: 'all', label: 'All' },
          { key: 'draft', label: 'Draft' },
          { key: 'pending', label: 'Pending Review' },
          { key: 'approved', label: 'Approved' },
          { key: 'returned', label: 'Returned' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key as LiquidationStatus)}
            className={`px-4 py-3 text-[14px] font-medium border-b-2 transition-colors ${
              activeStatus === tab.key
                ? 'border-[#7F77DD] text-[#7F77DD]'
                : 'border-transparent text-[#888780] hover:text-[#001A4D]'
            }`}
          >
            {tab.label}
            <span className="ml-2 px-2 py-0.5 bg-[#F8F8F8] rounded-full text-[11px]">
              {statusCounts[tab.key as LiquidationStatus]}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredReports.map((report) => (
          <div key={report.id} className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-[#001A4D] text-[16px] font-bold mb-1">{report.eventName}</h3>
                <p className="text-[#888780] text-[13px] mb-3">Submitted: {report.submissionDate}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[#001A4D] text-[20px] font-bold">₱{report.totalAmount.toLocaleString()}</span>
                  <span className="text-[#888780] text-[13px]">Total Reported</span>
                </div>
              </div>

              <div className="flex items-center gap-3 px-8">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    report.status !== 'draft' ? 'bg-[#639922]' : 'bg-[#E0E0E0]'
                  }`}>
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[10px] text-[#888780] mt-1">Draft</span>
                </div>
                <div className="w-12 h-0.5 bg-[#E0E0E0]" />
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    report.status === 'pending' || report.status === 'approved' || report.status === 'returned'
                      ? 'bg-[#639922]'
                      : 'bg-[#E0E0E0]'
                  }`}>
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[10px] text-[#888780] mt-1">Submitted</span>
                </div>
                <div className="w-12 h-0.5 bg-[#E0E0E0]" />
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    report.status === 'approved'
                      ? 'bg-[#639922]'
                      : report.status === 'returned'
                      ? 'bg-[#E24B4A]'
                      : 'bg-[#E0E0E0]'
                  }`}>
                    {report.status === 'returned' ? (
                      <X className="w-4 h-4 text-white" />
                    ) : (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <span className="text-[10px] text-[#888780] mt-1">
                    {report.status === 'approved' ? 'Approved' : report.status === 'returned' ? 'Returned' : 'Final'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3">
                <span className={`px-3 py-1 ${statusColors[report.status]} text-white rounded text-[12px] font-medium capitalize`}>
                  {report.status}
                </span>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[13px] font-medium hover:bg-[#F8F8F8]">
                    View
                  </button>
                  <button
                    disabled={report.status !== 'draft'}
                    className={`px-3 py-1.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[13px] font-medium ${
                      report.status === 'draft' ? 'hover:bg-[#F8F8F8]' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    disabled={report.status !== 'draft'}
                    className={`p-1.5 rounded ${
                      report.status === 'draft' ? 'hover:bg-[#FEE2E2]' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-[#E24B4A]" />
                  </button>
                </div>
              </div>
            </div>

            {report.status === 'returned' && report.returnNote && (
              <div className="mt-4 p-3 bg-[#FEE2E2] border border-[#E24B4A] rounded-lg flex items-start gap-2">
                <span className="text-[#E24B4A] text-[11px] font-bold">Returned:</span>
                <span className="text-[#001A4D] text-[11px]">{report.returnNote}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && <CreateLiquidationModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function CreateLiquidationModal({ onClose }: { onClose: () => void }) {
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([
    { id: 1, description: '', category: 'Supplies', quantity: 0, unitCost: 0, totalCost: 0, receiptRef: '' },
  ]);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);

  const addExpenseItem = () => {
    setExpenseItems([
      ...expenseItems,
      { id: Date.now(), description: '', category: 'Supplies', quantity: 0, unitCost: 0, totalCost: 0, receiptRef: '' },
    ]);
  };

  const removeExpenseItem = (id: number) => {
    setExpenseItems(expenseItems.filter((item) => item.id !== id));
  };

  const updateExpenseItem = (id: number, field: keyof ExpenseItem, value: any) => {
    setExpenseItems(
      expenseItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitCost') {
            updated.totalCost = updated.quantity * updated.unitCost;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const totalExpenses = expenseItems.reduce((sum, item) => sum + item.totalCost, 0);
  const budgetAllocated = 30000;
  const surplusDeficit = budgetAllocated - totalExpenses;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-[#001A4D] text-[20px] font-bold">Create Liquidation Report</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#F8F8F8] rounded-lg">
            <X className="w-5 h-5 text-[#888780]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Report Header</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Linked Event</label>
                <select className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none">
                  <option>IT Guild General Assembly</option>
                  <option>Leadership Summit 2026</option>
                  <option>Team Building Activity</option>
                </select>
              </div>

              <div>
                <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Total Budget Allocated</label>
                <input
                  type="number"
                  value={budgetAllocated}
                  readOnly
                  className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] bg-[#F8F8F8] cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Itemized Expense Ledger</h3>
            <div className="border border-[#E0E0E0] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-[#F8F8F8] border-b border-[#E0E0E0]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Description</th>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Category</th>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Qty</th>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Unit Cost</th>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Total</th>
                    <th className="px-3 py-2 text-left text-[#888780] text-[11px] font-bold uppercase">Receipt</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                  {expenseItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => updateExpenseItem(item.id, 'description', e.target.value)}
                          className="w-full px-2 py-1 border border-[#E0E0E0] rounded text-[13px] focus:border-[#7F77DD] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.category}
                          onChange={(e) => updateExpenseItem(item.id, 'category', e.target.value)}
                          className="w-full px-2 py-1 border border-[#E0E0E0] rounded text-[13px] focus:border-[#7F77DD] outline-none"
                        >
                          <option>Supplies</option>
                          <option>Food & Beverage</option>
                          <option>Logistics</option>
                          <option>Venue</option>
                          <option>Printing</option>
                          <option>Others</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateExpenseItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-[#E0E0E0] rounded text-[13px] focus:border-[#7F77DD] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.unitCost}
                          onChange={(e) => updateExpenseItem(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-[#E0E0E0] rounded text-[13px] focus:border-[#7F77DD] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-[13px] font-bold text-[#001A4D]">₱{item.totalCost.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          placeholder="Receipt #"
                          value={item.receiptRef}
                          onChange={(e) => updateExpenseItem(item.id, 'receiptRef', e.target.value)}
                          className="w-24 px-2 py-1 border border-[#E0E0E0] rounded text-[13px] focus:border-[#7F77DD] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeExpenseItem(item.id)}
                          className="p-1 hover:bg-[#FEE2E2] rounded"
                          disabled={expenseItems.length === 1}
                        >
                          <Trash2 className="w-4 h-4 text-[#E24B4A]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#F8F8F8] border-t-2 border-[#E0E0E0]">
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-right text-[#001A4D] text-[13px] font-bold">
                      Total Expenses:
                    </td>
                    <td className="px-3 py-3 text-[#001A4D] text-[14px] font-bold">₱{totalExpenses.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-[#888780] text-[13px]">Budget Allocated:</td>
                    <td className="px-3 py-2 text-[#888780] text-[13px]">₱{budgetAllocated.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-[#001A4D] text-[13px] font-bold">
                      {surplusDeficit >= 0 ? 'Surplus:' : 'Deficit:'}
                    </td>
                    <td className={`px-3 py-2 text-[14px] font-bold ${surplusDeficit >= 0 ? 'text-[#639922]' : 'text-[#E24B4A]'}`}>
                      ₱{Math.abs(surplusDeficit).toLocaleString()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-3 border-t border-[#E0E0E0]">
                <button onClick={addExpenseItem} className="text-[#7F77DD] text-[13px] font-medium hover:underline">
                  + Add Expense Item
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Receipt Uploads</h3>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2].map((index) => (
                <div key={index} className="border-2 border-dashed border-[#E0E0E0] rounded-lg p-6 text-center hover:border-[#7F77DD] transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-[#888780] mx-auto mb-2" />
                  <p className="text-[#001A4D] text-[13px] font-medium mb-1">Upload Receipt Photo</p>
                  <p className="text-[#888780] text-[11px]">JPG, PNG, PDF — max 5MB</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Officer Declaration</h3>
            <div className="bg-[#F8F8F8] border border-[#E0E0E0] rounded-lg p-5">
              <p className="text-[#888780] text-[13px] mb-4">
                I certify that all expenses listed above are accurate, supported by attached receipts, and in
                accordance with the organization's approved budget.
              </p>
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={declarationConfirmed}
                  onChange={(e) => setDeclarationConfirmed(e.target.checked)}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0] rounded"
                />
                <span className="text-[#001A4D] text-[13px] font-medium">I confirm this declaration</span>
              </label>
              <div className="text-[#888780] text-[12px]">
                <p>Officer: Juan Dela Cruz</p>
                <p>Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[#E0E0E0] px-6 py-4">
          <div className="flex items-center justify-end gap-3">
            <button className="px-5 py-2.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[14px] font-medium hover:bg-[#F8F8F8]">
              Save Draft
            </button>
            <button
              disabled={!declarationConfirmed}
              className={`px-5 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium ${
                declarationConfirmed ? 'hover:bg-[#7F77DD]/90' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              Submit to SAO Adviser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
