import { useState } from 'react';
import { Check, Copy, LogOut, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [copyState, setCopyState] = useState('idle');
  const isStudent = user?.role === 'student';

  async function copyStudentCode() {
    if (!user?.student_code) return;
    try {
      await navigator.clipboard.writeText(user.student_code);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to={isStudent ? '/student' : '/admin'} className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <Sparkles size={19} />
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight text-slate-900">Joineazy</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:block">Teamwork, made simple</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="max-w-24 text-right sm:max-w-40">
            <p className="truncate text-xs font-bold text-slate-800 sm:text-sm">{user?.name}</p>
            {isStudent && user.student_code && (
              <button
                type="button"
                onClick={copyStudentCode}
                className="mt-0.5 hidden items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 sm:inline-flex"
                title="Copy your student ID"
              >
                {user.student_code}
                {copyState === 'copied' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            )}
          </div>
          <span className={`inline-flex rounded-full px-2 py-1.5 text-[10px] font-bold sm:px-3 sm:text-xs ${
            isStudent ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
          }`}>
            <span className="sm:hidden">{isStudent ? 'Student' : 'Admin'}</span>
            <span className="hidden sm:inline">{isStudent ? 'Student' : 'Professor / Admin'}</span>
          </span>
          {isStudent && user.student_code && (
            <button
              type="button"
              onClick={copyStudentCode}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700 sm:hidden"
              aria-label={`Copy student ID ${user.student_code}`}
            >
              {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
              {user.student_code}
            </button>
          )}
          {copyState === 'failed' && (
            <span className="hidden text-xs text-rose-600 md:inline">Copy failed</span>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Logout"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
      {copyState === 'copied' && (
        <span className="sr-only" role="status">Student ID copied to clipboard</span>
      )}
    </header>
  );
}
