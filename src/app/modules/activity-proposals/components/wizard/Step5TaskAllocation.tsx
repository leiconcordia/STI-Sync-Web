/**
 * src/app/modules/activity-proposals/components/wizard/Step5TaskAllocation.tsx
 *
 * Section 5: Chronological Task Allocation & Milestones.
 * Matches Section 7 of official STI documents (Tasks, Assigned Person, Completion Date).
 */

import React, { useMemo } from 'react';
import {
  CheckSquare,
  UserCheck,
  Calendar,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { format, subDays, addDays, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { toast } from 'sonner';
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
    taskName: 'Working Committees Briefing & Logistics Rehearsal',
    assignedPerson: 'All Working Committees',
    completionDate: '',
  },
  {
    taskName: 'Final Operational Readiness & Pre-Event Checklist',
    assignedPerson: 'Event Head & Executive Board',
    completionDate: '',
  },
];

export default function Step5TaskAllocation({ formData, onChange, errors = {} }: Step5Props) {
  const eventDate = formData.date || formData.sessions?.[0]?.date || '';
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  // The latest possible task date is strictly 1 day before the implementation date
  const maxTaskDate = useMemo(() => {
    if (!eventDate) return '';
    const parsed = parseISO(eventDate);
    if (!isValid(parsed)) return '';
    return format(subDays(parsed, 1), 'yyyy-MM-dd');
  }, [eventDate]);

  const tasks: ProposalTask[] = formData.tasks && formData.tasks.length > 0
    ? formData.tasks
    : [
        {
          id: 'task-1',
          taskName: '',
          assignedPerson: '',
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
    // Default new task date to maxTaskDate or today
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

  // Populate realistic chronological milestones leading up to (and strictly before) the event date
  const loadStandardMilestones = () => {
    if (!eventDate) {
      toast.warning('Please specify the Target Implementation Date in Step 4 first.');
      return;
    }

    const eventParsed = parseISO(eventDate);
    if (!isValid(eventParsed)) {
      toast.error('Invalid implementation date found in Step 4.');
      return;
    }

    const todayDate = new Date();
    const lastAllowedDate = subDays(eventParsed, 1);
    const totalDaysAvailable = Math.max(1, differenceInCalendarDays(lastAllowedDate, todayDate));
    const stepCount = DEFAULT_STI_MILESTONES.length;

    const generated: ProposalTask[] = DEFAULT_STI_MILESTONES.map((m, idx) => {
      // Interpolate dates smoothly between today and 1 day before the event
      const fraction = idx / (stepCount - 1);
      const offsetDays = Math.min(
        totalDaysAvailable,
        Math.max(0, Math.round(fraction * totalDaysAvailable))
      );
      const computedDate = addDays(todayDate, offsetDays);
      // Ensure date never matches or exceeds eventDate
      const finalDate = computedDate >= eventParsed ? lastAllowedDate : computedDate;
      const dateString = format(finalDate, 'yyyy-MM-dd');

      return {
        id: `task-${Date.now()}-${idx}`,
        taskName: m.taskName,
        assignedPerson: m.assignedPerson,
        completionDate: dateString,
      };
    });

    onChange({ tasks: generated });
    toast.success('Loaded standard STI milestone tasks, sequenced strictly prior to the implementation date.');
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
                  Task list & Milestones
                </h4>
              </div>
              <p className="text-xs text-indigo-700/90 mt-0.5 leading-relaxed">
                Itemize preparatory milestones, assigned committees, and completion dates. All tasks must occur <strong>strictly prior</strong> to the implementation date.
              </p>
            </div>
            <button
              type="button"
              onClick={loadStandardMilestones}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex-shrink-0 self-start sm:self-center cursor-pointer"
              title="Populate standard STI activity milestones sequenced prior to the event"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load STI Standard Tasks</span>
            </button>
          </div>
        </div>
      </div>

      {/* Target Implementation Date Benchmark Banner */}
      <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>
            Target Implementation Date: <strong className="text-blue-900 font-bold">{eventDate || 'Not set in Step 4'}</strong>
          </span>
        </div>
        <div className="text-[11px] text-blue-800 font-medium">
          {maxTaskDate ? (
            <span>Latest allowed task completion: <strong>{maxTaskDate}</strong> (1 day prior)</span>
          ) : (
            <span className="text-amber-700 font-semibold">⚠ Please configure event date in Step 4</span>
          )}
        </div>
      </div>

      {/* Policy Warning Notice */}
      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-start gap-2">
        <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Sequencing Policy:</strong> The first scheduled task and all subsequent tasks cannot match or succeed the implementation date. All tasks must be completed strictly prior to <strong>{eventDate || 'the event date'}</strong>.
        </div>
      </div>

      {/* Error banner if any */}
      {errors.tasks && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errors.tasks}</span>
        </div>
      )}

      {/* Task Rows Table / Cards */}
      <div className="space-y-3">
        {tasks.map((task, index) => {
          const isDateMatchingOrExceedingEvent = Boolean(
            eventDate && task.completionDate && task.completionDate >= eventDate
          );
          const isDateInPast = Boolean(task.completionDate && task.completionDate < todayStr);
          const isPrecededByLaterTask = Boolean(
            index > 0 &&
            task.completionDate &&
            tasks[index - 1]?.completionDate &&
            task.completionDate < tasks[index - 1].completionDate
          );

          return (
            <div
              key={task.id || index}
              className={`p-4 bg-white border rounded-2xl shadow-xs transition-colors flex flex-col gap-3 ${
                isDateMatchingOrExceedingEvent || isDateInPast
                  ? 'border-red-300 bg-red-50/10'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3">
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

                {/* Column 1: Task Name */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Task Milestone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={task.taskName}
                    onChange={(e) => updateTask(index, { taskName: e.target.value })}
                    placeholder="e.g. Venue & Audio-Visual Equipment Reservation"
                    className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
                  />
                </div>

                {/* Column 2: Person Assigned */}
                <div className="w-full md:w-56">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Person / Committee Assigned <span className="text-red-500">*</span>
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
                <div className="w-full md:w-48">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Completion Date <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      min={todayStr}
                      max={maxTaskDate || undefined}
                      value={task.completionDate}
                      onChange={(e) => updateTask(index, { completionDate: e.target.value })}
                      className={`w-full px-3 py-2 bg-slate-50/60 border rounded-xl text-xs focus:outline-none focus:ring-2 transition-all font-semibold ${
                        isDateMatchingOrExceedingEvent || isDateInPast
                          ? 'border-red-400 text-red-900 bg-red-50/30 focus:ring-red-500/20'
                          : 'border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Desktop Remove Button */}
                {tasks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTask(index)}
                    className="hidden md:flex p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors mt-4 self-center cursor-pointer"
                    title="Remove task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dynamic Task Validation Alerts */}
              {isDateMatchingOrExceedingEvent && (
                <div className="text-[11px] text-red-600 font-semibold flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Cannot match or occur on/after the implementation date ({eventDate}). All preparatory tasks must be completed strictly prior to the event date (latest: {maxTaskDate}).
                  </span>
                </div>
              )}

              {isDateInPast && (
                <div className="text-[11px] text-red-600 font-semibold flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Completion date cannot be in the past ({task.completionDate}).</span>
                </div>
              )}

              {isPrecededByLaterTask && !isDateMatchingOrExceedingEvent && !isDateInPast && (
                <div className="text-[11px] text-amber-700 font-medium flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Note: Task #{index + 1} completes earlier than Task #{index} ({tasks[index - 1]?.completionDate}). Consider ordering milestones chronologically.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Task Button */}
      <button
        type="button"
        onClick={addTask}
        className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl text-slate-600 hover:text-indigo-600 text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:bg-indigo-50/40 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>Add Task Milestone</span>
      </button>

      {/* Bottom Summary */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          <span>Total Milestones: <strong className="text-slate-800">{tasks.length}</strong></span>
        </div>
        <div className="text-slate-500">
          {tasks.filter(t => !!t.taskName && !!t.completionDate && (!eventDate || t.completionDate < eventDate)).length} valid preparatory tasks ready
        </div>
      </div>
    </div>
  );
}
