import { useState, useMemo } from "react";
import {
  RefreshCw,
  Plus,
  School,
  AlertTriangle,
  AlertCircle,
  Eye,
  Edit,
  Archive,
  Trash2,
  X,
  CheckCircle,
  Calendar,
  Loader,
  Check,
  Lock,
  Save,
  CalendarPlus,
  Clock,
  FileText,
  Download,
} from "lucide-react";
import { useSemesters } from "../../modules/academic/hooks/useAcademicStream";
import {
  createSemester,
  updateSemester,
  archiveSemester,
  deleteSemester,
  generateSemesterLabel,
} from "../../modules/academic/services/academic.service";
import type { SemesterDocument, SemesterStatus, SemesterTerm } from "../../modules/academic/types/academic.types";

// ─── Types ────────────────────────────────────────────────────────────────────
type BannerState = "active" | "ending-soon" | "rollover-needed" | "in-progress";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weeksBetween(start: string, end: string): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const weeks = Math.round(ms / (7 * 24 * 60 * 60 * 1000));
  return `${weeks} week${weeks !== 1 ? "s" : ""}`;
}

function daysUntilEnd(endDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(endDate + "T00:00:00");
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function deriveBannerState(semesters: SemesterDocument[]): BannerState {
  const active = semesters.find((s) => s.status === "ACTIVE");
  if (!active) return "active";
  const days = daysUntilEnd(active.endDate);
  if (days < 0) return "rollover-needed";
  if (days <= 14) return "ending-soon";
  return "active";
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActiveSemesterBanner({
  state,
  activeSemester,
  onRollover,
}: {
  state: BannerState;
  activeSemester: SemesterDocument | undefined;
  onRollover: () => void;
}) {
  if (!activeSemester && state === "active") {
    return (
      <div className="w-full p-6 rounded-2xl bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <School className="w-10 h-10 text-white/50" />
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-0.5">No Active Semester</p>
            <p className="text-white font-bold text-xl">Add a semester and set it as Active to begin.</p>
          </div>
        </div>
      </div>
    );
  }

  const days = activeSemester ? daysUntilEnd(activeSemester.endDate) : 0;

  if (state === "active" && activeSemester) {
    return (
      <div className="w-full p-6 rounded-2xl bg-gradient-to-r from-[#001A4D] to-[#83358E] flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 flex items-center justify-center">
            <School className="w-10 h-10 text-[#FFD41C]" />
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-0.5">Currently Active Semester</p>
            <p className="text-white font-bold text-[28px] leading-tight">
              {activeSemester.semester} · A.Y. {activeSemester.academicYear}
            </p>
            <p className="text-white/80 text-sm mt-0.5">
              {formatDate(activeSemester.startDate)} — {formatDate(activeSemester.endDate)}
            </p>
          </div>
          <span className="ml-2 px-3 py-1 bg-[#FFD41C] text-[#001A4D] text-xs font-bold rounded-full">
            {days} day{days !== 1 ? "s" : ""} remaining
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            {[
              { label: "Active Students", value: String(activeSemester.students) },
              { label: "Events This Semester", value: String(activeSemester.events) },
            ].map((chip) => (
              <div key={chip.label} className="px-3 py-2 bg-white/15 rounded-xl text-center">
                <p className="text-white font-bold text-sm">{chip.value}</p>
                <p className="text-white/80 text-xs">{chip.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === "ending-soon" && activeSemester) {
    return (
      <div className="w-full p-6 rounded-2xl bg-gradient-to-r from-[#FFC107] to-[#FFD41C] flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <AlertTriangle className="w-10 h-10 text-white" />
          <div>
            <p className="text-white font-bold text-xl">Semester Ending Soon</p>
            <p className="text-white/90 text-sm">
              End Date: {formatDate(activeSemester.endDate)} · {days} day{days !== 1 ? "s" : ""} remaining
            </p>
            <p className="text-white/80 text-sm mt-0.5">Prepare for semester rollover.</p>
          </div>
        </div>
        <button
          onClick={onRollover}
          className="px-5 py-2.5 bg-[#001A4D] text-white rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-[#001A4D]/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Run Semester Rollover
        </button>
      </div>
    );
  }

  if (state === "rollover-needed") {
    return (
      <div className="w-full p-6 rounded-2xl bg-gradient-to-r from-[#EF4444] to-[#F97316] flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <AlertCircle className="w-10 h-10 text-white" />
          <div>
            <p className="text-white font-bold text-xl">Semester Has Ended — Rollover Required</p>
            <p className="text-white/90 text-sm mt-0.5">
              The current semester end date has passed. Run the semester rollover to begin the new semester.
            </p>
          </div>
        </div>
        <button
          onClick={onRollover}
          className="px-5 py-2.5 bg-[#FFD41C] text-[#001A4D] rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#FFD41C]/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Run Semester Rollover Now
        </button>
      </div>
    );
  }

  return null;
}

function StatusPill({ status }: { status: SemesterStatus }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-green-500 to-green-400 text-white text-xs font-bold rounded-full">
        <span className="w-1.5 h-1.5 bg-white rounded-full" />
        CURRENT
      </span>
    );
  }
  if (status === "UPCOMING") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
        UPCOMING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">
      COMPLETED
    </span>
  );
}

// ─── Add Semester Modal ────────────────────────────────────────────────────────
interface AddSemesterModalProps {
  existingSemesters: SemesterDocument[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddSemesterModal({ existingSemesters, onClose, onSuccess }: AddSemesterModalProps) {
  const [form, setForm] = useState({
    academicYear: "",
    semester: "" as SemesterTerm | "",
    startDate: "",
    endDate: "",
    reenrollDeadline: "",
    status: "UPCOMING" as SemesterStatus,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-generate label live from form inputs
  const autoLabel = useMemo(() => {
    if (!form.academicYear || !form.semester) return "";
    return generateSemesterLabel(form.academicYear, form.semester as SemesterTerm);
  }, [form.academicYear, form.semester]);

  // Validation helper — runs on submit
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    // Required fields
    if (!form.academicYear.trim()) errs.academicYear = "Academic year is required.";
    if (!form.semester)           errs.semester     = "Please select a semester.";
    if (!form.startDate)          errs.startDate    = "Start date is required.";
    if (!form.endDate)            errs.endDate      = "End date is required.";

    // Academic year format: 4 digits - 4 digits (hyphens or en-dashes)
    const ayClean = form.academicYear.replace(/[–—]/g, "-").trim();
    const ayMatch = /^\d{4}-\d{4}$/.test(ayClean);
    if (form.academicYear && !ayMatch) {
      errs.academicYear = "Format must be YYYY-YYYY (e.g. 2026-2027).";
    } else if (ayMatch) {
      const [startYear, endYear] = ayClean.split("-").map(Number);
      if (endYear !== startYear + 1) {
        errs.academicYear = "End year must be exactly 1 year after start year.";
      }
    }

    // Date logic
    if (form.startDate && form.endDate && form.endDate <= form.startDate) {
      errs.endDate = "End date must be after start date.";
    }
    if (form.reenrollDeadline && form.startDate && form.reenrollDeadline > form.startDate) {
      errs.reenrollDeadline = "Re-enrollment deadline should be on or before the semester start date.";
    }

    // Block adding if there's already an ACTIVE semester and new one is also ACTIVE
    const hasActive = existingSemesters.some((s) => s.status === "ACTIVE");
    if (hasActive && form.status === "ACTIVE") {
      errs.status = "There is already an active semester. A new semester cannot be set as Active. Run a semester rollover to switch.";
    }

    // Duplicate check: same academic year + same semester
    const duplicate = existingSemesters.some(
      (s) =>
        s.academicYear.replace(/[–—\s]/g, "-").toLowerCase() ===
          ayClean.toLowerCase() &&
        s.semester === form.semester
    );
    if (duplicate && !errs.academicYear && !errs.semester) {
      errs.duplicate = `${form.semester} for A.Y. ${form.academicYear} already exists.`;
    }

    // Date-range conflict: new semester cannot overlap with any existing semester's dates
    if (form.startDate && form.endDate && !errs.startDate && !errs.endDate) {
      const newStart = form.startDate;
      const newEnd   = form.endDate;

      const conflicting = existingSemesters.find((s) => {
        if (!s.startDate || !s.endDate) return false;
        // Two ranges [A,B] and [C,D] overlap when A <= D && B >= C
        return newStart <= s.endDate && newEnd >= s.startDate;
      });

      if (conflicting) {
        errs.dateConflict =
          `Date range conflicts with an existing semester: ` +
          `${conflicting.semester} · A.Y. ${conflicting.academicYear} ` +
          `(${formatDate(conflicting.startDate)} – ${formatDate(conflicting.endDate)}). ` +
          `Choose dates that do not overlap with published semesters.`;
      }
    }

    return errs;
  }

  async function handleSave() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await createSemester({
        academicYear: form.academicYear.replace(/[–—]/g, "-").trim(),
        semester: form.semester as SemesterTerm,
        startDate: form.startDate,
        endDate: form.endDate,
        reenrollDeadline: form.reenrollDeadline,
        status: form.status,
      });
      setSaved(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (e) {
      setErrors({ submit: "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const hasActiveBlock = existingSemesters.some((s) => s.status === "ACTIVE");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarPlus className="w-5 h-5 text-[#FFD41C]" />
            <h3 className="text-white font-bold text-base">Add Academic Semester</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active semester block warning */}
        {hasActiveBlock && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              <strong>Active semester detected.</strong> You can still add an upcoming semester, but you cannot set the new semester as Active while another is running. Use "Run Semester Rollover" to switch active semesters.
            </p>
          </div>
        )}

        {/* Duplicate / submit error */}
        {(errors.duplicate || errors.submit) && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-xs">{errors.duplicate || errors.submit}</p>
          </div>
        )}

        {/* Date-range conflict error */}
        {errors.dateConflict && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <Calendar className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 text-xs font-semibold mb-0.5">Date Range Conflict</p>
              <p className="text-red-700 text-xs">{errors.dateConflict}</p>
            </div>
          </div>
        )}


        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Academic Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Academic Year <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 2026-2027"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                errors.academicYear ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              value={form.academicYear}
              onChange={(e) => {
                setForm({ ...form, academicYear: e.target.value });
                setErrors((prev) => ({ ...prev, academicYear: "", duplicate: "" }));
              }}
            />
            {errors.academicYear ? (
              <p className="text-red-500 text-xs mt-1">{errors.academicYear}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Format: YYYY-YYYY</p>
            )}
          </div>

          {/* Semester */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Semester <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {(["1st Semester", "2nd Semester"] as SemesterTerm[]).map((opt) => (
                <label
                  key={opt}
                  className={`flex-1 flex items-center gap-2.5 px-4 py-3 border rounded-lg cursor-pointer transition-all ${
                    form.semester === opt
                      ? "border-[#83358E] bg-[#F3E8FF]/40 ring-2 ring-[#83358E]/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="semester"
                    value={opt}
                    checked={form.semester === opt}
                    onChange={() => {
                      setForm({ ...form, semester: opt });
                      setErrors((prev) => ({ ...prev, semester: "", duplicate: "" }));
                    }}
                    className="accent-[#83358E]"
                  />
                  <span className="text-sm font-medium text-[#001A4D]">{opt}</span>
                </label>
              ))}
            </div>
            {errors.semester && <p className="text-red-500 text-xs mt-1">{errors.semester}</p>}
          </div>

          {/* Auto-generated Label (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              Semester Label
              <span className="text-[10px] text-[#83358E] bg-purple-50 px-1.5 py-0.5 rounded font-semibold">AUTO</span>
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={autoLabel || "Fill in Academic Year and Semester above…"}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 italic text-sm pr-9"
              />
              <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Auto-generated in format <span className="font-mono font-semibold text-[#001A4D]">A.Y.YYYY-YYYY-#S</span>. Used in all reports and exports.
            </p>
          </div>

          {/* Start / End Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                  errors.startDate || errors.dateConflict ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                value={form.startDate}
                onChange={(e) => {
                  setForm({ ...form, startDate: e.target.value });
                  setErrors((prev) => ({ ...prev, startDate: "", endDate: "", dateConflict: "" }));
                }}
              />
              {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                  errors.endDate || errors.dateConflict ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                value={form.endDate}
                onChange={(e) => {
                  setForm({ ...form, endDate: e.target.value });
                  setErrors((prev) => ({ ...prev, endDate: "", dateConflict: "" }));
                }}
              />
              {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Re-enrollment Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Re-enrollment Deadline
            </label>
            <input
              type="date"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                errors.reenrollDeadline ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              value={form.reenrollDeadline}
              onChange={(e) => {
                setForm({ ...form, reenrollDeadline: e.target.value });
                setErrors((prev) => ({ ...prev, reenrollDeadline: "" }));
              }}
            />
            {errors.reenrollDeadline ? (
              <p className="text-red-500 text-xs mt-1">{errors.reenrollDeadline}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Date by which students must confirm enrollment.</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Initial Status</label>
            <div className="flex gap-4">
              {(["UPCOMING", "ACTIVE"] as SemesterStatus[]).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={form.status === s}
                    disabled={s === "ACTIVE" && hasActiveBlock}
                    onChange={() => {
                      setForm({ ...form, status: s });
                      setErrors((prev) => ({ ...prev, status: "" }));
                    }}
                    className="accent-[#83358E]"
                  />
                  <span className={`text-sm capitalize ${s === "ACTIVE" && hasActiveBlock ? "text-gray-400" : ""}`}>
                    {s === "UPCOMING" ? "Upcoming" : "Active"}
                  </span>
                </label>
              ))}
            </div>
            {errors.status && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-xs">{errors.status}</p>
              </div>
            )}
            {form.status === "ACTIVE" && !hasActiveBlock && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-amber-700 text-xs">
                  Setting this semester as <strong>Active</strong> will make it the current semester immediately. Ensure no other semester is currently active.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              saved
                ? "bg-green-600 text-white"
                : "bg-[#001A4D] text-white hover:bg-[#001A4D]/90"
            }`}
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Semester
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rollover Modal ────────────────────────────────────────────────────────────
function RolloverModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [execStep, setExecStep] = useState(0);
  const [carryBudget, setCarryBudget] = useState(true);
  const [autoInactivate, setAutoInactivate] = useState(true);
  const [flagOfficers, setFlagOfficers] = useState(true);
  const [resetCompliance, setResetCompliance] = useState(true);

  const steps = ["Select New Semester", "Review Impact", "Configure Rollover", "Confirm & Execute"];

  const execSteps = [
    "Closing current active semester...",
    "Updating student account statuses...",
    "Resetting semester compliance scores...",
    "Processing budget carry-over...",
    "Generating re-enrollment notifications...",
    "Activating new semester...",
    "Updating system configuration...",
    "Writing audit log entry...",
  ];

  const handleExecute = () => {
    setExecuting(true);
    let s = 0;
    const interval = setInterval(() => {
      s++;
      setExecStep(s);
      if (s >= execSteps.length) {
        clearInterval(interval);
        setTimeout(() => setDone(true), 600);
      }
    }, 700);
  };

  if (executing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] p-8">
          <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] -mx-8 -mt-8 px-8 py-5 rounded-t-2xl mb-6 flex items-center gap-3">
            <RefreshCw className="w-9 h-9 text-[#FFD41C] animate-spin" style={{ animationDuration: "2s" }} />
            <span className="text-white font-bold text-lg">{done ? "Rollover Complete!" : "Executing Rollover..."}</span>
          </div>

          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-[#001A4D] font-bold text-xl mb-1">Semester Rollover Complete!</p>
              <p className="text-gray-500 text-sm mb-4">New semester is now active.</p>
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#001A4D] text-[#FFD41C] font-bold rounded-xl text-sm hover:bg-[#001A4D]/90 transition-colors"
              >
                View New Semester Dashboard
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-5">
                {execSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {i < execStep ? (
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : i === execStep ? (
                      <Loader className="w-4 h-4 text-[#83358E] animate-spin flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        i < execStep ? "text-green-700" : i === execStep ? "text-[#83358E] font-medium" : "text-gray-400"
                      }`}
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#83358E] rounded-full transition-all duration-500"
                  style={{ width: `${(execStep / execSteps.length) * 100}%` }}
                />
              </div>
              <p className="text-right text-gray-400 text-xs mt-1">
                Step {execStep} of {execSteps.length}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[680px] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-8 py-5 rounded-t-2xl flex items-center gap-4">
          <div className="w-[52px] h-[52px] bg-[#FFD41C] rounded-full flex items-center justify-center">
            <RefreshCw className="w-7 h-7 text-[#001A4D] animate-spin" style={{ animationDuration: "4s" }} />
          </div>
          <div>
            <p className="text-white font-bold text-[22px]">Semester Rollover</p>
            <p className="text-[#FFD41C] text-sm">Switch to the next academic semester</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center px-8 py-4 border-b border-gray-200 bg-white gap-2">
          {steps.map((s, i) => {
            const num = i + 1;
            const isActive = num === step;
            const isDone = num < step;
            return (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isDone ? "bg-green-500 text-white" : isActive ? "bg-[#83358E] text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : num}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    isActive ? "text-[#83358E]" : isDone ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {s}
                </span>
                {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div>
              <p className="text-[#001A4D] font-bold text-lg mb-1">Which semester are you starting?</p>
              <p className="text-gray-500 text-sm mb-5">Select the semester that will become active after this rollover.</p>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-700 text-sm">
                  Make sure the target semester has been added via <strong>Add Semester</strong> before running a rollover. Only <strong>UPCOMING</strong> semesters can be activated.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-[#001A4D] font-bold text-lg mb-5">What will happen during this rollover?</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="border-l-4 border-red-500 pl-3 py-3 pr-3 bg-gray-50">
                    <p className="text-[#001A4D] font-bold text-sm">What Resets (Fresh Start):</p>
                  </div>
                  {[
                    "All active student accounts → Pending Re-enrollment",
                    "Student compliance scores → Reset to 0%",
                    "Student attendance rates → Reset to 0%",
                    "Organization compliance checklists → Reset",
                    "Active event proposal queue → Closed",
                    "Current semester budget tracking → Closed",
                    "Scanner activation codes → Invalidated",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
                      <RefreshCw className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-[#001A4D] text-xs">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="border-l-4 border-green-500 pl-3 py-3 pr-3 bg-gray-50">
                    <p className="text-[#001A4D] font-bold text-sm">What Carries Over (Preserved):</p>
                  </div>
                  {[
                    "All event records and outcomes",
                    "All attendance logs — Preserved in full",
                    "All payment records and outstanding balances",
                    "All fine records and outstanding fines",
                    "All liquidation records",
                    "All student identity and verification data",
                    "All certificate records",
                    "All audit logs and adviser decisions",
                    "All organization membership records",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-[#001A4D] text-xs">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[#001A4D] font-bold text-lg mb-1">Configure the new semester settings.</p>

              {/* Re-enrollment */}
              <div className="p-4 border border-gray-200 rounded-xl">
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Student Re-enrollment</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Re-enrollment Deadline</label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Students must confirm enrollment by this date.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Auto-Inactivate Students Who Don't Confirm</p>
                      <p className="text-xs text-gray-500">After 14 days past deadline</p>
                    </div>
                    <button
                      onClick={() => setAutoInactivate(!autoInactivate)}
                      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${autoInactivate ? "bg-[#83358E]" : "bg-gray-300"}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${autoInactivate ? "translate-x-6" : ""}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Budget */}
              <div className="p-4 border border-gray-200 rounded-xl">
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Budget Setup for New Semester</p>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Carry Over Unspent Org Budgets</p>
                    <p className="text-xs text-gray-500">Add remaining balances from this semester to next semester's allocation.</p>
                  </div>
                  <button
                    onClick={() => setCarryBudget(!carryBudget)}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${carryBudget ? "bg-[#83358E]" : "bg-gray-300"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${carryBudget ? "translate-x-6" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Organization */}
              <div className="p-4 border border-gray-200 rounded-xl">
                <div className="border-l-4 border-[#83358E] pl-3 mb-4">
                  <p className="text-[#001A4D] font-bold text-sm">Organization Settings</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Flag Officer Roles for Re-assignment Review", desc: "Notify SAO that officer positions should be reviewed.", state: flagOfficers, toggle: () => setFlagOfficers(!flagOfficers) },
                    { label: "Reset Organization Compliance Scores", desc: "Resets all organization compliance tracking for the new semester.", state: resetCompliance, toggle: () => setResetCompliance(!resetCompliance) },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                      <button
                        onClick={item.toggle}
                        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${item.state ? "bg-[#83358E]" : "bg-gray-300"}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${item.state ? "translate-x-6" : ""}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <p className="text-[#001A4D] font-bold text-lg mb-4">Final confirmation before executing rollover.</p>
              <div className="p-5 bg-[#001A4D] rounded-2xl mb-4">
                <p className="text-[#FFD41C] font-bold text-xs uppercase tracking-wider mb-3">Rollover Summary</p>
                {[
                  { label: "Budget carry-over", value: carryBudget ? "Yes — unspent balances roll over" : "No — fresh start" },
                  { label: "Auto-inactivate", value: autoInactivate ? "After 14 days of no confirmation" : "Disabled" },
                  { label: "Execution time", value: "Estimated 2–5 minutes" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-white/10 last:border-0">
                    <span className="text-white/70 text-sm">{row.label}</span>
                    <span className="text-white text-sm font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 border border-gray-200 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authorized}
                    onChange={() => setAuthorized(!authorized)}
                    className="w-5 h-5 accent-[#83358E] flex-shrink-0 mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    I authorize this semester rollover. I understand this will affect all active student accounts, reset semester-specific data, and activate the next semester.{" "}
                    <strong>This action cannot be undone.</strong>
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-2 ml-8">Auto-filled: {new Date().toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4 flex items-center justify-between rounded-b-2xl">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            {step > 1 ? "← Previous" : "Cancel"}
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 bg-[#83358E] text-white rounded-lg text-sm font-medium hover:bg-[#6D2A78] transition-colors"
            >
              Next: {steps[step]} →
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-red-500">This action cannot be undone.</p>
              <button
                onClick={handleExecute}
                disabled={!authorized}
                className={`px-5 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
                  authorized ? "bg-[#001A4D] text-[#FFD41C] hover:bg-[#001A4D]/90" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Execute Semester Rollover
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Semester History View ─────────────────────────────────────────────────────
function SemesterHistoryModal({
  semester,
  onClose,
}: {
  semester: SemesterDocument;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("events");
  const historyTabs = ["events", "attendance", "financial", "students"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        {/* Amber read-only banner */}
        <div className="flex items-center justify-between px-6 py-3 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700 font-bold text-sm">
              Viewing Historical Data: {semester.semester} · A.Y. {semester.academicYear}. All data in this view is read-only.
            </span>
          </div>
          <button onClick={onClose} className="text-[#001A4D] text-xs font-medium hover:underline">
            Return to Current Semester
          </button>
        </div>

        {/* Header Card */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-2xl">
              {semester.semester} · A.Y. {semester.academicYear}
            </p>
            <p className="text-white/80 text-sm">
              {formatDate(semester.startDate)} — {formatDate(semester.endDate)}
            </p>
          </div>
          <div className="flex gap-3">
            {[
              { label: "Events Held", value: semester.events },
              { label: "Students Active", value: semester.students },
              { label: "Liquidations Filed", value: "—" },
              { label: "Certificates Issued", value: "—" },
            ].map((chip) => (
              <div key={chip.label} className="px-3 py-2 bg-white/15 rounded-xl text-center">
                <p className="text-white font-bold text-base">{chip.value}</p>
                <p className="text-white/80 text-xs">{chip.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 bg-white">
          {historyTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t ? "border-[#83358E] text-[#83358E]" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "events" ? "Events" : t === "attendance" ? "Attendance" : t === "financial" ? "Financial" : "Students"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "events" && (
            <div className="space-y-3">
              {semester.events === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No events recorded for this semester.</p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Event records are pulled from the events module.</p>
              )}
            </div>
          )}
          {tab === "attendance" && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Overall Attendance Rate", value: "—", color: "text-green-600" },
                { label: "Total Check-ins", value: "—", color: "text-[#001A4D]" },
                { label: "Avg per Event", value: "—", color: "text-[#83358E]" },
              ].map((s) => (
                <div key={s.label} className="p-4 bg-white border border-gray-200 rounded-xl text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-500 text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {tab === "financial" && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Total Budget Allocated", value: "—", color: "text-[#001A4D]" },
                { label: "Total Spent", value: "—", color: "text-[#83358E]" },
                { label: "Liquidations Filed", value: "—", color: "text-blue-600" },
                { label: "Approved", value: "—", color: "text-green-600" },
              ].map((s) => (
                <div key={s.label} className="p-4 bg-white border border-gray-200 rounded-xl">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-500 text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {tab === "students" && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Total Enrolled", value: String(semester.students) || "—", color: "text-[#001A4D]" },
                { label: "Active at Semester End", value: "—", color: "text-green-600" },
                { label: "Overall Compliance Rate", value: "—", color: "text-[#83358E]" },
                { label: "Re-enrollment Confirmation", value: "—", color: "text-blue-600" },
              ].map((s) => (
                <div key={s.label} className="p-4 bg-white border border-gray-200 rounded-xl">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-500 text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-[#001A4D] font-bold text-sm mb-3">Generate Historical Report</p>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-[#001A4D]/90 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export Full Semester Report (PDF)
            </button>
            <button className="px-4 py-2 border border-[#0E4EBD] text-[#0E4EBD] rounded-lg text-xs hover:bg-blue-50 transition-colors flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Export Financial Summary (Excel)
            </button>
            <button className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition-colors">
              Export Attendance Data (CSV)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Archive Confirm Modal ─────────────────────────────────────────────────────
function ArchiveConfirmModal({
  semester,
  onClose,
  onConfirm,
}: {
  semester: SemesterDocument;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-4 flex items-center gap-3">
          <Archive className="w-5 h-5 text-white" />
          <h3 className="text-white font-bold text-base">Archive Semester</h3>
        </div>
        <div className="p-5">
          <p className="text-[#001A4D] font-medium mb-2">
            Archive <strong>{semester.semester} · A.Y. {semester.academicYear}</strong>?
          </p>
          <p className="text-gray-500 text-sm">
            This will mark the semester as <strong>COMPLETED</strong> and hide it from the active view. Historical data is preserved and accessible in the Archived tab.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-600 transition-colors"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive Semester
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Semester Modal ───────────────────────────────────────────────────────
interface EditSemesterModalProps {
  semester: SemesterDocument;
  existingSemesters: SemesterDocument[];
  onClose: () => void;
}

function EditSemesterModal({ semester, existingSemesters, onClose }: EditSemesterModalProps) {
  const [form, setForm] = useState({
    academicYear:     semester.academicYear,
    semester:         semester.semester as SemesterTerm | "",
    startDate:        semester.startDate,
    endDate:          semester.endDate,
    reenrollDeadline: semester.reenrollDeadline ?? "",
    status:           semester.status,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const autoLabel = useMemo(() => {
    if (!form.academicYear || !form.semester) return "";
    return generateSemesterLabel(form.academicYear, form.semester as SemesterTerm);
  }, [form.academicYear, form.semester]);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    if (!form.academicYear.trim()) errs.academicYear = "Academic year is required.";
    if (!form.semester)           errs.semester     = "Please select a semester.";
    if (!form.startDate)          errs.startDate    = "Start date is required.";
    if (!form.endDate)            errs.endDate      = "End date is required.";

    const ayClean = form.academicYear.replace(/[–—]/g, "-").trim();
    const ayMatch = /^\d{4}-\d{4}$/.test(ayClean);
    if (form.academicYear && !ayMatch) {
      errs.academicYear = "Format must be YYYY-YYYY (e.g. 2026-2027).";
    } else if (ayMatch) {
      const [sy, ey] = ayClean.split("-").map(Number);
      if (ey !== sy + 1) errs.academicYear = "End year must be exactly 1 year after start year.";
    }

    if (form.startDate && form.endDate && form.endDate <= form.startDate) {
      errs.endDate = "End date must be after start date.";
    }
    if (form.reenrollDeadline && form.startDate && form.reenrollDeadline > form.startDate) {
      errs.reenrollDeadline = "Re-enrollment deadline should be on or before the semester start date.";
    }

    // Duplicate: same AY + term, but not itself
    const ayClean2 = form.academicYear.replace(/[–—\s]/g, "-").toLowerCase();
    const duplicate = existingSemesters.some(
      (s) =>
        s.id !== semester.id &&
        s.academicYear.replace(/[–—\s]/g, "-").toLowerCase() === ayClean2 &&
        s.semester === form.semester
    );
    if (duplicate && !errs.academicYear && !errs.semester) {
      errs.duplicate = `${form.semester} for A.Y. ${form.academicYear} already exists.`;
    }

    // Date conflict: skip self
    if (form.startDate && form.endDate && !errs.startDate && !errs.endDate) {
      const conflicting = existingSemesters.find((s) => {
        if (s.id === semester.id || !s.startDate || !s.endDate) return false;
        return form.startDate <= s.endDate && form.endDate >= s.startDate;
      });
      if (conflicting) {
        errs.dateConflict =
          `Date range conflicts with: ${conflicting.semester} · A.Y. ${conflicting.academicYear} ` +
          `(${formatDate(conflicting.startDate)} – ${formatDate(conflicting.endDate)}).`;
      }
    }

    return errs;
  }

  async function handleSave() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await updateSemester(semester.id, {
        academicYear:     form.academicYear.replace(/[–—]/g, "-").trim(),
        semester:         form.semester as SemesterTerm,
        startDate:        form.startDate,
        endDate:          form.endDate,
        reenrollDeadline: form.reenrollDeadline,
        status:           form.status,
      });
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch {
      setErrors({ submit: "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Edit className="w-5 h-5 text-[#FFD41C]" />
            <div>
              <h3 className="text-white font-bold text-base">Edit Semester</h3>
              <p className="text-white/70 text-xs mt-0.5">{semester.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banners */}
        {(errors.duplicate || errors.submit) && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-xs">{errors.duplicate || errors.submit}</p>
          </div>
        )}
        {errors.dateConflict && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <Calendar className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 text-xs font-semibold mb-0.5">Date Range Conflict</p>
              <p className="text-red-700 text-xs">{errors.dateConflict}</p>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Academic Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Academic Year <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 2026-2027"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                errors.academicYear ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              value={form.academicYear}
              onChange={(e) => {
                setForm({ ...form, academicYear: e.target.value });
                setErrors((p) => ({ ...p, academicYear: "", duplicate: "" }));
              }}
            />
            {errors.academicYear && <p className="text-red-500 text-xs mt-1">{errors.academicYear}</p>}
          </div>

          {/* Semester */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Semester <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {(["1st Semester", "2nd Semester"] as SemesterTerm[]).map((opt) => (
                <label
                  key={opt}
                  className={`flex-1 flex items-center gap-2.5 px-4 py-3 border rounded-lg cursor-pointer transition-all ${
                    form.semester === opt
                      ? "border-[#83358E] bg-[#F3E8FF]/40 ring-2 ring-[#83358E]/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="edit-semester"
                    value={opt}
                    checked={form.semester === opt}
                    onChange={() => {
                      setForm({ ...form, semester: opt });
                      setErrors((p) => ({ ...p, semester: "", duplicate: "" }));
                    }}
                    className="accent-[#83358E]"
                  />
                  <span className="text-sm font-medium text-[#001A4D]">{opt}</span>
                </label>
              ))}
            </div>
            {errors.semester && <p className="text-red-500 text-xs mt-1">{errors.semester}</p>}
          </div>

          {/* Auto label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              Semester Label
              <span className="text-[10px] text-[#83358E] bg-purple-50 px-1.5 py-0.5 rounded font-semibold">AUTO</span>
            </label>
            <div className="relative">
              <input
                readOnly
                type="text"
                value={autoLabel || "Fill in Academic Year and Semester above…"}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 italic text-sm pr-9"
              />
              <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                  errors.startDate || errors.dateConflict ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                value={form.startDate}
                onChange={(e) => {
                  setForm({ ...form, startDate: e.target.value });
                  setErrors((p) => ({ ...p, startDate: "", endDate: "", dateConflict: "" }));
                }}
              />
              {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                  errors.endDate || errors.dateConflict ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                value={form.endDate}
                onChange={(e) => {
                  setForm({ ...form, endDate: e.target.value });
                  setErrors((p) => ({ ...p, endDate: "", dateConflict: "" }));
                }}
              />
              {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Re-enrollment Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Re-enrollment Deadline</label>
            <input
              type="date"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent ${
                errors.reenrollDeadline ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              value={form.reenrollDeadline}
              onChange={(e) => {
                setForm({ ...form, reenrollDeadline: e.target.value });
                setErrors((p) => ({ ...p, reenrollDeadline: "" }));
              }}
            />
            {errors.reenrollDeadline && <p className="text-red-500 text-xs mt-1">{errors.reenrollDeadline}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              saved ? "bg-green-600 text-white" : "bg-[#001A4D] text-white hover:bg-[#001A4D]/90"
            }`}
          >
            {saving ? (
              <><Loader className="w-4 h-4 animate-spin" />Saving…</>
            ) : saved ? (
              <><CheckCircle className="w-4 h-4" />Saved!</>
            ) : (
              <><Save className="w-4 h-4" />Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({
  semester,
  onClose,
  onConfirm,
}: {
  semester: SemesterDocument;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);
    await onConfirm();
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4 flex items-center gap-3">
          <Trash2 className="w-5 h-5 text-white" />
          <h3 className="text-white font-bold text-base">Delete Semester</h3>
        </div>

        <div className="p-5 space-y-4">
          {/* Warning */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 text-xs font-semibold">This action is permanent and cannot be undone.</p>
              <p className="text-red-600 text-xs mt-0.5">
                All records associated with this semester will be permanently removed from the database.
              </p>
            </div>
          </div>

          {/* Semester info */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-[#001A4D] font-bold text-sm">{semester.semester} · A.Y. {semester.academicYear}</p>
            <p className="text-gray-500 text-xs mt-1">
              {formatDate(semester.startDate)} — {formatDate(semester.endDate)}
            </p>
            <span className="mt-2 inline-flex px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
              ARCHIVED
            </span>
          </div>

          {/* Confirmation input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
            </label>
            <input
              type="text"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono ${
                confirmText && !isConfirmed ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!isConfirmed || loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              isConfirmed && !loading
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-0">
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-8 bg-gray-200 rounded" />
          <div className="h-4 w-8 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function AcademicSemesterSettings() {
  const { data: semesters, loading, error } = useSemesters();

  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<SemesterDocument | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SemesterDocument | null>(null);
  const [editTarget, setEditTarget]       = useState<SemesterDocument | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<SemesterDocument | null>(null);

  const activeSemester = semesters.find((s) => s.status === "ACTIVE");
  const bannerState = deriveBannerState(semesters);

  const filteredSemesters = useMemo(() => {
    return activeTab === "active"
      ? semesters.filter((s) => !s.archived)
      : semesters.filter((s) => s.archived || s.status === "COMPLETED");
  }, [semesters, activeTab]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Academic Year &amp; Semester</h2>
          <p className="text-gray-500 text-sm">Settings &rsaquo; Academic Year &amp; Semester</p>
        </div>
        <button
          onClick={() => setShowRollover(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-[#83358E] to-[#A855F7] text-white rounded-lg font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Run Semester Rollover
        </button>
      </div>

      {/* Active Semester Banner */}
      <ActiveSemesterBanner
        state={bannerState}
        activeSemester={activeSemester}
        onRollover={() => setShowRollover(true)}
      />

      {/* Firebase error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">Failed to load semesters: {error.message}</p>
        </div>
      )}

      {/* Semester Records Table */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden">
        {/* Section Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Semester Records</h3>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("active")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === "active" ? "bg-[#001A4D] text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab("archived")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === "archived" ? "bg-[#001A4D] text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Archived
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#001A4D] text-[#FFD41C] rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[#001A4D]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Semester
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <TableSkeleton />
        ) : filteredSemesters.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium text-sm">
              {activeTab === "active" ? "No active or upcoming semesters." : "No archived semesters."}
            </p>
            {activeTab === "active" && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-3 px-4 py-2 text-[#83358E] text-sm font-medium hover:underline flex items-center gap-1 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Add your first semester
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Status", "Academic Year", "Semester", "Label", "Start Date", "End Date", "Duration", "Events", "Students", "Actions"].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#E0E0E0]"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {filteredSemesters.map((sem) => (
                  <tr
                    key={sem.id}
                    className={`transition-colors ${
                      sem.status === "ACTIVE"
                        ? "border-l-4 border-l-[#FFD41C] bg-[#F3E8FF]/30 hover:bg-[#F3E8FF]/50"
                        : "hover:bg-[#F3E8FF]/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <StatusPill status={sem.status} />
                    </td>
                    <td className="px-4 py-3 text-[#001A4D] font-bold text-sm">A.Y. {sem.academicYear}</td>
                    <td className="px-4 py-3 text-[#001A4D] text-sm">{sem.semester}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-purple-50 text-[#83358E] text-xs font-mono font-semibold rounded">
                        {sem.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(sem.startDate)}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(sem.endDate)}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{weeksBetween(sem.startDate, sem.endDate)}</td>
                    <td className="px-4 py-3 text-blue-600 font-bold text-sm">{sem.events}</td>
                    <td className="px-4 py-3 text-[#001A4D] font-bold text-sm">{sem.students}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* View — always available */}
                        <button
                          onClick={() => setHistoryTarget(sem)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                          title="View Semester Data"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Edit — disabled for ACTIVE */}
                        <button
                          onClick={() => setEditTarget(sem)}
                          disabled={sem.status === "ACTIVE"}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                            sem.status === "ACTIVE"
                              ? "text-gray-300 cursor-not-allowed"
                              : "hover:bg-gray-100 text-gray-500"
                          }`}
                          title={sem.status === "ACTIVE" ? "Cannot edit active semester — run rollover first." : "Edit Semester"}
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        {/* Archive — shown only for non-archived, non-ACTIVE */}
                        {!sem.archived && sem.status !== "ACTIVE" && (
                          <button
                            onClick={() => setArchiveTarget(sem)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-50 text-amber-500 transition-colors"
                            title="Archive Semester"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete — only for archived semesters */}
                        {sem.archived && (
                          <button
                            onClick={() => setDeleteTarget(sem)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                            title="Delete Semester (archived only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddSemesterModal
          existingSemesters={semesters}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}
      {showRollover && <RolloverModal onClose={() => setShowRollover(false)} />}
      {historyTarget && (
        <SemesterHistoryModal semester={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
      {archiveTarget && (
        <ArchiveConfirmModal
          semester={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => archiveSemester(archiveTarget.id)}
        />
      )}
      {editTarget && (
        <EditSemesterModal
          semester={editTarget}
          existingSemesters={semesters}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          semester={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteSemester(deleteTarget.id)}
        />
      )}
    </div>
  );
}
