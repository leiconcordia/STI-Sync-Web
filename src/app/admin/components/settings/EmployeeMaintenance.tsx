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
  UserMinus,
  Loader2,
  FileSpreadsheet,
  Lock,
  FileWarning,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../../../services/firebase';
import {
  useEmployees,
  createEmployee,
  updateEmployee,
  archiveEmployeeSafely,
  deleteEmployeeSafely,
  checkEmployeeAssignmentBlockers,
  checkEmployeeDeleteEligibilityLive,
  unassignEmployeeRole,
  resolveEmployeeAssignments,
  evaluateArchiveEligibility,
  parseEmployeeExcelFile,
  bulkImportEmployees,
  buildSampleEmployeeWorkbook,
  type EmployeeDocument,
  type EmployeeExcelParseResult,
  type EmployeeRoleAssignment,
  type EmployeeBlockerReport,
  type EmployeeLifecycleEligibility,
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

  // Unassign Modal + Live Blocker Inspection
  const [unassignState, setUnassignState] = useState<{
    employee: EmployeeDocument;
    assignments: EmployeeRoleAssignment[];
    selectedAssignment: EmployeeRoleAssignment;
    checking: boolean;
    report: EmployeeBlockerReport | null;
    error: string | null;
  } | null>(null);

  // Confirm Delete Modal + Live Eligibility Inspection
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteCheckState, setDeleteCheckState] = useState<{
    checking: boolean;
    eligibility: EmployeeLifecycleEligibility | null;
    error: string | null;
  }>({ checking: false, eligibility: null, error: null });

  // Resolve ALL active role assignments per employee (Primary Adviser, Co-Adviser, Institutional Signatory)
  const assignmentsByEmployeeId = useMemo(() => {
    const map = new Map<string, EmployeeRoleAssignment[]>();
    for (const emp of employees) {
      map.set(emp.id, resolveEmployeeAssignments(emp, organizations, signatories));
    }
    return map;
  }, [employees, organizations, signatories]);

  const getEmployeeAssignments = (emp: EmployeeDocument): EmployeeRoleAssignment[] => {
    return assignmentsByEmployeeId.get(emp.id) || [];
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
      const { created, updated, skippedArchiveCount } = await bulkImportEmployees(
        excelPreview.result.validRows,
        employees
      );
      toast.success(
        `Employee Master List imported: ${created} added, ${updated} updated.`
      );
      if (skippedArchiveCount > 0) {
        toast.warning(
          `${skippedArchiveCount} actively assigned employee(s) were kept Active. Unassign their active role(s) before archiving.`
        );
      }
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

  const inspectAssignmentBlockers = async (
    emp: EmployeeDocument,
    allAssignments: EmployeeRoleAssignment[],
    selected: EmployeeRoleAssignment
  ) => {
    setUnassignState({
      employee: emp,
      assignments: allAssignments,
      selectedAssignment: selected,
      checking: true,
      report: null,
      error: null,
    });
    try {
      const report = await checkEmployeeAssignmentBlockers(emp, selected);
      setUnassignState((prev) =>
        prev && prev.employee.id === emp.id && prev.selectedAssignment.id === selected.id
          ? { ...prev, checking: false, report, error: null }
          : prev
      );
    } catch (err: any) {
      setUnassignState((prev) =>
        prev && prev.employee.id === emp.id && prev.selectedAssignment.id === selected.id
          ? {
              ...prev,
              checking: false,
              report: null,
              error: err?.message || 'Failed to inspect pending signatures and activities.',
            }
          : prev
      );
    }
  };

  const openUnassignModal = (emp: EmployeeDocument) => {
    const assignments = getEmployeeAssignments(emp);
    if (assignments.length === 0) {
      toast.info(`${emp.fullName} currently has no active role assignment.`);
      return;
    }
    void inspectAssignmentBlockers(emp, assignments, assignments[0]);
  };

  const handleConfirmUnassign = async () => {
    if (!unassignState || unassignState.checking || !unassignState.report?.canProceed) return;
    const { employee, selectedAssignment, assignments } = unassignState;
    const adminName = auth.currentUser?.displayName || auth.currentUser?.email || 'SAS Administrator';

    setIsSaving(true);
    try {
      await unassignEmployeeRole(employee, selectedAssignment, adminName);
      toast.success(`Unassigned ${employee.fullName} from ${selectedAssignment.label}.`);

      const remaining = assignments.filter((a) => a.id !== selectedAssignment.id);
      if (remaining.length > 0) {
        await inspectAssignmentBlockers(employee, remaining, remaining[0]);
      } else {
        setUnassignState(null);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unassign role.');
      // Refresh live blockers in case a pending item appeared concurrently
      await inspectAssignmentBlockers(employee, assignments, selectedAssignment);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = async (emp: EmployeeDocument, archive: boolean) => {
    if (archive) {
      const assignments = getEmployeeAssignments(emp);
      const eligibility = evaluateArchiveEligibility(emp, assignments);
      if (!eligibility.allowed) {
        toast.error(eligibility.reason || 'Unassign this employee’s active role(s) before archiving.');
        return;
      }
    }

    setIsSaving(true);
    try {
      if (archive) {
        await archiveEmployeeSafely(emp);
        toast.success('Employee archived.');
      } else {
        await updateEmployee(emp.id, { archived: false });
        toast.success('Employee restored.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update employee status.');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = async (emp: EmployeeDocument) => {
    setDeleteTarget(emp);
    setDeleteConfirmText('');
    setDeleteCheckState({ checking: true, eligibility: null, error: null });

    try {
      const eligibility = await checkEmployeeDeleteEligibilityLive(emp);
      setDeleteCheckState({ checking: false, eligibility, error: null });
    } catch (err: any) {
      setDeleteCheckState({
        checking: false,
        eligibility: null,
        error: err?.message || 'Could not verify delete eligibility.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (
      !deleteTarget ||
      deleteConfirmText !== 'DELETE' ||
      deleteCheckState.checking ||
      !deleteCheckState.eligibility?.allowed
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await deleteEmployeeSafely(deleteTarget);
      toast.success('Employee deleted permanently.');
      setDeleteTarget(null);
      setDeleteConfirmText('');
      setDeleteCheckState({ checking: false, eligibility: null, error: null });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete employee.');
      // Re-run eligibility check to display updated blocker state
      try {
        const eligibility = await checkEmployeeDeleteEligibilityLive(deleteTarget);
        setDeleteCheckState({ checking: false, eligibility, error: null });
      } catch {
        // Keep modal open with toast error
      }
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
              const assignments = getEmployeeAssignments(emp);
              const isAssigned = assignments.length > 0;
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
                        {assignments.map((assigned) => (
                          <span
                            key={assigned.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              assigned.badgeTone === 'adviser'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {assigned.badgeTone === 'adviser' ? (
                              <UserCheck className="w-3 h-3" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            {assigned.label}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {emp.positionTitle || 'Faculty / Staff'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    {!emp.archived && emp.status !== 'ARCHIVED' ? (
                      <>
                        {isAssigned && (
                          <button
                            type="button"
                            onClick={() => openUnassignModal(emp)}
                            disabled={isSaving}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Unassign active role(s)"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Unassign
                          </button>
                        )}
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
                          aria-disabled={isAssigned}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isAssigned
                              ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                              : 'hover:bg-amber-50 text-amber-600 cursor-pointer'
                          }`}
                          title={
                            isAssigned
                              ? 'Cannot archive while assigned — click Unassign first'
                              : 'Archive Employee'
                          }
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        {isAssigned && (
                          <button
                            type="button"
                            onClick={() => openUnassignModal(emp)}
                            disabled={isSaving}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Unassign active role(s) before deleting"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Unassign
                          </button>
                        )}
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
                          onClick={() => void openDeleteModal(emp)}
                          disabled={isSaving}
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

      {/* Unassign Employee Role Modal with Live Blocker Audit */}
      {unassignState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => !isSaving && setUnassignState(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden z-10 flex flex-col max-h-[85vh]">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <UserMinus className="w-5 h-5 text-[#FFD41C]" />
                <div>
                  <h3 className="font-bold text-base">Unassign Employee Role</h3>
                  <p className="text-[11px] text-white/75">
                    {unassignState.employee.fullName} ({unassignState.employee.employeeId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSaving && setUnassignState(null)}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Role Selector (handles 1 or multiple active roles cleanly) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Active Assignment{unassignState.assignments.length > 1 ? 's (Select one to unassign)' : ''}
                </label>
                <div className="flex flex-wrap gap-2">
                  {unassignState.assignments.map((role) => {
                    const isSelected = role.id === unassignState.selectedAssignment.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          if (!isSelected) {
                            void inspectAssignmentBlockers(
                              unassignState.employee,
                              unassignState.assignments,
                              role
                            );
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isSelected
                            ? role.badgeTone === 'adviser'
                              ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                              : 'bg-amber-600 text-white border-amber-700 shadow-xs'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {role.badgeTone === 'adviser' ? (
                          <UserCheck className="w-3.5 h-3.5" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        {role.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Blocker Inspection Results */}
              {unassignState.checking ? (
                <div className="p-6 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col items-center justify-center gap-2 text-center">
                  <Loader2 className="w-6 h-6 text-[#0E4EBD] animate-spin" />
                  <p className="text-xs font-semibold text-[#001A4D]">
                    Checking pending signatures and active club activities...
                  </p>
                </div>
              ) : unassignState.error ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Validation Check Failed</div>
                    <p className="mt-0.5">{unassignState.error}</p>
                  </div>
                </div>
              ) : unassignState.report && !unassignState.report.canProceed ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm text-rose-800">
                        Cannot Unassign — Pending Items Found ({unassignState.report.blockers.length})
                      </div>
                      <p className="mt-0.5 text-rose-700">
                        All pending signatures, reviews, and active/unconcluded activities below must be resolved first before unassigning{' '}
                        <strong>{unassignState.selectedAssignment.label}</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="border border-rose-100 rounded-xl divide-y divide-rose-100 max-h-60 overflow-y-auto bg-white">
                    {unassignState.report.blockers.map((blocker, idx) => (
                      <div key={`${blocker.documentId}-${idx}`} className="p-3 flex items-start gap-2.5">
                        <FileWarning className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                              {blocker.documentType}
                            </span>
                            {blocker.referenceNo && (
                              <span className="font-mono text-[10px] font-semibold text-gray-500">
                                {blocker.referenceNo}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-gray-900 mt-0.5 truncate">
                            {blocker.title}
                          </div>
                          <div className="text-[11px] text-rose-700 mt-0.5">
                            {blocker.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : unassignState.report?.canProceed ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-emerald-800">
                      Ready to Unassign — Zero Blockers Found
                    </div>
                    <p className="text-emerald-800">
                      No pending signatures or active club activities were found for{' '}
                      <strong>{unassignState.selectedAssignment.label}</strong>.
                    </p>
                    <p className="text-emerald-700/90">
                      Confirming will immediately revoke portal access for this role and allow archiving this employee once all active roles are unassigned.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUnassignState(null)}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmUnassign}
                disabled={
                  isSaving ||
                  unassignState.checking ||
                  !unassignState.report?.canProceed
                }
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSaving ? 'Unassigning...' : 'Confirm Unassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Permanent Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !isSaving && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-10">
            <div className="bg-gradient-to-r from-red-500 to-orange-600 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-bold text-lg">Delete Employee Permanently</h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isSaving}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Permanently delete <strong>{deleteTarget.fullName}</strong> ({deleteTarget.employeeId})?
              </p>

              {deleteCheckState.checking ? (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-2.5 text-xs text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0E4EBD]" />
                  Verifying active assignments and pending workflow items...
                </div>
              ) : deleteCheckState.error ? (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{deleteCheckState.error}</span>
                </div>
              ) : deleteCheckState.eligibility && !deleteCheckState.eligibility.allowed ? (
                <div className="space-y-2.5">
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-800">Deletion Blocked</div>
                      <p className="mt-0.5">{deleteCheckState.eligibility.reason}</p>
                    </div>
                  </div>
                  {deleteCheckState.eligibility.blockers && deleteCheckState.eligibility.blockers.length > 0 && (
                    <div className="border border-rose-100 rounded-xl divide-y divide-rose-100 max-h-44 overflow-y-auto">
                      {deleteCheckState.eligibility.blockers.map((b, idx) => (
                        <div key={`${b.documentId}-${idx}`} className="p-2.5 text-[11px]">
                          <div className="font-bold text-gray-900">
                            {b.documentType}: {b.title}
                          </div>
                          <div className="text-rose-700">{b.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : deleteCheckState.eligibility?.allowed ? (
                <>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    Verified: Unassigned with zero pending signatures or activities.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Type <span className="font-mono font-bold">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      disabled={isSaving}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </>
              ) : null}

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
                  disabled={
                    isSaving ||
                    deleteCheckState.checking ||
                    !deleteCheckState.eligibility?.allowed ||
                    deleteConfirmText !== 'DELETE'
                  }
                  className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
