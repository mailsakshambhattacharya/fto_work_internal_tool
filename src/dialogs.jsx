import { useState } from 'react';
import { Building2, Download, FileSpreadsheet, GraduationCap, LoaderCircle, Pencil, Upload } from 'lucide-react';
import { request } from './api.js';
import { Badge, displayCalendarDate, displayDateTime, displayNumber, Loading, Modal, Notice, Select, useRead } from './components.jsx';
import { readImport } from './import.js';

const schoolFields = [
  ['name', 'School name', 'Full school name', true, 120, 'text', true],
  ['code', 'School code', 'e.g. SCH-001', true, 40], ['onboarded_on', 'Onboarding date', '', false, 10, 'date'],
  ['area', 'Area or locality', '', false, 100], ['city', 'City', '', false, 100],
  ['principal_name', 'Principal name', 'Full name', true, 120, 'text', true],
  ['principal_email', 'Principal email', 'principal@example.org', false, 160, 'email'],
  ['principal_phone', 'Principal phone', '+91 …', false, 40, 'tel'],
  ['coordinator_name', 'Coordinator name', 'Full name', false, 120, 'text', true],
  ['coordinator_email', 'Coordinator email', 'coordinator@example.org', false, 160, 'email'],
  ['coordinator_phone', 'Coordinator phone', '+91 …', false, 40, 'tel'],
  ['state', 'State', 'e.g. Tamil Nadu', false, 60], ['pincode', 'Pincode', 'e.g. 600001', false, 12]
];
const studentFields = [
  ['school_id', 'School', '', true, 0, 'school', true], ['name', 'Student name', 'Full name', true, 120, 'text', true],
  ['student_code', 'Student ID', 'e.g. ST-001', true, 40], ['status', 'Status', '', true, 0, 'status'],
  ['grade', 'Grade', 'e.g. 10', true, 30], ['section', 'Section', 'e.g. A', false, 30],
  ['first_name', 'First name', '', false, 80], ['last_name', 'Last name', '', false, 80],
  ['email', 'Email', 'student@example.org', false, 160, 'email'], ['test_attempt_code', 'Test attempt code', '', false, 40]
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
            {key === 'onboarded_on' && !existing && <small>Leave blank to use today’s date.</small>}
          </label>;
        })}
      </div>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button>{!noSchools && <button type="submit" className="button primary" disabled={busy || (kind === 'Student' && options.status !== 'ready')}>{busy && <LoaderCircle className="spin" size={17} />}{existing ? 'Save changes' : `Save ${kind.toLowerCase()}`}</button>}</footer>
    </form>
  </Modal>;
}

export function ImportDialog({ close, saved, studentsOnly = false }) {
  const [file, setFile] = useState(null);
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [studentSchool, setStudentSchool] = useState('');
  const [updateExistingStudents, setUpdateExistingStudents] = useState(false);
  const hasStudents = Boolean(records?.students.length);
  const options = useRead(hasStudents ? 'school-options' : null);
  const schools = new Map(options.data?.map((row) => [row.code, row.name]));
  for (const school of records?.schools ?? []) {
    const code = school.code?.normalize('NFC').trim().toUpperCase();
    if (code && school.name?.trim()) schools.set(code, school.name.trim());
  }
  const schoolOptions = [...schools.entries()].sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
  const validSchool = schools.has(studentSchool);

  async function select(event) {
    const chosen = event.target.files[0];
    event.target.value = '';
    if (!chosen) return;
    setBusy(true);
    setError('');
    setRecords(null);
    setFile(chosen);
    setStudentSchool('');
    setUpdateExistingStudents(false);
    try {
      const imported = await readImport(chosen);
      if (studentsOnly && !imported.students.length) throw new Error('Add student rows to the Students sheet, or choose a raw student_data file.');
      setRecords(imported);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  async function importNow(event) {
    event.preventDefault();
    if (!records || (hasStudents && !validSchool)) return;
    setBusy(true);
    setError('');
    try {
      const result = await request('import', { data: { ...records, studentSchool, updateExistingStudents, filename: file.name.slice(0, 255) } });
      const upload = result.studentUpload;
      if (upload) saved(`${upload.school_name} · Added ${upload.Added} · Updated ${upload.Updated} · Repeats flagged ${upload.Repeated}`, upload.id);
      else saved(`School import complete. ${result.Added} added, ${result.Updated} updated, ${result.Unchanged} unchanged.`);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <Modal title={studentsOnly ? 'Upload students' : 'Import Excel'} subtitle="Select a school for each workbook that contains students." onClose={close} busy={busy}>
    <form className="import-form" onSubmit={importNow}>
      {error && <Notice>{error}</Notice>}
      <button type="button" className="button secondary template-button" disabled={busy} onClick={() => {
        setBusy(true);
        setError('');
        request('template', { file: true }).catch((cause) => setError(cause.message)).finally(() => setBusy(false));
      }}><Download size={17} /> Download template</button>
      <label className="file-drop"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={select} disabled={busy} />
        <span className="empty-icon"><Upload size={21} /></span><strong>{file ? 'Choose a different workbook' : 'Choose an Excel workbook'}</strong><small>Raw student_data file or the import template · .xlsx up to 2 MB · 500 records</small>
      </label>
      {file && <div className="file-info"><FileSpreadsheet size={22} /><div><strong>{file.name}</strong>{records && <small>{records.raw ? `Raw student file · ${displayNumber(records.students.length)} students` : `School rows ${displayNumber(records.schools.length)} · Student rows ${displayNumber(records.students.length)}`}{records.skipped.length > 0 && ` · ${displayNumber(records.skipped.length)} skipped`}</small>}</div></div>}
      {records?.skipped.length > 0 && <div><p className="fine-print">These rows will be skipped and listed in the upload log. Fix them in the file and upload again to add them.</p>
        <ul className="skipped-rows">{records.skipped.slice(0, 8).map((row) => <li key={row.line}>Row {row.line}{row.name && ` · ${row.name}`}: {row.reason}</li>)}{records.skipped.length > 8 && <li>…and {records.skipped.length - 8} more</li>}</ul></div>}
      {hasStudents && <div className="upload-options">
        {options.error && <Notice>{options.error}</Notice>}
        <label className="upload-school"><span>School for this student upload *</span><Select required value={studentSchool} onChange={(event) => setStudentSchool(event.target.value)} disabled={busy || !schoolOptions.length}>
          <option value="">{options.status === 'loading' && !schoolOptions.length ? 'Loading schools…' : 'Choose a school'}</option>
          {schoolOptions.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
        </Select></label>
        {options.status === 'ready' && !schoolOptions.length && <p className="fine-print">Add a school first, or include it in the workbook’s Schools sheet.</p>}
        <label className="check-label"><input type="checkbox" checked={updateExistingStudents} disabled={busy} onChange={(event) => setUpdateExistingStudents(event.target.checked)} /> Update changed details for student IDs already at this school</label>
        <p className="fine-print">Repeated rows are flagged in Student uploads. If the worksheet includes school codes, they must match the selected school.</p>
      </div>}
      {records?.schools.length > 0 && <p className="fine-print">Matching school codes update school records. Leave the onboarding date blank to keep an existing date.</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={!records || busy || (hasStudents && !validSchool)}>{busy && <LoaderCircle className="spin" size={17} />}Import records</button></footer>
    </form>
  </Modal>;
}

function Details({ entries }) {
  return <dl className="detail-list">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
}

export function RecordDialog({ kind, id, close, edit, browse, history, onExport, open }) {
  const { status, data: record, error } = useRead('record', { kind, id });
  const titles = { schools: 'School details', students: 'Student details', history: 'Update details', 'student-uploads': 'Student upload' };
  const title = record ? record.name || record.label || record.school_name : titles[kind];
  const subtitles = record && { schools: `School code ${record.code}`, students: `Student ID ${record.student_code}`, history: `${record.entity} record · Change ${record.id}`, 'student-uploads': `Student upload · ${record.filename}` };
  return <Modal title={title} subtitle={subtitles?.[kind]} onClose={close} wide={kind === 'history' || kind === 'student-uploads'}>
    {status === 'loading' && <Loading />}
    {status === 'error' && <Notice>{error}</Notice>}
    {status === 'ready' && kind === 'schools' && <>
      <Details entries={[
        ['Onboarded', displayCalendarDate(record.onboarded_on)], ['Area', record.area],
        ['City', record.city], ['Principal', record.principal_name],
        ['Principal email', record.principal_email], ['Principal phone', record.principal_phone],
        ['Coordinator', record.coordinator_name], ['Coordinator email', record.coordinator_email],
        ['Coordinator phone', record.coordinator_phone], ['State', [record.state, record.pincode].filter(Boolean).join(' · ')],
        ['Enrolled students', displayNumber(record.student_count)], ['Last updated', displayDateTime(record.updated_at)]
      ]} />
      <footer className="modal-actions spread"><div><button type="button" className="button secondary" onClick={() => onExport(record.id)}><FileSpreadsheet size={17} /> Export school</button><button type="button" className="button secondary" onClick={() => onExport(record.id, true)}><FileSpreadsheet size={17} /> Export FTO</button></div><div><button type="button" className="button secondary" onClick={() => history(record.id)}>School history</button><button type="button" className="button secondary" onClick={() => browse(record.id)}>View students</button><button type="button" className="button primary" onClick={() => edit('School', record)}><Pencil size={16} /> Edit school</button></div></footer>
    </>}
    {status === 'ready' && kind === 'students' && <>
      <Details entries={[
        ['School', <button className="text-button inline-link" onClick={() => open('schools', record.school_id)}>{record.school_name}</button>],
        ['Status', <Badge>{record.status}</Badge>], ['Grade', record.grade], ['Section', record.section],
        ['First / last name', [record.first_name, record.last_name].filter(Boolean).join(' / ')], ['Email', record.email],
        ['Test attempt code', record.test_attempt_code], ['Last updated', displayDateTime(record.updated_at)]
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
    {status === 'ready' && kind === 'student-uploads' && <>
      <Details entries={[
        ['Uploaded at', displayDateTime(record.uploaded_at)], ['School onboarded', displayCalendarDate(record.onboarded_on)],
        ['Area', record.school_area], ['City', record.school_city], ['Added', displayNumber(record.added_count)],
        ['Updated', displayNumber(record.updated_count)], ['Repeats flagged', displayNumber(record.repeated_count)]
      ]} />
      <div className="table-scroll change-table upload-row-results"><table className="record-table"><thead><tr><th scope="col">Excel row</th><th scope="col">Student ID</th><th scope="col">Student name</th><th scope="col">Result</th><th scope="col">Details</th></tr></thead><tbody>
        {[...record.row_results].sort((left, right) => Number(right.outcome === 'Repeated') - Number(left.outcome === 'Repeated') || left.line - right.line).map((row, index) => <tr key={`${row.line}:${index}`}><td>{row.line}</td><td>{row.student_code}</td><td>{row.name}</td><td><Badge>{row.outcome}</Badge></td><td>{row.reason || '—'}</td></tr>)}
      </tbody></table></div>
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => history(record.school_id)}>View school upload history</button><button type="button" className="button primary" onClick={close}>Done</button></footer>
    </>}
  </Modal>;
}
