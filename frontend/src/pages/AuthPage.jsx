import { useState } from 'react';
import { ArrowRight, BookOpenCheck, GraduationCap, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardPathForRole, useAuth } from '../context/AuthContext.jsx';

function errorMessage(error) {
  return error.response?.data?.error || error.message || 'Unable to sign in right now.';
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
  }

  function validate() {
    const errors = {};
    if (isRegister && !form.name.trim()) errors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!form.password) errors.password = 'Enter your password.';
    else if (isRegister && form.password.length < 8) errors.password = 'Use at least 8 characters.';
    if (isRegister && !['student', 'professor', 'admin'].includes(form.role)) {
      errors.role = 'Choose a valid account type.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const user = isRegister
        ? await register({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          })
        : await login({ email: form.email.trim(), password: form.password });
      navigate(dashboardPathForRole(user.role), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 top-0 size-96 rounded-full bg-indigo-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 size-[30rem] rounded-full bg-sky-500/15 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[1fr_0.92fr]">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-10 text-white lg:flex">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
              <Sparkles size={21} />
            </span>
            <span className="text-xl font-black tracking-tight">Joineazy</span>
          </div>
          <div className="max-w-md">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-100">
              <BookOpenCheck size={14} /> Built for better teamwork
            </span>
            <h1 className="text-4xl font-black leading-tight tracking-tight xl:text-5xl">
              Bring every group project together.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-indigo-100/85">
              Organize your teams, keep assignments on track, and celebrate every verified submission.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-indigo-100/85">
            <span className="grid size-10 place-items-center rounded-xl bg-white/10">
              <GraduationCap size={19} />
            </span>
            One workspace for students and educators
          </div>
        </section>

        <section className="px-6 py-8 sm:px-10 sm:py-12">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-indigo-600 text-white">
                <Sparkles size={19} />
              </span>
              <span className="text-xl font-black text-slate-900">Joineazy</span>
            </div>
            <p className="text-sm text-slate-500">A clearer way to manage every group project.</p>
          </div>

          <div className="mb-7">
            <p className="text-sm font-bold text-indigo-600">Welcome to Joineazy</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              {isRegister ? 'Create your account' : 'Sign in to continue'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isRegister ? 'Join your class and get your team organized.' : 'Your teams and assignments are waiting.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {['login', 'register'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setMode(tab); setError(''); setFieldErrors({}); }}
                className={`rounded-lg px-4 py-2.5 text-sm font-bold capitalize transition ${
                  mode === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <form key={mode} noValidate onSubmit={submit} className="space-y-4 motion-enter">
            {isRegister && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Full name</span>
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={updateField}
                    required
                    maxLength={120}
                    placeholder="Alex Morgan"
                    className="form-input"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  />
                  {fieldErrors.name && <span id="name-error" className="field-error">{fieldErrors.name}</span>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Account type</span>
                  <select
                    name="role"
                    value={form.role}
                    onChange={updateField}
                    className="form-input"
                    aria-invalid={Boolean(fieldErrors.role)}
                    aria-describedby={fieldErrors.role ? 'role-error' : undefined}
                  >
                    <option value="student">Student</option>
                    <option value="professor">Professor</option>
                    <option value="admin">Professor (Admin)</option>
                  </select>
                  {fieldErrors.role && <span id="role-error" className="field-error">{fieldErrors.role}</span>}
                </label>
              </>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={updateField}
                required
                maxLength={254}
                placeholder="you@school.edu"
                className="form-input"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email && <span id="email-error" className="field-error">{fieldErrors.email}</span>}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span>
              <input
                name="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={updateField}
                required
                minLength={isRegister ? 8 : undefined}
                maxLength={128}
                placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                className="form-input"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              {fieldErrors.password && <span id="password-error" className="field-error">{fieldErrors.password}</span>}
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {busy ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
            <ShieldCheck size={15} /> Your account details are protected
          </p>
        </section>
      </div>
    </main>
  );
}
