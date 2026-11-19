import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, Building2, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, GraduationCap, History, LoaderCircle, Search, Sparkles, X } from 'lucide-react';
import { request } from './api.js';

const number = new Intl.NumberFormat('en-IN');
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const calendarDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const displayNumber = (value) => value == null ? '—' : number.format(value);
export const displayDate = (value) => value ? date.format(new Date(value)) : '—';
export const displayDateTime = (value) => value ? dateTime.format(new Date(value)) : '—';
export const displayCalendarDate = (value) => value ? calendarDate.format(new Date(`${value}T00:00:00Z`)) : '—';

export function relativeDate(value) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes > -2) return 'Just now';
  const rt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes > -60) return rt.format(minutes, 'minute');
  if (minutes > -1440) return rt.format(Math.round(minutes / 60), 'hour');
  if (minutes > -10080) return rt.format(Math.round(minutes / 1440), 'day');
  return displayDate(value);
}

export function useRead(action, params = {}, refresh = 0) {
  const key = new URLSearchParams(params).toString();
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!action) return;
    const controller = new AbortController();
    setState((old) => ({ ...old, status: 'loading' }));
    request(action, { params: Object.fromEntries(new URLSearchParams(key)), signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ status: 'ready', data }); },
      (error) => { if (!controller.signal.aborted) setState({ status: 'error', error: error.message }); }
    );
    return () => controller.abort();
  }, [action, key, refresh]);
  return state;
}

export function Brand() {
  return <div className="brand"><img src="/schooldesk.svg" alt="" width="37" height="37" /><span>Schooldesk<small>Records workspace</small></span></div>;
}

export function Notice({ children }) {
  return <div className="notice" role="alert"><AlertCircle size={17} /> <span>{children}</span></div>;
}

export function Loading({ label = 'Loading records…' }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={19} /> {label}</div>;
}

export function Empty({ icon: Icon = FileSpreadsheet, title, description, children }) {
  return <div className="empty"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong>{description && <p>{description}</p>}{children}</div>;
}

export function SearchField({ value, onChange, placeholder }) {
  return <div className="search-field"><Search size={17} /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} aria-label={placeholder} placeholder={placeholder} maxLength={160} /></div>;
}

export function Select({ className = '', children, ...props }) {
  return <span className={`select-wrap ${className}`}><select {...props}>{children}</select><ChevronDown size={16} aria-hidden="true" /></span>;
}

export function Badge({ children }) {
  const tone = { Enrolled: 'green', Graduated: 'blue', Transferred: 'purple', Withdrawn: 'neutral', Added: 'green', Updated: 'blue', Repeated: 'amber', Skipped: 'amber' }[children] ?? 'neutral';
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function SchoolMark({ code, index, small = false }) {
  const initials = code?.length <= 3 ? code : code?.slice(0, 2);
  const tone = index ?? Array.from(code || '').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return <span className={`school-mark color-${tone % 5}${small ? ' small' : ''}`} aria-hidden="true">{initials || 'SC'}</span>;
}

export function ActivityIcon({ entity, operation }) {
  const Icon = entity === 'Student' ? GraduationCap : Building2;
  return <span className={`activity-icon ${operation === 'Added' ? 'green' : entity === 'School' ? 'blue' : 'purple'}`}><Icon size={17} strokeWidth={1.9} /></span>;
}

export function Pager({ result, setPage }) {
  if (!result.total) return null;
  const pages = Math.ceil(result.total / result.limit);
  const first = (result.page - 1) * result.limit + 1;
  return <div className="pager">
    <span>{displayNumber(first)}–{displayNumber(Math.min(result.total, first + result.limit - 1))} of {displayNumber(result.total)}</span>
    {pages > 1 && <div><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}><ChevronLeft size={18} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={result.page >= pages} onClick={() => setPage(result.page + 1)}><ChevronRight size={18} /></button></div>}
  </div>;
}

export function Modal({ title, subtitle, onClose, busy, children, wide }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className={`modal${wide ? ' wide' : ''}`} aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal-inner">
      <header className="modal-heading"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" type="button" aria-label="Close dialog" title="Close" onClick={onClose} disabled={busy}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>;
}

export function AskInput({ onAsk, busy, compact = false }) {
  const [question, setQuestion] = useState('');
  return <form className={`ask-input${compact ? ' compact' : ''}`} onSubmit={(event) => {
    event.preventDefault();
    const value = question.trim();
    if (!busy && value) { setQuestion(''); onAsk(value); }
  }}>
    <input placeholder="Ask a question…" aria-label="Ask a question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={400} />
    <button type="submit" title="Send question" aria-label="Send question" disabled={!question.trim() || busy}><ArrowUp size={19} strokeWidth={2.3} /></button>
  </form>;
}

export const viewMeta = {
  overview: { label: 'Overview', title: 'School records', description: 'Manage schools, principal details, and students in one place.' },
  schools: { label: 'Schools', title: 'Schools', description: 'Find schools and maintain their principal details.', icon: Building2 },
  students: { label: 'Students', title: 'Students', description: 'Find and update student records across all schools.', icon: GraduationCap },
  history: { label: 'Update history', title: 'Update history', description: 'See what changed, when it changed, and how it was saved.', icon: History },
  ask: { label: 'Ask records', title: 'Ask your records', description: 'Get answers from your school, student, and update records.', icon: Sparkles }
};
