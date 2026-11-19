import { randomUUID } from 'node:crypto';

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const schoolFields = {
  code: 'School Code', name: 'School Name', city: 'City', principal_name: 'Principal Name',
  principal_email: 'Principal Email', principal_phone: 'Principal Phone'
};
export const studentFields = {
  school_id: 'School', student_code: 'Student ID', name: 'Student Name', grade: 'Grade',
  section: 'Section', status: 'Status'
};
export const statuses = ['Enrolled', 'Transferred', 'Graduated', 'Withdrawn'];
const kinds = {
  School: { table: 'schools', fields: schoolFields, key: ['code'] },
  Student: { table: 'students', fields: studentFields, key: ['school_id', 'student_code'] }
};

function field(value, label, required, limit) {
  if (value != null && typeof value !== 'string') throw new RequestError(400, `${label} must be text.`);
  const text = (value ?? '').normalize('NFC').trim();
  if (required && !text) throw new RequestError(400, `${label} is required.`);
  if (text.length > limit || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new RequestError(400, `${label} must be on one line and ${limit} characters or fewer.`);
  }
  return text;
}

export function code(value, label) {
  const text = field(value, label, true, 40).toUpperCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(text)) {
    throw new RequestError(400, `${label} can use letters, numbers, periods, underscores, slashes and hyphens.`);
  }
  return text;
}

export function recordId(value) {
  if (typeof value !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) {
    throw new RequestError(400, 'Invalid record ID.');
  }
  return value;
}

function clean(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400, 'Enter the record details.');
  if (kind === 'School') {
    const email = field(input.principal_email, 'Principal email', false, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new RequestError(400, 'Enter a valid principal email address.');
    }
    return {
      code: code(input.code, 'School code'), name: field(input.name, 'School name', true, 120),
      city: field(input.city, 'City', false, 100), principal_name: field(input.principal_name, 'Principal name', true, 120),
      principal_email: email, principal_phone: field(input.principal_phone, 'Principal phone', false, 40)
    };
  }
  const value = field(input.status, 'Status', false, 20) || 'Enrolled';
  const status = statuses.find((item) => item.toLowerCase() === value.toLowerCase());
  if (!status) throw new RequestError(400, 'Status must be Enrolled, Transferred, Graduated or Withdrawn.');
  return {
    school_id: recordId(input.school_id), student_code: code(input.student_code, 'Student ID'),
    name: field(input.name, 'Student name', true, 120), grade: field(input.grade, 'Grade', true, 30),
    section: field(input.section, 'Section', false, 30), status
  };
}

export async function saveRecord(db, kind, input) {
  if (!Object.hasOwn(kinds, kind)) throw new RequestError(400, 'Choose a school or student record.');
  const id = input?.id == null ? null : recordId(input.id);
  const data = clean(kind, input);
  if (id && (!Number.isInteger(input.revision) || input.revision < 1)) {
    throw new RequestError(400, 'Reopen this record before saving.');
  }
  return db.transaction((tx) => writeRecord(tx, kind, data, { id, revision: input.revision, source: 'Manual entry' }));
}

async function writeRecord(tx, kind, data, { id, revision, source, upsert = false }) {
  const { table, fields, key } = kinds[kind];
  const columns = Object.keys(fields);
  const values = columns.map((column) => data[column]);
  let before;
  let record;
  let schoolName;

  if (kind === 'Student') {
    const school = await tx.query('SELECT name FROM schools WHERE id = $1', [data.school_id]);
    if (!school.rows.length) throw new RequestError(400, 'Choose an existing school.');
    schoolName = school.rows[0].name;
  }
  if (id) {
    ({ rows: [before] } = await tx.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id]));
    if (!before) throw new RequestError(404, 'This record could not be found.');
    if (before.revision !== revision) throw new RequestError(409, 'This record changed. Close the form and reopen it to edit the latest version.');
  } else {
    const placeholders = values.map((_, index) => `$${index + 2}`).join(', ');
    ({ rows: [record] } = await tx.query(
      `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES ($1, ${placeholders}) ON CONFLICT (${key.join(', ')}) DO NOTHING RETURNING *`,
      [randomUUID(), ...values]
    ));
    if (!record && !upsert) {
      throw new RequestError(409, kind === 'School' ? 'This school code is already in use.' : 'This student ID is already in use at that school.');
    }
    if (!record) {
      const match = key.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
      ({ rows: [before] } = await tx.query(`SELECT * FROM ${table} WHERE ${match} FOR UPDATE`, key.map((column) => data[column])));
      if (!before) throw new RequestError(409, 'A matching record changed during the import. Try again.');
    }
  }
  if (before) {
    if (columns.every((column) => before[column] === data[column])) return { record: before, operation: 'Unchanged' };
    const setters = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
    ({ rows: [record] } = await tx.query(
      `UPDATE ${table} SET ${setters}, updated_at = clock_timestamp(), revision = revision + 1 WHERE id = $1 RETURNING *`,
      [before.id, ...values]
    ));
  }

  const operation = before ? 'Updated' : 'Added';
  const schoolId = kind === 'School' ? record.id : record.school_id;
  const afterSnapshot = schoolName ? { ...record, school_name: schoolName } : record;
  let beforeSnapshot = before;
  if (before && schoolName) {
    const formerName = before.school_id === schoolId ? schoolName : (await tx.query('SELECT name FROM schools WHERE id = $1', [before.school_id])).rows[0].name;
    beforeSnapshot = { ...before, school_name: formerName };
  }
  await tx.query(`INSERT INTO changes (entity, record_id, school_id, label, operation, source, before_row, after_row, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, clock_timestamp())`,
  [kind, record.id, schoolId, record.name, operation, source, beforeSnapshot ? JSON.stringify(beforeSnapshot) : null, JSON.stringify(afterSnapshot)]);
  return { record, operation };
}

export async function importRecords(db, input) {
  if (!Array.isArray(input?.schools) || !Array.isArray(input?.students)) throw new RequestError(400, 'Choose a valid workbook.');
  const total = input.schools.length + input.students.length;
  if (total < 1 || total > 500) throw new RequestError(400, 'Use 1 to 500 records per workbook import.');
  const parse = (list, tab, validate, key) => {
    const seen = new Set();
    const entries = list.map((row, index) => {
      const line = Number.isInteger(row?.line) && row.line >= 2 ? row.line : index + 2;
      try {
        const data = validate(row);
        const identifier = key(data);
        if (seen.has(identifier)) throw new RequestError(400, 'Duplicate identifier in this workbook.');
        seen.add(identifier);
        return { data, identifier, line };
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        throw new RequestError(400, `${tab}, row ${line}. ${error.message}`);
      }
    });
    return entries.sort((left, right) => left.identifier.localeCompare(right.identifier));
  };
  const schools = parse(input.schools, 'Schools', (row) => clean('School', row), (row) => row.code);
  const students = parse(input.students, 'Students', (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new RequestError(400, 'Enter the record details.');
    const { school_id, ...data } = clean('Student', { ...row, school_id: '00000000-0000-0000-0000-000000000000' });
    return { ...data, school_code: code(row.school_code, 'School code') };
  }, (row) => `${row.school_code}:${row.student_code}`);

  return db.transaction(async (tx) => {
    const counts = { Added: 0, Updated: 0, Unchanged: 0 };
    const ids = new Map();
    for (const { data } of schools) {
      const result = await writeRecord(tx, 'School', data, { source: 'Excel import', upsert: true });
      ids.set(data.code, result.record.id);
      counts[result.operation]++;
    }
    for (const { data, line } of students) {
      let schoolId = ids.get(data.school_code);
      if (!schoolId) {
        const { rows: [school] } = await tx.query('SELECT id FROM schools WHERE code = $1', [data.school_code]);
        if (!school) throw new RequestError(400, `Students, row ${line}. School code ${data.school_code} does not exist.`);
        schoolId = school.id;
        ids.set(data.school_code, schoolId);
      }
      const result = await writeRecord(tx, 'Student', { ...data, school_id: schoolId }, { source: 'Excel import', upsert: true });
      counts[result.operation]++;
    }
    return counts;
  });
}

const schoolFrom = 'FROM schools s';
const studentFrom = 'FROM students t JOIN schools s ON s.id = t.school_id';
const changeFrom = 'FROM changes c JOIN schools s ON s.id = c.school_id';
const schoolSelect = `SELECT s.*, (SELECT count(*)::integer FROM students t WHERE t.school_id = s.id AND t.status = 'Enrolled') AS student_count ${schoolFrom}`;
const studentSelect = `SELECT t.*, s.name AS school_name, s.code AS school_code ${studentFrom}`;
const changeSelect = `SELECT c.*, c.id::text AS id, COALESCE(c.after_row->>'school_name', CASE WHEN c.entity = 'School' THEN c.label END, s.name) AS school_name ${changeFrom}`;

export function describeChange(change) {
  const fields = kinds[change.entity].fields;
  return Object.entries(fields).flatMap(([key, label]) => {
    const before = change.before_row?.[key] ?? '';
    const after = change.after_row[key] ?? '';
    return before === after ? [] : [{ key, label, before, after }];
  });
}

export function displayChange(row, schoolNames) {
  const { before_row, after_row, ...change } = row;
  const fields = describeChange(row).map((field) => field.key !== 'school_id' ? field : ({
    ...field, before: before_row?.school_name ?? schoolNames.get(field.before) ?? '', after: after_row.school_name ?? schoolNames.get(field.after) ?? row.school_name
  }));
  return { ...change, fields };
}

export async function formatChanges(db, rows) {
  const ids = [...new Set(rows.flatMap((row) => [row.before_row?.school_id, row.after_row?.school_id]).filter(Boolean))];
  const schools = ids.length ? (await db.query('SELECT id, name FROM schools WHERE id = ANY($1::uuid[])', [ids])).rows : [];
  const names = new Map(schools.map((row) => [row.id, row.name]));
  return rows.map((row) => displayChange(row, names));
}

export async function directory(db, kind, params = {}) {
  const q = field(params.q, 'Search', false, 160).toLowerCase();
  const school = params.school ? recordId(params.school) : null;
  const page = Math.max(1, Math.min(1_000_000, parseInt(params.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, parseInt(params.limit, 10) || 20));
  const clauses = {
    schools: [schoolSelect, schoolFrom, "strpos(lower(concat_ws(' ', s.name, s.code, s.city, s.principal_name)), $1) > 0 AND ($2::uuid IS NULL OR s.id = $2)", 'lower(s.name), s.id'],
    students: [studentSelect, studentFrom, "strpos(lower(concat_ws(' ', t.name, t.student_code, t.grade, t.section, t.status, s.name, s.code)), $1) > 0 AND ($2::uuid IS NULL OR t.school_id = $2)", 'lower(t.name), t.id'],
    history: [changeSelect, changeFrom, "strpos(lower(concat_ws(' ', c.label, c.operation, c.entity, c.source, s.name)), $1) > 0 AND ($2::uuid IS NULL OR c.school_id = $2 OR c.before_row->>'school_id' = ($2::uuid)::text)", 'c.id DESC']
  };
  const [select, from, where, order] = clauses[kind];
  const [listing, count] = await Promise.all([
    db.query(`${select} WHERE ${where} ORDER BY ${order} LIMIT $3 OFFSET $4`, [q, school, limit, (page - 1) * limit]),
    db.query(`SELECT count(*)::integer AS total ${from} WHERE ${where}`, [q, school])
  ]);
  const rows = kind === 'history' ? await formatChanges(db, listing.rows) : listing.rows;
  return { rows, total: count.rows[0].total, page, limit };
}

export async function overview(db) {
  const [metrics, schools, changes] = await Promise.all([
    db.query(`SELECT (SELECT count(*)::integer FROM schools) AS schools,
      (SELECT count(*)::integer FROM students WHERE status = 'Enrolled') AS students,
      (SELECT count(*)::integer FROM changes WHERE occurred_at >= now() - interval '7 days') AS updates`),
    db.query(`${schoolSelect} ORDER BY s.updated_at DESC, lower(s.name), s.id LIMIT 5`),
    db.query(`${changeSelect} ORDER BY c.id DESC LIMIT 4`)
  ]);
  return { metrics: metrics.rows[0], schools: schools.rows, changes: await formatChanges(db, changes.rows) };
}

export async function getRecord(db, kind, id) {
  const selects = { schools: [schoolSelect, 's.id'], students: [studentSelect, 't.id'], history: [changeSelect, 'c.id'] };
  if (!Object.hasOwn(selects, kind)) throw new RequestError(400, 'Invalid record type.');
  if (kind !== 'history') recordId(id);
  else if (!/^\d{1,18}$/.test(id)) throw new RequestError(400, 'Invalid update ID.');
  const [select, key] = selects[kind];
  const { rows } = await db.query(`${select} WHERE ${key} = $1`, [id]);
  if (!rows.length) throw new RequestError(404, 'This record could not be found.');
  return kind === 'history' ? (await formatChanges(db, rows))[0] : rows[0];
}

export async function workbookRows(db, school) {
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const filter = school ? recordId(school) : null;
    const schools = await tx.query(`${schoolSelect} WHERE ($1::uuid IS NULL OR s.id = $1) ORDER BY lower(s.name)`, [filter]);
    const students = await tx.query(`${studentSelect} WHERE ($1::uuid IS NULL OR t.school_id = $1) ORDER BY s.code, lower(t.name), t.id`, [filter]);
    const changes = await tx.query(`${changeSelect} WHERE ($1::uuid IS NULL OR c.school_id = $1 OR c.before_row->>'school_id' = ($1::uuid)::text) ORDER BY c.id DESC`, [filter]);
    return { schools: schools.rows, students: students.rows, changes: await formatChanges(tx, changes.rows) };
  });
}
