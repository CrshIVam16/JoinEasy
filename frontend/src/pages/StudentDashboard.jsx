import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';

function errorMessage(error) {
  return error.response?.data?.error || error.message || 'Something went wrong.';
}

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, options).format(date);
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const success = toast.type === 'success';
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl ${
        success ? 'border-emerald-200 bg-white text-emerald-800' : 'border-rose-200 bg-white text-rose-800'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <X className="mt-0.5 shrink-0" size={18} />}
      <p className="flex-1 text-sm font-semibold">{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X size={16} />
      </button>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, icon: Icon }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Icon size={20} />
      </span>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [memberInputs, setMemberInputs] = useState({});
  const [addingGroupId, setAddingGroupId] = useState(null);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setPageError('');
    try {
      const [groupResponse, assignmentResponse] = await Promise.all([
        api.get('/groups/my'),
        api.get('/assignments'),
      ]);
      setGroups(groupResponse.data.groups || []);
      setAssignments(assignmentResponse.data.assignments || []);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(() => {
    const statuses = assignments.flatMap((assignment) => assignment.group_status || []);
    const completed = statuses.filter((group) => group.submitted).length;
    const total = statuses.length;
    return {
      total,
      completed,
      pending: total - completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [assignments]);

  async function createGroup(event) {
    event.preventDefault();
    setCreatingGroup(true);
    setToast(null);
    try {
      await api.post('/groups', { name: groupName.trim() });
      setGroupName('');
      await loadData();
      setToast({ type: 'success', message: 'Your new team is ready.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setCreatingGroup(false);
    }
  }

  async function addMember(event, group) {
    event.preventDefault();
    const identifier = memberInputs[group.id]?.trim();
    if (!identifier) return;
    setAddingGroupId(group.id);
    setToast(null);
    try {
      await api.post(`/groups/${group.id}/members`, { identifier });
      setMemberInputs((current) => ({ ...current, [group.id]: '' }));
      await loadData();
      setToast({ type: 'success', message: 'Student added to your team.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setAddingGroupId(null);
    }
  }

  async function removeMember(group, member) {
    if (!window.confirm(`Remove ${member.name} from ${group.name}?`)) return;
    setRemovingMemberId(member.id);
    setToast(null);
    try {
      await api.delete(`/groups/${group.id}/members/${member.id}`);
      await loadData();
      setToast({ type: 'success', message: `${member.name} was removed from the team.` });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setRemovingMemberId(null);
    }
  }

  function openSubmission(assignment) {
    const pending = (assignment.group_status || []).filter((group) => !group.submitted);
    if (!pending.length) return;
    setSubmission({
      assignment,
      pending,
      selectedGroupId: pending[0].id,
      stepOne: false,
      note: '',
    });
  }

  async function confirmSubmission(event) {
    event.preventDefault();
    if (!submission?.stepOne || !submission.selectedGroupId) return;
    setSubmitting(true);
    setToast(null);
    try {
      await api.post('/submissions/confirm', {
        assignment_id: submission.assignment.id,
        group_id: submission.selectedGroupId,
        step_one_intent: true,
        step_two_confirmed: true,
        submission_note: submission.note.trim() || null,
      });
      setSubmission(null);
      await loadData();
      setToast({ type: 'success', message: 'Submission verified and recorded for your group.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="relative mb-9 overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-200 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-10 -top-20 size-72 rounded-full border-[40px] border-white/5" />
          <div className="pointer-events-none absolute bottom-0 right-40 size-40 rounded-full bg-white/5 blur-2xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-indigo-50">
                <Sparkles size={14} /> Your student workspace
              </span>
              <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                Hey, {user?.name?.split(' ')[0] || 'there'} <span aria-hidden="true">👋</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100 sm:text-base">
                Bring your group together and keep every assignment moving forward.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  {groups.length} {groups.length === 1 ? 'team' : 'teams'}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  {progress.pending} tasks to go
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-indigo-100">Your progress</p>
                  <p className="mt-1 text-4xl font-black tracking-tight">{progress.percent}%</p>
                </div>
                <p className="pb-1 text-right text-xs font-semibold text-indigo-100">
                  {progress.completed} of {progress.total} group tasks completed
                </p>
              </div>
              <div
                className="mt-5 h-2.5 overflow-hidden rounded-full bg-indigo-950/30"
                role="progressbar"
                aria-label="Assignments completed"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  ['Assigned', progress.total],
                  ['Completed', progress.completed],
                  ['Pending', progress.pending],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white/10 px-3 py-2.5 text-center">
                    <p className="text-lg font-black">{value}</p>
                    <p className="text-[11px] font-semibold text-indigo-100">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {pageError && (
          <div role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <span>{pageError}</span>
            <button type="button" onClick={() => loadData(true)} className="font-bold underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center">
            <LoaderCircle className="animate-spin text-indigo-600" size={30} />
          </div>
        ) : (
          <div className="grid items-start gap-9 xl:grid-cols-[0.92fr_1.08fr]">
            <section>
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionHeading
                  eyebrow="Your people"
                  title="My groups"
                  description="Invite teammates and manage your project groups."
                  icon={UsersRound}
                />
                <form onSubmit={createGroup} className="mb-6 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="Group name"
                    aria-label="Group name"
                    className="form-input flex-1"
                  />
                  <button
                    disabled={creatingGroup}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {creatingGroup ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
                    Create group
                  </button>
                </form>

                {groups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                    <UsersRound className="mx-auto text-slate-300" size={28} />
                    <p className="mt-3 text-sm font-bold text-slate-700">Your first team starts here</p>
                    <p className="mt-1 text-xs text-slate-500">Create a group to coordinate with classmates.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <article key={group.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-slate-900">{group.name}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {group.members?.length || 0} members
                              {group.created_by === user?.id && ' · You created this group'}
                            </p>
                          </div>
                          <span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                            <UsersRound size={17} />
                          </span>
                        </div>

                        <div className="mt-4 space-y-2">
                          {(group.members || []).map((member) => (
                            <div key={member.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-indigo-600 shadow-sm">
                                {member.name?.slice(0, 1).toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-slate-800">{member.name}</p>
                                <p className="truncate text-xs text-slate-500">{member.email}</p>
                              </div>
                              {member.student_code && (
                                <span className="hidden rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-extrabold tracking-wide text-indigo-700 sm:inline-flex">
                                  {member.student_code}
                                </span>
                              )}
                              {group.created_by === user?.id && member.id !== user?.id && (
                                <button
                                  type="button"
                                  onClick={() => removeMember(group, member)}
                                  disabled={removingMemberId === member.id}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  title={`Remove ${member.name}`}
                                  aria-label={`Remove ${member.name} from ${group.name}`}
                                >
                                  {removingMemberId === member.id
                                    ? <LoaderCircle className="animate-spin" size={15} />
                                    : <Trash2 size={15} />}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <form onSubmit={(event) => addMember(event, group)} className="mt-4 flex gap-2">
                          <input
                            value={memberInputs[group.id] || ''}
                            onChange={(event) => setMemberInputs((current) => ({
                              ...current,
                              [group.id]: event.target.value,
                            }))}
                            placeholder="Email or STU-XXXX"
                            aria-label={`Student email or code for ${group.name}`}
                            className="form-input min-w-0 flex-1 py-2.5 text-sm"
                          />
                          <button
                            type="submit"
                            disabled={addingGroupId === group.id || !memberInputs[group.id]?.trim()}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {addingGroupId === group.id
                              ? <LoaderCircle className="animate-spin" size={15} />
                              : <UserPlus size={15} />}
                            <span className="hidden sm:inline">Add</span>
                          </button>
                        </form>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionHeading
                eyebrow="Stay on track"
                title="Assignments"
                description="Your work, deadlines, and verified submissions in one place."
                icon={FileCheck2}
              />
              {assignments.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                  <Sparkles className="mx-auto text-indigo-300" size={30} />
                  <h3 className="mt-3 font-bold text-slate-800">Nothing assigned yet</h3>
                  <p className="mt-1 text-sm text-slate-500">New assignments for your groups will show up here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assignments.map((assignment) => {
                    const statuses = assignment.group_status || [];
                    const pending = statuses.filter((item) => !item.submitted);
                    return (
                      <article key={assignment.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                        <div className="p-5 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  assignment.due_date && new Date(assignment.due_date) < new Date()
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  <CalendarDays size={13} />
                                  {assignment.due_date ? formatDate(assignment.due_date) : 'No due date'}
                                </span>
                                {pending.length === 0 && statuses.length > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                    <Check size={13} /> Complete
                                  </span>
                                )}
                              </div>
                              <h3 className="text-lg font-black tracking-tight text-slate-900">{assignment.title}</h3>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              {statuses.length} {statuses.length === 1 ? 'group' : 'groups'}
                            </span>
                          </div>

                          {assignment.description && (
                            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                              {assignment.description}
                            </p>
                          )}

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {statuses.map((status) => (
                              <span
                                key={status.id}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                  status.submitted
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {status.submitted ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                                {status.name}: {status.submitted ? 'Submitted' : 'Pending'}
                              </span>
                            ))}
                          </div>

                          <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            {assignment.onedrive_link ? (
                              <a
                                href={assignment.onedrive_link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                Open OneDrive submission link <ExternalLink size={15} />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">No OneDrive link provided</span>
                            )}
                            {pending.length > 0 && (
                              <button
                                type="button"
                                onClick={() => openSubmission(assignment)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
                              >
                                <CheckCircle2 size={16} /> Confirm Submission
                              </button>
                            )}
                          </div>

                          {statuses.some((status) => status.submitted) && (
                            <div className="mt-3 space-y-2">
                              {statuses.filter((status) => status.submitted).map((status) => (
                                <div key={status.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-800">
                                  <CheckCircle2 size={14} />
                                  <span className="font-bold">{status.name}: Verified &amp; Submitted</span>
                                  {status.submitted_at && <span>· {formatDate(status.submitted_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                                  {status.confirmed_by_name && <span>· Confirmed by {status.confirmed_by_name}</span>}
                                  {status.submission_note && <span>· “{status.submission_note}”</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {submission && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="submission-dialog-title"
            className="my-auto w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FileCheck2 size={19} />
                </span>
                <h2 id="submission-dialog-title" className="mt-4 text-xl font-black text-slate-900">
                  Verify your submission
                </h2>
                <p className="mt-1 text-sm text-slate-500">{submission.assignment.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubmission(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close submission dialog"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={confirmSubmission} className="mt-6">
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                submission.stepOne ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'
              }`}>
                <input
                  type="checkbox"
                  checked={submission.stepOne}
                  onChange={(event) => setSubmission((current) => ({
                    ...current,
                    stepOne: event.target.checked,
                  }))}
                  className="mt-1 size-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-extrabold text-slate-900">
                    Step 1: Yes, I have uploaded our group&apos;s work to the OneDrive link
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Check this only after the team file has been uploaded.
                  </span>
                </span>
              </label>

              <div className={`mt-4 rounded-2xl border p-4 transition ${
                submission.stepOne ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
              }`}>
                <p className="text-sm font-extrabold text-slate-900">
                  Step 2: Confirm final submission
                </p>
                {submission.pending.length > 1 ? (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600">Confirm for group</span>
                    <select
                      value={submission.selectedGroupId}
                      disabled={!submission.stepOne}
                      onChange={(event) => setSubmission((current) => ({
                        ...current,
                        selectedGroupId: event.target.value,
                      }))}
                      className="form-input"
                    >
                      {submission.pending.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Group: {submission.pending[0]?.name}
                  </p>
                )}
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">Optional note</span>
                  <textarea
                    value={submission.note}
                    onChange={(event) => setSubmission((current) => ({
                      ...current,
                      note: event.target.value,
                    }))}
                    disabled={!submission.stepOne}
                    maxLength={2000}
                    rows={3}
                    placeholder="Anything your instructor should know?"
                    className="form-input resize-y"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSubmission(null)}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!submission.stepOne || submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={16} />}
                  Step 2: Confirm Final Submission
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
