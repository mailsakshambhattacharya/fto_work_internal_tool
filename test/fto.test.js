import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ExcelJS from 'exceljs';
import { createHandler } from '../server/handler.js';
import { schema } from '../server/schema.js';
import { readImport } from '../src/import.js';

// Made-up rows shaped like the website's student_data exports, including their quirks:
// numeric IDs, "NA" emails, a stray 7th column, trailing spaces, and copies of the list pasted again with blank IDs.
async function rawFile(name, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  sheet.addRow(['student_id', 'first_name', 'last_name', 'grade', 'email', 'test_attempt_code']);
  rows.forEach((row) => sheet.addRow(row));
  book.addWorksheet('Sheet2');
  return new File([await book.xlsx.writeBuffer()], name);
}
const grade9Rows = [
  [300101, 'Asha', 'Verma', 9, 'NA', 'AAAA11112222', 'AAAA11112222'], [300102, 'Ravi', 'Kumar', 9, 'NA', 'BBBB11112222'],
  [300103, 'Neha', 'Iyer', 9, 'NA', 'CCCC11112222'], [300104, 'Arjun', 'Das', 9, 'NA', 'DDDD11112222'],
  [300105, 'Meera ', 'Nair', 9, 'NA', 'EEEE11112222']
];
const fixture = (name) => name.includes('26')
  ? rawFile(name, Array.from({ length: 15 }, (_, index) => [300001 + index, `Student${index}`, 'Test', 7, 'NA', `G7CODE${String(index).padStart(6, '0')}`]))
  : rawFile(name, [...grade9Rows, ...Array.from({ length: 4 }, () => grade9Rows.map(([, ...rest]) => [null, ...rest.slice(0, 5)])).flat()]);

test('raw student_data files import and export in the FTO layout', async (context) => {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(schema); // migrations are re-runnable
  const env = { APP_PASSWORD: 'tester-only!', APP_SESSION_SECRET: 'test-session-secret-not-for-deployment' };
  const server = createServer(createHandler({ getDb: async () => db, env }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  async function call(action, { payload, params, binary = false } = {}) {
    const response = await fetch(`${base}/api/registry?${new URLSearchParams({ action, ...params })}`, {
      ...(payload && { method: 'POST', body: JSON.stringify(payload) }),
      headers: { ...(cookie && { cookie }), ...(payload && { 'Content-Type': 'application/json', Origin: base }) }
    });
    assert.equal(response.status, 200, `${action}: ${await response.clone().text()}`);
    if (action === 'login') cookie = response.headers.get('set-cookie').split(';')[0];
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  await call('login', { payload: { password: env.APP_PASSWORD } });

  const school = {
    code: 'AKRG', name: 'AKRG High School', principal_name: 'Gutta Padmaja', principal_email: 'akrg@example.org', principal_phone: '9000000000',
    coordinator_name: 'R Rao', coordinator_phone: '9000000001', coordinator_email: 'coord@example.org', state: 'Andhra Pradesh', pincode: '534301',
    onboarded_on: '2025-11-04'
  };
  await call('save', { payload: { kind: 'School', record: school } });

  const grade7 = await readImport(await fixture('student_data_26.xlsx'));
  assert.equal(grade7.raw, true);
  assert.equal(grade7.students.length, 15);
  assert.deepEqual(grade7.skipped, []);
  const grade9 = await readImport(await fixture('student_data_27.xlsx'));
  // This export repeats its 5 students four more times with blank IDs; those rows are skipped, not fatal.
  assert.equal(grade9.students.length, 5);
  assert.equal(grade9.skipped.length, 20);
  assert.deepEqual(grade9.skipped.at(-1), { line: 26, name: 'Meera Nair', reason: 'No student ID' });

  const first = await call('import', { payload: { ...grade7, studentSchool: 'AKRG', filename: 'student_data (26).xlsx' } });
  assert.equal(first.studentUpload.Added, 15);
  const second = await call('import', { payload: { ...grade9, studentSchool: 'AKRG', filename: 'student_data (27).xlsx' } });
  assert.equal(second.studentUpload.Added, 5);
  const upload = await call('record', { params: { kind: 'student-uploads', id: second.studentUpload.id } });
  assert.deepEqual(upload.row_results.filter((row) => row.outcome === 'Skipped').length, 20);

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await call('export-fto', { binary: true }));
  const rows = [];
  book.worksheets[0].eachRow({ includeEmpty: true }, (row) => rows.push(row.values.slice(1)));
  assert.deepEqual(rows[0].slice(0, 9), ['DATE', 'School Name', 'student_id', 'first_name', 'last_name', 'grade', 'email', 'test_attempt_code', '']);
  assert.equal(rows[0][16], 'Pincode');
  assert.equal(rows[1].filter(Boolean).length, 0);
  assert.deepEqual(rows[2], ['04.11.25', 'AKRG High School', '300001', 'Student0', 'Test', '7', '', 'G7CODE000000', '',
    'Gutta Padmaja', 'akrg@example.org', '9000000000', 'R Rao', '9000000001', 'coord@example.org', 'Andhra Pradesh', '534301']);
  assert.equal(rows[3][0], '');
  assert.equal(rows[3][1], '');
  assert.equal(rows[3][2], '300002');
  assert.equal(rows.length, 1 + 1 + 20);
});
