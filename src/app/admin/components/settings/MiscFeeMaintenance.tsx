import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Save,
  ArrowRightLeft,
  Users,
  Landmark,
  Sparkles,
  FileSpreadsheet,
  Lock,
  AlertTriangle,
  Coins,
  Wallet,
  Eye,
  Search,
  History,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useMiscFeeConfigs,
  useMiscFeeLedger,
} from '../../../modules/finance/hooks/useMiscFeeStream';
import { useRetainedActivityFunds } from '../../../modules/finance/hooks/useRetainedFundStream';
import {
  saveMiscFeeConfig,
  carryOver1stSemBalancesTo2ndSem,
  cloneMiscFeeConfigForNewSchoolYear,
  buildMiscFeeDocId,
} from '../../../modules/finance/services/misc-fee.service';
import {
  parseMiscFeeExcelWorkbook,
  computeBucketBalance,
  inferSaoActivityEligibility,
} from '../../../modules/finance/utils/misc-fee-excel-importer';
import { MiscFeeBucketTransactionsModal } from '../../../modules/finance/components/MiscFeeBucketTransactionsModal';
import { logAuditEvent } from '../../../modules/audit/services/audit.service';
import type {
  MiscFeeBucket,
  MiscFeeConfigDocument,
  MiscFeeSemesterTerm,
  MiscFeeHeadcountSource,
  ComputedBucketBalance,
} from '../../../modules/finance/types/misc-fee.types';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDateTime } from '../../../utils/date';

interface PendingMiscImportPreview {
  fileNames: string[];
  detectedTypes: ('SHS' | 'COLLEGE' | 'COMBINED')[];
  schoolYear: string;
  excludedCount: number;
  headcountSource: MiscFeeHeadcountSource;
  shsEnrolledOverride: number;
  college1stSemEnrolledOverride: number;
  college2ndSemEnrolledOverride: number;
  parsedBuckets: MiscFeeBucket[];
  mergedBuckets: MiscFeeBucket[];
}

export default function MiscFeeMaintenance() {
  const {
    activeConfig,
    activeAcademicTerm,
    liveRegistryCounts,
  } = useMiscFeeConfigs();
  const { data: miscFeeLedger = [] } = useMiscFeeLedger();
  const {
    saoRetainedFund,
    orgRetainedFunds,
    ledgerEntries: retainedLedgerEntries,
    loading: retainedLoading,
  } = useRetainedActivityFunds();

  const [activeTab, setActiveTab] = useState<'misc_pools' | 'retained_funds'>('misc_pools');
  const [particularSearch, setParticularSearch] = useState('');
  const [inspectedBucket, setInspectedBucket] = useState<ComputedBucketBalance | null>(null);
  const [draftConfig, setDraftConfig] = useState<MiscFeeConfigDocument>(activeConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [newSchoolYearInput, setNewSchoolYearInput] = useState('');
  const [showNewSyModal, setShowNewSyModal] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingMiscImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeConfig) {
      setDraftConfig(activeConfig);
    }
  }, [activeConfig]);

  const effectiveCounts = useMemo(() => {
    if (draftConfig.headcountSource === 'student_registry') {
      return {
        shsEnrolled: liveRegistryCounts.shs,
        shsGrade12Enrolled: liveRegistryCounts.shsGrade12,
        college1stSemEnrolled: liveRegistryCounts.college1stSem,
        college2ndSemEnrolled: liveRegistryCounts.college2ndSem,
      };
    }
    return {
      shsEnrolled: Number(draftConfig.shsEnrolledOverride) || 0,
      shsGrade12Enrolled: Number(draftConfig.shsEnrolledOverride) || 0,
      college1stSemEnrolled: Number(draftConfig.college1stSemEnrolledOverride) || 0,
      college2ndSemEnrolled: Number(draftConfig.college2ndSemEnrolledOverride) || 0,
    };
  }, [draftConfig, liveRegistryCounts]);

  const displayedBuckets = useMemo(() => {
    const q = particularSearch.trim().toLowerCase();
    return (draftConfig.buckets || []).filter(
      (b) =>
        b.saoEligible &&
        String(b.assessmentType || '').toLowerCase() === 'assessment' &&
        inferSaoActivityEligibility(b.assessmentType, b.mfTitle, b.particular) &&
        (!q ||
          b.particular.toLowerCase().includes(q) ||
          String(b.level || '').toLowerCase().includes(q) ||
          String(b.remarks || '').toLowerCase().includes(q))
    );
  }, [draftConfig.buckets, particularSearch]);

  const totals = useMemo(() => {
    let totalPool = 0;
    let totalDisbursed = 0;
    let totalReturned = 0;
    let totalAvailable = 0;

    for (const b of displayedBuckets) {
      const c = computeBucketBalance(b, effectiveCounts, draftConfig.activeSemester);
      totalPool += c.currentPool;
      totalDisbursed += c.currentDisbursed;
      totalReturned += c.currentReturnedSurplus;
      totalAvailable += c.currentAvailable;
    }
    return { totalPool, totalDisbursed, totalReturned, totalAvailable };
  }, [displayedBuckets, effectiveCounts, draftConfig.activeSemester]);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      let currentBuckets = [...(draftConfig.buckets || [])];
      const parsedFromFilesMap = new Map<string, MiscFeeBucket>();
      const detectedTypes: ('SHS' | 'COLLEGE' | 'COMBINED')[] = [];
      const fileNames: string[] = [];
      let excludedCount = 0;
      let detectedSy = draftConfig.schoolYear;
      let shsCount = draftConfig.shsEnrolledOverride;
      let col1Count = draftConfig.college1stSemEnrolledOverride;
      let col2Count = draftConfig.college2ndSemEnrolledOverride;

      for (const file of Array.from(files)) {
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
          throw new Error(
            `Unsupported file "${file.name}". Only .xlsx or .xls Miscellaneous Fees Excel files are accepted.`
          );
        }
        const buffer = await file.arrayBuffer();
        const parsed = parseMiscFeeExcelWorkbook(buffer, currentBuckets);
        fileNames.push(file.name);
        excludedCount += parsed.excludedCount || 0;
        if (!detectedTypes.includes(parsed.templateType)) {
          detectedTypes.push(parsed.templateType);
        }
        parsed.parsedBuckets.forEach((b) => {
          parsedFromFilesMap.set(b.particular.trim().toLowerCase(), b);
        });
        currentBuckets = parsed.buckets;
        if (parsed.schoolYear) detectedSy = parsed.schoolYear;
        if (parsed.shsEnrolled) shsCount = parsed.shsEnrolled;
        if (parsed.college1stSemEnrolled) col1Count = parsed.college1stSemEnrolled;
        if (parsed.college2ndSemEnrolled) col2Count = parsed.college2ndSemEnrolled;
      }

      const hasLiveRegistryStudents =
        liveRegistryCounts.shs > 0 ||
        liveRegistryCounts.college1stSem > 0 ||
        liveRegistryCounts.college2ndSem > 0;

      setPendingImport({
        fileNames,
        detectedTypes,
        schoolYear: detectedSy,
        excludedCount,
        headcountSource:
          draftConfig.headcountSource === 'template_override' && !hasLiveRegistryStudents
            ? 'template_override'
            : 'student_registry',
        shsEnrolledOverride: shsCount,
        college1stSemEnrolledOverride: col1Count,
        college2ndSemEnrolledOverride: col2Count,
        parsedBuckets: Array.from(parsedFromFilesMap.values()),
        mergedBuckets: currentBuckets,
      });
    } catch (err: any) {
      console.error('[MiscFeeMaintenance] Excel import error:', err);
      toast.error(err?.message || 'Wrong or invalid Miscellaneous Fee Excel file.');
      setPendingImport(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    setIsSaving(true);
    try {
      const checkCounts =
        pendingImport.headcountSource === 'student_registry'
          ? {
              shsEnrolled: liveRegistryCounts.shs,
              shsGrade12Enrolled: liveRegistryCounts.shsGrade12,
              college1stSemEnrolled: liveRegistryCounts.college1stSem,
              college2ndSemEnrolled: liveRegistryCounts.college2ndSem,
            }
          : {
              shsEnrolled: pendingImport.shsEnrolledOverride || 0,
              shsGrade12Enrolled: pendingImport.shsEnrolledOverride || 0,
              college1stSemEnrolled: pendingImport.college1stSemEnrolledOverride || 0,
              college2ndSemEnrolled: pendingImport.college2ndSemEnrolledOverride || 0,
            };

      const hasHeadcount =
        checkCounts.shsEnrolled > 0 ||
        checkCounts.college1stSemEnrolled > 0 ||
        checkCounts.college2ndSemEnrolled > 0;

      // Disbursement-floor guardrail when live headcount exists
      if (hasHeadcount) {
        for (const b of pendingImport.mergedBuckets) {
          const comp = computeBucketBalance(b, checkCounts, draftConfig.activeSemester);
          if ((Number(b.disbursed1stSem) || 0) > comp.pool1stSem) {
            throw new Error(
              `Cannot reduce "${b.particular}" 1st Sem pool (${formatCurrency(comp.pool1stSem)}) below already-disbursed amount (${formatCurrency(b.disbursed1stSem)}).`
            );
          }
          if ((Number(b.disbursed2ndSem) || 0) > comp.pool2ndSem) {
            throw new Error(
              `Cannot reduce "${b.particular}" 2nd Sem pool (${formatCurrency(comp.pool2ndSem)}) below already-disbursed amount (${formatCurrency(b.disbursed2ndSem)}).`
            );
          }
        }
      }

      const updated: MiscFeeConfigDocument = {
        ...draftConfig,
        id: buildMiscFeeDocId(pendingImport.schoolYear),
        schoolYear: pendingImport.schoolYear,
        headcountSource: pendingImport.headcountSource,
        shsEnrolledOverride: pendingImport.shsEnrolledOverride,
        college1stSemEnrolledOverride: pendingImport.college1stSemEnrolledOverride,
        college2ndSemEnrolledOverride: pendingImport.college2ndSemEnrolledOverride,
        buckets: pendingImport.mergedBuckets,
      };
      setDraftConfig(updated);
      await saveMiscFeeConfig(updated);
      try {
        await logAuditEvent({
          action: 'MISC_FEE_EXCEL_IMPORT',
          actionType: 'UPDATE',
          details: `Imported ${pendingImport.fileNames.join(', ')} (${pendingImport.parsedBuckets.length} SAO-eligible Assessment particulars, excluded ${pendingImport.excludedCount} non-Assessment/non-activity rows) for SY ${pendingImport.schoolYear}.`,
          performedBy: 'SAS Admin',
          userRole: 'SAS Admin',
          targetId: updated.id,
          targetName: `SY ${pendingImport.schoolYear} Miscellaneous Fees`,
        });
      } catch {}
      toast.success(
        `Confirmed and saved ${pendingImport.parsedBuckets.length} SAO-eligible Particular(s) for SY ${pendingImport.schoolYear}!`
      );
      setPendingImport(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save imported Miscellaneous Fee configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveMiscFeeConfig({
        ...draftConfig,
        id: buildMiscFeeDocId(draftConfig.schoolYear),
      });
      toast.success('Miscellaneous Fee configuration & fund pools saved!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCarryOverTo2ndSem = async () => {
    setIsSaving(true);
    try {
      const updated = await carryOver1stSemBalancesTo2ndSem(draftConfig, effectiveCounts);
      setDraftConfig(updated);
      toast.success(
        '1st Semester unspent Miscellaneous Fee balances carried over to 2nd Semester!'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to carry over balances.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewSchoolYear = async () => {
    if (!newSchoolYearInput.trim()) {
      toast.error('Please enter the new School Year (e.g. 2027-2028).');
      return;
    }
    setIsSaving(true);
    try {
      const created = await cloneMiscFeeConfigForNewSchoolYear(newSchoolYearInput.trim(), draftConfig);
      setDraftConfig(created);
      setShowNewSyModal(false);
      setNewSchoolYearInput('');
      toast.success(
        `Initialized SY ${created.schoolYear} with fresh ₱0.00 carry-over and cloned rate structure.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to initialize new School Year.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6 overflow-y-auto max-h-full">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-[#0E4EBD]" />
            <h2 className="text-lg font-black text-[#001A4D]">
              Miscellaneous Fee &amp; Activity Fund Pool Maintenance
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Configure SHS (Annual) and Tertiary/College (Per-Semester) Miscellaneous Fee Particulars, import official templates, and track real-time activity fund balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import SHS / College .xlsx</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-[#FFD41C]" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs: School Misc Fee Pools vs. Isolated Retained Student Contribution Fund */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('misc_pools')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'misc_pools'
              ? 'bg-[#001A4D] text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Miscellaneous Fee Revenue &amp; Pools</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('retained_funds')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'retained_funds'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Student Contribution &amp; Retained Funds</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'retained_funds'
                ? 'bg-emerald-900 text-emerald-100'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {formatCurrency(saoRetainedFund.availableBalance)}
          </span>
        </button>
      </div>

      {activeTab === 'misc_pools' && (
        <>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            {draftConfig.activeSemester} Total Pool
          </p>
          <p className="text-xl font-black text-[#001A4D] mt-1 font-mono">
            {formatCurrency(totals.totalPool)}
          </p>
          <p className="text-[11px] text-blue-800/80 mt-0.5">
            SHS ({effectiveCounts.shsEnrolled}) + College ({draftConfig.activeSemester === '2nd Semester' ? effectiveCounts.college2ndSemEnrolled : effectiveCounts.college1stSemEnrolled})
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Disbursed (Vouchers Uploaded)
          </p>
          <p className="text-xl font-black text-amber-900 mt-1 font-mono">
            {formatCurrency(totals.totalDisbursed)}
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Deducted upon Disbursement Voucher upload
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
            Liquidation Surplus Returned
          </p>
          <p className="text-xl font-black text-purple-900 mt-1 font-mono">
            {formatCurrency(totals.totalReturned)}
          </p>
          <p className="text-[11px] text-purple-700 mt-0.5">
            Unspent cash returned via Cashier receipt
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-300">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Net Available Activity Balance
          </p>
          <p className="text-xl font-black text-emerald-900 mt-1 font-mono">
            {formatCurrency(totals.totalAvailable)}
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Live remaining pool across eligible buckets
          </p>
        </div>
      </div>

      {/* Card A: Term, Student Registry Headcount & Carry-Over Controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0E4EBD]" />
            <h3 className="text-sm font-bold text-[#001A4D]">
              1. School Year, Active Semester &amp; Enrolled Student Headcount
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCarryOverTo2ndSem}
              disabled={isSaving}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Carry Over 1st Sem Remaining Balance to 2nd Sem</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewSyModal(true)}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>New School Year (Reset Carry-Over)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              School Year
            </label>
            <input
              type="text"
              value={draftConfig.schoolYear}
              onChange={(e) =>
                setDraftConfig((prev) => ({ ...prev, schoolYear: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-[#001A4D]"
              placeholder="2026-2027"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              Active Term
            </label>
            <select
              value={draftConfig.activeSemester}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  activeSemester: e.target.value as MiscFeeSemesterTerm,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-[#001A4D] bg-white"
            >
              <option value="1st Semester">1st Semester</option>
              <option value="2nd Semester">2nd Semester (with Carry-Over)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              Headcount Source
            </label>
            <select
              value={draftConfig.headcountSource}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  headcountSource: e.target.value as any,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-800 bg-white"
            >
              <option value="student_registry">
                Student Registry Bulk Import ({liveRegistryCounts.shs} SHS [G12: {liveRegistryCounts.shsGrade12}] / {liveRegistryCounts.college1stSem} Col 1S / {liveRegistryCounts.college2ndSem} Col 2S)
              </option>
              <option value="template_override">
                Manual Headcount Override
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              SHS Enrolled (Annual • G12: {effectiveCounts.shsGrade12Enrolled})
            </label>
            <input
              type="number"
              min="0"
              disabled={draftConfig.headcountSource === 'student_registry'}
              value={effectiveCounts.shsEnrolled}
              onChange={(e) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  headcountSource: 'template_override',
                  shsEnrolledOverride: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono font-bold text-[#001A4D] disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              College Enrolled ({draftConfig.activeSemester})
            </label>
            <input
              type="number"
              min="0"
              disabled={draftConfig.headcountSource === 'student_registry'}
              value={
                draftConfig.activeSemester === '2nd Semester'
                  ? effectiveCounts.college2ndSemEnrolled
                  : effectiveCounts.college1stSemEnrolled
              }
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 0;
                setDraftConfig((prev) => ({
                  ...prev,
                  headcountSource: 'template_override',
                  ...(prev.activeSemester === '2nd Semester'
                    ? { college2ndSemEnrolledOverride: val }
                    : { college1stSemEnrolledOverride: val }),
                }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono font-bold text-[#001A4D] disabled:bg-gray-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-[11px] text-gray-600">
          <span>
            Synced Academic Term:{' '}
            <strong className="text-[#001A4D]">
              SY {activeAcademicTerm.schoolYear} ({activeAcademicTerm.semester})
            </strong>
            {activeAcademicTerm.collegeTermLabel ? ` • ${activeAcademicTerm.collegeTermLabel}` : ''}
          </span>
          {draftConfig.headcountSource === 'student_registry' &&
            liveRegistryCounts.shs === 0 &&
            liveRegistryCounts.college1stSem === 0 &&
            liveRegistryCounts.college2ndSem === 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                No bulk-imported active students matched SY {draftConfig.schoolYear}. Import students in Student Registry to compute live pools.
              </span>
            )}
        </div>
      </div>

      {/* Card B: Miscellaneous Fee Particulars Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#001A4D]">
              2. SAO-Eligible Miscellaneous Fee Particulars (Read-Only from Uploaded Excel)
            </h3>
            <p className="text-[11px] text-gray-500">
              Formula: (SHS Rate × {effectiveCounts.shsEnrolled} [G12: {effectiveCounts.shsGrade12Enrolled}]) + (College 1st Sem Rate × {effectiveCounts.college1stSemEnrolled}) for 1st Sem; Carry-Over + (College 2nd Sem Rate × {effectiveCounts.college2ndSemEnrolled}) for 2nd Sem.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={particularSearch}
                onChange={(e) => setParticularSearch(e.target.value)}
                placeholder="Search Particular..."
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-blue-500/20 outline-none w-48"
              />
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[11px] font-bold">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Read-Only • Managed via Excel Import
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold">
                <th className="py-2.5 px-3 min-w-[230px]">Particular Name</th>
                <th className="py-2.5 px-2 text-right">SHS Rate (₱)</th>
                <th className="py-2.5 px-2 text-right">Col 1st Sem (₱)</th>
                <th className="py-2.5 px-2 text-right">Col 2nd Sem (₱)</th>
                <th className="py-2.5 px-3 text-right">1st Sem Revenue</th>
                <th className="py-2.5 px-3 text-right">1st Sem Carry-Over</th>
                <th className="py-2.5 px-3 text-right">2nd Sem Revenue</th>
                <th className="py-2.5 px-3 text-right">Disbursed</th>
                <th className="py-2.5 px-3 text-right">Returned Surplus</th>
                <th className="py-2.5 px-3 text-right bg-emerald-50/60 text-emerald-900">
                  Available ({draftConfig.activeSemester})
                </th>
                <th className="py-2.5 px-2 text-center">Track</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedBuckets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                      <p className="text-sm font-bold text-[#001A4D]">
                        No SAO-Eligible Miscellaneous Fee Particulars Uploaded Yet
                      </p>
                      <p className="text-xs text-gray-500">
                        Click <strong>Import SHS / College .xlsx</strong> above to upload your Miscellaneous Fee Excel files and fetch SAO-eligible Assessment pools.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedBuckets.map((b) => {
                const c = computeBucketBalance(b, effectiveCounts, draftConfig.activeSemester);
                return (
                  <tr
                    key={b.id}
                    onClick={() => setInspectedBucket(c)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="p-2.5">
                      <span className="font-bold text-[#001A4D] block">{b.particular}</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {b.level !== 'All' ? `Level: ${b.level}` : 'All Levels'}
                        {b.remarks ? ` • ${b.remarks}` : ''}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono text-gray-700">
                      {formatCurrency(b.shsRateTY)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-gray-700">
                      {formatCurrency(b.college1stSemRateTY)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-gray-700">
                      {formatCurrency(b.college2ndSemRateTY)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold text-gray-700">
                      {formatCurrency(c.pool1stSem)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-indigo-700 font-semibold">
                      {formatCurrency(c.carryOverFrom1stSem)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold text-gray-700">
                      {formatCurrency(c.pool2ndSem)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-amber-800">
                      {formatCurrency(c.currentDisbursed)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-purple-800">
                      {formatCurrency(c.currentReturnedSurplus)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                      {formatCurrency(c.currentAvailable)}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedBucket(c);
                        }}
                        className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                        title="Inspect Revenue Formula & Ledger Transactions"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {activeTab === 'retained_funds' && (
        <div className="space-y-5">
          {/* Isolation Policy Banner */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-950">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-emerald-900">
                Strict Isolation Policy: Student Contribution Surplus vs. School Miscellaneous Fees
              </p>
              <p className="text-emerald-800 leading-relaxed">
                Unspent Student Contribution surpluses after Financial Liquidation{' '}
                <strong>never mix with School Miscellaneous Fees</strong> and{' '}
                <strong>never reset at School Year-end</strong>. Club/Organization surpluses stay in their Organization Treasury Balance; SAO/Admin campus activity surpluses go into the{' '}
                <strong>SAO / Campus Student Activity Fund</strong> and can be reused directly on future Activity Proposals.
              </p>
            </div>
          </div>

          {/* KPI Cards for Retained Activity Funds */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-300">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                SAO Retained Activity Fund Balance
              </p>
              <p className="text-xl font-black text-emerald-950 mt-1 font-mono">
                {retainedLoading ? '...' : formatCurrency(saoRetainedFund.availableBalance)}
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Persistent across SY • Held under Cashier/SAO custodianship
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Contribution Revenue Collected
              </p>
              <p className="text-xl font-black text-[#001A4D] mt-1 font-mono">
                {formatCurrency(saoRetainedFund.totalContributionsCollected)}
              </p>
              <p className="text-[11px] text-blue-800/80 mt-0.5">
                Direct student contribution collections (SAO/Admin)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                Retained Liquidation Surpluses
              </p>
              <p className="text-xl font-black text-purple-900 mt-1 font-mono">
                {formatCurrency(saoRetainedFund.totalSurplusesRetained)}
              </p>
              <p className="text-[11px] text-purple-700 mt-0.5">
                Unspent balances credited from approved liquidations
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Drawn for Future Activities
              </p>
              <p className="text-xl font-black text-amber-900 mt-1 font-mono">
                {formatCurrency(saoRetainedFund.totalDisbursedOrSpent)}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Deducted from SAO Retained Student Activity Fund
              </p>
            </div>
          </div>

          {/* Organization Treasuries / Club Retained Surpluses */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-purple-700" />
                <h3 className="text-sm font-bold text-[#001A4D]">
                  Organization / Club Retained Student Contribution Balances
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-gray-500">
                {orgRetainedFunds.length} Organization Bucket(s)
              </span>
            </div>

            {orgRetainedFunds.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No club-retained Student Contribution surpluses or collections posted yet. When a student organization liquidates a Student Contribution event with surplus, it automatically lands here and in their Club Treasury.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold">
                      <th className="py-2.5 px-3">Organization</th>
                      <th className="py-2.5 px-3 text-right">Collected Revenue</th>
                      <th className="py-2.5 px-3 text-right">Surpluses Retained</th>
                      <th className="py-2.5 px-3 text-right">Expenses Drawn</th>
                      <th className="py-2.5 px-3 text-right bg-purple-50 text-purple-900">
                        Available Retained Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orgRetainedFunds.map((orgFund) => (
                      <tr key={orgFund.id} className="hover:bg-slate-50/70">
                        <td className="p-2.5 font-bold text-[#001A4D]">
                          {orgFund.organizationName || orgFund.organizationId}
                        </td>
                        <td className="p-2.5 text-right font-mono text-gray-700">
                          {formatCurrency(orgFund.totalContributionsCollected)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-emerald-700 font-semibold">
                          {formatCurrency(orgFund.totalSurplusesRetained)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-rose-700">
                          {formatCurrency(orgFund.totalDisbursedOrSpent)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-purple-900 bg-purple-50/40">
                          {formatCurrency(orgFund.availableBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Retained Student Activity Fund Transaction Ledger */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#0E4EBD]" />
                <h3 className="text-sm font-bold text-[#001A4D]">
                  Retained Student Activity Fund Ledger (Audit Trail)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-gray-500">
                {retainedLedgerEntries.length} Recorded Transaction(s)
              </span>
            </div>

            {retainedLedgerEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No retained Student Contribution transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Destination Bucket</th>
                      <th className="py-2.5 px-3">Description / Event</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {retainedLedgerEntries.slice(0, 50).map((entry) => {
                      const isCredit =
                        entry.type === 'collection_income' ||
                        entry.type === 'liquidation_surplus_retained';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/60">
                          <td className="p-2.5 text-gray-500 whitespace-nowrap">
                            {entry.createdAt ? formatAppDateTime(entry.createdAt) : '—'}
                          </td>
                          <td className="p-2.5 font-semibold text-[#001A4D]">
                            {entry.ownerType === 'sao'
                              ? 'SAO Campus Activity Fund'
                              : entry.organizationName || entry.bucketId}
                          </td>
                          <td className="p-2.5 text-gray-800">{entry.description}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                isCredit
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {entry.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td
                            className={`p-2.5 text-right font-mono font-bold ${
                              isCredit ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Particular Financial Summary & Activity Ledger Modal */}
      <MiscFeeBucketTransactionsModal
        isOpen={Boolean(inspectedBucket)}
        onClose={() => setInspectedBucket(null)}
        bucket={inspectedBucket}
        schoolYear={draftConfig.schoolYear}
        activeSemester={draftConfig.activeSemester}
        ledgerEntries={miscFeeLedger}
      />

      {/* Excel Import Confirmation Modal */}
      {pendingImport && (() => {
        const previewCounts =
          pendingImport.headcountSource === 'student_registry'
            ? {
                shsEnrolled: liveRegistryCounts.shs,
                shsGrade12Enrolled: liveRegistryCounts.shsGrade12,
                college1stSemEnrolled: liveRegistryCounts.college1stSem,
                college2ndSemEnrolled: liveRegistryCounts.college2ndSem,
              }
            : {
                shsEnrolled: pendingImport.shsEnrolledOverride || 0,
                shsGrade12Enrolled: pendingImport.shsEnrolledOverride || 0,
                college1stSemEnrolled: pendingImport.college1stSemEnrolledOverride || 0,
                college2ndSemEnrolled: pendingImport.college2ndSemEnrolledOverride || 0,
              };

        const saoEligibleParsed = pendingImport.parsedBuckets.filter((b) => b.saoEligible);
        const isSyMismatch =
          pendingImport.schoolYear &&
          activeAcademicTerm.schoolYear &&
          pendingImport.schoolYear.toLowerCase() !== activeAcademicTerm.schoolYear.toLowerCase();
        const isZeroHeadcount =
          previewCounts.shsEnrolled === 0 &&
          previewCounts.college1stSemEnrolled === 0 &&
          previewCounts.college2ndSemEnrolled === 0;

        let previewPool1st = 0;
        let previewPool2nd = 0;
        for (const b of pendingImport.parsedBuckets) {
          if (!b.saoEligible) continue;
          const comp = computeBucketBalance(b, previewCounts, draftConfig.activeSemester);
          previewPool1st += comp.pool1stSem;
          previewPool2nd += comp.college2ndSemPool;
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-[#FFD41C]" />
                  <div>
                    <h3 className="text-base font-bold">Confirm Miscellaneous Fee Excel Import</h3>
                    <p className="text-[11px] text-white/75">
                      Detected {pendingImport.fileNames.join(', ')} ({pendingImport.detectedTypes.join(' + ')}) • Excluded {pendingImport.excludedCount} non-Assessment / academic / lab rows
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setPendingImport(null)}
                  className="text-white/75 hover:text-white text-xs font-bold px-2 py-1 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {(isSyMismatch || isZeroHeadcount) && (
                  <div className="space-y-2">
                    {isSyMismatch && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>School Year Mismatch:</strong> Uploaded Excel targets <strong>SY {pendingImport.schoolYear}</strong>, while Academic Settings is currently on <strong>SY {activeAcademicTerm.schoolYear}</strong>.
                        </span>
                      </div>
                    )}
                    {isZeroHeadcount && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Zero Enrolled Students Found:</strong> Student Registry currently has 0 active enrolled students matched for SY {pendingImport.schoolYear}. Rates will be saved, and fund pools will automatically compute once students are bulk-imported.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">
                      School Year
                    </span>
                    <span className="text-sm font-black text-[#001A4D]">
                      SY {pendingImport.schoolYear}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">
                      SAO Eligible Assessment Items
                    </span>
                    <span className="text-sm font-black text-[#001A4D]">
                      {saoEligibleParsed.length} Particulars Fetched
                    </span>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-blue-700 block">
                      1st Sem Pool ({previewCounts.shsEnrolled} SHS + {previewCounts.college1stSemEnrolled} Col)
                    </span>
                    <span className="text-sm font-black text-[#001A4D] font-mono">
                      {formatCurrency(previewPool1st)}
                    </span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                      2nd Sem Col Pool ({previewCounts.college2ndSemEnrolled} Col)
                    </span>
                    <span className="text-sm font-black text-emerald-800 font-mono">
                      {formatCurrency(previewPool2nd)}
                    </span>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 sticky top-0 text-gray-700 font-bold border-b border-gray-200">
                        <tr>
                          <th className="py-2 px-3">SAO Eligible Particular</th>
                          <th className="py-2 px-2 text-right">SHS TY</th>
                          <th className="py-2 px-2 text-right">Col 1st TY</th>
                          <th className="py-2 px-2 text-right">Col 2nd TY</th>
                          <th className="py-2 px-3 text-right">1st Sem Budget</th>
                          <th className="py-2 px-3 text-right">2nd Sem Budget</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pendingImport.parsedBuckets.map((b) => {
                          const comp = computeBucketBalance(b, previewCounts, draftConfig.activeSemester);
                          return (
                            <tr key={b.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-semibold text-[#001A4D]">
                                {b.particular}
                                <span className="block text-[10px] text-gray-400 font-normal">
                                  {b.mfType} • {b.program} • {b.level}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {formatCurrency(b.shsRateTY)}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {formatCurrency(b.college1stSemRateTY)}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {formatCurrency(b.college2ndSemRateTY)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-[#001A4D]">
                                {formatCurrency(comp.pool1stSem)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                {formatCurrency(comp.college2ndSemPool)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setPendingImport(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isSaving ? 'Saving...' : 'Confirm & Save Fund Pools'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New School Year Reset Modal */}
      {showNewSyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-gray-200">
            <h3 className="text-base font-bold text-[#001A4D]">
              Start New School Year (Reset Carry-Over)
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Per institutional policy, unspent Miscellaneous Fee balances do <strong>not</strong> carry over to a new School Year. This will clone the Particular rate structure into the new School Year with all carry-over and disbursement balances reset to <strong>₱0.00</strong>.
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                New School Year (e.g. 2027-2028)
              </label>
              <input
                type="text"
                value={newSchoolYearInput}
                onChange={(e) => setNewSchoolYearInput(e.target.value)}
                placeholder="2027-2028"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewSyModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewSchoolYear}
                disabled={isSaving}
                className="px-4 py-2 bg-[#001A4D] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Initialize New School Year
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
