import { Sliders, Globe, Clock, Palette } from 'lucide-react';

interface SystemPreferencesProps {
  onUnsavedChange: () => void;
}

export default function SystemPreferences({ onUnsavedChange }: SystemPreferencesProps) {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">System Preferences</h2>
        <p className="text-sm text-gray-500 mt-1">Configure global system settings and preferences</p>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#001A4D] mb-4">Regional Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Time Zone
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>Asia/Manila (GMT+8)</option>
              <option>Asia/Tokyo (GMT+9)</option>
              <option>Asia/Singapore (GMT+8)</option>
              <option>UTC</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date Format
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>MM/DD/YYYY (05/31/2026)</option>
              <option>DD/MM/YYYY (31/05/2026)</option>
              <option>YYYY-MM-DD (2026-05-31)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Time Format
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>12-hour (3:30 PM)</option>
              <option>24-hour (15:30)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Currency
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>PHP (₱) - Philippine Peso</option>
              <option>USD ($) - US Dollar</option>
              <option>EUR (€) - Euro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Language
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>English</option>
              <option>Filipino</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#001A4D] mb-4">Appearance</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'Light', icon: '☀️', active: true },
                { name: 'Dark', icon: '🌙', active: false },
                { name: 'Auto', icon: '⚡', active: false },
              ].map((theme, index) => (
                <button
                  key={index}
                  onClick={onUnsavedChange}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    theme.active
                      ? 'border-[#83358E] bg-[#83358E]/5'
                      : 'border-gray-200 hover:border-[#83358E]/50'
                  }`}
                >
                  <div className="text-3xl mb-2">{theme.icon}</div>
                  <div className="text-sm font-medium text-gray-900">{theme.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Primary Color
            </label>
            <div className="flex gap-3">
              {[
                { color: '#0E4EBD', name: 'Cobalt Blue' },
                { color: '#83358E', name: 'Violet' },
                { color: '#1E70E8', name: 'Royal Blue' },
                { color: '#22C55E', name: 'Green' },
                { color: '#FFC107', name: 'Gold' },
              ].map((colorOption, index) => (
                <button
                  key={index}
                  onClick={onUnsavedChange}
                  className="w-12 h-12 rounded-lg border-2 border-gray-300 hover:border-[#83358E] transition-all"
                  style={{ backgroundColor: colorOption.color }}
                  title={colorOption.name}
                ></button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-200">
            <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">Enable animations and transitions</span>
              <button
                onClick={onUnsavedChange}
                className="relative w-12 h-6 rounded-full bg-[#83358E]"
              >
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
              </button>
            </label>
            <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">Show organization logos in navigation</span>
              <button
                onClick={onUnsavedChange}
                className="relative w-12 h-6 rounded-full bg-[#83358E]"
              >
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
              </button>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#001A4D] mb-4">System Behavior</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Default Event View
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>Calendar View</option>
              <option>List View</option>
              <option>Grid View</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Items Per Page
            </label>
            <select
              onChange={onUnsavedChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option>10</option>
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-200">
            <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">Auto-save form drafts</span>
              <button
                onClick={onUnsavedChange}
                className="relative w-12 h-6 rounded-full bg-[#83358E]"
              >
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
              </button>
            </label>
            <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">Confirm before deleting items</span>
              <button
                onClick={onUnsavedChange}
                className="relative w-12 h-6 rounded-full bg-[#83358E]"
              >
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
              </button>
            </label>
            <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">Show tooltips and help text</span>
              <button
                onClick={onUnsavedChange}
                className="relative w-12 h-6 rounded-full bg-gray-300"
              >
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full"></div>
              </button>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#001A4D] mb-4">Performance</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-700">Enable data caching for faster load times</span>
            <button
              onClick={onUnsavedChange}
              className="relative w-12 h-6 rounded-full bg-[#83358E]"
            >
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
            </button>
          </label>
          <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-700">Preload upcoming events</span>
            <button
              onClick={onUnsavedChange}
              className="relative w-12 h-6 rounded-full bg-[#83358E]"
            >
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full translate-x-6"></div>
            </button>
          </label>
          <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-700">Compress images automatically</span>
            <button
              onClick={onUnsavedChange}
              className="relative w-12 h-6 rounded-full bg-gray-300"
            >
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full"></div>
            </button>
          </label>
        </div>
      </div>
    </div>
  );
}
