import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ExcelJS from 'exceljs';
import { createHandler } from '../server/handler.js';
import { schema } from '../server/schema.js';
import { readImport } from '../src/import.js';

test('registry sign-in, atomic workbook import, audited edits, export, and answers', async (context) => {
  const db = new PGlite();
  await db.exec(schema);
  const env = { APP_PASSWORD: 'tester-only!', APP_SESSION_SECRET: 'test-session-secret-not-for-deployment' };
  const server = createServer(createHandler({ getDb: async () => db, env }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  async function call(action, { payload, params, expected = 200, origin = base, binary = false } = {}) {
    const response = await fetch(`${base}/api/registry?${new URLSearchParams({ action, ...params })}`, {
      ...(payload && { method: 'POST', body: JSON.stringify(payload) }),
      headers: { ...(cookie && { cookie }), ...(payload && { 'Content-Type': 'application/json', Origin: origin }) }
    });
    assert.equal(response.status, expected, `${action}: ${response.status !== expected ? await response.text() : response.status}`);
    if (action === 'login' && response.ok) cookie = response.headers.get('set-cookie').split(';')[0];
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }

  const ask = (question) => call('ask', { payload: { question, zone: 'Asia/Kolkata' } });
  await call('overview', { expected: 401 });
  await call('login', { payload: { password: 'wrong' }, expected: 401 });
  await call('login', { payload: { password: env.APP_PASSWORD } });
  await call('save', { payload: {}, origin: 'https://example.org', expected: 403 });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await call('template', { binary: true }));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Schools', 'Students']);
  workbook.getWorksheet('Schools').addRow(['GWS', 'Greenwood School', 'Delhi', 'Kavita Sharma', 'principal@greenwood.example', '', 'Civil Lines', new Date('2025-07-18T00:00:00Z')]);
  workbook.getWorksheet('Schools').addRow(['ZERO', 'Riverside School', 'Delhi', 'Priya Kapoor']);
  const sheet = workbook.getWorksheet('Students');
  sheet.addRow(['GWS', '0001', 'Meera Iyer', '10', 'A', 'Enrolled']);
  sheet.addRow(['', '0002', 'Aarav Mehta', 'IX', '', 'Transferred']);
  sheet.addRow(['', '0001', 'Meera Iyer', '10', 'C', 'Enrolled']);
  const upload = new File([await workbook.xlsx.writeBuffer()], 'registry.xlsx');
  const data = await readImport(upload);
  assert.equal(data.students[0].student_code, '0001');
  assert.equal(data.schools[0].onboarded_on, '2025-07-18');
  assert.match((await call('import', { payload: data, expected: 400 })).error, /choose a school/i);
  const rejected = { ...data, studentSchool: 'ZERO' };
  assert.match((await call('import', { payload: rejected, expected: 400 })).error, /row 2.*selected school \(ZERO\)/);
  const missing = { ...data, studentSchool: 'MISSING', students: data.students.map((row) => ({ ...row, school_code: '' })) };
  assert.match((await call('import', { payload: missing, expected: 400 })).error, /MISSING does not exist/);
  assert.equal((await call('overview')).metrics.schools, 0);
  assert.equal((await call('overview')).metrics.updates, 0);
  assert.equal((await call('student-uploads')).total, 0);
  const firstImport = await call('import', { payload: { ...data, studentSchool: 'GWS', filename: 'registry.xlsx' } });
  assert.deepEqual(firstImport.studentUpload, { id: firstImport.studentUpload.id, school_name: 'Greenwood School', Added: 2, Updated: 0, Repeated: 1 });
  const secondImport = await call('import', { payload: { ...data, studentSchool: 'GWS', filename: 'repeats.xlsx' } });
  assert.equal(secondImport.Unchanged, 2);
  assert.equal(secondImport.studentUpload.Repeated, 3);
  const { row_results: repeatRows } = await call('record', { params: { kind: 'student-uploads', id: secondImport.studentUpload.id } });
  assert.deepEqual(repeatRows.map(({ line, outcome, reason }) => [line, outcome, reason]), [
    [2, 'Repeated', 'Matches the saved record.'], [3, 'Repeated', 'Matches the saved record.'], [4, 'Repeated', 'Student ID already appears in this workbook.']
  ]);

  const { rows: [school] } = await call('schools', { params: { q: 'Civil Lines' } });
  assert.equal(school.onboarded_on, '2025-07-18');
  await call('import', { payload: { schools: [{ ...data.schools[0], area: undefined, onboarded_on: '' }], students: [] } });
  assert.equal((await call('record', { params: { kind: 'schools', id: school.id } })).area, 'Civil Lines');
  const { rows: [student] } = await call('students', { params: { school: school.id, q: '0001' } });
  assert.equal(student.section, 'A');
  const changedUpload = { schools: [], students: [{ ...data.students[0], section: 'D' }], studentSchool: 'GWS' };
  assert.equal((await call('import', { payload: changedUpload })).studentUpload.Repeated, 1);
  const edit = { kind: 'Student', record: { ...student, section: 'B' } };
  assert.equal((await call('save', { payload: edit })).operation, 'Updated');
  await call('save', { payload: edit, expected: 409 });

  const { rows: [change] } = await call('history', { params: { school: school.id, q: 'updated' } });
  assert.deepEqual(change.fields, [{ key: 'section', label: 'Section', before: 'A', after: 'B' }]);
  assert.equal((await call('record', { params: { kind: 'history', id: change.id } })).record_id, student.id);

  const exportBook = new ExcelJS.Workbook();
  await exportBook.xlsx.load(await call('export', { params: { school: school.id }, binary: true }));
  assert.deepEqual(exportBook.worksheets.map((item) => item.name), ['Schools', 'Students', 'Update History', 'Student Uploads', 'Student Upload Rows']);
  assert.equal(exportBook.getWorksheet('Schools').rowCount, 2);
  assert.equal(exportBook.getWorksheet('Schools').getCell('H2').value.toISOString().slice(0, 10), '2025-07-18');
  assert.equal(exportBook.getWorksheet('Students').getCell('B3').value, '0001');
  assert.equal(exportBook.getWorksheet('Students').getCell('L3').value instanceof Date, true);
  const history = exportBook.getWorksheet('Update History');
  assert.equal(history.getCell('H2').value, 'Section');
  assert.equal(history.getCell('I2').value, 'A');
  assert.equal(history.getCell('J2').value, 'B');
  assert.equal(history.views[0].ySplit, 1);
  assert.equal(exportBook.getWorksheet('Student Uploads').getCell('K2').value, 1);
  assert.equal(exportBook.getWorksheet('Student Upload Rows').getCell('I2').value, 'Student ID already exists at this school.');

  const principal = await ask('Who is the principal at Greenwood School?');
  assert.match(principal.answer, /Kavita Sharma/);
  assert.deepEqual(principal.sources.map((item) => item.id), [school.id]);
  assert.match((await ask('How many enrolled students are in Grade X?')).answer, /^1 enrolled student in Grade 10 matches/);
  assert.match((await ask('Which school has the fewest students?')).answer, /Riverside School · 0 students/);
  assert.match((await ask('Show student 0001')).answer, /Meera Iyer/);
  assert.match((await ask('Show recently updated records in the past 7 days')).answer, /Meera Iyer/);
  assert.match((await ask('When was Greenwood School onboarded and what is its area?')).answer, /18 Jul 2025.*Civil Lines/);
  assert.match((await ask('How many new students were added at Greenwood School?')).answer, /^2 students added/);
  const repeats = await ask('How many repeats were flagged at Greenwood School?');
  assert.match(repeats.answer, /Repeats flagged: 5/);
  assert.equal(repeats.sources[0].kind, 'student-uploads');
  assert.deepEqual((await ask('Who is the principal at Missing School?')).sources, []);

  const changedImport = await call('import', { payload: { ...changedUpload, updateExistingStudents: true } });
  assert.equal(changedImport.studentUpload.Updated, 1);
  assert.equal((await call('record', { params: { kind: 'students', id: student.id } })).section, 'D');
  const secondSchoolImport = await call('import', { payload: { schools: [], students: [{ ...data.students[0], school_code: '' }], studentSchool: 'ZERO' } });
  assert.equal(secondSchoolImport.studentUpload.Added, 1);
  const filteredUploads = await call('student-uploads', { params: { school: school.id } });
  assert.equal(filteredUploads.total, 4);
  assert.deepEqual(filteredUploads.summary, { added_count: 2, updated_count: 1, repeated_count: 5 });

  await call('logout', { payload: {} });
  cookie = undefined;
  await call('export', { expected: 401 });
});

test('onboarding date is backfilled from the original creation date once', async (context) => {
  const db = new PGlite();
  context.after(() => db.close());
  await db.exec(`CREATE TABLE schools (
    id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
  );
  INSERT INTO schools VALUES ('ee1a7218-e364-4d3d-9282-7c092f8f06f1', '2025-07-17 20:00:00Z', '2026-01-01 00:00:00Z');`);
  await db.exec(schema);
  const read = async () => (await db.query(`SELECT area, to_char(onboarded_on, 'YYYY-MM-DD') AS date FROM schools`)).rows[0];
  assert.deepEqual(await read(), { area: '', date: '2025-07-18' });
  await db.exec("UPDATE schools SET onboarded_on = '2024-06-19', area = 'West End'");
  await db.exec(schema);
  assert.deepEqual(await read(), { area: 'West End', date: '2024-06-19' });
});
