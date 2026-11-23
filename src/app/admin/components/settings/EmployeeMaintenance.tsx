import { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Briefcase,
  Upload,
  Download,
  Plus,
  Search,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  parseEmployeeExcelFile,
  bulkImportEmployees,
  buildSampleEmployeeWorkbook,
  type EmployeeDocument,
  type EmployeeExcelParseResult,
} from '../../../modules/employees';
import { useOrganizationStream } from '../../../modules/organizations';
import { subscribeToSignatories, type InstitutionalSignatory } from '../../../modules/signatories';

export default function EmployeeMaintenance() {
  const { data: employees = [], loading } = useEmployees();
  const { data: organizations = [] } = useOrganizationStream();
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);

  useEffect(() => {
    const unsub = subscribeToSignatories((list) => setSignatories(list));
    return () => unsub();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [archivedView, setArchivedView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Add / Edit Modal
  const [formModal, setFormModal] = useState<
    { mode: 'add' } | { mode: 'edit'; item: EmployeeDocument } | null
  >(null);
  const [form, setForm] = useState({
    employeeId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    positionTitle: '',
  });

  // Excel Upload Preview Modal
  const [excelPreview, setExcelPreview] = useState<{
    fileName: string;
    result: EmployeeExcelParseResult;
  } | null>(null);

  // Confirm Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Map currently assigned roles by employeeId / fullName
  const assignedRolesMap = useMemo(() => {
    const map = new Map<string, { role: 'adviser' | 'signatory'; label: string }>();

    organizations.forEach((org) => {
      if (org.status === 'archived' || !org.adviser) return;
      const empId = String(org.adviser.employeeId || '').trim().toLowerCase();
      const name = String(org.adviser.name || '').trim().toLowerCase();
      if (empId) map.set(`id:${empId}`, { role: 'adviser', label: `Adviser · ${org.acronym || org.name}` });
      if (name) map.set(`name:${name}`, { role: 'adviser', label: `Adviser · ${org.acronym || org.name}` });
    });

    signatories.forEach((sig) => {
      if (sig.isActive === false) return;
      const empId = String((sig as any).employeeId || '').trim().toLowerCase();
      const name = String(sig.name || '').trim().toLowerCase();
      if (empId) map.set(`id:${empId}`, { role: 'signatory', label: `Signatory · ${sig.roleTitle || 'Officer'}` });
      if (name) map.set(`name:${name}`, { role: 'signatory', label: `Signatory · ${sig.roleTitle || 'Officer'}` });
    });

    return map;
  }, [organizations, signatories]);

  const getAssignedBadge = (emp: EmployeeDocument) => {
    const empKey = `id:${String(emp.employeeId || '').trim().toLowerCase()}`;
    const nameKey = `name:${String(emp.fullName || '').trim().toLowerCase()}`;
    return assignedRolesMap.get(empKey) || assignedRolesMap.get(nameKey) || null;
  };

  const activeEmployees = useMemo(
    () => employees.filter((e) => !e.archived && e.status !== 'ARCHIVED'),
    [employees]
  );
  const archivedEmployees = useMemo(
    () => employees.filter((e) => e.archived || e.status === 'ARCHIVED'),
    [employees]
  );

  const displayedEmployees = useMemo(() => {
    const base = archivedView ? archivedEmployees : activeEmployees;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (e) =>
        (e.employeeId || '').toLowerCase().includes(q) ||
        (e.fullName || '').toLowerCase().includes(q) ||
        (e.firstName || '').toLowerCase().includes(q) ||
        (e.lastName || '').toLowerCase().includes(q) ||
        (e.positionTitle || '').toLowerCase().includes(q)
    );
  }, [archivedView, activeEmployees, archivedEmployees, searchQuery]);

  const handleDownloadSample = () => {
    const wb = buildSampleEmployeeWorkbook();
    XLSX.writeFile(wb, 'STI_Employee_Master_List_Sample.xlsx');
    toast.success('Downloaded sample Employee Excel template.');
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await parseEmployeeExcelFile(file);
      if (result.totalRows === 0) {
        toast.error('The uploaded Excel file has no employee rows.');
        return;
      }
      setExcelPreview({ fileName: file.name, result });
    } catch (err: any) {
      toast.error(err?.message || 'Could not read the Excel file.');
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelPreview || excelPreview.result.validRows.length === 0) return;
    setIsSaving(true);
    try {
      const { created, updated } = await bulkImportEmployees(
        excelPreview.result.validRows,
        employees
      );
      toast.success(
        `Employee Master List imported: ${created} added, ${updated} updated.`
      );
      setExcelPreview(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import employees.');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddModal = () => {
    setForm({
      employeeId: '',
      firstName: '',
      middleName: '',
      lastName: '',
      positionTitle: '',
    });
    setFormModal({ mode: 'add' });
  };

  const openEditModal = (emp: EmployeeDocument) => {
    setForm({
      employeeId: emp.employeeId || '',
      firstName: emp.firstName || '',
      middleName: emp.middleName || '',
      lastName: emp.lastName || '',
      positionTitle: emp.positionTitle || '',
    });
    setFormModal({ mode: 'edit', item: emp });
  };

  const handleSaveEmployee = async () => {
    if (!form.employeeId.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Employee ID, First Name, and Last Name are required.');
      return;
    }
    setIsSaving(true);
    try {
      if (formModal?.mode === 'add') {
        await createEmployee(form);
        toast.success(`Employee "${form.firstName.trim()} ${form.lastName.trim()}" added.`);
      } else if (formModal?.mode === 'edit') {
        await updateEmployee(formModal.item.id, form);
        toast.success('Employee record updated.');
      }
      setFormModal(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = async (emp: EmployeeDocument, archive: boolean) => {
    setIsSaving(true);
    try {
      await updateEmployee(emp.id, { archived: archive });
      toast.success(archive ? 'Employee archived.' : 'Employee restored.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update employee status.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteConfirmText !== 'DELETE') return;
    setIsSaving(true);
    try {
      await deleteEmployee(deleteTarget.id);
      toast.success('Employee deleted permanently.');
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete employee.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Employee Maintenance</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload or manage campus faculty and staff used in Institutional Signatory and Club Adviser dropdowns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadSample}
            className="px-3.5 py-2 border border-gray-300 bg-white text-[#001A4D] rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#0E4EBD]" />
            Sample Excel
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Excel
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#FFD41C]" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setArchivedView(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  !archivedView ? 'bg-white text-[#001A4D] shadow-xs' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Active ({activeEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setArchivedView(true)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  archivedView ? 'bg-white text-[#001A4D] shadow-xs' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Archived ({archivedEmployees.length})
              </button>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, Employee ID, or position..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-[#001A4D] focus:border-[#001A4D]"
            />
          </div>
        </div>

        {/* Employee List */}
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading employees...</div>
        ) : displayedEmployees.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Briefcase className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-700">
              {archivedView ? 'No archived employees' : 'No employees registered yet'}
            </p>
            <p className="text-xs text-gray-400">
              {archivedView
                ? 'Archived employees will appear here.'
                : 'Upload your Employee Excel Master List or add employees manually.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayedEmployees.map((emp) => {
              const assigned = getAssignedBadge(emp);
              return (
                <div
                  key={emp.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/80 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs shrink-0">
                      {(emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#001A4D] truncate">
                          {emp.fullName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[11px] font-semibold">
                          {emp.employeeId}
                        </span>
                        {assigned && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              assigned.role === 'adviser'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {assigned.role === 'adviser' ? (
                              <UserCheck className="w-3 h-3" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            {assigned.label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {emp.positionTitle || 'Faculty / Staff'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    {!emp.archived && emp.status !== 'ARCHIVED' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-[#0E4EBD] cursor-pointer"
                          title="Edit Employee"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveToggle(emp, true)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 cursor-pointer"
                          title="Archive Employee"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleArchiveToggle(emp, false)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 cursor-pointer"
                          title="Restore Employee"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(emp);
                            setDeleteConfirmText('');
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      {formModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !isSaving && setFormModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-10">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">
                {formModal.mode === 'add' ? 'Add Employee' : 'Edit Employee'}
              </h3>
              <button
                type="button"
                onClick={() => !isSaving && setFormModal(null)}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Employee ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  placeholder="e.g. FAC-2026-004"
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#001A4D]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="e.g. Maria"
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Middle Name <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.middleName}
                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                    placeholder="e.g. Reyes"
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="e.g. Santos"
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Position / Role Title
                </label>
                <input
                  type="text"
                  value={form.positionTitle}
                  onChange={(e) => setForm({ ...form, positionTitle: e.target.value })}
                  placeholder="e.g. IT Faculty Adviser, Program Head"
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormModal(null)}
                  disabled={isSaving}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEmployee}
                  disabled={isSaving || !form.employeeId.trim() || !form.firstName.trim() || !form.lastName.trim()}
                  className="flex-1 py-2.5 bg-[#001A4D] text-white rounded-xl text-sm font-bold hover:bg-[#0E4EBD] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {excelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !isSaving && setExcelPreview(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden z-10 flex flex-col max-h-[85vh]">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[#FFD41C]" />
                <div>
                  <h3 className="font-bold text-base">Preview Employee Excel Import</h3>
                  <p className="text-[11px] text-white/75">{excelPreview.fileName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSaving && setExcelPreview(null)}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-xl font-bold text-[#001A4D]">{excelPreview.result.totalRows}</div>
                  <div className="text-[11px] font-semibold text-blue-700">Total Rows</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xl font-bold text-emerald-700">{excelPreview.result.validRows.length}</div>
                  <div className="text-[11px] font-semibold text-emerald-700">Ready to Import</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-xl font-bold text-rose-700">{excelPreview.result.invalidRows.length}</div>
                  <div className="text-[11px] font-semibold text-rose-700">Skipped / Invalid</div>
                </div>
              </div>

              {excelPreview.result.invalidRows.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Rows with Errors (will be skipped):
                  </div>
                  {excelPreview.result.invalidRows.map((r) => (
                    <div key={r.rowNumber}>
                      Row {r.rowNumber} ({r.employeeId || 'No ID'}): {r.error}
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                    <tr>
                      <th className="py-2 px-3">Employee ID</th>
                      <th className="py-2 px-3">Full Name</th>
                      <th className="py-2 px-3">Position / Title</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {excelPreview.result.validRows.map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono font-semibold text-[#001A4D]">{r.employeeId}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{r.fullName}</td>
                        <td className="py-2 px-3 text-gray-600">{r.positionTitle || '—'}</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setExcelPreview(null)}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExcelImport}
                disabled={isSaving || excelPreview.result.validRows.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Import {excelPreview.result.validRows.length} Employee(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Permanent Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !isSaving && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10">
            <div className="bg-gradient-to-r from-red-500 to-orange-600 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-bold text-lg">Delete Employee</h3>
              <button onClick={() => setDeleteTarget(null)} disabled={isSaving} className="text-white/70 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Permanently delete <strong>{deleteTarget.fullName}</strong> ({deleteTarget.employeeId})?
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isSaving}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isSaving || deleteConfirmText !== 'DELETE'}
                  className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
