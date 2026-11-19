import ExcelJS from 'exceljs';
import { schoolColumns, studentColumns } from '../shared/workbook.js';

const dateColumn = ['updated_at', 'Updated At (UTC)', 24, 'dd mmm yyyy hh:mm'];

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
  addSheet(book, 'Schools', [...schoolColumns, ...(data ? schoolExtra : [])], data ? dates(data.schools) : [], 'FF3758E8');
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
  }
  return book.xlsx.writeBuffer();
}
