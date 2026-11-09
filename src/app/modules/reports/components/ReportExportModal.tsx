import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  X,
  Download,
  Printer,
  Calendar,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { TablePagination } from '../../../components/common/TablePagination';
import type { GeneratedReportData } from '../types/report.types';
import { exportReportToPDF } from '../utils/pdf-report-builder';
import { exportReportToCSV } from '../utils/csv-report-builder';

interface ReportExportModalProps {
  report: GeneratedReportData | null;
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_PER_PAGE = 8;

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  report,
  isOpen,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [report]);

  if (!isOpen || !report) return null;

  const totalPages = Math.max(1, Math.ceil((report.rows.length || 0) / REPORT_PER_PAGE));
  const paginatedRows = report.rows.slice(
    (currentPage - 1) * REPORT_PER_PAGE,
    currentPage * REPORT_PER_PAGE
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#FFD41C]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">{report.title}</h3>
              <p className="text-xs text-white/70">
                Scope: {report.metadata.scope} · {report.metadata.academicYear || 'A.Y. 2026-2027'}{' '}
                {report.metadata.semester || ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Executive Summary Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {report.kpis.map((kpi, i) => (
              <div key={i} className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-left">
                <p className="text-[11px] text-gray-500 font-semibold uppercase">{kpi.label}</p>
                <p className="text-lg font-bold text-[#001A4D] mt-0.5">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Data Table Preview */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#001A4D] text-white font-bold sticky top-0 uppercase tracking-wider">
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 whitespace-nowrap">
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/40">
                      {report.columns.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 whitespace-nowrap text-gray-700">
                          {String(row[c.key] || '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan={report.columns.length} className="text-center py-10 text-gray-400">
                        No records found matching the current academic filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={report.rows.length}
              itemsPerPage={REPORT_PER_PAGE}
              onPageChange={setCurrentPage}
              itemName="records"
            />
          </div>

          {/* Official Signatories Block Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100 text-xs">
            <div>
              <span className="text-gray-400 block text-[11px]">Prepared by:</span>
              <p className="font-bold text-[#001A4D] mt-1">{report.signatories?.preparedBy?.name || 'SAS Staff'}</p>
              <p className="text-gray-500 text-[11px]">{report.signatories?.preparedBy?.title || 'Student Affairs & Services'}</p>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Attested by:</span>
              <p className="font-bold text-[#001A4D] mt-1">{report.signatories?.attestedBy?.name || 'SAS Coordinator'}</p>
              <p className="text-gray-500 text-[11px]">{report.signatories?.attestedBy?.title || 'Student Affairs Head'}</p>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Approved by:</span>
              <p className="font-bold text-[#001A4D] mt-1">{report.signatories?.approvedBy?.name || 'School Administrator'}</p>
              <p className="text-gray-500 text-[11px]">{report.signatories?.approvedBy?.title || 'School Principal / Administrator'}</p>
            </div>
          </div>
        </div>

        {/* Modal Footer (Export Actions) */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Close Preview
          </button>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => exportReportToCSV(report)}
              variant="outline"
              className="border-[#0E4EBD] text-[#0E4EBD] text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV / Excel
            </Button>
            <Button
              onClick={() => exportReportToPDF(report)}
              className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Export Official PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

