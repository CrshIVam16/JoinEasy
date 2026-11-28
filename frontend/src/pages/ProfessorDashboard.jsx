import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  ExternalLink,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from 'lucide-react';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ProgressBar, StatusBadge, Toast } from '../components/DashboardUI.jsx';

const EMPTY_ASSIGNMENT = {
  course_id: '',
  title: '',
  description: '',
  due_date: '',
  onedrive_link: '',
  target_type: 'all',
  submission_type: 'group',
  group_ids: [],
};

function errorMessage(error) {
  return error.response?.data?.error || error.message || 'Something went wrong.';
}

function formatDate(value) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function dateForInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Metric({ icon: Icon, label, value, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span>
      </div>
    </div>
  );
}

export default function ProfessorDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [courseFilter, setCourseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState(null);
  const [courseForm, setCourseForm] = useState({ code: '', title: '', description: '' });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [enrollmentForm, setEnrollmentForm] = useState({
    course_id: '',
    identifier_type: 'email',
    identifier: '',
  });
  const [enrollingStudent, setEnrollingStudent] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [assignmentForm, setAssignmentForm] = useState(EMPTY_ASSIGNMENT);
  const [groupSelectionTouched, setGroupSelectionTouched] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setPageError('');
    try {
      const courseParams = courseFilter ? { courseId: courseFilter } : {};
      const analyticsParams = {
        ...(courseFilter ? { courseId: courseFilter } : {}),
        status: statusFilter,
      };
      const [courseResponse, groupResponse, assignmentResponse, analyticsResponse] = await Promise.all([
        api.get('/courses'),
        api.get('/groups'),
        api.get('/assignments', { params: courseParams }),
        api.get('/submissions/analytics', { params: analyticsParams }),
      ]);
      setCourses(courseResponse.data.courses || []);
      setGroups(groupResponse.data.groups || []);
      setAssignments(assignmentResponse.data.assignments || []);
      setAnalytics(analyticsResponse.data);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [courseFilter, statusFilter]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const targetGroups = groups;

  const filteredAssignmentIds = useMemo(
    () => new Set((analytics?.assignments || []).map((assignment) => assignment.id || assignment.assignment_id)),
    [analytics],
  );
  const visibleAssignments = statusFilter === 'all'
    ? assignments
    : assignments.filter((assignment) => filteredAssignmentIds.has(assignment.id));
  const summary = useMemo(() => {
    const totalTargets = assignments.reduce(
      (total, assignment) => total + Number(assignment.total_target_count || 0),
      0,
    );
    const allSubmissions = assignments.reduce(
      (total, assignment) => total + Number(assignment.submitted_count || 0),
      0,
    );
    const acknowledged = assignments.reduce(
      (total, assignment) => total + Number(assignment.acknowledged_count || 0),
      0,
    );
    const recordedSubmissions = Math.min(allSubmissions, totalTargets);
    const acknowledgedSubmissions = Math.min(acknowledged, recordedSubmissions);
    return {
      total_assignments: assignments.length,
      total_targets: totalTargets,
      submitted_count: recordedSubmissions - acknowledgedSubmissions,
      acknowledged_count: acknowledgedSubmissions,
      pending_count: Math.max(0, totalTargets - recordedSubmissions),
    };
  }, [assignments]);

  function updateCourseForm(event) {
    setCourseForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function createCourse(event) {
    event.preventDefault();
    setCreatingCourse(true);
    setToast(null);
    try {
      await api.post('/courses', {
        code: courseForm.code.trim(),
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || null,
      });
      setCourseForm({ code: '', title: '', description: '' });
      await loadData();
      setToast({ type: 'success', message: 'Course created.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setCreatingCourse(false);
    }
  }

  async function enrollStudent(event) {
    event.preventDefault();
    const { course_id, identifier, identifier_type } = enrollmentForm;
    setEnrollingStudent(true);
    setToast(null);
    try {
      await api.post(`/courses/${course_id}/enroll`, {
        [identifier_type]: identifier.trim(),
      });
      setEnrollmentForm((current) => ({ ...current, identifier: '' }));
      await loadData();
      setToast({ type: 'success', message: 'Student enrolled in the course.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setEnrollingStudent(false);
    }
  }

  function openCreateAssignment() {
    setEditingId('');
    setAssignmentForm({
      ...EMPTY_ASSIGNMENT,
      course_id: courseFilter || courses[0]?.id || '',
    });
    setGroupSelectionTouched(false);
    setShowAssignmentForm(true);
  }

  function openEditAssignment(assignment) {
    setEditingId(assignment.id);
    setAssignmentForm({
      course_id: assignment.course_id || '',
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: dateForInput(assignment.due_date),
      onedrive_link: assignment.onedrive_link || '',
      target_type: assignment.target_type || 'all',
      submission_type: assignment.submission_type || 'group',
      group_ids: (assignment.groups || []).map((group) => group.id),
    });
    setGroupSelectionTouched(false);
    setShowAssignmentForm(true);
  }

  function updateAssignmentForm(event) {
    const { name, value } = event.target;
    setAssignmentForm((current) => ({ ...current, [name]: value }));
  }

  function toggleGroup(groupId) {
    setGroupSelectionTouched(true);
    setAssignmentForm((current) => ({
      ...current,
      group_ids: current.group_ids.includes(groupId)
        ? current.group_ids.filter((id) => id !== groupId)
        : [...current.group_ids, groupId],
    }));
  }

  async function saveAssignment(event) {
    event.preventDefault();
    setSavingAssignment(true);
    setToast(null);
    const payload = {
      course_id: assignmentForm.course_id || null,
      title: assignmentForm.title.trim(),
      description: assignmentForm.description.trim() || null,
      due_date: assignmentForm.due_date ? new Date(assignmentForm.due_date).toISOString() : null,
      onedrive_link: assignmentForm.onedrive_link.trim() || null,
      target_type: assignmentForm.target_type,
      submission_type: assignmentForm.submission_type,
    };
    if (!editingId || groupSelectionTouched) {
      payload.group_ids = assignmentForm.target_type === 'groups' ? assignmentForm.group_ids : [];
    }

    try {
      if (editingId) await api.put(`/assignments/${editingId}`, payload);
      else await api.post('/assignments', payload);
      setShowAssignmentForm(false);
      await loadData();
      setToast({ type: 'success', message: editingId ? 'Assignment updated.' : 'Assignment created.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setSavingAssignment(false);
    }
  }

  async function deleteAssignment(assignment) {
    if (!window.confirm(`Delete "${assignment.title}" and its submission records?`)) return;
    setToast(null);
    try {
      await api.delete(`/assignments/${assignment.id}`);
      await loadData();
      setToast({ type: 'success', message: 'Assignment deleted.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    }
  }

  function analyticsFor(assignment) {
    return (analytics?.assignments || []).find((item) => item.id === assignment.id || item.assignment_id === assignment.id);
  }

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="motion-enter mb-8 flex flex-col justify-between gap-5 rounded-[2rem] bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-800 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:p-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.17em] text-indigo-200">{user?.role === 'admin' ? 'Professor (Admin) workspace' : 'Professor workspace'}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Courses &amp; assignments</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">Create course work and follow student and group submissions as they come in.</p>
          </div>
          <button type="button" onClick={openCreateAssignment} disabled={!courses.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={17} /> New assignment
          </button>
        </section>

        {pageError && (
          <div role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{pageError}</span>
            <button type="button" onClick={() => loadData(true)} className="font-bold underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-indigo-600" size={30} /></div>
        ) : (
          <>
            <section className="mb-9">
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Teaching</p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">Courses</h2>
              </div>
              {courses.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => (
                    <button
                      type="button"
                      key={course.id}
                      aria-pressed={courseFilter === course.id}
                      onClick={() => setCourseFilter((current) => current === course.id ? '' : course.id)}
                      className={`motion-enter rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        courseFilter === course.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">{course.code}</span>
                        <span className="text-xs font-semibold text-slate-500">{course.enrolled_student_count || 0} students</span>
                      </div>
                      <h3 className="mt-4 text-lg font-black text-slate-900">{course.title}</h3>
                      <p className="mt-1 select-all break-all font-mono text-[10px] text-slate-400">Course ID: {course.id}</p>
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{course.description || 'No course description.'}</p>
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                        <span><b className="block text-base text-slate-900">{course.assignment_count || 0}</b><small className="text-[10px] text-slate-500">Assignments</small></span>
                        <span><b className="block text-base text-sky-700">{course.submission_count || 0}</b><small className="text-[10px] text-slate-500">All submissions</small></span>
                        <span><b className="block text-base text-emerald-700">{course.acknowledgment_count || 0}</b><small className="text-[10px] text-slate-500">Acknowledged</small></span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No courses are available yet.</p>
              )}
              {courseFilter && <button type="button" onClick={() => setCourseFilter('')} className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-800">Clear course filter</button>}
              <form onSubmit={createCourse} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[0.7fr_1fr_1.5fr_auto]">
                <input name="code" value={courseForm.code} onChange={updateCourseForm} required maxLength={40} placeholder="Course code" aria-label="Course code" className="form-input" />
                <input name="title" value={courseForm.title} onChange={updateCourseForm} required maxLength={200} placeholder="Course title" aria-label="Course title" className="form-input" />
                <input name="description" value={courseForm.description} onChange={updateCourseForm} maxLength={2000} placeholder="Description (optional)" aria-label="Course description" className="form-input" />
                <button disabled={creatingCourse} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                  {creatingCourse ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Course
                </button>
              </form>
              {courses.length > 0 && (
                <form onSubmit={enrollStudent} className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_0.8fr_1.3fr_auto]">
                  <select
                    value={enrollmentForm.course_id}
                    onChange={(event) => setEnrollmentForm((current) => ({ ...current, course_id: event.target.value }))}
                    required
                    aria-label="Course to enroll student in"
                    className="form-input"
                  >
                    <option value="" disabled>Select a course</option>
                    {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
                  </select>
                  <select
                    value={enrollmentForm.identifier_type}
                    onChange={(event) => setEnrollmentForm((current) => ({ ...current, identifier_type: event.target.value }))}
                    aria-label="Student identifier type"
                    className="form-input"
                  >
                    <option value="email">Email</option>
                    <option value="student_code">Student code</option>
                    <option value="student_id">Student UUID</option>
                  </select>
                  <input
                    value={enrollmentForm.identifier}
                    onChange={(event) => setEnrollmentForm((current) => ({ ...current, identifier: event.target.value }))}
                    required
                    maxLength={254}
                    placeholder="Student email, code, or UUID"
                    aria-label="Student identifier"
                    className="form-input"
                  />
                  <button disabled={enrollingStudent} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60">
                    {enrollingStudent ? <LoaderCircle size={16} className="animate-spin" /> : <UsersRound size={16} />}
                    Enroll student
                  </button>
                </form>
              )}
              {!courses.length && <p className="mt-2 text-xs text-slate-500">Create a course before adding course-linked assignments.</p>}
            </section>

            <section className="mb-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={ClipboardList} label="Assignments" value={summary.total_assignments ?? 0} />
              <Metric icon={UsersRound} label="Submitted" value={summary.submitted_count ?? 0} tone="sky" />
              <Metric icon={CheckCircle2} label="Acknowledged" value={summary.acknowledged_count ?? 0} tone="emerald" />
              <Metric icon={Activity} label="Pending" value={summary.pending_count ?? 0} tone="violet" />
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:p-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Monitoring</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Submission status</h2>
                  <p className="mt-1 text-sm text-slate-500">Counts reflect the selected course and all statuses; filters narrow the list below.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="sr-only">Filter by course</span>
                    <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="form-input py-2.5">
                      <option value="">All courses</option>
                      {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Filter by submission status</span>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="form-input py-2.5">
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="acknowledged">Acknowledged</option>
                    </select>
                  </label>
                </div>
              </div>
              {visibleAssignments.length ? (
                <div className="divide-y divide-slate-100">
                  {visibleAssignments.map((assignment) => {
                    const analyticsAssignment = analyticsFor(assignment);
                    const allTargets = assignment.submission_type === 'individual'
                      ? assignment.students || []
                      : assignment.groups || [];
                    const shownTargets = analyticsAssignment
                      ? (assignment.submission_type === 'individual' ? analyticsAssignment.students : analyticsAssignment.groups) || []
                      : allTargets;
                    const total = Number(assignment.total_target_count || 0);
                    const recordedSubmissions = Number(assignment.submitted_count || 0);
                    const acknowledged = Math.min(
                      Number(assignment.acknowledged_count || 0),
                      recordedSubmissions,
                    );
                    const submitted = Math.max(0, recordedSubmissions - acknowledged);
                    const pending = Math.max(0, total - recordedSubmissions);
                    const percent = total ? Math.round((Math.min(recordedSubmissions, total) / total) * 100) : 0;
                    const targetLookup = new Map(allTargets.map((target) => [target.id, target]));

                    return (
                      <article key={assignment.id} className="motion-enter p-5 sm:p-6">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">{assignment.course_code || 'Course not linked'}</span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${assignment.submission_type === 'individual' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
                                {assignment.submission_type === 'individual' ? 'Individual' : 'Group'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{assignment.target_type === 'all' ? 'All targets' : 'Selected groups'}</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900">{assignment.title}</h3>
                            {assignment.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{assignment.description}</p>}
                            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={13} /> {formatDate(assignment.due_date)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {assignment.onedrive_link && <a href={assignment.onedrive_link} target="_blank" rel="noreferrer" aria-label="Open OneDrive link" className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><ExternalLink size={16} /></a>}
                            <button type="button" onClick={() => openEditAssignment(assignment)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"><Edit3 size={14} /> Edit</button>
                            <button type="button" onClick={() => deleteAssignment(assignment)} aria-label={`Delete ${assignment.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <p className="text-xs font-semibold text-sky-700">{submitted} submitted</p>
                          <p className="text-xs font-semibold text-emerald-700">{acknowledged} acknowledged</p>
                          <p className="text-xs font-semibold text-slate-600">{pending} pending</p>
                        </div>
                        <ProgressBar value={percent} label={`${assignment.title}: ${recordedSubmissions} of ${total} submitted or acknowledged`} />
                        <div className="mt-4 grid gap-2 lg:grid-cols-2">
                          {shownTargets.map((target) => {
                            const detail = targetLookup.get(target.id) || {};
                            return (
                              <div key={target.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-800">{target.name || detail.name || 'Student or group'}</p>
                                  {target.acknowledged_by_name && <p className="mt-0.5 text-xs text-slate-500">Acknowledged by {target.acknowledged_by_name}</p>}
                                  {!target.acknowledged_by_name && detail.confirmed_by_name && <p className="mt-0.5 text-xs text-slate-500">Submitted by {detail.confirmed_by_name}</p>}
                                  {detail.submitted_at && <p className="mt-0.5 text-[11px] text-slate-400">Submitted {formatDate(detail.submitted_at)}</p>}
                                </div>
                                <StatusBadge status={target.status || detail.status || 'pending'} />
                              </div>
                            );
                          })}
                          {shownTargets.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No targets match this status filter.</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="p-10 text-center">
                  <BookOpen className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-bold text-slate-700">No assignments to show</p>
                  <p className="mt-1 text-xs text-slate-500">Create an assignment or adjust your filters.</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {showAssignmentForm && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-indigo-600">{editingId ? 'Edit coursework' : 'New coursework'}</p>
                <h2 id="assignment-dialog-title" className="mt-1 text-xl font-black text-slate-900">{editingId ? 'Update assignment' : 'Create assignment'}</h2>
              </div>
              <button type="button" onClick={() => setShowAssignmentForm(false)} aria-label="Close assignment form" className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
            </div>
            <form onSubmit={saveAssignment} className="space-y-4 px-6 py-6 sm:px-8">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Course</span>
                <select name="course_id" value={assignmentForm.course_id} onChange={updateAssignmentForm} required className="form-input">
                  <option value="" disabled>Select a course</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Title</span>
                <input name="title" value={assignmentForm.title} onChange={updateAssignmentForm} required maxLength={200} className="form-input" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Description</span>
                <textarea name="description" value={assignmentForm.description} onChange={updateAssignmentForm} maxLength={2000} rows={3} className="form-input resize-y" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Deadline</span>
                  <input name="due_date" type="datetime-local" value={assignmentForm.due_date} onChange={updateAssignmentForm} className="form-input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">OneDrive link (optional)</span>
                  <input name="onedrive_link" type="url" value={assignmentForm.onedrive_link} onChange={updateAssignmentForm} maxLength={2048} placeholder="https://" className="form-input" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Submission type</span>
                  <select name="submission_type" value={assignmentForm.submission_type} onChange={updateAssignmentForm} className="form-input">
                    <option value="individual">Individual</option>
                    <option value="group">Group</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Target scope</span>
                  <select name="target_type" value={assignmentForm.target_type} onChange={(event) => {
                    setGroupSelectionTouched(true);
                    updateAssignmentForm(event);
                  }} className="form-input">
                    <option value="all">All eligible students or groups</option>
                    <option value="groups">Selected groups</option>
                  </select>
                </label>
              </div>
              {assignmentForm.target_type === 'groups' && (
                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-700">Target groups</legend>
                  {targetGroups.length ? (
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                      {targetGroups.map((group) => (
                        <label key={group.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                          <input type="checkbox" checked={assignmentForm.group_ids.includes(group.id)} onChange={() => toggleGroup(group.id)} className="size-4 accent-indigo-600" />
                          <span className="text-sm font-semibold text-slate-700">{group.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">No existing group targets are available to select yet.</p>
                  )}
                  {!editingId && assignmentForm.group_ids.length === 0 && <p className="mt-1 text-xs text-rose-600">Choose at least one group.</p>}
                </fieldset>
              )}
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowAssignmentForm(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={savingAssignment || (!editingId && assignmentForm.target_type === 'groups' && assignmentForm.group_ids.length === 0)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {savingAssignment ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingAssignment ? 'Saving…' : editingId ? 'Save changes' : 'Create assignment'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
