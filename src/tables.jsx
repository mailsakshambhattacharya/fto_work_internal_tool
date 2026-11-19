import { ChevronRight, Upload } from 'lucide-react';
import { ActivityIcon, Badge, displayCalendarDate, displayDate, displayDateTime, displayNumber, Empty, SchoolMark, viewMeta } from './components.jsx';

function OpenCell({ open, label }) {
  return <td className="open-cell"><button type="button" className="icon-button row-open" onClick={open} aria-label={`Open ${label}`} title={`Open ${label}`}><ChevronRight size={17} /></button></td>;
}

export function RecordTable({ kind, rows, onOpen, overview, emptyAction }) {
  if (!rows.length) {
    const titles = { schools: ['No schools to show', 'Add a school or adjust your search.'], students: ['No students to show', 'Add a student or adjust your filters.'], history: ['No updates to show', 'Saved record changes will appear here.'], 'student-uploads': ['No student uploads to show', 'Student imports and flagged repeats will appear here.'] };
    return <Empty icon={viewMeta[kind]?.icon ?? Upload} title={titles[kind][0]} description={titles[kind][1]}>{emptyAction}</Empty>;
  }
  return <div className="table-scroll"><table className={`record-table ${kind}${overview ? ' overview-table' : ''}`}>
    <thead><tr>
      {kind === 'schools' && <><th scope="col">School</th><th scope="col">Principal</th><th scope="col" className="center">Enrolled</th>{!overview && <><th scope="col">Onboarded</th><th scope="col">Last updated</th></>}</>}
      {kind === 'students' && <><th scope="col">Student</th><th scope="col">School</th><th scope="col">Grade / Section</th><th scope="col">Status</th><th scope="col">Last updated</th></>}
      {kind === 'history' && <><th scope="col">Record</th><th scope="col">School</th><th scope="col">Action</th><th scope="col">Source</th><th scope="col">Changed at</th></>}
      {kind === 'student-uploads' && <><th scope="col">School / Workbook</th><th scope="col">Uploaded</th><th scope="col" className="center">Added</th><th scope="col" className="center">Updated</th><th scope="col" className="center">Repeats flagged</th></>}
      <th scope="col"><span className="sr-only">Open record</span></th>
    </tr></thead>
    <tbody>{rows.map((row, index) => {
      const open = () => onOpen(kind, row.id);
      if (kind === 'schools') return <tr key={row.id}>
        <td><div className="cell-identity"><SchoolMark code={row.code} index={overview ? index : undefined} /><div><button className="text-button record-name" onClick={open}>{row.name}</button><small>{[!overview && row.code, row.area, row.city].filter(Boolean).join(' · ') || row.code}</small></div></div></td>
        <td>{row.principal_name}</td><td className="center tabular">{displayNumber(row.student_count)}</td>
        {!overview && <><td className="muted nowrap">{displayCalendarDate(row.onboarded_on)}</td><td className="muted nowrap">{displayDate(row.updated_at)}</td></>}
        <OpenCell open={open} label={row.name} />
      </tr>;
      if (kind === 'students') return <tr key={row.id}>
        <td><div className="cell-identity"><span className={`school-mark color-${row.name.charCodeAt(0) % 5}`}>{row.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase()}</span><div><button className="text-button record-name" onClick={open}>{row.name}</button><small>{row.student_code}</small></div></div></td>
        <td>{row.school_name}</td><td>{row.grade}{row.section && ` / ${row.section}`}</td><td><Badge>{row.status}</Badge></td><td className="muted nowrap">{displayDate(row.updated_at)}</td><OpenCell open={open} label={row.name} />
      </tr>;
      if (kind === 'student-uploads') return <tr key={row.id}>
        <td><div className="cell-identity"><SchoolMark code={row.school_code} /><div><button className="text-button record-name" onClick={open}>{row.school_name}</button><small>{row.filename}</small></div></div></td>
        <td className="muted nowrap">{displayDateTime(row.uploaded_at)}</td><td className="center tabular">{displayNumber(row.added_count)}</td><td className="center tabular">{displayNumber(row.updated_count)}</td><td className="center tabular">{displayNumber(row.repeated_count)}</td><OpenCell open={open} label={`${row.school_name} upload ${row.id}`} />
      </tr>;
      return <tr key={row.id}>
        <td><div className="cell-identity"><ActivityIcon {...row} /><div><button className="text-button record-name" onClick={open}>{row.label}</button><small>{row.entity} record</small></div></div></td>
        <td>{row.school_name}</td><td><Badge>{row.operation}</Badge></td><td className="muted nowrap">{row.source}</td><td className="muted nowrap">{displayDateTime(row.occurred_at)}</td><OpenCell open={open} label={`${row.label} update`} />
      </tr>;
    })}</tbody>
  </table></div>;
}
