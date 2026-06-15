import { Outlet, useLocation } from 'react-router';
import { OfficerSidebar } from './OfficerSidebar';
import { OfficerTopNav } from './OfficerTopNav';

const pageTitles: Record<string, string> = {
  '/officer/dashboard': 'Dashboard',
  '/officer/events': 'Event Management',
  '/officer/attendance': 'Attendance Logs',
  '/officer/liquidation': 'Financial Liquidation',
  '/officer/members': 'Member Directory',
  '/officer/announcements': 'Announcements',
  '/officer/settings': 'Settings',
};

export function OfficerLayout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Officer Portal';

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <OfficerSidebar />
      <div className="ml-[240px]">
        <OfficerTopNav title={title} />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
