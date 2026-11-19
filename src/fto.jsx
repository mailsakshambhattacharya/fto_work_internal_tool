import { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { displayNumber, Empty, Loading, Notice, SearchField, useRead } from './components.jsx';

const studentColumns = [['student_code', 'student_id'], ['first_name', 'first_name'], ['last_name', 'last_name'], ['grade', 'grade'], ['email', 'email'], ['test_attempt_code', 'test_attempt_code']];
const schoolColumns = [['principal_name', 'Principal Name'], ['principal_email', 'P EMail'], ['principal_phone', 'Contact Number'], ['coordinator_name', 'Coordinator Name'], ['coordinator_phone', 'Coordinator Contact'], ['coordinator_email', 'Coordinator Email'], ['state', 'State'], ['pincode', 'Pincode']];

// Groups the flat FTO rows by school, keeping the export's order.
function groupBySchool(rows) {
  const groups = [];
  for (const row of rows) {
    if (groups.at(-1)?.id !== row.school_id) groups.push({ id: row.school_id, school: row, students: [] });
    groups.at(-1).students.push(row);
  }
  return groups;
}

export function FtoPreview({ refresh, compact = false, onExport, exporting, openFull }) {
  const { data, status, error } = useRead('fto', {}, refresh);
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const all = groupBySchool(data?.rows ?? []);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.flatMap((group) => {
      if (group.school.school_name.toLowerCase().includes(q)) return [group];
      const students = group.students.filter((row) => [row.student_code, row.first_name, row.last_name, row.test_attempt_code].join(' ').toLowerCase().includes(q));
      return students.length ? [{ ...group, students }] : [];
    });
  }, [data, search]);
  const schoolCount = new Set(data?.rows.map((row) => row.school_id)).size;

  return <section className={`card fto-card${compact ? ' compact' : ''}`} aria-labelledby="fto-heading">
    <header className="card-heading fto-heading">
      <div><h2 id="fto-heading">Consolidated FTO sheet</h2><p>{data ? `${displayNumber(schoolCount)} schools · ${displayNumber(data.rows.length)} students · the same rows Export FTO downloads` : 'Latest version from every upload'}</p></div>
      <div className="fto-tools">
        <SearchField value={search} onChange={setSearch} placeholder="Search school, student, or code" />
        {compact && openFull && <button type="button" className="button secondary" onClick={openFull}><FileSpreadsheet size={17} /> Full view</button>}
        {!compact && <button type="button" className="button primary" onClick={onExport} disabled={exporting}><FileDown size={17} /> {exporting ? 'Exporting…' : 'Export FTO'}</button>}
      </div>
    </header>
    {status === 'error' && <Notice>{error}</Notice>}
    {status === 'loading' && !data && <Loading />}
    {data && !data.rows.length && <Empty icon={FileSpreadsheet} title="No students yet" description="Drop a student file above. Its students appear here grouped by school." />}
    {data && data.rows.length > 0 && !groups.length && <p className="fto-empty">No schools or students match “{search}”.</p>}
    {groups.length > 0 && <div className="fto-scroll" tabIndex={0} aria-label="Consolidated FTO rows">
      <table className="fto-table">
        <thead><tr><th scope="col">DATE</th><th scope="col">School Name</th>{studentColumns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}{schoolColumns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
        {groups.map(({ id, school, students }) => <tbody key={id}>
          <tr className="fto-group"><th scope="rowgroup" colSpan={2 + studentColumns.length + schoolColumns.length}><span>{school.school_name}</span><small>{displayNumber(students.length)} {students.length === 1 ? 'student' : 'students'}{school.state && ` · ${school.state}`}</small></th></tr>
          {students.map((row, index) => <tr key={`${row.student_code}:${index}`}>
            <td className="nowrap">{index === 0 ? school.date : ''}</td><td className="fto-school">{index === 0 ? school.school_name : ''}</td>
            {studentColumns.map(([key]) => <td key={key} className={key === 'test_attempt_code' || key === 'student_code' ? 'mono' : ''}>{row[key]}</td>)}
            {schoolColumns.map(([key]) => <td key={key}>{index === 0 ? school[key] : ''}</td>)}
          </tr>)}
        </tbody>)}
      </table>
    </div>}
  </section>;
}
