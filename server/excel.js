import ExcelJS from 'exceljs';
import { ftoColumns, schoolColumns, studentColumns } from '../shared/workbook.js';

const dateColumn = ['updated_at', 'Updated At (UTC)', 24, 'dd mmm yyyy hh:mm'];
const uploadDateColumn = ['uploaded_at', 'Uploaded At (UTC)', 24, 'dd mmm yyyy hh:mm:ss'];
const uploadIdentity = [['id', 'Upload ID', 16], ['school_code', 'School Code', 20, '@'], ['school_name', 'School Name', 35]];

function addSheet(book, name, columns, data, tabColor) {
  const sheet = book.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
  });
  sheet.columns = columns.map(([key, header, width, numFmt]) => ({ key, header, width, style: { ...(numFmt && { numFmt }) } }));
  sheet.addRows(data);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, data.length + 1), column: columns.length } };
  sheet.eachRow((row, index) => {
    row.height = index === 1 ? 26 : 19;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: index === 1 ? 'FFFFFFFF' : 'FF1D2840' }, bold: index === 1 };
      cell.alignment = { vertical: 'middle', ...(index === 1 && { horizontal: 'center' }) };
      if (index === 1 || index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FF243B91' : 'FFF3F6FC' } };
    });
  });
}

export async function createWorkbook(data) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Schooldesk';
  const schoolExtra = [['student_count', 'Enrolled Students', 21], dateColumn];
  const studentExtra = [['school_name', 'School Name', 35], dateColumn];
  const dates = (rows) => rows.map((row) => ({ ...row, updated_at: new Date(row.updated_at) }));
  const schools = data ? dates(data.schools).map((row) => ({ ...row, onboarded_on: new Date(`${row.onboarded_on}T00:00:00Z`) })) : [];
  addSheet(book, 'Schools', [...schoolColumns, ...(data ? schoolExtra : [])], schools, 'FF3758E8');
  addSheet(book, 'Students', [...studentColumns, ...(data ? studentExtra : [])], data ? dates(data.students) : [], 'FF0B8B77');
  if (data) {
    const columns = [
      ['id', 'Change ID', 15], ['occurred_at', 'Changed At (UTC)', 24, 'dd mmm yyyy hh:mm:ss'], ['entity', 'Record Type', 19],
      ['operation', 'Action', 16], ['label', 'Record Name', 32], ['school_name', 'School Name', 32], ['source', 'Source', 19],
      ['field', 'Field', 23], ['before', 'Previous Value', 43], ['after', 'New Value', 43], ['record_id', 'Record Key', 42]
    ];
    const rows = data.changes.flatMap((row) => row.fields.map((field) => ({
      ...row, occurred_at: new Date(row.occurred_at), field: field.label, before: field.before, after: field.after
    })));
    addSheet(book, 'Update History', columns, rows, 'FF8854C0');
    const uploads = data.uploads.map((row) => ({ ...row, uploaded_at: new Date(row.uploaded_at) }));
    addSheet(book, 'Student Uploads', [
      ...uploadIdentity, ['school_area', 'Area', 24], ['school_city', 'City', 22],
      ['onboarded_on', 'Onboarded On', 20, 'yyyy-mm-dd'], uploadDateColumn, ['filename', 'Workbook', 37],
      ['added_count', 'Added', 14], ['updated_count', 'Updated', 14], ['repeated_count', 'Repeats Flagged', 20]
    ], uploads.map((row) => ({ ...row, onboarded_on: new Date(`${row.onboarded_on}T00:00:00Z`) })), 'FF3769AD');
    const uploadRows = uploads.flatMap((upload) => upload.row_results.map((row) => ({ ...upload, ...row })));
    addSheet(book, 'Student Upload Rows', [
      ...uploadIdentity, uploadDateColumn, ['line', 'Excel Row', 15], ['student_code', 'Student ID', 20, '@'],
      ['name', 'Student Name', 32], ['outcome', 'Result', 18], ['reason', 'Repeat Reason', 48]
    ], uploadRows, 'FF3769AD');
  }
  return book.xlsx.writeBuffer();
}

const schoolDetails = ['date', 'school_name', 'principal_name', 'principal_email', 'principal_phone', 'coordinator_name',
  'coordinator_phone', 'coordinator_email', 'state', 'pincode'];

// Matches the FTO master sheet: a blank row after the header and between schools, with school details on each school's first row.
export async function createFtoWorkbook(rows) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Schooldesk';
  const sheet = book.addWorksheet('FTO Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = ftoColumns.map(([key, header, width, numFmt]) => ({ key, header, width, style: { ...(numFmt && { numFmt }) } }));
  sheet.getRow(1).font = { bold: true };
  let school;
  for (const row of rows) {
    const first = row.school_id !== school;
    if (first) sheet.addRow({});
    school = row.school_id;
    sheet.addRow(Object.fromEntries(ftoColumns.map(([key]) => [key, first || !schoolDetails.includes(key) ? row[key] ?? '' : ''])));
  }
  return book.xlsx.writeBuffer();
}
