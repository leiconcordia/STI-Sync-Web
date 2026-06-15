import { useState } from 'react';
import { Upload, Eye, EyeOff, Monitor, Smartphone, LogOut, ShieldCheck } from 'lucide-react';

type SettingsSection = 'account' | 'security' | 'notifications';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'bg-red-500', 'bg-amber-400', 'bg-blue-500', 'bg-green-500'];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i <= score ? colors[score] : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {score > 0 && (
        <p className={`text-[11px] font-medium ${
          score === 1 ? 'text-red-500' : score === 2 ? 'text-amber-500' : score === 3 ? 'text-blue-500' : 'text-green-600'
        }`}>
          {labels[score]} password
        </p>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#83358E]' : 'bg-gray-300'
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: 'account', label: 'Account Profile' },
  { key: 'security', label: 'Security & Password' },
  { key: 'notifications', label: 'Notification Preferences' },
];

export default function OfficerSettings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const [notifications, setNotifications] = useState({
    eventAnnouncements: true,
    liquidationUpdates: true,
    attendanceReminders: true,
    paymentAlerts: true,
    advisorMessages: true,
    documentApprovals: false,
  });

  const toggleNotif = (key: keyof typeof notifications) =>
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));

  const sessions = [
    { device: 'Windows PC', browser: 'Chrome 125', timestamp: 'Jun 11, 2026 · 8:30 AM', location: 'Ormoc City', current: true, icon: Monitor },
    { device: 'Android Phone', browser: 'Mobile App', timestamp: 'Jun 10, 2026 · 5:45 PM', location: 'Ormoc City', current: false, icon: Smartphone },
    { device: 'Windows PC', browser: 'Chrome 124', timestamp: 'Jun 9, 2026 · 9:15 AM', location: 'Ormoc City', current: false, icon: Monitor },
  ];

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:ring-2 focus:ring-[#83358E] focus:border-transparent outline-none transition';
  const readOnlyClass =
    'w-full px-4 py-2.5 border border-gray-200 rounded-lg text-[14px] bg-gray-50 text-gray-500 cursor-not-allowed';

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[#888780] text-[13px] mb-1">Dashboard › Settings</div>
        <h1 className="text-[#001A4D] text-[24px] font-bold">Settings</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar nav */}
        <div className="col-span-3">
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-3">
            <nav className="space-y-0.5">
              {NAV_ITEMS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                    activeSection === key
                      ? 'bg-[#F3E8FF] text-[#83358E]'
                      : 'text-[#888780] hover:bg-gray-50 hover:text-[#001A4D]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content panel */}
        <div className="col-span-9">
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">

            {/* ── Account Profile ── */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                <h2 className="text-[#001A4D] text-[18px] font-bold">Account Profile</h2>

                {/* Avatar */}
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 bg-[#83358E] rounded-full flex items-center justify-center text-white font-bold text-2xl">
                      JD
                    </div>
                    <button className="absolute bottom-0 right-0 p-1.5 bg-white border border-[#E0E0E0] rounded-full shadow hover:bg-gray-50 transition">
                      <Upload className="w-3.5 h-3.5 text-[#83358E]" />
                    </button>
                  </div>
                  <div>
                    <p className="text-[#001A4D] text-[13px] font-semibold">Profile Photo</p>
                    <p className="text-[#888780] text-[12px] mt-0.5">JPG or PNG · max 2 MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Full Name</label>
                    <input type="text" defaultValue="Juan Dela Cruz" className={inputClass} />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Student ID</label>
                    <input type="text" defaultValue="2021-00001" readOnly className={readOnlyClass} />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Course & Year</label>
                    <input type="text" defaultValue="BSIT · 3rd Year" readOnly className={readOnlyClass} />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Officer Role</label>
                    <input type="text" defaultValue="President" readOnly className={readOnlyClass} />
                  </div>

                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Contact Number</label>
                    <input type="tel" defaultValue="+63 912 345 6789" className={inputClass} />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Email Address</label>
                    <input type="email" defaultValue="juan.delacruz@sti.edu" className={inputClass} />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button className="px-5 py-2 bg-[#83358E] text-white rounded-lg text-[14px] font-medium hover:bg-[#6D2A78] transition-colors">
                    Save Changes
                  </button>
                  <button className="px-5 py-2 border border-gray-300 text-gray-600 rounded-lg text-[14px] font-medium hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Security & Password ── */}
            {activeSection === 'security' && (
              <div className="space-y-6">
                <h2 className="text-[#001A4D] text-[18px] font-bold">Security & Password</h2>

                {/* Change password */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        placeholder="Enter current password"
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={newPassword} />
                  </div>

                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button className="px-5 py-2 bg-[#83358E] text-white rounded-lg text-[14px] font-medium hover:bg-[#6D2A78] transition-colors">
                  Update Password
                </button>

                {/* Active sessions */}
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#83358E]" />
                      <h3 className="text-[#001A4D] text-[15px] font-bold">Active Sessions</h3>
                    </div>
                    <button className="text-[13px] text-red-500 hover:text-red-600 font-medium transition-colors">
                      Sign out all other sessions
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sessions.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                            <s.icon className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[#001A4D] text-[13px] font-medium">{s.device} · {s.browser}</p>
                              {s.current && (
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">
                                  This device
                                </span>
                              )}
                            </div>
                            <p className="text-[#888780] text-[11px] mt-0.5">{s.timestamp} · {s.location}</p>
                          </div>
                        </div>
                        {!s.current && (
                          <button className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Sign out">
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Notifications ── */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-[#001A4D] text-[18px] font-bold">Notification Preferences</h2>
                <p className="text-[#888780] text-[13px] -mt-3">
                  Choose which in-app notifications you receive.
                </p>

                {/* Events group */}
                <div>
                  <p className="text-[11px] font-bold text-[#888780] uppercase tracking-wider mb-3">Events</p>
                  <div className="space-y-0">
                    <NotifRow
                      label="Event Announcements"
                      description="New events posted by officers or advisers"
                      checked={notifications.eventAnnouncements}
                      onChange={() => toggleNotif('eventAnnouncements')}
                    />
                    <NotifRow
                      label="Attendance Reminders"
                      description="Reminders before events you're required to attend"
                      checked={notifications.attendanceReminders}
                      onChange={() => toggleNotif('attendanceReminders')}
                    />
                  </div>
                </div>

                {/* Finance group */}
                <div>
                  <p className="text-[11px] font-bold text-[#888780] uppercase tracking-wider mb-3">Finance</p>
                  <div className="space-y-0">
                    <NotifRow
                      label="Liquidation Status Updates"
                      description="When your liquidation reports are reviewed or returned"
                      checked={notifications.liquidationUpdates}
                      onChange={() => toggleNotif('liquidationUpdates')}
                    />
                    <NotifRow
                      label="Due Payment Alerts"
                      description="Upcoming or overdue membership fee reminders"
                      checked={notifications.paymentAlerts}
                      onChange={() => toggleNotif('paymentAlerts')}
                    />
                  </div>
                </div>

                {/* Admin & Docs group */}
                <div>
                  <p className="text-[11px] font-bold text-[#888780] uppercase tracking-wider mb-3">Admin & Documents</p>
                  <div className="space-y-0">
                    <NotifRow
                      label="SAO Adviser Messages"
                      description="Important messages or feedback from your SAO adviser"
                      checked={notifications.advisorMessages}
                      onChange={() => toggleNotif('advisorMessages')}
                    />
                    <NotifRow
                      label="Document Approvals"
                      description="Status updates on submitted documents and proposals"
                      checked={notifications.documentApprovals}
                      onChange={() => toggleNotif('documentApprovals')}
                      last
                    />
                  </div>
                </div>

                <button className="px-5 py-2 bg-[#83358E] text-white rounded-lg text-[14px] font-medium hover:bg-[#6D2A78] transition-colors">
                  Save Preferences
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

function NotifRow({
  label,
  description,
  checked,
  onChange,
  last = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-3.5 ${!last ? 'border-b border-gray-100' : ''}`}>
      <div>
        <p className="text-[#001A4D] text-[14px] font-medium">{label}</p>
        <p className="text-[#888780] text-[12px] mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
