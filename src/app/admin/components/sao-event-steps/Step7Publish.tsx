import { CheckCircle, Calendar, Users, DollarSign, Shield, Rocket, Edit2, Clock, MapPin, Award, Bell } from 'lucide-react';

interface Step7Props {
  data: any;
  onUpdate: (data: any) => void;
}

export default function Step7Publish({ data, onUpdate }: Step7Props) {
  const validationItems = [
    { id: 1, label: 'Event details complete', desc: 'title, description, objectives, type, org', status: 'valid' },
    { id: 2, label: 'Schedule and venue assigned', desc: 'dates, sessions, venue, no conflicts', status: 'valid' },
    { id: 3, label: 'Participant settings configured', desc: 'limits, audience, attendance rules', status: 'valid' },
    { id: 4, label: 'Staff fully assigned', desc: 'Event Head, Officer-in-Charge, scanners', status: 'valid' },
    { id: 5, label: 'Budget authorized', desc: 'amounts set, disbursement, liquidation deadline', status: 'valid' },
    { id: 6, label: 'Required documents uploaded', desc: 'compliance verified', status: 'warning' },
    { id: 7, label: 'Adviser authorization confirmed', desc: 'checkbox confirmed', status: 'invalid' },
    { id: 8, label: 'No critical compliance failures', desc: 'or all overridden with remarks', status: 'valid' }
  ];

  const allValid = validationItems.filter(item => item.status === 'valid').length === validationItems.length;

  return (
    <div className="grid grid-cols-[720px_320px] gap-6">
      <div className="space-y-6">

        {/* Admin Event Summary Card */}
        <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="p-6 bg-gradient-to-r from-[#001A4D] to-[#83358E] relative">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-10 h-10 text-white" />
              </div>

              <div className="flex-1">
                <h2 className="text-white font-bold text-2xl mb-1">
                  {data.title || 'Event Title'}
                </h2>
                <p className="text-[#FFD41C] text-sm mb-3">
                  {data.tagline || 'Event tagline'}
                </p>
                <div className="flex items-center gap-2 text-white text-sm">
                  <div className="w-6 h-6 rounded-full bg-white/20"></div>
                  <span>{data.hostingOrg || 'Organization Name'}</span>
                  <span className="px-2 py-0.5 bg-blue-500 rounded text-xs">Academic</span>
                </div>
              </div>

              <div className="absolute top-4 right-4">
                <div className="px-3 py-1.5 bg-green-500 text-white rounded-lg flex items-center gap-1.5 font-medium text-sm">
                  <Shield className="w-4 h-4" />
                  SAO APPROVED
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white space-y-4">
            {/* Administrative Section */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Administrative</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Reference ID:</span>
                    <span className="ml-2 font-medium text-gray-900">EVT-ADM-2026-0018</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Created By:</span>
                    <span className="ml-2 font-medium text-gray-900">Riselle Mae B. Lucanas</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Visibility:</span>
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Published</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Fast-Track:</span>
                    <span className="ml-2 px-2 py-0.5 bg-[#FFD41C]/20 text-[#FFD41C] rounded text-xs font-medium">Active</span>
                  </div>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Classification */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Classification</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Academic</span>
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Workshop</span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">Priority</span>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Schedule */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Schedule</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-900">SY 2025-2026 • 1st Semester</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-900">June 15, 2026 • 9:00 AM - 5:00 PM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-900">Main Auditorium</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Assigned</span>
                  </div>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Participants */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Participants</h3>
                <div className="text-sm text-gray-900">
                  <span className="font-medium">Max: 500 • Min: 50</span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span>All departments, 1st-4th Year</span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span className="text-gray-600">80% min attendance</span>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Staff */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Staff</h3>
                <div className="flex flex-wrap gap-2">
                  <div className="px-2 py-1 bg-gray-100 rounded text-xs flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#0E4EBD] to-[#83358E]"></div>
                    <span className="text-gray-900">Event Head</span>
                  </div>
                  <div className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">
                    3 Scanner Officers
                  </div>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Budget */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Budget</h3>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-[#001A4D]">₱100,000</div>
                  <div className="flex gap-3 text-xs text-gray-600">
                    <span>Org: ₱35,000</span>
                    <span>SAO: ₱50,000</span>
                    <span>Sponsorship: ₱15,000</span>
                  </div>
                  <div className="text-xs text-gray-600">Liquidation deadline: June 30, 2026</div>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>

            {/* Documents */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Documents</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-900">0 of 2 required uploaded</span>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">83% Compliance</span>
                </div>
              </div>
              <button className="text-[#83358E] text-sm font-medium flex items-center gap-1 hover:underline">
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Admin Validation Checklist */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-[#001A4D] px-4 py-3">
            <h3 className="text-white font-bold">Final Validation</h3>
          </div>

          <div className="p-4 space-y-2">
            {validationItems.map((item) => (
              <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                item.status === 'valid' ? 'border-green-200 bg-green-50' :
                item.status === 'warning' ? 'border-amber-200 bg-amber-50' :
                'border-red-200 bg-red-50'
              }`}>
                <div className="flex-shrink-0 mt-0.5">
                  {item.status === 'valid' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : item.status === 'warning' ? (
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">!</div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">✕</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">{item.label}</div>
                  <div className="text-xs text-gray-600">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {!allValid && (
            <div className="px-4 pb-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">!</div>
                <p className="text-sm text-red-800">
                  <strong>Resolve all validation issues before publishing this event.</strong> Check the items marked in red above.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Publication Settings Card */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="border-l-4 border-[#83358E] p-4">
            <h3 className="text-[#001A4D] font-bold text-base mb-3">Publication Settings</h3>

            <div className="space-y-3">
              {[
                { key: 'publishToFeed', label: 'Publish to Student Feed', default: true },
                { key: 'sendPushNotification', label: 'Send Push Notification to Target Students', default: true },
                { key: 'postToDashboard', label: 'Post Announcement to Organization Dashboard', default: true },
                { key: 'notifyOfficers', label: 'Notify Assigned Officers', default: true },
                { key: 'addToCalendar', label: 'Add to Academic Calendar', default: false }
              ].map((setting) => (
                <label key={setting.key} className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <span className="font-medium text-gray-900 text-sm">{setting.label}</span>
                  <button
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      setting.default ? 'bg-[#83358E]' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      setting.default ? 'translate-x-6' : ''
                    }`}></div>
                  </button>
                </label>
              ))}
            </div>

            {/* Push Notification Preview */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <Bell className="w-4 h-4 text-blue-600 mt-0.5" />
                <h4 className="text-sm font-bold text-gray-900">Push Notification Preview</h4>
              </div>
              <div className="p-3 bg-white rounded border border-gray-200">
                <div className="font-medium text-gray-900 text-sm mb-1">New Event: {data.title || 'Event Title'}</div>
                <div className="text-xs text-gray-600">
                  {data.hostingOrg || 'Organization'} • June 15, 2026 • Main Auditorium
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Right Panel - Final Admin Summary */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
          <h4 className="font-bold text-gray-900 mb-3">Publication Summary</h4>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gradient-to-br from-green-600 to-green-500 rounded-lg text-white text-center">
                <Calendar className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xl font-bold">1 Day</div>
                <div className="text-xs opacity-90">Duration</div>
              </div>

              <div className="p-3 bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] rounded-lg text-white text-center">
                <Users className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xl font-bold">387</div>
                <div className="text-xs opacity-90">Est. Reach</div>
              </div>

              <div className="p-3 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-lg text-white text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xl font-bold">100K</div>
                <div className="text-xs opacity-90">Approved Budget</div>
              </div>

              <div className="p-3 bg-gradient-to-br from-[#FFC107] to-[#FFD41C] rounded-lg text-white text-center">
                <Award className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xl font-bold">83%</div>
                <div className="text-xs opacity-90">Compliance</div>
              </div>
            </div>

            {/* Post-Creation Actions */}
            <div className="border-2 border-[#83358E] rounded-lg p-3">
              <h5 className="text-sm font-bold text-gray-900 mb-3">Post-Creation Actions</h5>
              <div className="space-y-2 text-xs">
                {[
                  'Event record created in database',
                  'Event published to student feed',
                  'Push notifications sent to 387 target students',
                  'Officers notified of their assignments',
                  'Scanner activation code generated',
                  'Budget authorization recorded',
                  'Liquidation deadline set for June 30',
                  'Event added to SAO master calendar'
                ].map((action, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Large Publish Button */}
            <button
              disabled={!allValid}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg font-bold text-base hover:from-green-700 hover:to-green-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Rocket className="w-5 h-5" />
              Create & Publish Event
            </button>

            {!allValid && (
              <p className="text-xs text-center text-red-600">
                Complete all validation items to publish
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
