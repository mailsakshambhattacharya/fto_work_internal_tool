import { rawStudentHeaders, requiredHeaders, schoolColumns, studentColumns } from '../shared/workbook.js';

const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const rawKey = (text) => normalize(String(text ?? '')).replace(/[\s-]+/g, '_');

function textOf(value, tab, line, key) {
  if (value == null) return '';
  if (key === 'onboarded_on' && value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  throw new Error(`${tab}, row ${line}. Use text or numbers in record cells. Enter identifiers as text to preserve leading zeros.`);
}

// A raw student_data export: one sheet whose header row is student_id, first_name, last_name, grade, email, test_attempt_code.
function readRaw(worksheets) {
  const found = worksheets.find(({ data }) => {
    const header = (data?.[0] ?? []).map(rawKey);
    return ['student_id', 'first_name', 'grade'].every((label) => header.includes(label));
  });
  if (!found) return null;
  const header = found.data[0].map(rawKey);
  const index = Object.fromEntries(rawStudentHeaders.map((label) => [label, header.indexOf(label)]));
  const students = [];
  const skipped = [];
  found.data.slice(1).forEach((row, position) => {
    const line = position + 2;
    const value = (label) => index[label] < 0 ? '' : textOf(row[index[label]], found.sheet, line, label);
    const record = {
      line, student_code: value('student_id'), first_name: value('first_name'), last_name: value('last_name'),
      grade: value('grade'), email: value('email'), test_attempt_code: value('test_attempt_code')
    };
    const name = [record.first_name, record.last_name].filter(Boolean).join(' ');
    if (!name && !record.student_code && !record.grade && !record.test_attempt_code) return;
    if (!record.student_code) skipped.push({ line, name, reason: 'No student ID' });
    else if (!name) skipped.push({ line, name: record.student_code, reason: 'No student name' });
    else if (!record.grade) skipped.push({ line, name, reason: 'No grade' });
    else students.push({ ...record, name });
    if (students.length > 500) throw new Error('Use up to 500 records per workbook import.');
  });
  if (!students.length) throw new Error('This student file has no rows with a student ID, name, and grade.');
  return { schools: [], students, skipped, raw: true };
}

export async function readImport(file) {
  if (!file?.name.toLowerCase().endsWith('.xlsx')) throw new Error('Choose an Excel workbook ending in .xlsx.');
  if (file.size > 2_000_000) throw new Error('Choose a workbook smaller than 2 MB.');
  const { default: readExcel } = await import('read-excel-file/universal');
  let worksheets;
  try {
    worksheets = await readExcel(file);
  } catch {
    throw new Error('This workbook could not be read. Try starting with the import template.');
  }
  const hasTemplateSheets = worksheets.some(({ sheet }) => ['schools', 'students'].includes(normalize(sheet)));
  if (!hasTemplateSheets) {
    const raw = readRaw(worksheets);
    if (raw) return raw;
  }
  const read = (tab, columns) => {
    const data = worksheets.find(({ sheet }) => normalize(sheet) === normalize(tab))?.data;
    if (!data?.length) return [];
    const map = new Map();
    data[0].forEach((cell, column) => {
      const label = normalize(String(cell ?? ''));
      if (!label || !columns.some(([, header]) => normalize(header) === label)) return;
      if (map.has(label)) throw new Error(`${tab} has a duplicate ${cell} column.`);
      map.set(label, column);
    });
    for (const label of requiredHeaders[tab]) {
      if (!map.has(normalize(label))) throw new Error(`Add the ${label} column to the ${tab} sheet.`);
    }
    const rows = [];
    data.slice(1).forEach((row, index) => {
      const line = index + 2;
      const values = columns.filter(([, label]) => map.has(normalize(label)))
        .map(([key, label]) => [key, textOf(row[map.get(normalize(label))], tab, line, key)]);
      if (values.some(([, value]) => value)) rows.push({ line, ...Object.fromEntries(values) });
      if (rows.length > 500) throw new Error('Use up to 500 records per workbook import.');
    });
    return rows;
  };
  const schools = read('Schools', schoolColumns);
  const students = read('Students', studentColumns);
  if (!schools.length && !students.length) throw new Error('Add records to the Schools or Students sheet, or choose a raw student_data file.');
  if (schools.length + students.length > 500) throw new Error('Use up to 500 records per workbook import.');
  return { schools, students, skipped: [], raw: false };
}
