import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Plus,
  UsersRound,
  UserPlus,
  Trash2,
} from 'lucide-react';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ProgressBar, StatusBadge, Toast } from '../components/DashboardUI.jsx';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function StudentDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState(null);
  const [courseIdInput, setCourseIdInput] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [memberInputs, setMemberInputs] = useState({});
  const [busyGroupId, setBusyGroupId] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setPageError('');
    try {
      const assignmentParams = selectedCourseId ? { courseId: selectedCourseId } : {};
      const [courseResponse, groupResponse, assignmentResponse] = await Promise.all([
        api.get('/courses'),
        api.get('/groups/my'),
        api.get('/assignments', { params: assignmentParams }),
      ]);
      setCourses(courseResponse.data.courses || []);
      setGroups(groupResponse.data.groups || []);
      setAssignments(assignmentResponse.data.assignments || []);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(() => {
    const units = assignments.flatMap((assignment) => {
      if (assignment.submission_type === 'individual') {
        return [{ status: assignment.my_submission?.status || 'pending' }];
      }
      return assignment.group_status || [];
    });
    const completed = units.filter((unit) => unit.status === 'submitted' || unit.status === 'acknowledged').length;
    const total = units.length;
    return {
      completed,
      total,
      pending: total - completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [assignments]);

  async function enrollInCourse(event) {
    event.preventDefault();
    const courseIdentifier = courseIdInput.trim();
    if (!courseIdentifier) return;
    setEnrolling(true);
    setToast(null);
    try {
      const courseId = UUID_PATTERN.test(courseIdentifier)
        ? courseIdentifier
        : (await api.get('/courses/lookup', { params: { code: courseIdentifier } })).data.course.id;
      if (courses.some((course) => course.id === courseId)) {
        setToast({ type: 'success', message: 'You are already enrolled in this course.' });
        setCourseIdInput('');
        return;
      }
      await api.post(`/courses/${courseId}/enroll`, {});
      setCourseIdInput('');
      setSelectedCourseId(courseId);
      await loadData();
      setToast({ type: 'success', message: 'You are enrolled in the course.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setEnrolling(false);
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    setCreatingGroup(true);
    setToast(null);
    try {
      await api.post('/groups', { name: groupName.trim() });
      setGroupName('');
      await loadData();
      setToast({ type: 'success', message: 'Group created. You are its leader.' });
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
    setBusyGroupId(group.id);
    setToast(null);
    try {
      await api.post(`/groups/${group.id}/members`, { identifier });
      setMemberInputs((current) => ({ ...current, [group.id]: '' }));
      await loadData();
      setToast({ type: 'success', message: 'Student added to the group.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setBusyGroupId('');
    }
  }

  async function removeMember(group, member) {
    if (!window.confirm(`Remove ${member.name} from ${group.name}?`)) return;
    setBusyGroupId(group.id);
    setToast(null);
    try {
      await api.delete(`/groups/${group.id}/members/${member.id}`);
      await loadData();
      setToast({ type: 'success', message: `${member.name} was removed from the group.` });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setBusyGroupId('');
    }
  }

  async function transferLeader(group, leaderId) {
    if (!leaderId || leaderId === group.leader_id) return;
    setBusyGroupId(group.id);
    setToast(null);
    try {
      await api.patch(`/groups/${group.id}/leader`, { leader_id: leaderId });
      await loadData();
      setToast({ type: 'success', message: 'Group leadership transferred.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setBusyGroupId('');
    }
  }

  async function submitAssignment(assignment, groupId = null) {
    const key = `${assignment.id}:${groupId || 'individual'}`;
    setBusyAction(key);
    setToast(null);
    try {
      await api.post('/submissions/confirm', {
        assignment_id: assignment.id,
        ...(groupId ? { group_id: groupId } : {}),
        step_one_intent: true,
        step_two_confirmed: true,
        submission_note: null,
      });
      await loadData();
      setToast({ type: 'success', message: 'Submission confirmed.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setBusyAction('');
    }
  }

  async function acknowledgeAssignment(assignment, groupId = null) {
    const key = `${assignment.id}:${groupId || 'individual'}`;
    setBusyAction(key);
    setToast(null);
    try {
      await api.post('/submissions/acknowledge', {
        assignment_id: assignment.id,
        ...(groupId ? { group_id: groupId } : {}),
      });
      await loadData();
      setToast({ type: 'success', message: 'Submission acknowledged.' });
    } catch (error) {
      setToast({ type: 'error', message: errorMessage(error) });
    } finally {
      setBusyAction('');
    }
  }

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="motion-enter mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-200 sm:p-9">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">Student workspace</span>
              <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">Welcome, {user?.name?.split(' ')[0] || 'student'}.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100 sm:text-base">
                Keep your courses, teams, and submission progress together.
              </p>
            </div>
            <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-5 sm:w-80">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-indigo-100">Completion</p>
                  <p className="text-3xl font-black">{progress.percent}%</p>
                </div>
                <p className="text-right text-xs text-indigo-100">{progress.completed} / {progress.total} tasks</p>
              </div>
              <ProgressBar value={progress.percent} label="Student assignment completion" />
              <div className="mt-3 flex justify-between text-xs font-semibold text-indigo-100">
                <span>{progress.pending} pending</span><span>{groups.length} groups</span>
              </div>
            </div>
          </div>
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
            <section className="mb-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Your learning</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Enrolled courses</h2>
                </div>
                {selectedCourseId && (
                  <button type="button" onClick={() => setSelectedCourseId('')} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">
                    Clear assignment filter
                  </button>
                )}
              </div>

              {courses.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => (
                    <button
                      type="button"
                      key={course.id}
                      onClick={() => setSelectedCourseId((current) => current === course.id ? '' : course.id)}
                      aria-pressed={selectedCourseId === course.id}
                      className={`motion-enter rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        selectedCourseId === course.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black tracking-wide text-indigo-700">{course.code}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {course.assignment_count || 0} assignments
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg font-black text-slate-900">{course.title}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">Prof. {course.professor_name || 'Instructor'}</p>
                      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{course.description || 'No course description.'}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  You are not enrolled in a course yet. Ask your instructor for the course code or UUID to join.
                </p>
              )}
              <form onSubmit={enrollInCourse} className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
                <label className="sr-only" htmlFor="course-id">Course code or UUID</label>
                <input
                  id="course-id"
                  value={courseIdInput}
                  onChange={(event) => setCourseIdInput(event.target.value)}
                  placeholder="Enter a course code or UUID"
                  className="form-input flex-1"
                  required
                />
                <button disabled={enrolling} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
                  {enrolling ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
                  Enroll
                </button>
              </form>
              <p className="mt-2 text-xs text-slate-500">Use the course code, or the UUID shown on your professor&apos;s course card.</p>
            </section>

            <div className="grid items-start gap-8 xl:grid-cols-[0.85fr_1.15fr]">
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><UsersRound size={19} /></span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-violet-600">Teamwork</p>
                    <h2 className="text-xl font-black text-slate-900">My groups</h2>
                  </div>
                </div>
                <form onSubmit={createGroup} className="mb-5 flex flex-col gap-2 sm:flex-row">
                  <input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={120} required placeholder="Name your group" className="form-input flex-1" />
                  <button disabled={creatingGroup} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
                    {creatingGroup ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Create
                  </button>
                </form>
                {groups.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Create a group to coordinate with classmates.</p>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => {
                      const canManage = group.created_by === user?.id || group.leader_id === user?.id;
                      return (
                        <article key={group.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-extrabold text-slate-900">{group.name}</h3>
                              <p className="mt-1 text-xs text-slate-500">{group.members?.length || 0} members</p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Leader: {group.members?.find((member) => member.id === group.leader_id)?.name || 'Assigned'}</span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {(group.members || []).map((member) => {
                              const isLeader = member.id === group.leader_id;
                              return (
                                <div key={member.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{member.name}</span>
                                  {isLeader && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">Leader</span>}
                                  {member.student_code && <span className="hidden text-[11px] text-slate-500 sm:inline">{member.student_code}</span>}
                                  {canManage && member.id !== group.leader_id && (
                                    <button type="button" onClick={() => removeMember(group, member)} disabled={busyGroupId === group.id} title={`Remove ${member.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50">
                                      {busyGroupId === group.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {canManage && group.members?.length > 1 && (
                            <label className="mt-3 block">
                              <span className="mb-1 block text-xs font-semibold text-slate-500">Transfer leadership</span>
                              <select
                                value={group.leader_id}
                                disabled={busyGroupId === group.id}
                                onChange={(event) => transferLeader(group, event.target.value)}
                                className="form-input py-2"
                              >
                                {group.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                              </select>
                            </label>
                          )}
                          <form onSubmit={(event) => addMember(event, group)} className="mt-3 flex gap-2">
                            <input
                              value={memberInputs[group.id] || ''}
                              onChange={(event) => setMemberInputs((current) => ({ ...current, [group.id]: event.target.value }))}
                              placeholder="Email or STU-XXXX"
                              aria-label={`Add a member to ${group.name}`}
                              className="form-input min-w-0 flex-1 py-2.5"
                            />
                            <button type="submit" disabled={!memberInputs[group.id]?.trim() || busyGroupId === group.id} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                              {busyGroupId === group.id ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
                            </button>
                          </form>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Your coursework</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-900">Assignments</h2>
                  </div>
                  <BookOpen className="text-indigo-500" size={22} />
                </div>
                {assignments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No assignments {selectedCourseId ? 'for this course' : 'available yet'}.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {assignments.map((assignment) => {
                      const individual = assignment.submission_type === 'individual';
                      const ownSubmission = assignment.my_submission;
                      const groupStatuses = assignment.group_status || [];
                      const isComplete = individual
                        ? ownSubmission?.status === 'acknowledged'
                        : groupStatuses.length > 0 && groupStatuses.every((item) => item.status === 'acknowledged');

                      return (
                        <article key={assignment.id} className="motion-enter rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${individual ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
                                  {individual ? 'Individual' : 'Group'}
                                </span>
                                {assignment.course_code && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{assignment.course_code}</span>}
                                {isComplete && <span className="status-pop inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><Check size={13} /> Complete</span>}
                              </div>
                              <h3 className="text-lg font-black text-slate-900">{assignment.title}</h3>
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><CalendarDays size={14} />{formatDate(assignment.due_date)}</span>
                          </div>
                          {assignment.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{assignment.description}</p>}

                          {individual ? (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                              <div className="flex items-center gap-2">
                                {ownSubmission?.status ? <StatusBadge status={ownSubmission.status} /> : <StatusBadge status="pending" />}
                                {ownSubmission?.submitted_at && <span className="text-xs text-slate-500">Submitted {formatDate(ownSubmission.submitted_at)}</span>}
                              </div>
                              {!ownSubmission?.status ? (
                                <button type="button" disabled={busyAction === `${assignment.id}:individual`} onClick={() => submitAssignment(assignment)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                                  {busyAction === `${assignment.id}:individual` ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm submission
                                </button>
                              ) : ownSubmission.status === 'submitted' ? (
                                <button type="button" disabled={busyAction === `${assignment.id}:individual`} onClick={() => acknowledgeAssignment(assignment)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                                  {busyAction === `${assignment.id}:individual` ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Acknowledge
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {groupStatuses.map((status) => {
                                const group = groups.find((item) => item.id === status.id);
                                const leaderId = group?.leader_id || (status.is_leader ? user?.id : null);
                                const leader = group?.members?.find((member) => member.id === leaderId);
                                const actionKey = `${assignment.id}:${status.id}`;
                                return (
                                  <div key={status.id} className="rounded-xl border border-slate-200 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="font-bold text-slate-800">{status.name}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          Leader: {leader?.name || (status.is_leader ? `${user?.name} (you)` : leaderId || 'Unknown')}
                                          {status.is_leader && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">You are the leader</span>}
                                        </p>
                                      </div>
                                      <StatusBadge status={status.status} />
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs text-slate-500">
                                        {status.acknowledged_by
                                          ? `Acknowledged by ${group?.members?.find((member) => member.id === status.acknowledged_by)?.name || leader?.name || 'group leader'}${status.acknowledged_at ? ` · ${formatDate(status.acknowledged_at)}` : ''}`
                                          : status.submitted_at ? `Submitted ${formatDate(status.submitted_at)}` : 'No submission yet'}
                                      </span>
                                      {status.status === 'pending' && status.is_leader && (
                                        <button type="button" disabled={busyAction === actionKey} onClick={() => submitAssignment(assignment, status.id)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                                          {busyAction === actionKey ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm submission
                                        </button>
                                      )}
                                      {status.status === 'submitted' && status.is_leader && (
                                        <button type="button" disabled={busyAction === actionKey} onClick={() => acknowledgeAssignment(assignment, status.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                                          {busyAction === actionKey ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Acknowledge
                                        </button>
                                      )}
                                      {!status.is_leader && status.status !== 'acknowledged' && (
                                        <p className="text-xs font-semibold text-amber-700">Only the group leader can confirm or acknowledge this submission.</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {assignment.onedrive_link && (
                            <a href={assignment.onedrive_link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                              Open OneDrive link <ExternalLink size={13} />
                            </a>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
