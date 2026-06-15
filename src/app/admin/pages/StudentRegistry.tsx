import { useState } from 'react';
import { Clock, RefreshCw, UserCheck, UserX, Archive } from 'lucide-react';
import RegistryDashboard from '../components/student-registry/RegistryDashboard';
import PendingVerification from '../components/student-registry/PendingVerification';
import ReEnrollmentManagement from '../components/student-registry/ReEnrollmentManagement';
import ActiveStudents from '../components/student-registry/ActiveStudents';
import InactiveSuspended from '../components/student-registry/InactiveSuspended';
import ArchivedGraduates from '../components/student-registry/ArchivedGraduates';

type RegistryView = 'dashboard' | 'pending' | 'reenrollment' | 'active' | 'inactive' | 'archived';

export function StudentRegistry() {
  const [activeView, setActiveView] = useState<RegistryView>('dashboard');

  const pendingCount = 12;
  const reenrollmentCount = 158;

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <RegistryDashboard onNavigate={setActiveView} />;
      case 'pending':
        return <PendingVerification />;
      case 'reenrollment':
        return <ReEnrollmentManagement />;
      case 'active':
        return <ActiveStudents />;
      case 'inactive':
        return <InactiveSuspended />;
      case 'archived':
        return <ArchivedGraduates />;
      default:
        return <RegistryDashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2 bg-white border border-[#E0E0E0] rounded-xl p-2">
        <button
          onClick={() => setActiveView('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'dashboard'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveView('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'pending'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending Verification
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('reenrollment')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'reenrollment'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Re-enrollment
          {reenrollmentCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs">
              {reenrollmentCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'active'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Active Students
        </button>
        <button
          onClick={() => setActiveView('inactive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'inactive'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          <UserX className="w-4 h-4" />
          Inactive & Suspended
        </button>
        <button
          onClick={() => setActiveView('archived')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === 'archived'
              ? 'bg-[#001A4D] text-white'
              : 'text-[#001A4D] hover:bg-gray-50'
          }`}
        >
          <Archive className="w-4 h-4" />
          Archived
        </button>
      </div>

      {/* Main Content */}
      {renderView()}
    </div>
  );
}
