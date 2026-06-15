import { useState } from 'react';
import { Lock, AlertCircle, Upload, Shield } from 'lucide-react';

interface Step1Props {
  data: any;
  onUpdate: (data: any) => void;
}

export default function Step1EventDetails({ data, onUpdate }: Step1Props) {
  const [fastTrack, setFastTrack] = useState(true);
  const [formValues, setFormValues] = useState({
    eventId: 'EVT-ADM-2026-0018',
    hostingOrg: '',
    title: '',
    tagline: '',
    description: '',
    objectives: [],
    eventType: '',
    category: '',
    enableQRTickets: true,
    publicEvent: true,
    mandatoryAttendance: false,
    lockAfterApproval: false,
    ...data
  });

  const updateField = (field: string, value: any) => {
    const updated = { ...formValues, [field]: value };
    setFormValues(updated);
    onUpdate(updated);
  };

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6">
      {/* Left Panel */}
      <div className="space-y-6">

        {/* Section A — Administrative Context */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Administrative Context</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Reference ID</label>
              <div className="relative">
                <input
                  type="text"
                  value={formValues.eventId}
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 pr-10"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Created By</label>
              <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0E4EBD] to-[#83358E] flex items-center justify-center text-white font-bold text-sm">RL</div>
                <div>
                  <div className="font-medium text-gray-900">Riselle Mae B. Lucanas</div>
                  <div className="text-xs text-gray-500">SAO Adviser</div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-medium text-gray-900">Fast-Track Creation</label>
                  <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
                </div>
                <p className="text-sm text-gray-600">Bypass standard review protocols and immediately publish this event.</p>
              </div>
              <button
                onClick={() => setFastTrack(!fastTrack)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${fastTrack ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${fastTrack ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {fastTrack && (
              <div className="flex items-start gap-3 p-4 bg-[#FFD41C]/10 border border-[#FFD41C] rounded-lg">
                <AlertCircle className="w-5 h-5 text-[#FFD41C] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-900">
                  <strong>⚡ Fast-Track Active</strong> — This event will be published immediately upon creation without entering the review queue.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section B — Organization Assignment */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Organization Assignment</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Hosting Organization <span className="text-red-500">*</span>
            </label>
            <select
              value={formValues.hostingOrg}
              onChange={(e) => updateField('hostingOrg', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
            >
              <option value="">Select organization...</option>
              <option value="ccs">College of Computer Studies (CCS) • 145 members</option>
              <option value="cba">College of Business Administration (CBA) • 98 members</option>
              <option value="cte">College of Teacher Education (CTE) • 67 members</option>
              <option value="ssg">Supreme Student Government (SSG) • 25 officers</option>
            </select>
          </div>
        </div>

        {/* Section C — Event Identity */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Event Identity</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter event title..."
                value={formValues.title}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Tagline</label>
              <input
                type="text"
                placeholder="Short catchy description..."
                value={formValues.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Description <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={5}
                placeholder="Detailed description of the event..."
                value={formValues.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Objectives</label>
              <input
                type="text"
                placeholder="Type and press Enter to add objectives..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">Enhance learning</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">Build community</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section D — Classification */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Classification</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formValues.eventType}
                onChange={(e) => updateField('eventType', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              >
                <option value="">Select type...</option>
                <option>Academic</option>
                <option>Social</option>
                <option>Cultural</option>
                <option>Sports</option>
                <option>Competition</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formValues.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              >
                <option value="">Select category...</option>
                <option>Workshop</option>
                <option>Seminar</option>
                <option>Tournament</option>
                <option>Festival</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section E — Event Settings */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Event Settings</h3>
          </div>
          <div className="space-y-3">
            {[
              { key: 'enableQRTickets', label: 'Enable QR Tickets', desc: 'Generate scannable QR code tickets' },
              { key: 'publicEvent', label: 'Public Event', desc: 'Visible to all students campus-wide' },
              { key: 'mandatoryAttendance', label: 'Mandatory Attendance', desc: 'Mark as compulsory institutional event', admin: true },
              { key: 'lockAfterApproval', label: 'Lock Event After Approval', desc: 'Prevent officers from editing after creation', admin: true },
            ].map((setting) => (
              <div key={setting.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{setting.label}</span>
                    {setting.admin && <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>}
                  </div>
                  <p className="text-sm text-gray-600">{setting.desc}</p>
                </div>
                <button
                  onClick={() => updateField(setting.key, !formValues[setting.key])}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${formValues[setting.key] ? 'bg-[#83358E]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formValues[setting.key] ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section F — Event Media */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Event Media</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Banner Image <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#83358E] transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB • Recommended: 1200x630px</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Thumbnail</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#83358E] transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">Square format • 400x400px recommended</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Official SAO Endorsement Stamp <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin Only</span>
              </label>
              <div className="border-2 border-dashed border-[#83358E] rounded-lg p-8 text-center hover:border-[#001A4D] transition-colors cursor-pointer bg-[#83358E]/5">
                <Shield className="w-8 h-8 text-[#83358E] mx-auto mb-2" />
                <p className="text-sm text-gray-600">Upload official endorsement letterhead</p>
                <p className="text-xs text-gray-500 mt-1">Will be displayed as official badge on event card</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Preview */}
      <div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
          <h4 className="font-bold text-gray-900 mb-3">Student Feed Preview</h4>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="aspect-video bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg mb-3 flex items-center justify-center">
              <span className="text-white/50 text-sm">Event Banner</span>
            </div>
            <h5 className="font-bold text-gray-900 mb-1">{formValues.title || 'Event Title'}</h5>
            <p className="text-sm text-gray-600 mb-3">{formValues.tagline || 'Event tagline will appear here'}</p>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#0E4EBD] to-[#83358E]" />
              <span className="text-xs text-gray-600">{formValues.hostingOrg ? 'Selected Organization' : 'Organization Name'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{formValues.eventType || 'Type'}</span>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">Approved</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h5 className="text-sm font-bold text-gray-900 mb-2">Admin Controls Preview</h5>
            <div className="flex flex-wrap gap-2">
              <button className="px-3 py-1.5 text-xs border border-[#83358E] text-[#83358E] rounded hover:bg-[#83358E]/5">Edit</button>
              <button className="px-3 py-1.5 text-xs border border-amber-600 text-amber-600 rounded hover:bg-amber-50">Suspend</button>
              <button className="px-3 py-1.5 text-xs border border-red-600 text-red-600 rounded hover:bg-red-50">Cancel Event</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
