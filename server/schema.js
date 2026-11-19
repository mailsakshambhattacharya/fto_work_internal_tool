export const schema = `
  CREATE TABLE IF NOT EXISTS schools (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    city text NOT NULL DEFAULT '',
    area text NOT NULL DEFAULT '',
    onboarded_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
    principal_name text NOT NULL,
    principal_email text NOT NULL DEFAULT '',
    principal_phone text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision integer NOT NULL DEFAULT 1
  );
  DO $migration$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'schools'::regclass AND attname = 'area' AND NOT attisdropped
    ) THEN
      ALTER TABLE schools ADD COLUMN area text NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'schools'::regclass AND attname = 'onboarded_on' AND NOT attisdropped
    ) THEN
      ALTER TABLE schools ADD COLUMN onboarded_on date;
      UPDATE schools SET onboarded_on = (created_at AT TIME ZONE 'Asia/Kolkata')::date;
      ALTER TABLE schools ALTER COLUMN onboarded_on SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);
      ALTER TABLE schools ALTER COLUMN onboarded_on SET NOT NULL;
    END IF;
  END
  $migration$;
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
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS pincode text NOT NULL DEFAULT '';
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS coordinator_name text NOT NULL DEFAULT '';
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS coordinator_phone text NOT NULL DEFAULT '';
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS coordinator_email text NOT NULL DEFAULT '';
  ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
  ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';
  ALTER TABLE students ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
  ALTER TABLE students ADD COLUMN IF NOT EXISTS test_attempt_code text NOT NULL DEFAULT '';
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
  CREATE TABLE IF NOT EXISTS student_uploads (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES schools(id),
    filename text NOT NULL,
    added_count integer NOT NULL,
    updated_count integer NOT NULL,
    repeated_count integer NOT NULL,
    row_results jsonb NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX IF NOT EXISTS schools_updated_idx ON schools (updated_at DESC, id);
  CREATE INDEX IF NOT EXISTS students_updated_idx ON students (updated_at DESC, id);
  CREATE INDEX IF NOT EXISTS changes_school_idx ON changes (school_id, id DESC);
  CREATE INDEX IF NOT EXISTS changes_record_idx ON changes (record_id, id DESC);
  CREATE INDEX IF NOT EXISTS changes_time_idx ON changes (occurred_at DESC);
  CREATE INDEX IF NOT EXISTS student_uploads_school_idx ON student_uploads (school_id, id DESC);
`;

export function initializeDatabase(db) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(1734288562)');
    await tx.query(schema);
  });
}
