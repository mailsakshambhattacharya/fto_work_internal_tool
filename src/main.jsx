import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Building2, Check, ChevronRight, Command, FileDown, FileSpreadsheet, GraduationCap, History, LayoutGrid, LockKeyhole, LogOut, Menu, Plus, Sparkles, Upload, X } from 'lucide-react';
import { ActivityIcon, AskInput, Brand, displayCalendarDate, displayNumber, Empty, Loading, Notice, Pager, relativeDate, SearchField, Select, useRead, viewMeta } from './components.jsx';
import { AddDialog, ImportDialog, RecordDialog, RecordForm } from './dialogs.jsx';
import { RecordTable } from './tables.jsx';
import { request } from './api.js';
import './styles.css';

const navigations = [
  ['overview', LayoutGrid], ['schools', Building2], ['students', GraduationCap], ['history', History], ['ask', Sparkles]
];
const initialView = () => Object.hasOwn(viewMeta, window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'overview';
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function SignIn({ configured, onSignIn }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="sign-in"><div className="sign-in-card card"><Brand /><span className="empty-icon"><LockKeyhole size={22} /></span><h1>Sign in to Schooldesk</h1><p>Use your workspace password to access school records.</p>
    {configured === false && <Notice>Workspace sign-in is awaiting setup.</Notice>}
    {error && <Notice>{error}</Notice>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      setError('');
      try { onSignIn(await request('login', { data: { password } })); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
    }}><label><span>Workspace password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || configured === false} /></label><button type="submit" className="button primary" disabled={busy || configured === false}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
  </div></main>;
}

function Sidebar({ active, navigate, localAccess, open, onClose, logout }) {
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button')?.focus();
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  return <>
    {open && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside ref={menu} className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-top"><Brand /><button type="button" className="icon-button close-nav" onClick={onClose} aria-label="Close navigation"><X size={20} /></button></div>
      <nav aria-label="Workspace navigation"><p className="nav-label">WORKSPACE</p>{navigations.map(([key, Icon]) => (
        <button key={key} type="button" className={`nav-link${key === 'ask' ? ' nav-ask' : ''}${active === key ? ' active' : ''}`} onClick={() => navigate(key)} aria-current={active === key ? 'page' : undefined}><Icon size={19} strokeWidth={1.85} /><span>{viewMeta[key].label}</span></button>
      ))}</nav>
      <div className="sidebar-footer"><span className="workspace-icon">{localAccess ? <Command size={17} /> : <LockKeyhole size={16} />}</span><div><strong>{localAccess ? 'Local workspace' : 'Private workspace'}</strong><small>{localAccess ? 'Stored on this device' : 'Schooldesk'}</small></div>{!localAccess && <button type="button" className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={18} /></button>}</div>
    </aside>
  </>;
}

function PageHeader({ view, actions }) {
  const page = viewMeta[view];
  return <div className="page-header"><div><h1>{page.title}</h1><p>{page.description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function Metrics({ data, navigate }) {
  const metrics = [
    ['schools', 'Total schools', 'In the registry', Building2, 'blue', 'schools'],
    ['students', 'Enrolled students', 'Across all schools', GraduationCap, 'green', 'students'],
    ['updates', 'Recent updates', 'In the last 7 days', History, 'purple', 'history']
  ];
  return <div className="metrics">{metrics.map(([key, label, detail, Icon, tone, target]) => (
    <button type="button" key={key} className="metric card" onClick={() => navigate(target)}>
      <span className={`metric-icon ${tone}`}><Icon size={22} strokeWidth={1.9} /></span><span className="metric-content"><span className="metric-label">{label}</span><strong>{displayNumber(data?.[key])}</strong><span className="metric-detail">{detail}</span></span><ChevronRight className="metric-chevron" size={16} />
    </button>
  ))}</div>;
}

function Overview({ refresh, navigate, open, add, showImport, ask, busy }) {
  const { data, error, status } = useRead('overview', {}, refresh);
  const prompts = [data?.schools[0] ? `Who’s the principal at ${data.schools[0].name}?` : 'How many schools are in the registry?', 'How many students are enrolled?'];
  return <>
    <PageHeader view="overview" actions={<><button className="button secondary" onClick={showImport}><Upload size={17} /> Import Excel</button><button className="button primary" onClick={() => add()}><Plus size={19} /> Add record</button></>} />
    {error && <Notice>{error}</Notice>}
    <Metrics data={data?.metrics} navigate={navigate} />
    <div className="dashboard-grid">
      <section className="card school-card" aria-labelledby="schools-heading">
        <header className="card-heading"><div><h2 id="schools-heading">Schools</h2><p>Recently updated school records</p></div><button type="button" className="text-button view-all" onClick={() => navigate('schools')}>View all</button></header>
        {data ? <RecordTable kind="schools" rows={data.schools} onOpen={open} overview emptyAction={<button className="button secondary" onClick={() => add('School')}>Add your first school</button>} /> : status !== 'error' && <Loading />}
        {data?.schools.length > 0 && <footer className="card-foot">Showing {data.schools.length} of {displayNumber(data.metrics.schools)} schools</footer>}
      </section>
      <div className="dashboard-side">
        <section className="ask-card" aria-labelledby="ask-heading">
          <span className="ask-icon"><Sparkles size={21} /></span><h2 id="ask-heading">Ask your records</h2><p>Find answers across schools, students, and recent changes.</p>
          <div className="prompt-list">{prompts.map((prompt) => <button type="button" className="prompt" key={prompt} onClick={() => ask(prompt)} disabled={busy}>{prompt}</button>)}</div>
          <AskInput onAsk={ask} busy={busy} compact />
        </section>
        <section className="card activity-card" aria-labelledby="activity-heading">
          <header className="card-heading"><h2 id="activity-heading">Recent activity</h2><button type="button" className="text-button view-all" onClick={() => navigate('history')}>View all</button></header>
          {data ? data.changes.length ? <ul className="activity-list">{data.changes.slice(0, 3).map((row) => <li key={row.id}><button type="button" onClick={() => open('history', row.id)}><ActivityIcon {...row} /><span><strong>{row.entity} {row.operation.toLowerCase()}</strong><small>{row.label}</small></span><time dateTime={row.occurred_at} title={new Date(row.occurred_at).toLocaleString()}>{relativeDate(row.occurred_at)}</time></button></li>)}</ul> : <p className="no-activity">Updates appear here after you save a record.</p> : status !== 'error' && <Loading />}
        </section>
      </div>
    </div>
  </>;
}

function Directory({ view, refresh, add, open, showImport, schoolFilter, setSchoolFilter, historyMode, setHistoryMode }) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => { setQ(search.trim()); setPage(1); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const kind = view === 'history' ? historyMode : view;
  const { data, status, error } = useRead(kind, { q, page, ...(schoolFilter && view !== 'schools' && { school: schoolFilter }) }, refresh);
  const options = useRead(view !== 'schools' ? 'school-options' : null, {}, refresh);
  const useSchool = view !== 'schools';
  const singular = view === 'schools' ? 'School' : 'Student';
  const school = options.data?.find((item) => item.id === schoolFilter);
  const searchLabel = { schools: 'Search schools', students: 'Search students', history: 'Search record changes', 'student-uploads': 'Search student uploads' }[kind];
  return <>
    <PageHeader view={view} actions={view !== 'history' && <>
      {view === 'students' && <button className="button secondary" type="button" onClick={showImport}><Upload size={17} /> Upload students</button>}
      <button className="button primary" onClick={() => add(singular, view === 'students' ? schoolFilter : undefined)}><Plus size={19} /> Add {singular.toLowerCase()}</button>
    </>} />
    <section className="card directory-card" aria-label={viewMeta[view].label}>
      {view === 'history' && <div className="history-switch" aria-label="History view">
        <button type="button" aria-pressed={kind === 'history'} onClick={() => setHistoryMode('history')}>Record changes</button>
        <button type="button" aria-pressed={kind === 'student-uploads'} onClick={() => setHistoryMode('student-uploads')}>Student uploads</button>
      </div>}
      <div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder={searchLabel} />
        {useSchool && <Select className="filter-select" value={schoolFilter} aria-label="Filter by school" onChange={(event) => { setPage(1); setSchoolFilter(event.target.value); }}><option value="">All schools</option>{options.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>}
        {data && <span className="results-label">{displayNumber(data.total)} {data.total === 1 ? 'result' : 'results'}</span>}
      </div>
      {view === 'history' && school && <div className="history-school">
        <button className="text-button inline-link" type="button" onClick={() => open('schools', school.id)}>{school.name}</button>
        <span>Onboarded {displayCalendarDate(school.onboarded_on)}</span>
        {(school.area || school.city) && <span>{[school.area, school.city].filter(Boolean).join(', ')}</span>}
      </div>}
      {kind === 'student-uploads' && data?.summary && <dl className="upload-totals">
        <div><dt>Students added</dt><dd>{displayNumber(data.summary.added_count)}</dd></div>
        <div><dt>Students updated</dt><dd>{displayNumber(data.summary.updated_count)}</dd></div>
        <div><dt>Repeats flagged</dt><dd>{displayNumber(data.summary.repeated_count)}</dd></div>
      </dl>}
      {error ? <div className="table-error"><Notice>{error}</Notice></div> : data ? <><RecordTable kind={kind} onOpen={open} rows={data.rows} /><Pager result={data} setPage={setPage} /></> : status === 'loading' && <Loading />}
    </section>
  </>;
}

function Assistant({ messages, ask, busy, clear, open }) {
  const scroll = useRef(null);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages]);
  const prompts = ['How many students are enrolled?', 'Show recent changes', 'Count students by school', 'List the school principals'];
  return <><PageHeader view="ask" />
    <section className="card chat-card" aria-label="Record assistant">
      <header className="chat-header"><span className="metric-icon blue"><Sparkles size={21} /></span><div><h2>Record assistant</h2><p>Schools, students, and update history</p></div>{messages.length > 0 && <button type="button" className="button secondary" disabled={busy} onClick={clear}>Clear chat</button>}</header>
      <div className="chat-feed" ref={scroll} role="log" aria-label="Conversation" aria-live="polite">
        {messages.length ? messages.map((message, index) => <div key={index} className={`chat-message ${message.question ? 'question' : 'answer'}`}>
          {message.question ? <p>{message.question}</p> : message.error ? <Notice>{message.error}</Notice> : <><span className="message-icon"><Sparkles size={16} /></span><div><p>{message.answer}</p>{message.sources?.length > 0 && <div className="sources"><strong>Matching records</strong><div>{message.sources.map((row) => <button type="button" key={`${row.kind}:${row.id}`} onClick={() => open(row.kind, row.id)} title={row.detail}><FileSpreadsheet size={15} />{row.label}</button>)}</div></div>}</div></>}
        </div>) : <Empty icon={Sparkles} title="What would you like to look up?" description="Ask about a principal, find a student, or check what changed."><div className="chat-prompts">{prompts.map((item) => <button className="prompt" key={item} onClick={() => ask(item)}>{item}</button>)}</div></Empty>}
        {busy && <Loading label="Checking the records…" />}
      </div>
      <footer className="chat-footer"><AskInput onAsk={ask} busy={busy} /></footer>
    </section>
  </>;
}

function Workspace({ localAccess, logout }) {
  const [view, setView] = useState(initialView);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [historyMode, setHistoryMode] = useState('history');
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const sync = () => { setView(initialView()); setSchoolFilter(''); setHistoryMode('history'); };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  function navigate(next, school = '', mode = 'history') {
    if (next !== view) window.history.pushState(null, '', next === 'overview' ? window.location.pathname : `#${next}`);
    setMenu(false);
    setView(next);
    setSchoolFilter(school);
    if (next === 'history') setHistoryMode(mode);
    window.scrollTo(0, 0);
  }

  const close = () => setModal(null);
  const add = (kind, school) => setModal(kind ? { type: 'form', kind, school } : { type: 'add' });
  const open = (kind, id) => setModal({ type: 'record', kind, id });
  const edit = (kind, record) => setModal({ type: 'form', kind, record });
  const saved = (text, uploadId) => {
    if (uploadId) open('student-uploads', uploadId);
    else close();
    setRefresh((value) => value + 1);
    setToast({ text });
  };

  async function exportExcel(school, fto = false) {
    if (exporting) return;
    setExporting(true);
    try {
      await request(fto ? 'export-fto' : 'export', { params: school ? { school } : {}, file: true });
      setToast({ text: fto ? 'FTO sheet downloaded.' : 'Excel workbook downloaded.' });
    }
    catch (cause) { setToast({ text: cause.message, error: true }); }
    finally { setExporting(false); }
  }

  async function ask(question) {
    if (asking) return;
    navigate('ask');
    setAsking(true);
    setMessages((items) => [...items, { question }]);
    try {
      const result = await request('ask', { data: { question, zone } });
      setMessages((items) => [...items, result]);
    } catch (cause) { setMessages((items) => [...items, { error: cause.message }]); }
    finally { setAsking(false); }
  }

  return <div className="workspace">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content').focus(); }}>Skip to records</a>
    <Sidebar active={view} navigate={navigate} localAccess={localAccess} open={menu} onClose={() => setMenu(false)} logout={() => logout().catch((cause) => setToast({ text: cause.message, error: true }))} />
    <div className="workspace-main">
      <header className="topbar"><div className="breadcrumbs"><button type="button" className="icon-button menu-button" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22} /></button><span>Workspace</span><ChevronRight size={15} /><strong>{viewMeta[view].label}</strong></div><div className="topbar-actions"><button type="button" className="button secondary export-button" onClick={() => exportExcel(undefined, true)} disabled={exporting} title="One sheet in the FTO master layout"><FileDown size={18} /> Export FTO</button><button type="button" className="button secondary export-button" onClick={() => exportExcel()} disabled={exporting}><FileDown size={18} /> {exporting ? 'Exporting…' : 'Export Excel'}</button></div></header>
      <main id="main-content" className="content" tabIndex={-1}>
        {view === 'overview' && <Overview refresh={refresh} navigate={navigate} open={open} add={add} showImport={() => setModal({ type: 'import' })} ask={ask} busy={asking} />}
        {view === 'ask' && <Assistant messages={messages} ask={ask} busy={asking} clear={() => setMessages([])} open={open} />}
        {['schools', 'students', 'history'].includes(view) && <Directory key={view === 'history' ? historyMode : view} view={view} refresh={refresh} open={open} add={add} showImport={() => setModal({ type: 'import', studentsOnly: true })} schoolFilter={schoolFilter} setSchoolFilter={setSchoolFilter} historyMode={historyMode} setHistoryMode={setHistoryMode} />}
      </main>
    </div>
    {modal?.type === 'add' && <AddDialog choose={add} close={close} />}
    {modal?.type === 'form' && <RecordForm key={`${modal.kind}:${modal.record?.id ?? 'new'}`} {...modal} close={close} saved={saved} addSchool={() => add('School')} />}
    {modal?.type === 'import' && <ImportDialog close={close} saved={saved} studentsOnly={modal.studentsOnly} />}
    {modal?.type === 'record' && <RecordDialog key={`${modal.kind}:${modal.id}`} {...modal} close={close} edit={edit} browse={(school) => { close(); navigate('students', school); }} history={(school) => { close(); navigate('history', school, 'student-uploads'); }} onExport={exportExcel} open={open} />}
    {toast && <div className={`toast${toast.error ? ' error' : ''}`} role={toast.error ? 'alert' : 'status'}>{!toast.error && <Check size={20} />}<span>{toast.text}</span><button type="button" className="icon-button" title="Dismiss message" aria-label="Dismiss message" onClick={() => setToast(null)}><X size={17} /></button></div>}
  </div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    request('session').then(setSession).catch((cause) => setError(cause.message));
    const expire = () => setSession({ authenticated: false, configured: true });
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  if (!session) return <div className="startup"><Brand />{error ? <Notice>{error}</Notice> : <Loading label="Opening workspace…" />}</div>;
  if (!session.authenticated) return <SignIn configured={session.configured} onSignIn={setSession} />;
  return <Workspace localAccess={session.localAccess} logout={async () => {
    await request('logout', { data: {} });
    setSession({ authenticated: false, configured: true });
  }} />;
}

createRoot(document.getElementById('root')).render(<App />);
