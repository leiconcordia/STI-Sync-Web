/**
 * src/app/modules/activity-proposals/components/wizard/Step5TaskAllocation.tsx
 *
 * Section 5: Chronological Task Allocation & Milestones.
 * Matches Section 7 of official STI documents (Tasks, Assigned Person, Completion Date).
 */

import React from 'react';
import {
  CheckSquare,
  UserCheck,
  Calendar,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Clock,
} from 'lucide-react';
import type { ProposalFormData, ProposalTask } from '../../types/proposal.types';

interface Step5Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

const DEFAULT_STI_MILESTONES: Omit<ProposalTask, 'id'>[] = [
  {
    taskName: 'Drafting & Submission of Activity Proposal',
    assignedPerson: 'Activity Proponent / Lead Officer',
    completionDate: '',
  },
  {
    taskName: 'Signatory Endorsements & Administration Approval',
    assignedPerson: 'SAS Coordinator & Department Heads',
    completionDate: '',
  },
  {
    taskName: 'Venue Reservation & Audio-Visual / Tech Setup',
    assignedPerson: 'Logistics & Technical Committee',
    completionDate: '',
  },
  {
    taskName: 'Speaker Coordination & Program Finalization',
    assignedPerson: 'Program Committee Head',
    completionDate: '',
  },
  {
    taskName: 'Marketing, Promotional Materials & Registration Setup',
    assignedPerson: 'Marketing & Secretariat Committee',
    completionDate: '',
  },
  {
    taskName: 'Event Execution & QR Attendance Monitoring',
    assignedPerson: 'All Working Committees',
    completionDate: '',
  },
  {
    taskName: 'Post-Activity Evaluation & Liquidation Report Submission',
    assignedPerson: 'Finance Officer & Event Head',
    completionDate: '',
  },
];

export default function Step5TaskAllocation({ formData, onChange, errors = {} }: Step5Props) {
  const tasks: ProposalTask[] = formData.tasks && formData.tasks.length > 0
    ? formData.tasks
    : [
        {
          id: 'task-1',
          taskName: 'Activity Proposal Drafting & Submission',
          assignedPerson: 'Lead Proponent',
          completionDate: '',
        },
        {
          id: 'task-2',
          taskName: 'Venue & Logistics Coordination',
          assignedPerson: 'Logistics Head',
          completionDate: '',
        },
        {
          id: 'task-3',
          taskName: 'Event Execution',
          assignedPerson: 'Organizing Committee',
          completionDate: '',
        },
      ];

  const updateTask = (index: number, updates: Partial<ProposalTask>) => {
    const updated = tasks.map((t, idx) => {
      if (idx === index) {
        return { ...t, ...updates };
      }
      return t;
    });
    onChange({ tasks: updated });
  };

  const addTask = () => {
    const newTask: ProposalTask = {
      id: `task-${Date.now()}-${tasks.length + 1}`,
      taskName: '',
      assignedPerson: '',
      completionDate: '',
    };
    onChange({ tasks: [...tasks, newTask] });
  };

  const removeTask = (indexToRemove: number) => {
    if (tasks.length <= 1) return;
    const filtered = tasks.filter((_, idx) => idx !== indexToRemove);
    onChange({ tasks: filtered });
  };

  const loadStandardMilestones = () => {
    const baseDate = formData.sessions?.[0]?.date || '';
    const generated: ProposalTask[] = DEFAULT_STI_MILESTONES.map((m, idx) => ({
      id: `task-${Date.now()}-${idx}`,
      taskName: m.taskName,
      assignedPerson: m.assignedPerson,
      completionDate: baseDate,
    }));
    onChange({ tasks: generated });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <CheckSquare className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-900 flex items-center justify-center font-bold text-xs">
                  13
                </div>
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  Task list
                </h4>
              </div>
              <p className="text-xs text-indigo-700/90 mt-0.5 leading-relaxed">
                Itemize tasks, assigned persons/committees, and target completion dates.
              </p>
            </div>
            <button
              type="button"
              onClick={loadStandardMilestones}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex-shrink-0 self-start sm:self-center"
              title="Populate standard STI activity lifecycle milestones"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load STI Standard Tasks</span>
            </button>
          </div>
        </div>
      </div>

      {/* 15-Day Policy Warning Notice */}
      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span>
          <strong>Policy Note:</strong> The 15-calendar-day policy rule is measured from the <em>earliest</em> task completion date or session date.
        </span>
      </div>

      {/* Task Rows Table / Cards */}
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div
            key={task.id || index}
            className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center gap-3"
          >
            {/* Index Number */}
            <div className="flex items-center justify-between md:justify-start gap-2">
              <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {index + 1}
              </span>
              <span className="text-xs font-semibold text-slate-500 md:hidden">Task #{index + 1}</span>
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(index)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors md:hidden"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Column 1: Task */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Task <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={task.taskName}
                onChange={(e) => updateTask(index, { taskName: e.target.value })}
                placeholder="e.g. Venue & AV Equipment Reservation"
                className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
              />
            </div>

            {/* Column 2: Person Assigned */}
            <div className="w-full md:w-56">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Person Assigned <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={task.assignedPerson}
                  onChange={(e) => updateTask(index, { assignedPerson: e.target.value })}
                  placeholder="e.g. Logistics Committee"
                  className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
                />
                <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Column 3: Date to be Completed */}
            <div className="w-full md:w-44">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Date to be Completed <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={task.completionDate}
                  onChange={(e) => updateTask(index, { completionDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
                />
              </div>
            </div>

            {/* Desktop Remove Button */}
            {tasks.length > 1 && (
              <button
                type="button"
                onClick={() => removeTask(index)}
                className="hidden md:flex p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors mt-4 self-center"
                title="Remove task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Task Button */}
      <button
        type="button"
        onClick={addTask}
        className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl text-slate-600 hover:text-indigo-600 text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:bg-indigo-50/40"
      >
        <Plus className="w-4 h-4" />
        <span>Add Task Milestone</span>
      </button>

      {/* Bottom Summary */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          <span>Total Milestones: <strong className="text-slate-800">{tasks.length}</strong></span>
        </div>
        <div className="text-slate-500">
          {tasks.filter(t => !!t.taskName && !!t.completionDate).length} completed tasks ready
        </div>
      </div>
    </div>
  );
}
