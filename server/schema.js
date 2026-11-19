export const schema = `
  CREATE TABLE IF NOT EXISTS schools (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    city text NOT NULL DEFAULT '',
    principal_name text NOT NULL,
    principal_email text NOT NULL DEFAULT '',
    principal_phone text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision integer NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS students (
    id uuid PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES schools(id),
    student_code text NOT NULL,
    name text NOT NULL,
    grade text NOT NULL,
    section text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'Enrolled' CHECK (status IN ('Enrolled', 'Transferred', 'Graduated', 'Withdrawn')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (school_id, student_code)
  );
  CREATE TABLE IF NOT EXISTS changes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity text NOT NULL CHECK (entity IN ('School', 'Student')),
    record_id uuid NOT NULL,
    school_id uuid NOT NULL REFERENCES schools(id),
    label text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('Added', 'Updated')),
    source text NOT NULL,
    before_row jsonb,
    after_row jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS schools_updated_idx ON schools (updated_at DESC, id);
  CREATE INDEX IF NOT EXISTS students_updated_idx ON students (updated_at DESC, id);
  CREATE INDEX IF NOT EXISTS changes_school_idx ON changes (school_id, id DESC);
  CREATE INDEX IF NOT EXISTS changes_record_idx ON changes (record_id, id DESC);
  CREATE INDEX IF NOT EXISTS changes_time_idx ON changes (occurred_at DESC);
`;

export function initializeDatabase(db) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(1734288562)');
    await tx.query(schema);
  });
}
