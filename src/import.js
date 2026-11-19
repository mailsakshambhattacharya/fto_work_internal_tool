import { requiredHeaders, schoolColumns, studentColumns } from '../shared/workbook.js';

const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

function textOf(value, tab, line) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  throw new Error(`${tab}, row ${line}. Use text or numbers in record cells. Enter identifiers as text to preserve leading zeros.`);
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
      const values = columns.map(([key, label]) => [key, textOf(row[map.get(normalize(label))], tab, line)]);
      if (values.some(([, value]) => value)) rows.push({ line, ...Object.fromEntries(values) });
      if (rows.length > 500) throw new Error('Use up to 500 records per workbook import.');
    });
    return rows;
  };
  const schools = read('Schools', schoolColumns);
  const students = read('Students', studentColumns);
  if (!schools.length && !students.length) throw new Error('Add records to the Schools or Students sheet first.');
  if (schools.length + students.length > 500) throw new Error('Use up to 500 records per workbook import.');
  return { schools, students };
}
