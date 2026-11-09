import React from 'react';
import {
  Search,
  Filter,
  RotateCcw,
  Calendar,
  Building2,
  GraduationCap,
  X,
} from 'lucide-react';
import type { UniversalFilterState, ReportScope } from '../types/report.types';
import type { SemesterDocument } from '../../academic/types/academic.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';

interface UniversalReportFilterBarProps {
  filterState: UniversalFilterState;
  onChange: (updates: Partial<UniversalFilterState>) => void;
  onReset: () => void;
  semesters: SemesterDocument[];
  organizations: OrganizationDocument[];
  activePeriod?: { academicYear?: string; semester?: string; label?: string } | null;
  className?: string;
}

export const UniversalReportFilterBar: React.FC<UniversalReportFilterBarProps> = ({
  filterState,
  onChange,
  onReset,
  semesters,
  organizations,
  activePeriod,
  className = '',
}) => {
  const isFiltered = Boolean(
    filterState.semesterId !== 'ACTIVE' ||
    filterState.organizationId !== 'ALL' ||
    filterState.scope !== 'ALL' ||
    filterState.searchQuery.trim().length > 0
  );

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-3.5 ${className}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterState.searchQuery}
            onChange={(e) => onChange({ searchQuery: e.target.value })}
            placeholder="Search by title, reference code, officer, or student ID..."
            className="w-full pl-9.5 pr-8 py-2 text-xs bg-gray-50/80 hover:bg-gray-50 focus:bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0E4EBD]/20 focus:border-[#0E4EBD] transition-all font-medium text-gray-800 placeholder:text-gray-400"
          />
          {filterState.searchQuery && (
            <button
              onClick={() => onChange({ searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Academic Level Scope Toggle (Segmented Control) */}
        <div className="flex items-center gap-1.5 self-start lg:self-center">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider hidden sm:inline mr-1">
            Scope:
          </span>
          <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200/80">
            {(['ALL', 'COLLEGE', 'SHS'] as ReportScope[]).map((sc) => {
              const active = filterState.scope === sc;
              return (
                <button
                  key={sc}
                  onClick={() => onChange({ scope: sc })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? sc === 'SHS'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
                  }`}
                >
                  {sc === 'ALL' ? 'All Tracks' : sc === 'COLLEGE' ? 'College' : 'Senior High'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dropdown Filters Row */}
      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100 text-xs">
        {/* Academic Semester Selector */}
        <div className="flex items-center gap-1.5 min-w-[200px]">
          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-gray-500 font-semibold whitespace-nowrap">Semester:</span>
          <select
            value={filterState.semesterId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'ACTIVE') {
                onChange({
                  semesterId: 'ACTIVE',
                  academicYear: activePeriod?.academicYear,
                  semester: activePeriod?.semester,
                });
              } else if (val === 'ALL') {
                onChange({
                  semesterId: 'ALL',
                  academicYear: undefined,
                  semester: undefined,
                });
              } else {
                const found = semesters.find((s) => s.id === val);
                onChange({
                  semesterId: val,
                  academicYear: found?.academicYear,
                  semester: found?.semester,
                });
              }
            }}
            className="flex-1 px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#001A4D] transition-colors"
          >
            <option value="ACTIVE">
              {activePeriod?.label ? `${activePeriod.label} • Active Term` : 'Current Active Semester'}
            </option>
            <option value="ALL">All Semesters (Historical)</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.academicLevel === 'SHS' ? 'SHS' : 'College'})
              </option>
            ))}
          </select>
        </div>

        {/* Organization / Department Selector */}
        <div className="flex items-center gap-1.5 min-w-[220px]">
          <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-gray-500 font-semibold whitespace-nowrap">Organization:</span>
          <select
            value={filterState.organizationId}
            onChange={(e) => onChange({ organizationId: e.target.value })}
            className="flex-1 px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#001A4D] transition-colors"
          >
            <option value="ALL">All Campus Organizations</option>
            <option value="sas">Student Affairs & Services (SAS)</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.acronym ? `${org.acronym} — ${org.name}` : org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Button */}
        {isFiltered && (
          <button
            onClick={onReset}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Active Semester
          </button>
        )}
      </div>
    </div>
  );
};

