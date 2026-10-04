/**
 * src/app/admin/pages/StudentRegistry.tsx
 *
 * Streamlined Student Registry with automated Registrar Bulk Enrollment,
 * Active Student Directory, Inactive/Unenrolled Tracking, and Graduate Archives.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import {
  UserCheck,
  UserX,
  Archive,
  LayoutDashboard,
  Loader2,
} from 'lucide-react';
import ActiveStudents from '../components/student-registry/ActiveStudents';
import InactiveSuspended from '../components/student-registry/InactiveSuspended';
import ArchivedGraduates from '../components/student-registry/ArchivedGraduates';
import RegistryDashboard from '../components/student-registry/RegistryDashboard';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import type { StudentDocument } from '../../modules/students/types/student.types';

type RegistryView = 'active' | 'inactive' | 'archived' | 'dashboard';

export function StudentRegistry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<RegistryView>('active');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['active', 'inactive', 'archived', 'dashboard'].includes(tab)) {
      setActiveView(tab as RegistryView);
    }
  }, [searchParams]);

  const handleNavigate = (view: string, studentIdOrSearch?: string) => {
    if (studentIdOrSearch) {
      setSearchParams({ tab: view, id: studentIdOrSearch });
    } else {
      setSearchParams({ tab: view });
    }
    setActiveView(view as RegistryView);
  };

  const { data: students, loading: loadingStudents, error: errorStudents } = useStudents();
  const {
    activeCollegePeriod,
    activeShsPeriod,
    loading: loadingSemesters,
    error: errorSemesters,
  } = useActiveAcademicPeriods();

  const loading = loadingStudents || loadingSemesters;
  const error = errorStudents || errorSemesters;
  const activeSemester = activeCollegePeriod || activeShsPeriod;

  const categorizedStudents = useMemo(() => {
    const active: StudentDocument[] = [];
    const inactive: StudentDocument[] = [];
    const archived: StudentDocument[] = [];

    students.forEach((student) => {
      switch (student.status) {
        case 'ACTIVE':
          active.push(student);
          break;
        case 'INACTIVE':
        case 'SUSPENDED':
          inactive.push(student);
          break;
        case 'ARCHIVED':
          archived.push(student);
          break;
        default:
          active.push(student);
          break;
      }
    });

    return { active, inactive, archived, reenrollment: [] };
  }, [students]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#001A4D]" />
        <p className="text-gray-500 font-medium">Loading student registry data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h3 className="font-bold mb-2">Error loading registry</h3>
        <p>{error.message}</p>
      </div>
    );
  }

  const { active, inactive, archived } = categorizedStudents;

  const renderView = () => {
    switch (activeView) {
      case 'active':
        return <ActiveStudents students={active} />;
      case 'inactive':
        return <InactiveSuspended inactiveStudents={inactive} suspendedStudents={[]} />;
      case 'archived':
        return <ArchivedGraduates students={archived} />;
      case 'dashboard':
        return (
          <RegistryDashboard
            onNavigate={handleNavigate}
            categorizedStudents={categorizedStudents}
            activeSemester={activeSemester}
            activeCollegePeriod={activeCollegePeriod}
            activeShsPeriod={activeShsPeriod}
            allStudents={students}
          />
        );
      default:
        return <ActiveStudents students={active} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Streamlined Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E0E0E0] rounded-xl p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleNavigate('active')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              activeView === 'active'
                ? 'bg-[#001A4D] text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Active Students</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
              activeView === 'active' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
            }`}>
              {active.length}
            </span>
          </button>

          <button
            onClick={() => handleNavigate('inactive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              activeView === 'inactive'
                ? 'bg-[#001A4D] text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <UserX className="w-4 h-4 text-amber-400" />
            <span>Inactive / Dropped</span>
            {inactive.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                activeView === 'inactive' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {inactive.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavigate('archived')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              activeView === 'archived'
                ? 'bg-[#001A4D] text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Archive className="w-4 h-4 text-purple-400" />
            <span>Archived Graduates</span>
            {archived.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                activeView === 'archived' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {archived.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => handleNavigate('dashboard')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeView === 'dashboard'
              ? 'bg-blue-50 text-[#001A4D] font-bold border border-blue-200'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Analytics Overview</span>
        </button>
      </div>

      {/* Main Content Area */}
      {renderView()}
    </div>
  );
}
