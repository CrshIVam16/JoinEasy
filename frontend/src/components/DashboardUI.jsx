import { CheckCircle2, CircleAlert } from 'lucide-react';

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const success = toast.type === 'success';
  const Icon = success ? CheckCircle2 : CircleAlert;

  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl motion-enter ${
        success ? 'border-emerald-200 text-emerald-800' : 'border-rose-200 text-rose-800'
      }`}
    >
      <Icon className="mt-0.5 shrink-0" size={18} />
      <p className="flex-1 text-sm font-semibold">{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss notification" className="rounded-md p-0.5 hover:bg-slate-100">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export function StatusBadge({ status }) {
  const normalized = status || 'pending';
  const styles = {
    acknowledged: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    submitted: 'bg-sky-50 text-sky-700 ring-sky-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  };
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset status-pop ${styles[normalized] || styles.pending}`}>
      {normalized === 'acknowledged' && <CheckCircle2 size={13} />}
      {label}
    </span>
  );
}

export function ProgressBar({ value, label = 'Progress' }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
