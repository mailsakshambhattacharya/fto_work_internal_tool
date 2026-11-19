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
  workbook.getWorksheet('Schools').addRow(['GWS', 'Greenwood School', 'Delhi', 'Kavita Sharma', 'principal@greenwood.example']);
  workbook.getWorksheet('Schools').addRow(['ZERO', 'Riverside School', 'Delhi', 'Priya Kapoor']);
  const sheet = workbook.getWorksheet('Students');
  sheet.addRow(['GWS', '0001', 'Meera Iyer', '10', 'A', 'Enrolled']);
  sheet.addRow(['GWS', '0002', 'Aarav Mehta', 'IX', '', 'Transferred']);
  const upload = new File([await workbook.xlsx.writeBuffer()], 'registry.xlsx');
  const data = await readImport(upload);
  assert.equal(data.students[0].student_code, '0001');
  const rejected = { ...data, students: [...data.students, { ...data.students[0], school_code: 'MISSING', line: 4 }] };
  assert.match((await call('import', { payload: rejected, expected: 400 })).error, /row 4/);
  assert.equal((await call('overview')).metrics.schools, 0);
  assert.equal((await call('overview')).metrics.updates, 0);
  assert.deepEqual(await call('import', { payload: data }), { Added: 4, Updated: 0, Unchanged: 0 });
  assert.deepEqual(await call('import', { payload: data }), { Added: 0, Updated: 0, Unchanged: 4 });

  const { rows: [school] } = await call('schools', { params: { q: 'Greenwood' } });
  const { rows: [student] } = await call('students', { params: { school: school.id, q: '0001' } });
  const edit = { kind: 'Student', record: { ...student, section: 'B' } };
  assert.equal((await call('save', { payload: edit })).operation, 'Updated');
  await call('save', { payload: edit, expected: 409 });

  const { rows: [change] } = await call('history', { params: { school: school.id, q: 'updated' } });
  assert.deepEqual(change.fields, [{ key: 'section', label: 'Section', before: 'A', after: 'B' }]);
  assert.equal((await call('record', { params: { kind: 'history', id: change.id } })).record_id, student.id);

  const exportBook = new ExcelJS.Workbook();
  await exportBook.xlsx.load(await call('export', { params: { school: school.id }, binary: true }));
  assert.deepEqual(exportBook.worksheets.map((item) => item.name), ['Schools', 'Students', 'Update History']);
  assert.equal(exportBook.getWorksheet('Schools').rowCount, 2);
  assert.equal(exportBook.getWorksheet('Students').getCell('B3').value, '0001');
  assert.equal(exportBook.getWorksheet('Students').getCell('H3').value instanceof Date, true);
  const history = exportBook.getWorksheet('Update History');
  assert.equal(history.getCell('H2').value, 'Section');
  assert.equal(history.getCell('I2').value, 'A');
  assert.equal(history.getCell('J2').value, 'B');
  assert.equal(history.views[0].ySplit, 1);

  const principal = await ask('Who is the principal at Greenwood School?');
  assert.match(principal.answer, /Kavita Sharma/);
  assert.deepEqual(principal.sources.map((item) => item.id), [school.id]);
  assert.match((await ask('How many enrolled students are in Grade X?')).answer, /^1 enrolled student in Grade 10 matches/);
  assert.match((await ask('Which school has the fewest students?')).answer, /Riverside School · 0 students/);
  assert.match((await ask('Show student 0001')).answer, /Meera Iyer/);
  assert.match((await ask('Show recently updated records in the past 7 days')).answer, /Meera Iyer/);
  assert.deepEqual((await ask('Who is the principal at Missing School?')).sources, []);

  await call('logout', { payload: {} });
  cookie = undefined;
  await call('export', { expected: 401 });
});
