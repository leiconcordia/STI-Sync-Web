import { Link, useLocation, useNavigate } from 'react-router';
import stiSyncLogo from '../../../imports/STI_SYNC_LOGO.jpg';
import {
  LayoutDashboard,
  Calendar,
  QrCode,
  Award,
  Receipt,
  Users,
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  Wallet,
  Files,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/officer/dashboard', badge: null },
  { icon: Calendar, label: 'Event Management', path: '/officer/events', badge: null },
  { icon: QrCode, label: 'Attendance Logs', path: '/officer/attendance', badge: null },
  { icon: Award, label: 'Certificates', path: '/officer/certificates', badge: 2 },
  { icon: Wallet, label: 'Finance Center', path: '/officer/finance', badge: 2 },
  { icon: Receipt, label: 'Financial Liquidation', path: '/officer/liquidation', badge: null },
  { icon: Users, label: 'Member Directory', path: '/officer/members', badge: null },
  { icon: Files, label: 'Documents', path: '/officer/documents', badge: 2 },
  { icon: Bell, label: 'Announcements', path: '/officer/announcements', badge: 3 },
  { icon: Settings, label: 'Settings', path: '/officer/settings', badge: null },
];

export function OfficerSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[#E0E0E0] flex flex-col">
      {/* Logo and Org Switcher */}
      <div className="p-4 border-b border-[#E0E0E0]">
        <div className="flex items-center gap-2 mb-3">
          <img src={stiSyncLogo} alt="STI Sync" className="w-8 h-8 object-cover rounded-lg" />
          <span className="text-[#001A4D] font-bold text-lg">STI Sync</span>
        </div>

        {/* Organization Context Switcher */}
        <button className="w-full flex items-center justify-between px-3 py-2 bg-[#EEEDFE] rounded-lg hover:bg-[#EEEDFE]/80 transition-colors">
          <span className="text-[#7F77DD] text-sm font-medium">STI IT Guild</span>
          <ChevronDown className="w-4 h-4 text-[#7F77DD]" />
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all group ${
                isActive
                  ? 'bg-[#F3E8FF] text-[#83358E]'
                  : 'text-[#888780] hover:text-[#001A4D] hover:bg-gray-50'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#83358E] rounded-r" />
              )}
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium flex-1">{item.label}</span>
              {item.badge !== null && (
                <span className={`w-2 h-2 rounded-full ${item.path === '/officer/certificates' ? 'bg-[#FFC107]' : 'bg-[#E24B4A]'}`} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Officer Profile */}
      <div className="p-4 border-t border-[#E0E0E0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-semibold">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#001A4D] text-sm font-medium truncate">Juan Dela Cruz</div>
            <div className="text-[#888780] text-xs">Organization Officer</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4 text-[#888780]" />
          </button>
        </div>
      </div>
    </div>
  );
}
