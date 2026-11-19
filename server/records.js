import { randomUUID } from 'node:crypto';

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const schoolFields = {
  code: 'School Code', name: 'School Name', city: 'City', principal_name: 'Principal Name',
  principal_email: 'Principal Email', principal_phone: 'Principal Phone', area: 'Area', onboarded_on: 'Onboarded On',
  coordinator_name: 'Coordinator Name', coordinator_phone: 'Coordinator Phone', coordinator_email: 'Coordinator Email',
  state: 'State', pincode: 'Pincode'
};
export const studentFields = {
  school_id: 'School', student_code: 'Student ID', name: 'Student Name', grade: 'Grade',
  section: 'Section', status: 'Status', first_name: 'First Name', last_name: 'Last Name', email: 'Email',
  test_attempt_code: 'Test Attempt Code'
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

// Columns added after launch: a missing value keeps what is saved, so older workbooks never blank them out.
function optional(input, key, label, limit) {
  return input[key] == null ? null : field(input[key], label, false, limit);
}

const placeholderEmail = /^(?:n\/?a|nil|none|-+)$/i;

function clean(kind, input, requireSchool = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400, 'Enter the record details.');
  if (kind === 'School') {
    const email = field(input.principal_email, 'Principal email', false, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new RequestError(400, 'Enter a valid principal email address.');
    }
    const coordinatorEmail = optional(input, 'coordinator_email', 'Coordinator email', 160);
    if (coordinatorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coordinatorEmail)) {
      throw new RequestError(400, 'Enter a valid coordinator email address.');
    }
    const onboarding = field(input.onboarded_on, 'Onboarding date', false, 10);
    if (onboarding && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(onboarding) || !Number.isFinite(Date.parse(onboarding)) || !new Date(onboarding).toISOString().startsWith(onboarding))) {
      throw new RequestError(400, 'Enter a valid onboarding date in YYYY-MM-DD format.');
    }
    return {
      code: code(input.code, 'School code'), name: field(input.name, 'School name', true, 120),
      city: field(input.city, 'City', false, 100), principal_name: field(input.principal_name, 'Principal name', true, 120),
      principal_email: email, principal_phone: field(input.principal_phone, 'Principal phone', false, 40),
      area: input.area == null ? null : field(input.area, 'Area', false, 100), onboarded_on: onboarding || null,
      coordinator_name: optional(input, 'coordinator_name', 'Coordinator name', 120),
      coordinator_phone: optional(input, 'coordinator_phone', 'Coordinator phone', 40), coordinator_email: coordinatorEmail,
      state: optional(input, 'state', 'State', 60), pincode: optional(input, 'pincode', 'Pincode', 12)
    };
  }
  const value = field(input.status, 'Status', false, 20) || 'Enrolled';
  const status = statuses.find((item) => item.toLowerCase() === value.toLowerCase());
  if (!status) throw new RequestError(400, 'Status must be Enrolled, Transferred, Graduated or Withdrawn.');
  const firstName = optional(input, 'first_name', 'First name', 80);
  const lastName = optional(input, 'last_name', 'Last name', 80);
  const email = optional(input, 'email', 'Email', 160);
  const fullName = field(input.name, 'Student name', false, 120) || [firstName, lastName].filter(Boolean).join(' ');
  return {
    ...(requireSchool && { school_id: recordId(input.school_id) }), student_code: code(input.student_code, 'Student ID'),
    name: field(fullName, 'Student name', true, 120), grade: field(input.grade, 'Grade', true, 30),
    section: field(input.section, 'Section', false, 30), status, first_name: firstName, last_name: lastName,
    email: email && placeholderEmail.test(email) ? '' : email,
    test_attempt_code: optional(input, 'test_attempt_code', 'Test attempt code', 40)
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

async function writeRecord(tx, kind, data, { id, revision, source, upsert = false, updateExisting = true, importedSchool }) {
  const { table, fields, key } = kinds[kind];
  const columns = Object.keys(fields);
  const projection = kind === 'School' ? `*, to_char(onboarded_on, 'YYYY-MM-DD') AS onboarded_on` : '*';
  let before;
  let record;
  let schoolName = importedSchool?.name;

  if (kind === 'Student' && !importedSchool) {
    const school = await tx.query('SELECT name FROM schools WHERE id = $1', [data.school_id]);
    if (!school.rows.length) throw new RequestError(400, 'Choose an existing school.');
    schoolName = school.rows[0].name;
  }
  if (id) {
    ({ rows: [before] } = await tx.query(`SELECT ${projection} FROM ${table} WHERE id = $1 FOR UPDATE`, [id]));
    if (!before) throw new RequestError(404, 'This record could not be found.');
    if (before.revision !== revision) throw new RequestError(409, 'This record changed. Close the form and reopen it to edit the latest version.');
  } else {
    const insertColumns = columns.filter((column) => data[column] != null);
    const placeholders = insertColumns.map((_, index) => `$${index + 2}`).join(', ');
    ({ rows: [record] } = await tx.query(
      `INSERT INTO ${table} (id, ${insertColumns.join(', ')}) VALUES ($1, ${placeholders}) ON CONFLICT (${key.join(', ')}) DO NOTHING RETURNING ${projection}`,
      [randomUUID(), ...insertColumns.map((column) => data[column])]
    ));
    if (!record && !upsert) {
      throw new RequestError(409, kind === 'School' ? 'This school code is already in use.' : 'This student ID is already in use at that school.');
    }
    if (!record) {
      const match = key.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
      ({ rows: [before] } = await tx.query(`SELECT ${projection} FROM ${table} WHERE ${match} FOR UPDATE`, key.map((column) => data[column])));
      if (!before) throw new RequestError(409, 'A matching record changed during the import. Try again.');
    }
  }
  if (before) {
    const values = columns.map((column) => data[column] ?? before[column]);
    if (columns.every((column, index) => before[column] === values[index])) return { record: before, operation: 'Unchanged' };
    if (!updateExisting) return { record: before, operation: 'Repeated' };
    const setters = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
    ({ rows: [record] } = await tx.query(
      `UPDATE ${table} SET ${setters}, updated_at = clock_timestamp(), revision = revision + 1 WHERE id = $1 RETURNING ${projection}`,
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
  if (input.students.length && !input.studentSchool) throw new RequestError(400, 'Choose a school for the student upload.');
  const studentSchool = input.students.length ? code(input.studentSchool, 'Selected school code') : null;
  const filename = studentSchool ? field(input.filename, 'Workbook name', false, 255) || 'Excel workbook' : '';
  const parse = (list, tab, validate, key) => {
    const seen = new Set();
    const entries = list.map((row, index) => {
      const line = Number.isInteger(row?.line) && row.line >= 2 ? row.line : index + 2;
      try {
        const data = validate(row);
        const identifier = key(data);
        const duplicate = seen.has(identifier);
        if (duplicate && tab === 'Schools') throw new RequestError(400, 'Duplicate school code in this workbook.');
        seen.add(identifier);
        return { data, identifier, line, duplicate };
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        throw new RequestError(400, `${tab}, row ${line}. ${error.message}`);
      }
    });
    return entries.sort((left, right) => left.identifier.localeCompare(right.identifier));
  };
  const schools = parse(input.schools, 'Schools', (row) => clean('School', row), (row) => row.code);
  const students = parse(input.students, 'Students', (row) => {
    const data = clean('Student', row, false);
    if (field(row.school_code, 'School code', false, 40) && code(row.school_code, 'School code') !== studentSchool) {
      throw new RequestError(400, `School code does not match the selected school (${studentSchool}). Upload a workbook for one school at a time.`);
    }
    return data;
  }, (row) => row.student_code);

  return db.transaction(async (tx) => {
    const counts = { Added: 0, Updated: 0, Unchanged: 0, Repeated: 0 };
    let selectedSchool;
    for (const { data } of schools) {
      const result = await writeRecord(tx, 'School', data, { source: 'Excel import', upsert: true });
      if (data.code === studentSchool) selectedSchool = result.record;
      counts[result.operation]++;
    }
    if (!students.length) return counts;
    if (!selectedSchool) {
      ({ rows: [selectedSchool] } = await tx.query('SELECT id, name FROM schools WHERE code = $1', [studentSchool]));
      if (!selectedSchool) throw new RequestError(400, `Selected school code ${studentSchool} does not exist.`);
    }
    const outcomes = { Added: 0, Updated: 0, Repeated: 0 };
    const rowResults = [];
    for (const { data, line, duplicate } of students) {
      let outcome = 'Repeated';
      let reason = 'Student ID already appears in this workbook.';
      if (!duplicate) {
        const { operation } = await writeRecord(tx, 'Student', { ...data, school_id: selectedSchool.id }, {
          source: 'Excel import', upsert: true, importedSchool: selectedSchool, updateExisting: input.updateExistingStudents === true
        });
        outcome = operation === 'Unchanged' ? 'Repeated' : operation;
        reason = operation === 'Unchanged' ? 'Matches the saved record.' : operation === 'Repeated' ? 'Student ID already exists at this school.' : '';
      }
      outcomes[outcome]++;
      counts[outcome]++;
      rowResults.push({ line, student_code: data.student_code, name: data.name, outcome, reason });
    }
    const skipped = Array.isArray(input.skipped) ? input.skipped.slice(0, 500) : [];
    for (const row of skipped) {
      rowResults.push({
        line: Number.isInteger(row?.line) ? row.line : 0, student_code: '', name: field(String(row?.name ?? ''), 'Skipped row name', false, 160),
        outcome: 'Skipped', reason: field(String(row?.reason ?? ''), 'Skipped row reason', false, 120)
      });
    }
    rowResults.sort((left, right) => left.line - right.line);
    const { rows: [upload] } = await tx.query(`INSERT INTO student_uploads (school_id, filename, added_count, updated_count, repeated_count, row_results)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id::text AS id`,
    [selectedSchool.id, filename, outcomes.Added, outcomes.Updated, outcomes.Repeated, JSON.stringify(rowResults)]);
    return { ...counts, studentUpload: { id: upload.id, school_name: selectedSchool.name, ...outcomes } };
  });
}

const schoolFrom = 'FROM schools s';
const studentFrom = 'FROM students t JOIN schools s ON s.id = t.school_id';
const changeFrom = 'FROM changes c JOIN schools s ON s.id = c.school_id';
const uploadFrom = 'FROM student_uploads u JOIN schools s ON s.id = u.school_id';
const schoolSelect = `SELECT s.*, to_char(s.onboarded_on, 'YYYY-MM-DD') AS onboarded_on,
  (SELECT count(*)::integer FROM students t WHERE t.school_id = s.id AND t.status = 'Enrolled') AS student_count ${schoolFrom}`;
const studentSelect = `SELECT t.*, s.name AS school_name, s.code AS school_code ${studentFrom}`;
const changeSelect = `SELECT c.*, c.id::text AS id, COALESCE(c.after_row->>'school_name', CASE WHEN c.entity = 'School' THEN c.label END, s.name) AS school_name ${changeFrom}`;
const uploadFields = `u.id::text AS id, u.school_id, s.name AS school_name, s.code AS school_code, s.area AS school_area, s.city AS school_city,
  to_char(s.onboarded_on, 'YYYY-MM-DD') AS onboarded_on, u.filename, u.added_count, u.updated_count, u.repeated_count, u.uploaded_at`;
const uploadSelect = `SELECT ${uploadFields} ${uploadFrom}`;

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
    schools: [schoolSelect, schoolFrom, "strpos(lower(concat_ws(' ', s.name, s.code, s.area, s.city, s.principal_name)), $1) > 0 AND ($2::uuid IS NULL OR s.id = $2)", 'lower(s.name), s.id'],
    students: [studentSelect, studentFrom, "strpos(lower(concat_ws(' ', t.name, t.student_code, t.grade, t.section, t.status, s.name, s.code)), $1) > 0 AND ($2::uuid IS NULL OR t.school_id = $2)", 'lower(t.name), t.id'],
    history: [changeSelect, changeFrom, "strpos(lower(concat_ws(' ', c.label, c.operation, c.entity, c.source, s.name)), $1) > 0 AND ($2::uuid IS NULL OR c.school_id = $2 OR c.before_row->>'school_id' = ($2::uuid)::text)", 'c.id DESC'],
    'student-uploads': [uploadSelect, uploadFrom, "strpos(lower(concat_ws(' ', u.filename, s.name, s.code, s.area, s.city)), $1) > 0 AND ($2::uuid IS NULL OR u.school_id = $2)", 'u.id DESC']
  };
  const [select, from, where, order] = clauses[kind];
  const totals = kind === 'student-uploads' ? `,
    COALESCE(sum(u.added_count), 0)::integer AS added_count, COALESCE(sum(u.updated_count), 0)::integer AS updated_count,
    COALESCE(sum(u.repeated_count), 0)::integer AS repeated_count` : '';
  const [listing, count] = await Promise.all([
    db.query(`${select} WHERE ${where} ORDER BY ${order} LIMIT $3 OFFSET $4`, [q, school, limit, (page - 1) * limit]),
    db.query(`SELECT count(*)::integer AS total ${totals} ${from} WHERE ${where}`, [q, school])
  ]);
  const rows = kind === 'history' ? await formatChanges(db, listing.rows) : listing.rows;
  const { total, ...summary } = count.rows[0];
  return { rows, total, page, limit, ...(totals && { summary }) };
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
  const selects = {
    schools: [schoolSelect, 's.id'], students: [studentSelect, 't.id'], history: [changeSelect, 'c.id'],
    'student-uploads': [`SELECT ${uploadFields}, u.row_results ${uploadFrom}`, 'u.id']
  };
  if (!Object.hasOwn(selects, kind)) throw new RequestError(400, 'Invalid record type.');
  if (kind === 'schools' || kind === 'students') recordId(id);
  else if (!/^\d{1,18}$/.test(id)) throw new RequestError(400, 'Invalid history entry ID.');
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
    const uploads = await tx.query(`SELECT ${uploadFields}, u.row_results ${uploadFrom} WHERE ($1::uuid IS NULL OR u.school_id = $1) ORDER BY u.id DESC`, [filter]);
    return { schools: schools.rows, students: students.rows, changes: await formatChanges(tx, changes.rows), uploads: uploads.rows };
  });
}

// Rows for the consolidated FTO sheet: every student, grouped by school, oldest onboarding first.
export async function ftoRows(db, school) {
  const filter = school ? recordId(school) : null;
  const { rows } = await db.query(`SELECT s.id AS school_id, s.name AS school_name, to_char(s.onboarded_on, 'DD.MM.YY') AS date,
      s.principal_name, s.principal_email, s.principal_phone, s.coordinator_name, s.coordinator_phone, s.coordinator_email,
      s.state, s.pincode, t.student_code, t.name, t.first_name, t.last_name, t.grade, t.email, t.test_attempt_code
    ${studentFrom} WHERE ($1::uuid IS NULL OR s.id = $1)
    ORDER BY s.onboarded_on, lower(s.name), s.id, length(t.student_code), t.student_code`, [filter]);
  return rows.map((row) => row.first_name || row.last_name ? row : { ...row, first_name: row.name });
}
