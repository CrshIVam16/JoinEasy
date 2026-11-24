import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  FilePlus2,
  FileText,
  Filter,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import api from '../api/axios.js';

function errorMessage(error) {
  return error.response?.data?.error || error.message || 'Something went wrong.';
}

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, options).format(date);
}

function dateForInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  title: '',
  description: '',
  due_date: '',
  onedrive_link: '',
  target_type: 'all',
  group_ids: [],
};

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const success = toast.type === 'success';
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${
        success ? 'border-emerald-200 text-emerald-800' : 'border-rose-200 text-rose-800'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <X className="mt-0.5 shrink-0" size={18} />}
      <p className="flex-1 text-sm font-semibold">{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss notification"><X size={16} /></button>
    </div>
  );
}

function KpiCard({ label, value, note, icon: Icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-400">{note}</p>
    </article>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState(null);
  const [filterId, setFilterId] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setPageError('');
    try {
      const [analyticsResponse, assignmentResponse, groupResponse] = await Promise.all([
        api.get('/submissions/analytics'),
        api.get('/assignments'),
        api.get('/groups'),
      ]);
      setAnalytics(analyticsResponse.data);
      setAssignments(assignmentResponse.data.assignments || []);
      setGroups(groupResponse.data.groups || []);
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

  const summary = analytics?.summary || {};
  const visibleAssignments = useMemo(
    () => filterId === 'all' ? assignments : assignments.filter((item) => item.id === filterId),
    [assignments, filterId],
  );

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  }

  function openEdit(assignment) {
    setEditingId(assignment.id);
    setForm({
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: dateForInput(assignment.due_date),
      onedrive_link: assignment.onedrive_link || '',
      target_type: assignment.target_type,
      group_ids: assignment.target_type === 'groups'
        ? (assignment.groups || []).map((group) => group.id)
        : [],
    });
    setModalOpen(true);
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleGroup(groupId) {
    setForm((current) => ({
      ...current,
      group_ids: current.group_ids.includes(groupId)
        ? current.group_ids.filter((id) => id !== groupId)
        : [...current.group_ids, groupId],
    }));
  }

  async function saveAssignment(event) {
    event.preventDefault();
    setSaving(true);
    setToast(null);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      onedrive_link: form.onedrive_link.trim() || null,
      target_type: form.target_type,
      group_ids: form.target_type === 'groups' ? form.group_ids : [],
    };

    try {
      if (editingId) {
        await api.put(`/assignments/${editingId}`, payload);
      } else {
        await api.post('/assignments', payload);
      }
      setModalOpen(false);
      await loadData();
      setToast({ type: 'success', message: editingId ? 'Assignment updated.' : 'Assignment created.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment(assignment) {
    if (!window.confirm(`Delete “${assignment.title}”? This also removes its submission records.`)) return;
    setToast(null);
    try {
      await api.delete(`/assignments/${assignment.id}`);
      if (filterId === assignment.id) setFilterId('all');
      await loadData();
      setToast({ type: 'success', message: 'Assignment deleted.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    }
  }

  const overallPercent = Number(summary.completion_rate || 0);

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Professor workspace</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Assignment overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Create assignments, follow team progress, and see every submission at a glance.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
          >
            <Plus size={18} /> Create assignment
          </button>
        </section>

        {pageError && (
          <div role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <span>{pageError}</span>
            <button type="button" onClick={() => loadData(true)} className="font-bold underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="animate-spin text-indigo-600" size={30} />
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Total assignments" value={summary.total_assignments ?? 0} note="Across all active coursework" icon={FileText} tone="indigo" />
              <KpiCard label="Total groups" value={summary.total_groups ?? groups.length} note="Student teams in your workspace" icon={UsersRound} tone="sky" />
              <KpiCard label="Total submissions" value={summary.total_submissions ?? 0} note={`Across ${summary.total_groups ?? 0} active groups (${summary.total_students ?? 0} students)`} icon={CheckCircle2} tone="emerald" />
              <KpiCard label="Overall completion" value={`${overallPercent}%`} note="Submitted target groups to date" icon={Activity} tone="violet" />
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Progress snapshot</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">Submission completion</h2>
                  </div>
                  <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Activity size={19} />
                  </span>
                </div>

                {assignments.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                    Create an assignment to start tracking submissions.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {assignments.map((assignment) => {
                      const total = Number(assignment.total_target_groups || 0);
                      const submitted = Number(assignment.submitted_count || 0);
                      const percent = total ? Math.round((submitted / total) * 100) : 0;
                      return (
                        <div key={assignment.id}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-bold text-slate-800">{assignment.title}</p>
                            <span className="shrink-0 text-xs font-bold text-slate-500">{submitted}/{total} · {percent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Coursework</p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">Assignments</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {assignments.length} total
                  </span>
                </div>
                {assignments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <FilePlus2 className="mx-auto text-slate-300" size={26} />
                    <p className="mt-3 text-sm font-bold text-slate-700">No assignments yet</p>
                    <p className="mt-1 text-xs text-slate-500">Create your first assignment to notify student groups.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {assignments.map((assignment) => (
                      <article key={assignment.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900">{assignment.title}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              assignment.target_type === 'all' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
                            }`}>
                              {assignment.target_type === 'all' ? 'All students' : `${assignment.groups?.length || 0} groups`}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            <CalendarDays size={13} /> {formatDate(assignment.due_date)}
                            <span className="px-1">·</span>
                            {assignment.submitted_count}/{assignment.total_target_groups} submitted
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {assignment.onedrive_link && (
                            <a
                              href={assignment.onedrive_link}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                              aria-label="Open OneDrive link"
                            >
                              <ExternalLink size={16} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(assignment)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAssignment(assignment)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Delete ${assignment.title}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Live tracker</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Group submission status</h2>
                  <p className="mt-1 text-sm text-slate-500">Review each target group and its teammates.</p>
                </div>
                <label className="flex items-center gap-2">
                  <Filter size={16} className="text-slate-400" />
                  <span className="sr-only">Filter by assignment</span>
                  <select
                    value={filterId}
                    onChange={(event) => setFilterId(event.target.value)}
                    className="form-input min-w-48 py-2.5 text-sm"
                  >
                    <option value="all">All assignments</option>
                    {assignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                    ))}
                  </select>
                </label>
              </div>

              {visibleAssignments.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <UsersRound className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-bold text-slate-700">Nothing to track yet</p>
                  <p className="mt-1 text-xs text-slate-500">Assignment target groups will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibleAssignments.map((assignment) => {
                    const targetGroups = assignment.groups || [];
                    return (
                      <div key={assignment.id} className="p-5 sm:p-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-extrabold text-slate-900">{assignment.title}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {targetGroups.length} target {targetGroups.length === 1 ? 'group' : 'groups'} · Due {formatDate(assignment.due_date)}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            Number(assignment.submitted_count) === Number(assignment.total_target_groups) && Number(assignment.total_target_groups) > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {assignment.submitted_count}/{assignment.total_target_groups} submitted
                          </span>
                        </div>
                        {targetGroups.length === 0 ? (
                          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            No groups are currently in the target audience.
                          </p>
                        ) : (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {targetGroups.map((targetGroup) => {
                              const group = groups.find((item) => item.id === targetGroup.id);
                              const members = group?.members || [];
                              return (
                                <article key={targetGroup.id} className="rounded-2xl border border-slate-200 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <h4 className="truncate font-bold text-slate-800">{targetGroup.name}</h4>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        {members.length} {members.length === 1 ? 'teammate' : 'teammates'}
                                      </p>
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                      targetGroup.submitted
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}>
                                      {targetGroup.submitted ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                                      {targetGroup.submitted ? 'Submitted' : 'Pending'}
                                    </span>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {members.length ? members.map((member) => (
                                      <span key={member.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
                                        {member.name}
                                        {member.student_code && <span className="font-bold text-indigo-600">· {member.student_code}</span>}
                                      </span>
                                    )) : (
                                      <span className="text-xs text-slate-400">No members listed</span>
                                    )}
                                  </div>

                                  {targetGroup.submitted && (
                                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-xs text-emerald-800">
                                      <CheckCircle2 size={14} />
                                      <span className="font-semibold">
                                        {targetGroup.confirmed_by_name
                                          ? `Confirmed by ${targetGroup.confirmed_by_name}`
                                          : 'Submission confirmed'}
                                      </span>
                                      {targetGroup.submitted_at && (
                                        <span>· {formatDate(targetGroup.submitted_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                      )}
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-dialog-title"
            className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">
                  {editingId ? 'Manage coursework' : 'New coursework'}
                </span>
                <h2 id="assignment-dialog-title" className="mt-1 text-xl font-black text-slate-900">
                  {editingId ? 'Edit assignment' : 'Create assignment'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close assignment form"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveAssignment} className="space-y-5 px-6 py-6 sm:px-8">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Assignment title</span>
                <input
                  name="title"
                  value={form.title}
                  onChange={updateForm}
                  required
                  maxLength={200}
                  placeholder="e.g. Research presentation"
                  className="form-input"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Description</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  maxLength={2000}
                  rows={4}
                  placeholder="Share instructions, requirements, and helpful context..."
                  className="form-input resize-y"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Due date</span>
                  <input
                    name="due_date"
                    type="datetime-local"
                    value={form.due_date}
                    onChange={updateForm}
                    className="form-input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">OneDrive submission link</span>
                  <input
                    name="onedrive_link"
                    type="url"
                    value={form.onedrive_link}
                    onChange={updateForm}
                    maxLength={2048}
                    placeholder="https://..."
                    className="form-input"
                  />
                </label>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-bold text-slate-700">Target audience</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'all', title: 'All students', detail: 'Every group can submit', icon: UsersRound },
                    { value: 'groups', title: 'Specific groups', detail: 'Choose target teams', icon: Filter },
                  ].map(({ value, title, detail, icon: Icon }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                        form.target_type === value
                          ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="target_type"
                        value={value}
                        checked={form.target_type === value}
                        onChange={updateForm}
                        className="mt-1 accent-indigo-600"
                      />
                      <Icon className="mt-0.5 text-indigo-600" size={18} />
                      <span>
                        <span className="block text-sm font-bold text-slate-800">{title}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {form.target_type === 'groups' && (
                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-700">
                    Select groups <span className="font-medium text-slate-400">({form.group_ids.length} selected)</span>
                  </legend>
                  {groups.length === 0 ? (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Create a student group before targeting specific groups.</p>
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                      {groups.map((group) => (
                        <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={form.group_ids.includes(group.id)}
                            onChange={() => toggleGroup(group.id)}
                            className="size-4 accent-indigo-600"
                          />
                          <span className="flex-1 text-sm font-semibold text-slate-700">{group.name}</span>
                          <span className="text-xs text-slate-400">{group.member_count ?? group.members?.length ?? 0} members</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {form.group_ids.length === 0 && groups.length > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600">Select at least one group.</p>
                  )}
                </fieldset>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (form.target_type === 'groups' && form.group_ids.length === 0)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={16} />}
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create assignment'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
