import React, { useRef, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  X, Printer, Download, QrCode, User,
  Calendar, CheckCircle2, Clock, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import type { EnrichedAttendanceRecord } from '../types/attendance.types';
import type { StudentDocument } from '../../students/types/student.types';

export interface StudentAttendancePassModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: EnrichedAttendanceRecord | null;
  student?: StudentDocument | any | null;
  eventTitle?: string;
}

export function StudentAttendancePassModal({
  isOpen,
  onClose,
  record,
  student,
  eventTitle,
}: StudentAttendancePassModalProps) {
  const qrContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !record) return null;

  // Extract clean student details
  const studentSchoolId = (
    record.studentSchoolId ||
    record.studentId ||
    student?.studentId ||
    ''
  ).trim();

  const studentAuthUid = (
    record.studentAuthUid ||
    student?.authUid ||
    student?.id ||
    record.studentId ||
    ''
  ).trim();

  const studentName =
    record.name ||
    (student ? `${student.firstName} ${student.lastName}`.trim() : 'STI Student');

  const courseInfo =
    record.courseCode ||
    record.courseName ||
    student?.courseCode ||
    student?.courseName ||
    'STI College';

  const yearLevel = record.yearLevel || student?.yearLevel || '';
  const section = record.section || student?.section || '';
  const department = record.departmentCode || record.departmentName || student?.departmentName || '';
  const photoUrl = student?.profilePhotoUrl || (record as any)?.profilePhotoUrl || '';
  const status = record.status || 'Unchecked';

  // Exact mobile-compatible payload format matching Flutter scanner
  const payloadObject = {
    type: 'STI_STUDENT_ID',
    studentId: studentSchoolId,
    studentAuthUid: studentAuthUid,
  };
  const qrPayload = JSON.stringify(payloadObject);

  // Status badge styling
  const statusConfig: Record<string, { label: string; bg: string; icon: any }> = {
    'Complete': { label: 'Present / Complete', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    'Checked In': { label: 'Checked In', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
    'Checked Out': { label: 'Checked Out', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: CheckCircle2 },
    'Late': { label: 'Late', bg: 'bg-orange-50 text-orange-700 border-orange-200', icon: Clock },
    'Absent': { label: 'Absent', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle },
    'Flagged': { label: 'Flagged', bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  };
  const currentStatus = statusConfig[status] || {
    label: status,
    bg: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: User,
  };
  const StatusIcon = currentStatus.icon;

  // Name initials for avatar fallback
  const initials = studentName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  // Download high-resolution QR PNG
  const handleDownloadQR = () => {
    try {
      const canvas = qrContainerRef.current?.querySelector('canvas');
      if (!canvas) {
        toast.error('Unable to capture QR code canvas for download.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `STI_Student_Pass_${studentSchoolId || 'QR'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Downloaded QR pass for ${studentName}`);
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download QR code image.');
    }
  };

  // Trigger print
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print-specific CSS styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #sti-student-pass-printable, #sti-student-pass-printable * {
            visibility: visible !important;
          }
          #sti-student-pass-printable {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 360px !important;
            border: 2px solid #001A4D !important;
            border-radius: 16px !important;
            box-shadow: none !important;
            background: white !important;
            z-index: 999999 !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 bg-[#001A4D]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          id="sti-student-pass-printable"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden text-gray-800 animate-in zoom-in-95 duration-150 flex flex-col"
        >
          {/* Top STI Navy Header */}
          <div className="bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#001A4D] text-white px-5 py-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                <QrCode className="w-4 h-4 text-[#FFD41C]" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                  <span>Student Attendance Pass</span>
                </h3>
                <p className="text-[10px] text-blue-100/90 font-medium">
                  Universal STI Student QR Pass
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="no-print p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Close pass modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Pass Body */}
          <div className="p-5 flex flex-col items-center text-center space-y-4 bg-white">
            {/* Student Identity Card */}
            <div className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-blue-50/50 border border-blue-100/80 text-left">
              {/* Profile Photo / Avatar Initials */}
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] flex items-center justify-center text-white font-extrabold text-base">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={studentName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{initials || 'ST'}</span>
                )}
              </div>

              {/* Student Bio */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="font-bold text-[#001A4D] text-sm truncate" title={studentName}>
                    {studentName}
                  </h4>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-bold text-xs text-[#0E4EBD] bg-white px-1.5 py-0.5 rounded border border-blue-200">
                    {studentSchoolId || 'No ID'}
                  </span>
                  {section && (
                    <span className="text-[11px] font-semibold text-gray-500 truncate">
                      Sec. {section}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 truncate">
                  {courseInfo} {yearLevel ? `• ${yearLevel}` : ''}
                </p>
              </div>
            </div>

            {/* Attendance Status Badge & Event Title */}
            <div className="w-full flex items-center justify-between gap-2 px-1 text-xs">
              <span className="text-gray-500 text-[11px] truncate max-w-[170px]" title={eventTitle || 'Activity'}>
                {eventTitle || 'Campus Activity'}
              </span>
              <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 shrink-0 ${currentStatus.bg}`}>
                <StatusIcon className="w-3 h-3" />
                <span>{currentStatus.label}</span>
              </div>
            </div>

            {/* High Contrast QR Code Display */}
            <div
              ref={qrContainerRef}
              className="bg-white p-3.5 rounded-2xl border-2 border-dashed border-[#0E4EBD]/30 shadow-xs flex flex-col items-center justify-center relative"
            >
              <QRCodeCanvas
                value={qrPayload}
                size={220}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#001A4D"
                includeMargin={true}
              />
            </div>

            {/* Scan Guidance Note */}
            <p className="text-[11px] text-gray-500 leading-relaxed px-2">
              Scan directly from monitor using the <strong className="text-[#001A4D]">STI Sync Scanner App</strong> or print as an official badge.
            </p>
          </div>

          {/* Action Buttons Footer */}
          <div className="no-print p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-2 px-3 bg-[#001A4D] hover:bg-[#00266e] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Print Student Attendance Pass"
            >
              <Printer className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Print Pass</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQR}
              className="flex-1 py-2 px-3 bg-[#FFD41C] hover:bg-amber-400 text-[#001A4D] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Download PNG QR Image"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download QR</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

