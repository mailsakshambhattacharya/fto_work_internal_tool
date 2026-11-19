import { useState } from 'react';
import { Building2, Download, FileSpreadsheet, GraduationCap, LoaderCircle, Pencil, Upload } from 'lucide-react';
import { request } from './api.js';
import { Badge, displayDateTime, displayNumber, Loading, Modal, Notice, Select, useRead } from './components.jsx';
import { readImport } from './import.js';

const schoolFields = [
  ['name', 'School name', 'Full school name', true, 120, 'text', true],
  ['code', 'School code', 'e.g. SCH-001', true, 40], ['city', 'City', '', false, 100],
  ['principal_name', 'Principal name', 'Full name', true, 120, 'text', true],
  ['principal_email', 'Principal email', 'principal@example.org', false, 160, 'email'],
  ['principal_phone', 'Principal phone', '+91 …', false, 40, 'tel']
];
const studentFields = [
  ['school_id', 'School', '', true, 0, 'school', true], ['name', 'Student name', 'Full name', true, 120, 'text', true],
  ['student_code', 'Student ID', 'e.g. ST-001', true, 40], ['status', 'Status', '', true, 0, 'status'],
  ['grade', 'Grade', 'e.g. 10', true, 30], ['section', 'Section', 'e.g. A', false, 30]
];

export function AddDialog({ choose, close }) {
  return <Modal title="Add a record" subtitle="Choose the type of record you want to add." onClose={close}>
    <div className="choice-list">
      <button type="button" onClick={() => choose('School')}><span className="activity-icon blue"><Building2 size={21} /></span><span><strong>Add school</strong><small>School information and principal details</small></span></button>
      <button type="button" onClick={() => choose('Student')}><span className="activity-icon purple"><GraduationCap size={22} /></span><span><strong>Add student</strong><small>Student details for an existing school</small></span></button>
    </div>
  </Modal>;
}

export function RecordForm({ kind, record, school, close, saved, addSchool }) {
  const existing = Boolean(record?.id);
  const [draft, setDraft] = useState(() => record || (kind === 'Student' ? { school_id: school || '', status: 'Enrolled' } : {}));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useRead(kind === 'Student' ? 'school-options' : null);
  const fields = kind === 'School' ? schoolFields : studentFields;
  const noSchools = kind === 'Student' && options.status === 'ready' && !options.data.length;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request('save', { data: { kind, record: draft } });
      const message = result.operation === 'Unchanged' ? 'No changes to save.' : `${kind} ${result.operation.toLowerCase()}.`;
      saved(message);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={`${existing ? 'Edit' : 'Add'} ${kind.toLowerCase()}`} subtitle={existing ? 'Saved changes appear in update history.' : 'Fields marked with * are required.'} onClose={close} busy={busy}>
    <form className="record-form" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      {options.status === 'error' && <Notice>{options.error}</Notice>}
      {noSchools ? <div className="modal-prompt"><p>Add a school before creating a student record.</p><button className="button primary" type="button" onClick={addSchool}>Add school</button></div> : <div className="form-grid">
        {fields.map(([key, label, placeholder, required, maxLength, type = 'text', wide]) => {
          const value = draft[key] ?? '';
          const onChange = (event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }));
          return <label key={key} className={wide ? 'span-two' : ''}>
            <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
            {type === 'school' ? <Select value={value} onChange={onChange} required disabled={busy || options.status !== 'ready'}>
              <option value="">{options.status === 'loading' ? 'Loading schools…' : 'Select a school'}</option>{options.data?.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </Select> : type === 'status' ? <Select value={value} onChange={onChange} required disabled={busy}>
              {['Enrolled', 'Transferred', 'Graduated', 'Withdrawn'].map((item) => <option key={item}>{item}</option>)}
            </Select> : <input type={type} required={required} value={value} onChange={onChange} maxLength={maxLength} placeholder={placeholder} disabled={busy} />}
          </label>;
        })}
      </div>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button>{!noSchools && <button type="submit" className="button primary" disabled={busy || (kind === 'Student' && options.status !== 'ready')}>{busy && <LoaderCircle className="spin" size={17} />}{existing ? 'Save changes' : `Save ${kind.toLowerCase()}`}</button>}</footer>
    </form>
  </Modal>;
}

export function ImportDialog({ close, saved }) {
  const [file, setFile] = useState(null);
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function select(event) {
    const chosen = event.target.files[0];
    event.target.value = '';
    if (!chosen) return;
    setBusy(true);
    setError('');
    setRecords(null);
    setFile(chosen);
    try { setRecords(await readImport(chosen)); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  async function importNow(event) {
    event.preventDefault();
    if (!records) return;
    setBusy(true);
    setError('');
    try {
      const result = await request('import', { data: records });
      saved(`Import complete. ${result.Added} added, ${result.Updated} updated, ${result.Unchanged} unchanged.`);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <Modal title="Import Excel" subtitle="Add or update school and student records from one workbook." onClose={close} busy={busy}>
    <form className="import-form" onSubmit={importNow}>
      {error && <Notice>{error}</Notice>}
      <button type="button" className="button secondary template-button" disabled={busy} onClick={() => {
        setBusy(true);
        setError('');
        request('template', { file: true }).catch((cause) => setError(cause.message)).finally(() => setBusy(false));
      }}><Download size={17} /> Download template</button>
      <label className="file-drop"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={select} disabled={busy} />
        <span className="empty-icon"><Upload size={21} /></span><strong>{file ? 'Choose a different workbook' : 'Choose an Excel workbook'}</strong><small>.xlsx up to 2 MB · 500 records per import</small>
      </label>
      {file && <div className="file-info"><FileSpreadsheet size={22} /><div><strong>{file.name}</strong>{records && <small>{displayNumber(records.schools.length)} schools · {displayNumber(records.students.length)} students</small>}</div></div>}
      <p className="fine-print">Matching school codes or student IDs at the same school will update existing records. Blank cells clear optional fields.</p>
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={!records || busy}>{busy && <LoaderCircle className="spin" size={17} />}Import records</button></footer>
    </form>
  </Modal>;
}

function Details({ entries }) {
  return <dl className="detail-list">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
}

export function RecordDialog({ kind, id, close, edit, browse, onExport, open }) {
  const { status, data: record, error } = useRead('record', { kind, id });
  const title = record ? record.name || record.label : 'Record details';
  const subtitle = record && (kind === 'schools' ? `School code ${record.code}` : kind === 'students' ? `Student ID ${record.student_code}` : `${record.entity} record · Change ${record.id}`);
  return <Modal title={title} subtitle={subtitle} onClose={close} wide={kind === 'history'}>
    {status === 'loading' && <Loading />}
    {status === 'error' && <Notice>{error}</Notice>}
    {status === 'ready' && kind === 'schools' && <>
      <Details entries={[
        ['Principal', record.principal_name], ['City', record.city],
        ['Principal email', record.principal_email], ['Principal phone', record.principal_phone],
        ['Enrolled students', displayNumber(record.student_count)], ['Last updated', displayDateTime(record.updated_at)]
      ]} />
      <footer className="modal-actions spread"><button type="button" className="button secondary" onClick={() => onExport(record.id)}><FileSpreadsheet size={17} /> Export school</button><div><button type="button" className="button secondary" onClick={() => browse(record.id)}>View students</button><button type="button" className="button primary" onClick={() => edit('School', record)}><Pencil size={16} /> Edit school</button></div></footer>
    </>}
    {status === 'ready' && kind === 'students' && <>
      <Details entries={[
        ['School', <button className="text-button inline-link" onClick={() => open('schools', record.school_id)}>{record.school_name}</button>],
        ['Status', <Badge>{record.status}</Badge>], ['Grade', record.grade], ['Section', record.section], ['Last updated', displayDateTime(record.updated_at)]
      ]} />
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={close}>Close</button><button type="button" className="button primary" onClick={() => edit('Student', record)}><Pencil size={16} /> Edit student</button></footer>
    </>}
    {status === 'ready' && kind === 'history' && <>
      <Details entries={[
        ['Action', <Badge>{record.operation}</Badge>], ['School', record.school_name], ['Changed at', displayDateTime(record.occurred_at)], ['Source', record.source]
      ]} />
      <div className="table-scroll change-table"><table className="record-table"><thead><tr><th scope="col">Field</th><th scope="col">Previous value</th><th scope="col">New value</th></tr></thead><tbody>
        {record.fields.map((field) => <tr key={field.key}><td>{field.label}</td><td>{field.before || '—'}</td><td>{field.after || '—'}</td></tr>)}
      </tbody></table></div>
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => open(record.entity === 'School' ? 'schools' : 'students', record.record_id)}>Open current record</button></footer>
    </>}
  </Modal>;
}
